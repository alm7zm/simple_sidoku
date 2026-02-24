/**
 * UI Renderer — Phase 3
 * Handles screens, battle flow, shop, profile, themes, and animations.
 */

const UI = (() => {

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    let boardEl, timerEl, mistakesEl, hintsEl, difficultyEl;

    // Battle state
    let battleSelectedCell = null;
    let lastSeed = null;
    let lastDifficulty = null;

    // ── Initialise ─────────────────────────────────────────
    function init() {
        boardEl = $('#board');
        timerEl = $('#timer');
        mistakesEl = $('#mistakes');
        hintsEl = $('#hints-count');
        difficultyEl = $('#current-difficulty');

        Player.load();
        buildBoard();
        buildBattleBoard();
        bindEvents();
        applyTheme(Player.getActiveTheme());

        // Check for challenge URL
        const params = new URLSearchParams(window.location.search);
        const seed = params.get('seed');
        const diff = params.get('diff');
        if (seed && diff) {
            startNewGame(diff, parseInt(seed));
            return;
        }

        const saved = Game.loadFromLocalStorage();
        if (saved && !saved.gameOver) {
            renderBoard(saved);
            updateInfoBar(saved);
            showScreen('game');
            enterGameMode();
        } else {
            showScreen('menu');
            updateMenuStats();
        }
    }

    // ── Build 9×9 Board ───────────────────────────────────
    function buildBoard() {
        boardEl.innerHTML = '';
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const cell = createCell(r, c, false);
                cell.addEventListener('click', () => onCellClick(r, c));
                boardEl.appendChild(cell);
            }
        }
    }

    function buildBattleBoard() {
        const bb = $('#battle-board');
        if (!bb) return;
        bb.innerHTML = '';
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const cell = createCell(r, c, true);
                cell.addEventListener('click', () => onBattleCellClick(r, c));
                bb.appendChild(cell);
            }
        }
    }

    function createCell(r, c, isBattle) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        cell.dataset.row = r;
        cell.dataset.col = c;
        if (isBattle) cell.dataset.battle = '1';

        if (c % 3 === 0 && c !== 0) cell.classList.add('box-left');
        if (r % 3 === 0 && r !== 0) cell.classList.add('box-top');

        const notesGrid = document.createElement('div');
        notesGrid.classList.add('notes-grid');
        for (let n = 1; n <= 9; n++) {
            const noteCell = document.createElement('span');
            noteCell.classList.add('note');
            noteCell.dataset.note = n;
            notesGrid.appendChild(noteCell);
        }
        cell.appendChild(notesGrid);

        const val = document.createElement('span');
        val.classList.add('cell-value');
        cell.appendChild(val);
        return cell;
    }

    // ── Render Board State ─────────────────────────────────
    function renderBoard(st) {
        if (!st) st = Game.getState();
        const selected = st.selectedCell;
        const selectedVal = selected ? st.puzzle[selected.row][selected.col] : null;

        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const cell = boardEl.children[r * 9 + c];
                const val = st.puzzle[r][c];
                const isOrig = Game.isOriginalCell(r, c);
                const valEl = cell.querySelector('.cell-value');
                const notesEl = cell.querySelector('.notes-grid');

                cell.classList.remove('selected', 'highlighted', 'same-number', 'error', 'original', 'user-filled', 'hint-cell', 'related');
                if (isOrig) cell.classList.add('original');

                if (val !== 0) {
                    valEl.textContent = val;
                    notesEl.style.display = 'none';
                    valEl.style.display = '';
                    if (!isOrig) {
                        cell.classList.add('user-filled');
                        if (val !== st.solution[r][c]) cell.classList.add('error');
                    }
                } else {
                    valEl.textContent = '';
                    valEl.style.display = 'none';
                    const cellNotes = st.notes[r][c];
                    if (cellNotes && cellNotes.size > 0) {
                        notesEl.style.display = '';
                        for (let n = 1; n <= 9; n++) {
                            notesEl.querySelector(`[data-note="${n}"]`).textContent = cellNotes.has(n) ? n : '';
                        }
                    } else {
                        notesEl.style.display = 'none';
                    }
                }

                if (selected) {
                    if (r === selected.row && c === selected.col) cell.classList.add('selected');
                    if (r === selected.row || c === selected.col ||
                        (Math.floor(r / 3) === Math.floor(selected.row / 3) &&
                            Math.floor(c / 3) === Math.floor(selected.col / 3))) {
                        cell.classList.add('related');
                    }
                    if (selectedVal && selectedVal !== 0 && val === selectedVal) cell.classList.add('same-number');
                }
            }
        }
        updateNumberPad();
    }

    // ── Render Battle Board ────────────────────────────────
    function renderBattleBoard() {
        const battle = PvP.getBattle();
        if (!battle) return;
        const bb = $('#battle-board');
        const board = battle.playerBoard;
        const solution = battle.solution;
        const original = battle.original;

        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const cell = bb.children[r * 9 + c];
                const val = board[r][c];
                const isOrig = original[r][c] !== 0;
                const valEl = cell.querySelector('.cell-value');
                const notesEl = cell.querySelector('.notes-grid');
                notesEl.style.display = 'none';

                cell.classList.remove('selected', 'related', 'same-number', 'error', 'original', 'user-filled');
                if (isOrig) cell.classList.add('original');

                if (val !== 0) {
                    valEl.textContent = val;
                    valEl.style.display = '';
                    if (!isOrig) {
                        cell.classList.add('user-filled');
                        if (val !== solution[r][c]) cell.classList.add('error');
                    }
                } else {
                    valEl.textContent = '';
                    valEl.style.display = 'none';
                }

                if (battleSelectedCell && r === battleSelectedCell.row && c === battleSelectedCell.col) {
                    cell.classList.add('selected');
                }
            }
        }
    }

    // ── Info Bar ───────────────────────────────────────────
    function updateInfoBar(st) {
        if (!st) st = Game.getState();
        mistakesEl.textContent = `${st.mistakes}/${Game.getMaxMistakes()}`;
        hintsEl.textContent = `${Game.getMaxHints() - st.hintsUsed}`;
        difficultyEl.textContent = capitalize(st.difficulty);
        updateTimer(st.timer);
    }

    function updateTimer(seconds) {
        if (timerEl) timerEl.textContent = Game.formatTime(seconds);
    }

    function updateNumberPad() {
        const counts = Game.getNumberCounts();
        for (let n = 1; n <= 9; n++) {
            const btn = $(`#numpad [data-num="${n}"]`);
            if (btn) btn.classList.toggle('completed', counts[n] >= 9);
        }
    }

    function updateMenuStats() {
        $('#menu-streak').textContent = Player.getStreak();
        $('#menu-coins').textContent = Player.getCoins();
        $('#menu-level').textContent = Player.getLevel();
    }

    // ── Event Binding ──────────────────────────────────────
    function bindEvents() {
        // Difficulty buttons
        $$('.diff-btn').forEach(btn => {
            btn.addEventListener('click', () => startNewGame(btn.dataset.difficulty));
        });

        // Number pad
        $$('#numpad [data-num]').forEach(btn => {
            btn.addEventListener('click', () => onNumberInput(parseInt(btn.dataset.num)));
        });

        // Tool buttons
        $('#btn-undo')?.addEventListener('click', onUndo);
        $('#btn-redo')?.addEventListener('click', onRedo);
        $('#btn-erase')?.addEventListener('click', onErase);
        $('#btn-notes')?.addEventListener('click', onToggleNotes);
        $('#btn-hint')?.addEventListener('click', onHint);
        $('#btn-new-game')?.addEventListener('click', () => { exitGameMode(); showScreen('menu'); updateMenuStats(); });
        $('#btn-pause')?.addEventListener('click', onPause);

        // Overlay buttons
        $('#btn-play-again')?.addEventListener('click', () => { hideOverlay(); exitGameMode(); showScreen('menu'); updateMenuStats(); });
        $('#btn-play-again-lose')?.addEventListener('click', () => { hideOverlay(); exitGameMode(); showScreen('menu'); updateMenuStats(); });
        $('#btn-resume')?.addEventListener('click', () => { Game.togglePause(); hideOverlay(); });

        // Challenge button
        $('#btn-challenge')?.addEventListener('click', onChallengeClick);

        // Bottom nav
        $$('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const screen = btn.dataset.screen;
                exitGameMode();
                showScreen(screen);
                $$('.nav-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                if (screen === 'menu') updateMenuStats();
                if (screen === 'shop') renderShop();
                if (screen === 'profile') renderProfile();
                if (screen === 'battle') renderBattleScreen();
            });
        });

        // Battle difficulty buttons
        $$('.battle-diff-btn').forEach(btn => {
            btn.addEventListener('click', () => onStartBattle(btn.dataset.diff));
        });

        // Battle numpad
        $$('[data-bnum]').forEach(btn => {
            btn.addEventListener('click', () => onBattleNumberInput(parseInt(btn.dataset.bnum)));
        });

        // Battle tools
        $('#btn-battle-erase')?.addEventListener('click', onBattleErase);
        $('#btn-battle-quit')?.addEventListener('click', onBattleQuit);

        // Battle result done
        $('#btn-battle-done')?.addEventListener('click', () => {
            hideOverlay();
            exitGameMode();
            showScreen('battle');
            renderBattleScreen();
            $$('.nav-btn').forEach(b => b.classList.remove('active'));
            $('#nav-battle')?.classList.add('active');
        });

        // Keyboard
        document.addEventListener('keydown', onKeyDown);
    }

    // ── Game Mode ──────────────────────────────────────────
    function enterGameMode() { document.body.classList.add('in-game'); }
    function exitGameMode() { document.body.classList.remove('in-game'); }

    // ── Cell Click ─────────────────────────────────────────
    function onCellClick(row, col) {
        if (Game.isGameOver()) return;
        Game.selectCell(row, col);
        renderBoard();
    }

    function onNumberInput(num) {
        const result = Game.placeNumber(num);
        if (!result) return;
        renderBoard();
        updateInfoBar();
        if (result.gameOver) {
            setTimeout(() => result.won ? showWinScreen() : showLoseScreen(), 400);
        } else if (!result.isCorrect && !result.note) {
            const st = Game.getState();
            if (st.selectedCell) {
                const cell = boardEl.children[st.selectedCell.row * 9 + st.selectedCell.col];
                cell.classList.add('shake');
                setTimeout(() => cell.classList.remove('shake'), 500);
            }
        }
    }

    function onUndo() { if (Game.undo()) renderBoard(); }
    function onRedo() { if (Game.redo()) renderBoard(); }
    function onErase() { Game.eraseCell(); renderBoard(); }

    function onToggleNotes() {
        const isNotes = Game.toggleNotesMode();
        $('#btn-notes').classList.toggle('active', isNotes);
    }

    function onHint() {
        const result = Game.useHint();
        if (!result) {
            const btn = $('#btn-hint');
            btn.classList.add('shake');
            setTimeout(() => btn.classList.remove('shake'), 500);
            return;
        }
        renderBoard();
        updateInfoBar();
        if (Game.isGameOver() && Game.hasWon()) setTimeout(showWinScreen, 400);
    }

    function onPause() {
        const paused = Game.togglePause();
        if (paused) showOverlay('pause');
        else hideOverlay();
    }

    function onKeyDown(e) {
        if (!$('#screen-game')?.classList.contains('active')) return;
        const st = Game.getState();
        if (!st.selectedCell || st.gameOver) return;
        const { row, col } = st.selectedCell;

        if (e.key >= '1' && e.key <= '9') onNumberInput(parseInt(e.key));
        else if (e.key === 'Backspace' || e.key === 'Delete') onErase();
        else if (e.key === 'ArrowUp' && row > 0) { Game.selectCell(row - 1, col); renderBoard(); }
        else if (e.key === 'ArrowDown' && row < 8) { Game.selectCell(row + 1, col); renderBoard(); }
        else if (e.key === 'ArrowLeft' && col > 0) { Game.selectCell(row, col - 1); renderBoard(); }
        else if (e.key === 'ArrowRight' && col < 8) { Game.selectCell(row, col + 1); renderBoard(); }
        else if (e.key === 'z' && e.ctrlKey) onUndo();
        else if (e.key === 'y' && e.ctrlKey) onRedo();
        else if (e.key === 'n' || e.key === 'N') onToggleNotes();
    }

    // ── Screens & Overlays ─────────────────────────────────
    function showScreen(name) {
        $$('.screen').forEach(s => s.classList.remove('active'));
        $(`#screen-${name}`)?.classList.add('active');
    }

    function startNewGame(difficulty, seed = null) {
        Game.clearSave();
        const st = Game.newGame(difficulty, seed);
        lastSeed = st.seed || seed;
        lastDifficulty = difficulty;
        renderBoard(st);
        updateInfoBar(st);
        $('#btn-notes')?.classList.remove('active');
        showScreen('game');
        enterGameMode();
        boardEl.classList.add('board-enter');
        setTimeout(() => boardEl.classList.remove('board-enter'), 600);
    }

    function showOverlay(type) {
        const overlay = $('#overlay');
        overlay.classList.add('active');
        $$('.overlay-content').forEach(c => c.classList.remove('active'));
        $(`#overlay-${type}`)?.classList.add('active');
    }

    function hideOverlay() {
        $('#overlay').classList.remove('active');
    }

    // ── Win / Lose ─────────────────────────────────────────
    function showWinScreen() {
        const st = Game.getState();
        const notesUsed = st.history.some(h => h.note);
        const reward = Player.awardForCompletion(st.difficulty, st.timer, st.mistakes, st.hintsUsed, notesUsed);

        $('#win-time').textContent = Game.formatTime(st.timer);
        $('#win-mistakes').textContent = st.mistakes;
        $('#win-difficulty').textContent = capitalize(st.difficulty);
        $('#win-xp').textContent = `+${reward.xp} XP`;
        $('#win-coins').textContent = `+${reward.coins}`;

        const levelUpEl = $('#win-level-up');
        if (reward.leveledUp) { levelUpEl.style.display = ''; $('#win-new-level').textContent = `Level ${reward.newLevel}`; }
        else levelUpEl.style.display = 'none';

        const questsEl = $('#win-quests-completed');
        if (reward.completedQuests.length > 0) {
            questsEl.style.display = '';
            questsEl.innerHTML = reward.completedQuests.map(q => `<div class="quest-complete-item">✅ ${q.text} — +${q.xpReward} XP, +${q.coinReward} 🪙</div>`).join('');
        } else questsEl.style.display = 'none';

        showOverlay('win');
        createConfetti();
        showXPToast(`+${reward.xp} XP  •  +${reward.coins} 🪙`);
    }

    function showLoseScreen() {
        Player.recordLoss();
        showOverlay('lose');
    }

    // ── Challenge ──────────────────────────────────────────
    function onChallengeClick() {
        const st = Game.getState();
        const seed = lastSeed || SudokuEngine.randomSeed();
        const diff = st.difficulty || lastDifficulty || 'medium';
        const url = `${window.location.origin}${window.location.pathname}?seed=${seed}&diff=${diff}`;

        navigator.clipboard.writeText(url).then(() => {
            const toast = $('#copied-toast');
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 2500);
        }).catch(() => {
            prompt('Copy this challenge link:', url);
        });
    }

    // ── XP Toast & Confetti ────────────────────────────────
    function showXPToast(text) {
        const toast = $('#xp-toast');
        $('#xp-toast-text').textContent = text;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2500);
    }

    function createConfetti() {
        const container = $('#confetti');
        container.innerHTML = '';
        const colors = ['#6c63ff', '#ff6584', '#43e97b', '#f8d800', '#00d2ff', '#ff9a9e'];
        for (let i = 0; i < 60; i++) {
            const piece = document.createElement('div');
            piece.classList.add('confetti-piece');
            piece.style.left = Math.random() * 100 + '%';
            piece.style.background = colors[Math.floor(Math.random() * colors.length)];
            piece.style.animationDelay = Math.random() * 2 + 's';
            piece.style.animationDuration = (2 + Math.random() * 2) + 's';
            container.appendChild(piece);
        }
        setTimeout(() => container.innerHTML = '', 5000);
    }

    // ── Theme ──────────────────────────────────────────────
    function applyTheme(themeId) {
        document.body.classList.remove('theme-neon', 'theme-woodcraft', 'theme-cyberpunk');
        if (themeId && themeId !== 'default') document.body.classList.add(`theme-${themeId}`);
    }

    // ═══════════════════════════════════════════════════════
    // ── BATTLE FLOW ────────────────────────────────────────
    // ═══════════════════════════════════════════════════════

    function renderBattleScreen() {
        const league = Player.getLeague();
        const record = Player.getPvPRecord();

        $('#battle-league-icon').textContent = league.icon;
        $('#battle-league-name').textContent = league.name;
        $('#battle-elo').textContent = Player.getELO();
        $('#pvp-wins').textContent = record.wins;
        $('#pvp-losses').textContent = record.losses;
        $('#pvp-draws').textContent = record.draws;

        renderMatchHistory();
    }

    function renderMatchHistory() {
        const history = Player.getMatchHistory();
        const list = $('#match-history-list');
        if (!list) return;

        if (history.length === 0) {
            list.innerHTML = '<p class="empty-state">No matches yet. Start a battle!</p>';
            return;
        }

        list.innerHTML = history.map(m => {
            const resultClass = m.result;
            const resultText = m.result === 'win' ? 'Victory' : m.result === 'lose' ? 'Defeat' : 'Draw';
            const eloSign = m.eloDelta > 0 ? '+' : '';
            return `
        <div class="match-card ${resultClass}">
          <div class="match-left">
            <span class="match-opponent">vs ${m.opponent}</span>
            <span class="match-detail">${capitalize(m.difficulty)} • You ${m.playerProgress}% / AI ${m.aiProgress}%</span>
          </div>
          <div class="match-right">
            <span class="match-result ${resultClass}">${resultText}</span>
            <span class="match-elo-change">${eloSign}${m.eloDelta} ELO → ${m.elo}</span>
          </div>
        </div>
      `;
        }).join('');
    }

    function onStartBattle(difficulty) {
        // Show matchmaking overlay
        showOverlay('matchmaking');
        enterGameMode();

        setTimeout(() => {
            hideOverlay();

            // Init battle
            const battle = PvP.startBattle(difficulty);
            battleSelectedCell = null;

            // Update UI
            $('#ai-avatar').textContent = battle.aiAvatar;
            $('#ai-name').textContent = battle.aiName;
            $('#battle-timer').textContent = PvP.formatTime(battle.timeRemaining);
            $('#player-progress').style.width = '0%';
            $('#ai-progress').style.width = '0%';

            showScreen('battle-active');
            renderBattleBoard();

            // Start battle
            PvP.beginBattle(
                // AI progress callback
                (filled, total) => {
                    const pct = Math.round((filled / total) * 100);
                    $('#ai-progress').style.width = pct + '%';
                },
                // Timer tick callback
                (remaining) => {
                    $('#battle-timer').textContent = PvP.formatTime(remaining);
                    if (remaining <= 60) {
                        $('#battle-timer').style.color = 'var(--danger)';
                    }
                },
                // Battle end callback
                (battle) => {
                    showBattleResult(battle);
                }
            );
        }, 2000); // 2s matchmaking delay
    }

    function onBattleCellClick(row, col) {
        const battle = PvP.getBattle();
        if (!battle || battle.ended) return;
        if (battle.original[row][col] !== 0) return;

        battleSelectedCell = { row, col };
        renderBattleBoard();
    }

    function onBattleNumberInput(num) {
        if (!battleSelectedCell) return;
        const { row, col } = battleSelectedCell;

        const result = PvP.playerPlace(row, col, num);
        if (!result) return;

        if (result.isCorrect) {
            const battle = PvP.getBattle();
            const pct = Math.round((battle.playerCellsFilled / battle.aiTotalCells) * 100);
            $('#player-progress').style.width = pct + '%';

            if (result.finished) {
                PvP.playerFinish((bt) => showBattleResult(bt));
            }
        } else {
            // Shake cell
            const bb = $('#battle-board');
            const cell = bb.children[row * 9 + col];
            cell.classList.add('shake');
            setTimeout(() => cell.classList.remove('shake'), 500);
        }

        renderBattleBoard();
    }

    function onBattleErase() {
        if (!battleSelectedCell) return;
        PvP.playerErase(battleSelectedCell.row, battleSelectedCell.col);
        renderBattleBoard();
    }

    function onBattleQuit() {
        PvP.quitBattle((bt) => showBattleResult(bt));
    }

    function showBattleResult(battle) {
        const emoji = battle.result === 'win' ? '🏆' : battle.result === 'lose' ? '😤' : '🤝';
        const title = battle.result === 'win' ? 'Victory!' : battle.result === 'lose' ? 'Defeat' : 'Draw';
        const subtitle = battle.result === 'win'
            ? `You beat ${battle.aiName}! +15 🪙 +75 XP`
            : battle.result === 'lose'
                ? `${battle.aiName} solved it first. Keep practicing!`
                : 'Time ran out. Both sides fought well!';

        const league = Player.getLeague();

        $('#battle-result-emoji').textContent = emoji;
        $('#battle-result-title').textContent = title;
        $('#battle-result-subtitle').textContent = subtitle;
        $('#battle-result-elo-change').textContent = (battle.eloDelta > 0 ? '+' : '') + battle.eloDelta;
        $('#battle-result-new-elo').textContent = Player.getELO();
        $('#battle-result-league').textContent = league.icon + ' ' + league.name;

        showOverlay('battle-result');

        if (battle.result === 'win') {
            createConfetti();
            showXPToast(`+75 XP  •  +15 🪙  •  ${(battle.eloDelta > 0 ? '+' : '') + battle.eloDelta} ELO`);
        }
    }

    // ═══════════════════════════════════════════════════════
    // ── SHOP ───────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════

    function renderShop() {
        $('#shop-coins').textContent = Player.getCoins();
        const grid = $('#theme-grid');
        grid.innerHTML = '';
        const themes = Player.getThemes();
        const activeTheme = Player.getActiveTheme();

        themes.forEach(theme => {
            const owned = Player.isThemeUnlocked(theme.id);
            const equipped = theme.id === activeTheme;

            const card = document.createElement('div');
            card.classList.add('theme-card');
            if (equipped) card.classList.add('equipped');

            card.innerHTML = `
        <div class="theme-preview" style="background: ${theme.preview[0]}">
          ${theme.preview.map(c => `<div class="preview-swatch" style="background: ${c}"></div>`).join('')}
        </div>
        <div class="theme-info">
          <div class="theme-name">${theme.name}</div>
          <div class="theme-desc">${theme.description}</div>
          <button class="theme-action-btn ${equipped ? 'equipped' : owned ? 'equip' : Player.getCoins() >= theme.price ? 'buy' : 'locked'}">
            ${equipped ? '✓ Equipped' : owned ? 'Equip' : Player.getCoins() >= theme.price ? `🪙 ${theme.price} — Buy` : `🔒 ${theme.price} Coins`}
          </button>
        </div>
      `;

            const btn = card.querySelector('.theme-action-btn');
            if (!equipped && owned) {
                btn.addEventListener('click', (e) => { e.stopPropagation(); Player.equipTheme(theme.id); applyTheme(theme.id); renderShop(); });
            } else if (!owned && Player.getCoins() >= theme.price) {
                btn.addEventListener('click', (e) => { e.stopPropagation(); const r = Player.buyTheme(theme.id); if (r.success) { Player.equipTheme(theme.id); applyTheme(theme.id); } renderShop(); });
            }

            grid.appendChild(card);
        });
    }

    // ═══════════════════════════════════════════════════════
    // ── PROFILE ────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════

    function renderProfile() {
        const stats = Player.getStats();
        const xpProgress = Player.getXPProgress();
        const league = Player.getLeague();
        const record = Player.getPvPRecord();

        // Level
        $('#profile-level-badge').textContent = stats.level;
        $('#profile-level').textContent = stats.level;
        $('#profile-xp-bar').style.width = xpProgress.percent + '%';
        $('#profile-xp-text').textContent = `${xpProgress.progress} / ${xpProgress.needed} XP`;

        // League
        $('#profile-league-icon').textContent = league.icon;
        $('#profile-league-name').textContent = league.name;
        $('#profile-elo').textContent = Player.getELO();
        $('#profile-pvp-wins').textContent = record.wins;
        $('#profile-pvp-losses').textContent = record.losses;
        $('#profile-pvp-draws').textContent = record.draws;

        // Streak
        $('#profile-streak-count').textContent = stats.streak;

        // Stats
        $('#stat-games-played').textContent = stats.totalGamesPlayed;
        $('#stat-games-won').textContent = stats.totalGamesWon;
        $('#stat-win-rate').textContent = stats.winRate + '%';
        $('#stat-coins').textContent = Player.getCoins();

        renderQuests();
        renderBestTimes(stats.bestTimes);
    }

    function renderQuests() {
        const quests = Player.getQuests();
        const list = $('#quest-list');
        list.innerHTML = '';
        if (quests.length === 0) {
            list.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem;">No quests yet. Complete a game to generate daily quests!</p>';
            return;
        }
        quests.forEach(quest => {
            const card = document.createElement('div');
            card.classList.add('quest-card');
            if (quest.completed) card.classList.add('completed');
            card.innerHTML = `
        <div class="quest-check">${quest.completed ? '✓' : ''}</div>
        <div class="quest-text">${quest.text}</div>
        <div class="quest-reward">+${quest.xpReward} XP</div>
      `;
            list.appendChild(card);
        });
    }

    function renderBestTimes(bestTimes) {
        const grid = $('#best-times-grid');
        grid.innerHTML = '';
        ['easy', 'medium', 'hard', 'expert', 'evil'].forEach(diff => {
            const item = document.createElement('div');
            item.classList.add('best-time-item');
            item.innerHTML = `<span class="best-time-diff">${capitalize(diff)}</span><span class="best-time-value">${Player.formatTime(bestTimes[diff])}</span>`;
            grid.appendChild(item);
        });
    }

    function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

    return { init, updateTimer, renderBoard };

})();

document.addEventListener('DOMContentLoaded', UI.init);
