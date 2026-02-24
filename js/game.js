/**
 * Game State Manager
 * Handles game logic, assists, timer, mistakes, notes, and local storage.
 */

const Game = (() => {

    const MAX_MISTAKES = 3;
    const MAX_HINTS = 3;

    let state = {
        puzzle: null,       // current board (player's progress)
        solution: null,     // the solved board
        original: null,     // original puzzle (to know which cells are pre-filled)
        difficulty: 'medium',
        selectedCell: null, // { row, col }
        notesMode: false,
        notes: null,        // 9x9 array of Sets
        history: [],        // undo stack
        redoStack: [],
        mistakes: 0,
        hintsUsed: 0,
        timer: 0,           // seconds elapsed
        timerInterval: null,
        paused: false,
        gameOver: false,
        won: false,
        clues: 0,
    };

    /**
     * Start a new game.
     */
    function newGame(difficulty = 'medium', seed = null) {
        stopTimer();

        const data = SudokuEngine.generate(difficulty, seed);

        state = {
            puzzle: data.puzzle,
            solution: data.solution,
            original: SudokuEngine.cloneGrid(data.puzzle),
            difficulty,
            seed: data.seed || seed,
            selectedCell: null,
            notesMode: false,
            notes: Array.from({ length: 9 }, () =>
                Array.from({ length: 9 }, () => new Set())
            ),
            history: [],
            redoStack: [],
            mistakes: 0,
            hintsUsed: 0,
            timer: 0,
            timerInterval: null,
            paused: false,
            gameOver: false,
            won: false,
            clues: data.clues,
        };

        startTimer();
        saveToLocalStorage();
        return state;
    }

    /**
     * Select a cell.
     */
    function selectCell(row, col) {
        state.selectedCell = { row, col };
    }

    /**
     * Check if a cell is a pre-filled (original) clue.
     */
    function isOriginalCell(row, col) {
        return state.original && state.original[row][col] !== 0;
    }

    /**
     * Place a number in the selected cell.
     */
    function placeNumber(num) {
        if (state.gameOver || !state.selectedCell) return null;

        const { row, col } = state.selectedCell;
        if (isOriginalCell(row, col)) return null;

        if (state.notesMode) {
            return toggleNote(row, col, num);
        }

        // Save state for undo
        pushHistory(row, col, state.puzzle[row][col], num);

        const correct = state.solution[row][col];
        const isCorrect = num === correct;

        // Clear notes for this cell
        state.notes[row][col].clear();

        // Place the number
        state.puzzle[row][col] = num;

        if (!isCorrect) {
            state.mistakes++;
            if (state.mistakes >= MAX_MISTAKES) {
                state.gameOver = true;
                state.won = false;
                stopTimer();
            }
        } else {
            // Auto-clear notes in same row, col, and box
            clearRelatedNotes(row, col, num);
        }

        // Check for win
        if (!state.gameOver && checkWin()) {
            state.gameOver = true;
            state.won = true;
            stopTimer();
        }

        saveToLocalStorage();
        return { isCorrect, gameOver: state.gameOver, won: state.won };
    }

    /**
     * Toggle a pencil-mark note.
     */
    function toggleNote(row, col, num) {
        if (state.puzzle[row][col] !== 0) return null;

        if (state.notes[row][col].has(num)) {
            state.notes[row][col].delete(num);
        } else {
            state.notes[row][col].add(num);
        }
        saveToLocalStorage();
        return { note: true };
    }

    /**
     * Clear notes related to a placed number.
     */
    function clearRelatedNotes(row, col, num) {
        // Same row
        for (let c = 0; c < 9; c++) state.notes[row][c].delete(num);
        // Same col
        for (let r = 0; r < 9; r++) state.notes[r][col].delete(num);
        // Same box
        const boxRow = Math.floor(row / 3) * 3;
        const boxCol = Math.floor(col / 3) * 3;
        for (let r = boxRow; r < boxRow + 3; r++) {
            for (let c = boxCol; c < boxCol + 3; c++) {
                state.notes[r][c].delete(num);
            }
        }
    }

    /**
     * Erase the selected cell.
     */
    function eraseCell() {
        if (state.gameOver || !state.selectedCell) return;
        const { row, col } = state.selectedCell;
        if (isOriginalCell(row, col)) return;

        pushHistory(row, col, state.puzzle[row][col], 0);
        state.puzzle[row][col] = 0;
        state.notes[row][col].clear();
        saveToLocalStorage();
    }

    /**
     * Use a hint: reveal the correct value in the selected cell.
     */
    function useHint() {
        if (state.gameOver || !state.selectedCell) return null;
        if (state.hintsUsed >= MAX_HINTS) return null;

        const { row, col } = state.selectedCell;
        if (isOriginalCell(row, col)) return null;
        if (state.puzzle[row][col] === state.solution[row][col]) return null;

        state.hintsUsed++;
        const correct = state.solution[row][col];

        pushHistory(row, col, state.puzzle[row][col], correct);
        state.puzzle[row][col] = correct;
        state.notes[row][col].clear();
        clearRelatedNotes(row, col, correct);

        if (checkWin()) {
            state.gameOver = true;
            state.won = true;
            stopTimer();
        }

        saveToLocalStorage();
        return { value: correct, hintsRemaining: MAX_HINTS - state.hintsUsed };
    }

    /**
     * Undo the last action.
     */
    function undo() {
        if (state.gameOver || state.history.length === 0) return null;
        const action = state.history.pop();
        state.redoStack.push(action);
        state.puzzle[action.row][action.col] = action.oldVal;
        saveToLocalStorage();
        return action;
    }

    /**
     * Redo the last undone action.
     */
    function redo() {
        if (state.gameOver || state.redoStack.length === 0) return null;
        const action = state.redoStack.pop();
        state.history.push(action);
        state.puzzle[action.row][action.col] = action.newVal;
        saveToLocalStorage();
        return action;
    }

    function pushHistory(row, col, oldVal, newVal) {
        state.history.push({ row, col, oldVal, newVal });
        state.redoStack = []; // clear redo on new action
    }

    /**
     * Toggle notes mode on/off.
     */
    function toggleNotesMode() {
        state.notesMode = !state.notesMode;
        return state.notesMode;
    }

    /**
     * Check if the puzzle is completely and correctly solved.
     */
    function checkWin() {
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (state.puzzle[r][c] !== state.solution[r][c]) return false;
            }
        }
        return true;
    }

    // ── Timer ──────────────────────────────────────────────

    function startTimer() {
        stopTimer();
        state.timerInterval = setInterval(() => {
            if (!state.paused && !state.gameOver) {
                state.timer++;
                if (typeof UI !== 'undefined' && UI.updateTimer) {
                    UI.updateTimer(state.timer);
                }
            }
        }, 1000);
    }

    function stopTimer() {
        if (state.timerInterval) {
            clearInterval(state.timerInterval);
            state.timerInterval = null;
        }
    }

    function togglePause() {
        state.paused = !state.paused;
        return state.paused;
    }

    function formatTime(seconds) {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    // ── Local Storage ──────────────────────────────────────

    function saveToLocalStorage() {
        try {
            const save = {
                puzzle: state.puzzle,
                solution: state.solution,
                original: state.original,
                difficulty: state.difficulty,
                notes: state.notes.map(row => row.map(s => [...s])),
                history: state.history,
                redoStack: state.redoStack,
                mistakes: state.mistakes,
                hintsUsed: state.hintsUsed,
                timer: state.timer,
                clues: state.clues,
            };
            localStorage.setItem('sudoku_save', JSON.stringify(save));
        } catch (e) { /* ignore quota errors */ }
    }

    function loadFromLocalStorage() {
        try {
            const raw = localStorage.getItem('sudoku_save');
            if (!raw) return null;
            const save = JSON.parse(raw);

            state = {
                ...state,
                ...save,
                notes: save.notes.map(row => row.map(arr => new Set(arr))),
                selectedCell: null,
                notesMode: false,
                paused: false,
                gameOver: false,
                won: false,
                timerInterval: null,
            };

            // Re-check if already won/lost
            if (state.mistakes >= MAX_MISTAKES) {
                state.gameOver = true;
                state.won = false;
            } else if (checkWin()) {
                state.gameOver = true;
                state.won = true;
            }

            if (!state.gameOver) startTimer();
            return state;
        } catch (e) {
            return null;
        }
    }

    function clearSave() {
        localStorage.removeItem('sudoku_save');
    }

    // ── Getters ────────────────────────────────────────────

    function getState() { return state; }
    function getMistakes() { return state.mistakes; }
    function getMaxMistakes() { return MAX_MISTAKES; }
    function getHintsUsed() { return state.hintsUsed; }
    function getMaxHints() { return MAX_HINTS; }
    function getTimer() { return state.timer; }
    function isNotesMode() { return state.notesMode; }
    function isGameOver() { return state.gameOver; }
    function hasWon() { return state.won; }

    /**
     * Get count of how many times a number (1-9) appears on the board.
     */
    function getNumberCounts() {
        const counts = {};
        for (let n = 1; n <= 9; n++) counts[n] = 0;
        if (!state.puzzle) return counts;
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const v = state.puzzle[r][c];
                if (v >= 1 && v <= 9) counts[v]++;
            }
        }
        return counts;
    }

    return {
        newGame,
        selectCell,
        isOriginalCell,
        placeNumber,
        eraseCell,
        useHint,
        undo,
        redo,
        toggleNotesMode,
        togglePause,
        formatTime,
        loadFromLocalStorage,
        clearSave,
        getState,
        getMistakes,
        getMaxMistakes,
        getHintsUsed,
        getMaxHints,
        getTimer,
        isNotesMode,
        isGameOver,
        hasWon,
        getNumberCounts,
    };

})();
