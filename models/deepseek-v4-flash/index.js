// fillGrid — Japanese Kana Crossword Filler (benchmark-only)

function slotKey(s) { return `${s.direction}:${s.row}:${s.col}:${s.length}`; }

function getCell(slot, i) {
  return slot.direction === "across"
    ? { row: slot.row, col: slot.col + i }
    : { row: slot.row + i, col: slot.col };
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
          adj.get(slotKey(a)).push({ nb: slotKey(d), myIdx: ai, nbIdx: di });
          adj.get(slotKey(d)).push({ nb: slotKey(a), myIdx: di, nbIdx: ai });
          break;
        }
      }
    }
  }
  return adj;
}

// ── Lexicon ──────────────────────────────────────────────────────

function jlptRank(level) {
  if (typeof level !== "string") return null;
  const m = level.match(/^N([1-5])$/i);
  return m ? Number(m[1]) : null;
}

function indexLexicon(lexicon) {
  const byLen = new Map();
  for (const e of lexicon) {
    const normalizedReading = e.normalizedReading ?? e.reading;
    const len = normalizedReading.length;
    if (!byLen.has(len)) byLen.set(len, []);
    byLen.get(len).push({
      ...e,
      normalizedReading,
      readingChars: [...normalizedReading],
      jlptRank: jlptRank(e.level) ?? 0,
    });
  }
  return byLen;
}

function buildCandidates(lexiconByLen, slots) {
  const map = new Map();
  for (const s of slots) {
    map.set(slotKey(s), lexiconByLen.get(s.length) ?? []);
  }
  return map;
}

// ── Word preferences ─────────────────────────────────────────────

function computePreferenceScore(entry, wp) {
  if (!wp) return 0;
  let matchCount = 0, total = 0;

  if (wp.preferredTags?.length) {
    total++;
    const et = new Set(entry.tags ?? []);
    if (wp.preferredTags.some(t => et.has(t))) matchCount++;
  }
  if (wp.preferredPos?.length) {
    total++;
    if (wp.preferredPos.includes(entry.pos)) matchCount++;
  }
  if (wp.preferredLevels?.length) {
    total++;
    if (wp.preferredLevels.includes(entry.level)) matchCount++;
  }
  return total === 0 ? 0 : matchCount / total;
}

function sortCandidates(candidates, wp) {
  for (const [k, list] of candidates) {
    const scored = list.map(e => ({
      entry: e,
      score: wp ? computePreferenceScore(e, wp) : 0,
    }));
    scored.sort((a, b) => b.score - a.score || b.entry.jlptRank - a.entry.jlptRank || a.entry.readingChars.length - b.entry.readingChars.length);
    candidates.set(k, scored.map(s => s.entry));
  }
}

// ── RNG ──────────────────────────────────────────────────────────

function createRng(seed) {
  let s = (seed * 2654435761) >>> 0;
  if (s === 0) s = 1;
  return {
    next(n) { s = (s * 1664525 + 1013904223) >>> 0; return s % n; },
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

function solveCSP(slots, adj, candidates, rng, nodeLimit) {
  const assigned = new Map();
  const usedWords = new Set();
  let nodeCount = 0;

  function search(remaining) {
    if (assigned.size === slots.length) return assigned;
    if (nodeLimit && ++nodeCount > nodeLimit) return null;

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
      if (usedWords.has(entry.word)) continue;

      let ok = true;
      for (const { nb, myIdx, nbIdx } of adj.get(bestKey) ?? []) {
        if (!assigned.has(nb)) continue;
        if (entry.readingChars[myIdx] !== assigned.get(nb).readingChars[nbIdx]) {
          ok = false; break;
        }
      }
      if (!ok) continue;

      assigned.set(bestKey, entry);
      usedWords.add(entry.word);

      let dead = false;
      const filtered = new Map();
      for (const [k, list] of remaining) {
        if (k === bestKey || assigned.has(k)) { filtered.set(k, list); continue; }
        let f = list;
        for (const { nb, myIdx, nbIdx } of adj.get(k) ?? []) {
          if (!assigned.has(nb)) continue;
          const c = assigned.get(nb).readingChars[nbIdx];
          f = f.filter(e => e.readingChars[myIdx] === c);
          if (f.length === 0) { dead = true; break; }
        }
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

export function fillGrid(input) {
  const { grid, slots, lexicon, gridConstraints, wordPreferences, count } = input;
  const size = gridConstraints.size;

  const adj = buildAdj(slots);
  const byLen = indexLexicon(lexicon);
  const baseCandidates = buildCandidates(byLen, slots);
  sortCandidates(baseCandidates, wordPreferences);

  for (const [, list] of baseCandidates) {
    if (list.length === 0) return { size, grid, slots, puzzles: [] };
  }

  const numbered = numberSlots(slots);
  const numMap = new Map(numbered.map(s => [slotKey(s), s.number]));

  // Build preferred-only candidate set for phase-1
  const prefCandidates = new Map();
  let hasAnyPrefs = false;
  for (const [k, list] of baseCandidates) {
    if (wordPreferences) {
      const prefs = list.filter(e => computePreferenceScore(e, wordPreferences) > 0);
      if (prefs.length >= 3) { prefCandidates.set(k, prefs); hasAnyPrefs = true; continue; }
    }
    prefCandidates.set(k, list);
  }

  const puzzles = [];
  let prefFailures = 0;

  for (let attempt = 0; attempt < count * 8 && puzzles.length < count; attempt++) {
    const usePref = hasAnyPrefs && attempt < count * 2 && prefFailures < Math.ceil(count / 2);
    const cset = usePref ? prefCandidates : baseCandidates;
    const rng = createRng(attempt * 104729 + 1);
    const limit = usePref ? 15000 : 0;
    const result = solveCSP(slots, adj, cset, rng, limit);
    if (!result) {
      if (!usePref) break;
      prefFailures++;
      continue;
    }
    prefFailures = 0;

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
        normalizedReading: entry.normalizedReading,
        clue: entry.clue,
      });
    }
    entries.sort((a, b) => a.number - b.number);

    const sig = entries.map(e => `${e.word}::${e.normalizedReading ?? e.reading}`).sort().join("|");
    if (puzzles.some(p => p._sig === sig)) continue;
    puzzles.push({ entries, _sig: sig });
  }

  for (const p of puzzles) delete p._sig;
  return { size, grid, slots, puzzles };
}
