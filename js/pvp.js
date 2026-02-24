/**
 * PvP Battle System
 * Simulates 1v1 battles against an AI opponent.
 */

const PvP = (() => {

    const BATTLE_TIME = 600; // 10 minutes
    const AI_NAMES = [
        'SudokuMaster', 'GridNinja', 'PuzzleWiz', 'NumberCrunch',
        'BrainStorm', 'LogicLord', 'CellSolver', 'DigitDemon',
        'MindBender', 'PuzzlePro', 'GridGenius', 'NumWizard',
        'SolveKing', 'PuzzleAce', 'BoardBoss', 'ClueCracker',
    ];

    const AI_AVATARS = ['🤖', '🧠', '🦊', '🐉', '👾', '🎭', '🦉', '🧙'];

    // AI solve speed: average ms per cell based on selected difficulty
    const AI_SPEED = {
        easy: { min: 2000, max: 5000 },
        medium: { min: 3000, max: 7000 },
        hard: { min: 5000, max: 10000 },
        expert: { min: 7000, max: 14000 },
        evil: { min: 10000, max: 20000 },
    };

    let battle = null;

    /**
     * Start a new PvP battle.
     */
    function startBattle(difficulty = 'medium') {
        const seed = SudokuEngine.randomSeed();
        const data = SudokuEngine.generate(difficulty, seed);

        // Determine which cells the AI needs to fill
        const emptyCells = [];
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (data.puzzle[r][c] === 0) {
                    emptyCells.push({ row: r, col: c, val: data.solution[r][c] });
                }
            }
        }

        // Shuffle AI solving order
        shuffleArray(emptyCells);

        // Pick AI opponent
        const aiName = AI_NAMES[Math.floor(Math.random() * AI_NAMES.length)];
        const aiAvatar = AI_AVATARS[Math.floor(Math.random() * AI_AVATARS.length)];
        const speed = AI_SPEED[difficulty] || AI_SPEED.medium;

        battle = {
            seed,
            difficulty,
            puzzle: data.puzzle,
            solution: data.solution,
            original: SudokuEngine.cloneGrid(data.puzzle),

            // Player state
            playerBoard: SudokuEngine.cloneGrid(data.puzzle),
            playerCellsFilled: 0,
            playerMistakes: 0,
            playerFinished: false,

            // AI state
            aiName,
            aiAvatar,
            aiCellsFilled: 0,
            aiTotalCells: emptyCells.length,
            aiCellsQueue: emptyCells,
            aiFinished: false,
            aiIntervalId: null,
            aiSpeed: speed,

            // Timer
            timeRemaining: BATTLE_TIME,
            timerIntervalId: null,
            started: false,
            ended: false,

            // Result
            result: null, // 'win', 'lose', 'draw'
            eloDelta: 0,
        };

        return battle;
    }

    /**
     * Begin the battle (start timer and AI).
     */
    function beginBattle(onAIProgress, onTimerTick, onBattleEnd) {
        if (!battle || battle.started) return;
        battle.started = true;

        // Start countdown timer
        battle.timerIntervalId = setInterval(() => {
            if (battle.ended) return;
            battle.timeRemaining--;
            if (onTimerTick) onTimerTick(battle.timeRemaining);

            if (battle.timeRemaining <= 0) {
                endBattle('timeout', onBattleEnd);
            }
        }, 1000);

        // Start AI solving
        scheduleNextAICell(onAIProgress, onBattleEnd);
    }

    function scheduleNextAICell(onAIProgress, onBattleEnd) {
        if (battle.ended || battle.aiFinished) return;

        const { min, max } = battle.aiSpeed;
        const delay = min + Math.random() * (max - min);

        battle.aiIntervalId = setTimeout(() => {
            if (battle.ended) return;

            battle.aiCellsFilled++;
            if (onAIProgress) {
                onAIProgress(battle.aiCellsFilled, battle.aiTotalCells);
            }

            if (battle.aiCellsFilled >= battle.aiTotalCells) {
                battle.aiFinished = true;
                if (!battle.playerFinished) {
                    endBattle('ai_finished', onBattleEnd);
                }
            } else {
                scheduleNextAICell(onAIProgress, onBattleEnd);
            }
        }, delay);
    }

    /**
     * Player places a number during battle.
     */
    function playerPlace(row, col, num) {
        if (!battle || battle.ended || battle.playerFinished) return null;
        if (battle.original[row][col] !== 0) return null;

        const correct = battle.solution[row][col];
        const isCorrect = num === correct;

        battle.playerBoard[row][col] = num;

        if (isCorrect) {
            battle.playerCellsFilled++;

            // Check if player has solved all cells
            let allFilled = true;
            for (let r = 0; r < 9; r++) {
                for (let c = 0; c < 9; c++) {
                    if (battle.playerBoard[r][c] !== battle.solution[r][c]) {
                        allFilled = false;
                        break;
                    }
                }
                if (!allFilled) break;
            }

            if (allFilled) {
                battle.playerFinished = true;
                return { isCorrect: true, finished: true };
            }
        } else {
            battle.playerMistakes++;
        }

        return { isCorrect, finished: false };
    }

    /**
     * Player erases a cell during battle.
     */
    function playerErase(row, col) {
        if (!battle || battle.ended) return;
        if (battle.original[row][col] !== 0) return;
        if (battle.playerBoard[row][col] !== 0 &&
            battle.playerBoard[row][col] === battle.solution[row][col]) {
            battle.playerCellsFilled--;
        }
        battle.playerBoard[row][col] = 0;
    }

    /**
     * End the battle with a reason.
     */
    function endBattle(reason, callback) {
        if (battle.ended) return;
        battle.ended = true;

        clearInterval(battle.timerIntervalId);
        clearTimeout(battle.aiIntervalId);

        // Determine result
        if (reason === 'player_finished' || battle.playerFinished) {
            battle.result = 'win';
            battle.eloDelta = 25;
        } else if (reason === 'ai_finished') {
            battle.result = 'lose';
            battle.eloDelta = -25;
        } else if (reason === 'timeout') {
            // Compare progress
            const playerPct = battle.playerCellsFilled / battle.aiTotalCells;
            const aiPct = battle.aiCellsFilled / battle.aiTotalCells;
            if (playerPct > aiPct) {
                battle.result = 'win';
                battle.eloDelta = 15;
            } else if (aiPct > playerPct) {
                battle.result = 'lose';
                battle.eloDelta = -15;
            } else {
                battle.result = 'draw';
                battle.eloDelta = 0;
            }
        } else if (reason === 'quit') {
            battle.result = 'lose';
            battle.eloDelta = -25;
        }

        // Update player ELO
        Player.updateELO(battle.eloDelta, {
            result: battle.result,
            opponent: battle.aiName,
            difficulty: battle.difficulty,
            playerProgress: Math.round((battle.playerCellsFilled / battle.aiTotalCells) * 100),
            aiProgress: Math.round((battle.aiCellsFilled / battle.aiTotalCells) * 100),
            timeUsed: BATTLE_TIME - battle.timeRemaining,
        });

        if (callback) callback(battle);
    }

    /**
     * Player finishes the puzzle.
     */
    function playerFinish(callback) {
        if (!battle || battle.ended) return;
        battle.playerFinished = true;
        endBattle('player_finished', callback);
    }

    /**
     * Quit a battle.
     */
    function quitBattle(callback) {
        if (!battle || battle.ended) return;
        endBattle('quit', callback);
    }

    function getBattle() { return battle; }
    function isActive() { return battle && battle.started && !battle.ended; }

    function formatTime(seconds) {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    function shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    return {
        startBattle,
        beginBattle,
        playerPlace,
        playerErase,
        playerFinish,
        quitBattle,
        getBattle,
        isActive,
        formatTime,
        BATTLE_TIME,
    };

})();
