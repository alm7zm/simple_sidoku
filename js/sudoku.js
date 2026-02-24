/**
 * Sudoku Engine — Puzzle Generator & Solver
 * Generates unique, solvable 9×9 Sudoku grids with configurable difficulty.
 * Supports seeded generation for reproducible puzzles (challenge mode).
 */

const SudokuEngine = (() => {

  const DIFFICULTY = {
    easy: [38, 45],
    medium: [30, 37],
    hard: [25, 29],
    expert: [22, 24],
    evil: [17, 21],
  };

  // ── Seeded PRNG (Mulberry32) ───────────────────────────
  function mulberry32(seed) {
    let s = seed | 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Active RNG — defaults to Math.random, overridden during seeded generation
  let rng = Math.random;

  function createEmptyGrid() {
    return Array.from({ length: 9 }, () => Array(9).fill(0));
  }

  function cloneGrid(grid) {
    return grid.map(row => [...row]);
  }

  function isValid(grid, row, col, num) {
    for (let c = 0; c < 9; c++) {
      if (grid[row][c] === num) return false;
    }
    for (let r = 0; r < 9; r++) {
      if (grid[r][col] === num) return false;
    }
    const boxRow = Math.floor(row / 3) * 3;
    const boxCol = Math.floor(col / 3) * 3;
    for (let r = boxRow; r < boxRow + 3; r++) {
      for (let c = boxCol; c < boxCol + 3; c++) {
        if (grid[r][c] === num) return false;
      }
    }
    return true;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function fillGrid(grid) {
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (grid[row][col] === 0) {
          const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
          for (const num of nums) {
            if (isValid(grid, row, col, num)) {
              grid[row][col] = num;
              if (fillGrid(grid)) return true;
              grid[row][col] = 0;
            }
          }
          return false;
        }
      }
    }
    return true;
  }

  function countSolutions(grid, limit = 2) {
    let count = 0;
    function solve(g) {
      if (count >= limit) return;
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
          if (g[row][col] === 0) {
            for (let num = 1; num <= 9; num++) {
              if (isValid(g, row, col, num)) {
                g[row][col] = num;
                solve(g);
                g[row][col] = 0;
              }
            }
            return;
          }
        }
      }
      count++;
    }
    solve(cloneGrid(grid));
    return count;
  }

  /**
   * Generate a puzzle.
   * @param {string} difficulty
   * @param {number|null} seed - Optional seed for reproducible puzzle
   */
  function generate(difficulty = 'medium', seed = null) {
    // Set RNG
    if (seed !== null) {
      rng = mulberry32(seed);
    } else {
      rng = Math.random;
    }

    const [minClues, maxClues] = DIFFICULTY[difficulty] || DIFFICULTY.medium;
    const targetClues = Math.floor(rng() * (maxClues - minClues + 1)) + minClues;
    const cellsToRemove = 81 - targetClues;

    const solution = createEmptyGrid();
    fillGrid(solution);

    const puzzle = cloneGrid(solution);
    const positions = shuffle(
      Array.from({ length: 81 }, (_, i) => [Math.floor(i / 9), i % 9])
    );

    let removed = 0;
    for (const [row, col] of positions) {
      if (removed >= cellsToRemove) break;
      const backup = puzzle[row][col];
      puzzle[row][col] = 0;
      if (countSolutions(puzzle) !== 1) {
        puzzle[row][col] = backup;
      } else {
        removed++;
      }
    }

    // Reset RNG
    rng = Math.random;

    return {
      puzzle,
      solution,
      difficulty,
      clues: 81 - removed,
      seed,
    };
  }

  function solve(grid) {
    const copy = cloneGrid(grid);
    return fillGrid(copy) ? copy : null;
  }

  function getDifficulties() {
    return Object.keys(DIFFICULTY);
  }

  /**
   * Generate a random seed integer.
   */
  function randomSeed() {
    return Math.floor(Math.random() * 2147483647);
  }

  return {
    generate,
    solve,
    isValid,
    cloneGrid,
    getDifficulties,
    randomSeed,
    DIFFICULTY,
  };

})();
