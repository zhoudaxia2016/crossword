// Japanese Kana Crossword Generator

function isBlack(c) { return c === "#"; }

function slotKey(s) { return `${s.direction}:${s.row}:${s.col}:${s.length}`; }

function getCell(slot, i) {
  return slot.direction === "across"
    ? { row: slot.row, col: slot.col + i }
    : { row: slot.row + i, col: slot.col };
}

// ── Grid connectivity (BFS) ───────────────────────────────────────

function whiteConnected(grid) {
  const n = grid.length;
  const seen = Array.from({ length: n }, () => Array(n).fill(false));
  let start = null, total = 0;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (!isBlack(grid[r][c])) { total++; if (!start) start = [r, c]; }
  if (!start) return false;
  const q = [start];
  seen[start[0]][start[1]] = true;
  let reached = 0;
  while (q.length) {
    const [r, c] = q.shift();
    reached++;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < n && nc >= 0 && nc < n && !seen[nr][nc] && !isBlack(grid[nr][nc])) {
        seen[nr][nc] = true;
        q.push([nr, nc]);
      }
    }
  }
  return reached === total;
}

// ── Slot extraction ──────────────────────────────────────────────

function extractSlots(grid, minLen, maxLen) {
  const n = grid.length;
  const slots = [];
  const dirs = [
    { d: "across", dr: 0, dc: 1 },
    { d: "down", dr: 1, dc: 0 },
  ];
  for (const { d, dr, dc } of dirs) {
    const visited = Array.from({ length: n }, () => Array(n).fill(false));
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        if (isBlack(grid[r][c]) || visited[r][c]) continue;
        let len = 0;
        let cr = r, cc = c;
        while (cr < n && cc < n && !isBlack(grid[cr][cc])) {
          visited[cr][cc] = true;
          len++;
          cr += dr;
          cc += dc;
        }
        if (len >= minLen && len <= maxLen)
          slots.push({ direction: d, row: r, col: c, length: len });
      }
  }
  return slots;
}

// ── Grid generation ──────────────────────────────────────────────

// Hardcoded black-cell templates for common sizes.
// Cells that would be out of bounds are silently ignored.
const TEMPLATES = {
  5: [
    [[0, 2], [4, 2]],
    [[2, 0], [2, 4]],
    [[0, 0], [4, 4], [0, 4], [4, 0]],
  ],
  6: [
    // known good pattern (ハート・コウシ style, 9 blacks)
    [[0, 3], [1, 0], [1, 2], [2, 4], [3, 0], [3, 5], [4, 1], [4, 3], [5, 4]],
    // variant 1 (8 blacks)
    [[0, 0], [0, 5], [1, 2], [2, 1], [2, 4], [3, 2], [4, 3], [5, 5]],
    // variant 2 (7 blacks)
    [[0, 2], [1, 4], [2, 0], [3, 5], [4, 1], [5, 3]],
  ],
  7: [
    [[0, 3], [1, 5], [2, 1], [3, 0], [3, 6], [4, 5], [5, 1], [6, 3]],
    [[0, 0], [0, 6], [1, 2], [1, 4], [2, 5], [4, 1], [5, 2], [5, 4], [6, 0], [6, 6]],
  ],
  8: [
    [[0, 2], [0, 5], [1, 0], [1, 7], [2, 4], [3, 1], [3, 6], [4, 1], [4, 6], [5, 3], [6, 0], [6, 7], [7, 2], [7, 5]],
    [[0, 3], [1, 1], [1, 6], [2, 4], [3, 0], [3, 7], [4, 0], [4, 7], [5, 3], [6, 1], [6, 6], [7, 4]],
  ],
};

// Algorithmic generator: produce black cells with 180° rotational symmetry.
function generateBlackPattern(size) {
  const n = size;
  const halfR = Math.floor((n + 1) / 2);
  const halfC = Math.floor(n / 2);

  // generate candidate black-cell positions with a staggered pattern
  const cells = [];
  for (let r = 0; r < halfR; r++) {
    // offset so black cells aren't all in the same column
    const offset = (r * 3 + 1) % Math.max(n - 1, 1);
    const c = offset < halfC ? offset : offset + (n % 2 === 0 ? 0 : 0);
    if (c < n) cells.push([r, c]);
  }

  // ensure there's at least 1 black cell per "quadrant" for interesting structure
  if (cells.length < 2 && n >= 4) {
    cells.push([0, Math.floor(n / 3)]);
    cells.push([1, Math.floor(2 * n / 3)]);
  }

  // apply symmetry
  const set = new Set(cells.map(p => `${p[0]},${p[1]}`));
  for (const [r, c] of cells) set.add(`${n - 1 - r},${n - 1 - c}`);
  return [...set].map(s => s.split(",").map(Number));
}

function applyBlacks(size, blacks) {
  const g = Array.from({ length: size }, () => Array(size).fill("."));
  for (const [r, c] of blacks) if (r >= 0 && r < size && c >= 0 && c < size) g[r][c] = "#";
  return g;
}

function generateGridTemplate(size, minLen, maxLen) {
  // 1) Try hardcoded templates
  const templates = TEMPLATES[size] ?? [];
  for (const tmpl of templates) {
    const grid = applyBlacks(size, tmpl);
    if (!whiteConnected(grid)) continue;
    const slots = extractSlots(grid, minLen, maxLen);
    if (slots.length === 0) continue;
    if (!slots.every(s => s.length <= maxLen)) continue;
    return { grid, slots };
  }

  // 2) Try algorithmic patterns with different seeds
  for (let attempt = 0; attempt < 20; attempt++) {
    const blacks = generateBlackPattern(size);
    // add some random jitter for variety
    const expanded = new Set(blacks.map(p => `${p[0]},${p[1]}`));
    const rng = createRng(attempt * 9973 + 1);
    // maybe add a couple extra blacks
    if (size >= 5 && attempt > 5) {
      const extra = rng.nextInt(Math.max(1, Math.floor(size / 2)));
      for (let i = 0; i < extra; i++) {
        const br = rng.nextInt(Math.floor((size + 1) / 2));
        const bc = rng.nextInt(size);
        expanded.add(`${br},${bc}`);
        expanded.add(`${size - 1 - br},${size - 1 - bc}`);
      }
    }
    const grid = applyBlacks(size, [...expanded].map(s => s.split(",").map(Number)));
    if (!whiteConnected(grid)) continue;
    const slots = extractSlots(grid, minLen, maxLen);
    if (slots.length === 0) continue;
    if (!slots.every(s => s.length <= maxLen)) continue;
    return { grid, slots };
  }

  // 3) Fallback: all-white
  const grid = Array.from({ length: size }, () => Array(size).fill("."));
  return { grid, slots: extractSlots(grid, minLen, maxLen) };
}

// ── Constraint graph ─────────────────────────────────────────────

function buildAdj(slots) {
  const across = slots.filter(s => s.direction === "across");
  const down = slots.filter(s => s.direction === "down");
  const adj = new Map();
  for (const s of slots) adj.set(slotKey(s), []);

  for (const a of across) {
    for (let ai = 0; ai < a.length; ai++) {
      const { row, col } = getCell(a, ai);
      for (const d of down) {
        if (col === d.col && row >= d.row && row < d.row + d.length) {
          const di = row - d.row;
          const ak = slotKey(a), dk = slotKey(d);
          adj.get(ak).push({ nb: dk, myIdx: ai, nbIdx: di });
          adj.get(dk).push({ nb: ak, myIdx: di, nbIdx: ai });
          break;
        }
      }
    }
  }
  return adj;
}

// ── Lexicon ──────────────────────────────────────────────────────

function indexLexicon(lexicon) {
  const byLen = new Map();
  for (const e of lexicon) {
    const len = e.reading.length;
    if (!byLen.has(len)) byLen.set(len, []);
    byLen.get(len).push(e);
  }
  return byLen;
}

function jlptRank(level) {
  if (typeof level !== "string") return null;
  const m = level.match(/^N([1-5])$/i);
  return m ? Number(m[1]) : null;
}

function filterCandidate(entry, wc) {
  if (!wc) return true;
  const { maxJlptLevel, allowedPos, tags } = wc;
  if (maxJlptLevel) {
    const lr = jlptRank(entry.level), mr = jlptRank(maxJlptLevel);
    if (lr !== null && mr !== null && lr < mr) return false;
  }
  if (allowedPos?.length && !allowedPos.includes(entry.pos)) return false;
  if (tags?.length) {
    const et = new Set(entry.tags ?? []);
    if (!tags.every(t => et.has(t))) return false;
  }
  return true;
}

function buildCandidates(lexiconByLen, slots, wc) {
  const map = new Map();
  for (const s of slots) {
    const all = lexiconByLen.get(s.length) ?? [];
    const filtered = wc ? all.filter(e => filterCandidate(e, wc)) : all;
    map.set(slotKey(s), filtered);
  }
  return map;
}

// ── RNG ──────────────────────────────────────────────────────────

function createRng(seed) {
  let s = (seed * 2654435761) >>> 0;
  if (s === 0) s = 1;
  return {
    next(n) {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s % n;
    },
    shuffle(arr) {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = this.next(i + 1);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
}

// ── CSP solver ───────────────────────────────────────────────────

function solveCSP(slots, adj, candidates, rng) {
  const assigned = new Map();
  const usedWords = new Set();

  function search(remaining) {
    if (assigned.size === slots.length) return assigned;

    let bestKey = null, bestLen = Infinity, bestList = null;
    for (const [k, list] of remaining) {
      if (assigned.has(k)) continue;
      if (list.length < bestLen) {
        bestLen = list.length;
        bestKey = k;
        bestList = list;
        if (bestLen === 0) return null;
        if (bestLen === 1) break;
      }
    }
    if (!bestKey) return assigned;

    const order = bestList.length <= 3
      ? [...Array(bestList.length).keys()]
      : rng.shuffle([...Array(bestList.length).keys()]);

    for (const idx of order) {
      const entry = bestList[idx];

      // skip if word already used in this puzzle
      if (usedWords.has(entry.word)) continue;

      // check consistency against already assigned neighbors
      let ok = true;
      for (const { nb, myIdx, nbIdx } of adj.get(bestKey) ?? []) {
        if (!assigned.has(nb)) continue;
        if (Array.from(entry.reading)[myIdx] !== Array.from(assigned.get(nb).reading)[nbIdx]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      // assign
      assigned.set(bestKey, entry);
      usedWords.add(entry.word);

      // forward-check neighbors
      let dead = false;
      const filtered = new Map();
      for (const [k, list] of remaining) {
        if (k === bestKey || assigned.has(k)) { filtered.set(k, list); continue; }
        let f = list;
        for (const { nb, myIdx, nbIdx } of adj.get(k) ?? []) {
          if (!assigned.has(nb)) continue;
          const ch = Array.from(assigned.get(nb).reading)[nbIdx];
          f = f.filter(e => Array.from(e.reading)[myIdx] === ch);
          if (f.length === 0) { dead = true; break; }
        }
        // also filter out already-used words
        if (!dead) {
          f = f.filter(e => !usedWords.has(e.word));
          if (f.length === 0) dead = true;
        }
        if (dead) break;
        filtered.set(k, f);
      }

      if (!dead) {
        const result = search(filtered);
        if (result) return result;
      }

      assigned.delete(bestKey);
      usedWords.delete(entry.word);
    }
    return null;
  }

  return search(candidates);
}

// ── Slot numbering ───────────────────────────────────────────────

function numberSlots(slots) {
  const sorted = [...slots].sort((a, b) => a.row - b.row || a.col - b.col);
  const posToNum = new Map();
  let next = 1;
  return sorted.map(s => {
    const k = `${s.row}:${s.col}`;
    if (!posToNum.has(k)) posToNum.set(k, next++);
    return { ...s, number: posToNum.get(k) };
  });
}

// ── Exported API ─────────────────────────────────────────────────

export function generateGrid(input) {
  const { gridConstraints } = input;
  const size = gridConstraints.size;
  const minLen = gridConstraints.minEntryLength ?? 2;
  const maxLen = gridConstraints.maxEntryLength ?? size;
  const { grid, slots } = generateGridTemplate(size, minLen, maxLen);
  return { size, grid, slots };
}

export function fillGrid(input) {
  const { grid, slots, lexicon, gridConstraints, wordConstraints = {}, wordPreferences = {}, count } = input;
  const size = gridConstraints.size;

  const adj = buildAdj(slots);
  const byLen = indexLexicon(lexicon);
  const baseCandidates = buildCandidates(byLen, slots, wordConstraints);

  for (const [k, list] of baseCandidates) {
    if (list.length === 0) return { size, grid, slots, puzzles: [] };
  }

  const numbered = numberSlots(slots);
  const numMap = new Map(numbered.map(s => [slotKey(s), s.number]));

  const puzzles = [];
  const wordBlacklist = new Set();

  // try up to `count * 5` times to produce `count` distinct puzzles
  for (let attempt = 0; attempt < count * 5 && puzzles.length < count; attempt++) {
    const rng = createRng(attempt * 104729 + 1);
    const result = solveCSP(slots, adj, baseCandidates, rng);
    if (!result) break;

    const entries = [];
    for (const [k, entry] of result) {
      const s = slots.find(sl => slotKey(sl) === k);
      entries.push({
        number: numMap.get(k),
        direction: s.direction,
        row: s.row,
        col: s.col,
        word: entry.word,
        reading: entry.reading,
        clue: entry.clue,
      });
    }
    entries.sort((a, b) => a.number - b.number);

    // dedup puzzles (prevent identical solutions)
    const sig = entries.map(e => `${e.word}::${e.reading}`).sort().join("|");
    if (puzzles.some(p => p._sig === sig)) continue;
    puzzles.push({ entries, _sig: sig });
  }

  // remove internal sig
  for (const p of puzzles) delete p._sig;

  return { size, grid, slots, puzzles };
}

export function generateCrossword(input) {
  const { lexicon, gridConstraints, wordConstraints } = input;
  const { size, grid, slots } = generateGrid({ gridConstraints });
  const fill = fillGrid({ grid, slots, lexicon, gridConstraints, wordConstraints, count: 1 });
  return { size, grid, slots, entries: fill.puzzles[0]?.entries ?? [] };
}
