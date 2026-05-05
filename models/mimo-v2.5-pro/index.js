const SMALL_TO_LARGE = new Map([
  ["ぁ", "あ"], ["ぃ", "い"], ["ぅ", "う"], ["ぇ", "え"], ["ぉ", "お"],
  ["ゃ", "や"], ["ゅ", "ゆ"], ["ょ", "よ"], ["っ", "つ"], ["ゎ", "わ"],
  ["ァ", "ア"], ["ィ", "イ"], ["ゥ", "ウ"], ["ェ", "エ"], ["ォ", "オ"],
  ["ャ", "ヤ"], ["ュ", "ユ"], ["ョ", "ヨ"], ["ッ", "ツ"], ["ヮ", "ワ"],
]);

function normalizeKana(text) {
  return Array.from(String(text ?? ""))
    .map((ch) => SMALL_TO_LARGE.get(ch) ?? ch)
    .join("");
}

function getSlotCell(slot, index) {
  return slot.direction === "across"
    ? { row: slot.row, col: slot.col + index }
    : { row: slot.row + index, col: slot.col };
}

function buildLexiconIndex(lexicon) {
  const byLength = new Map();
  for (const entry of lexicon) {
    const reading = normalizeKana(entry.reading ?? "");
    const chars = Array.from(reading);
    const len = chars.length;
    if (len === 0) continue;
    if (!byLength.has(len)) byLength.set(len, []);
    byLength.get(len).push({
      word: entry.word,
      reading: entry.reading,
      normalizedReading: reading,
      chars,
      clue: entry.clue,
      pos: entry.pos,
      level: entry.level,
      tags: entry.tags,
    });
  }
  return byLength;
}

function buildCharIndex(byLength) {
  const charIndex = new Map();
  for (const [len, candidates] of byLength) {
    const posIndex = new Array(len);
    for (let p = 0; p < len; p++) posIndex[p] = new Map();
    for (let ci = 0; ci < candidates.length; ci++) {
      const entry = candidates[ci];
      for (let p = 0; p < len; p++) {
        const ch = entry.chars[p];
        if (!posIndex[p].has(ch)) posIndex[p].set(ch, []);
        posIndex[p].get(ch).push(ci);
      }
    }
    charIndex.set(len, posIndex);
  }
  return charIndex;
}

function buildSlotMeta(slots) {
  const cellToSlots = new Map();
  for (let si = 0; si < slots.length; si++) {
    const slot = slots[si];
    for (let pi = 0; pi < slot.length; pi++) {
      const { row, col } = getSlotCell(slot, pi);
      const key = `${row}:${col}`;
      if (!cellToSlots.has(key)) cellToSlots.set(key, []);
      cellToSlots.get(key).push({ slotIdx: si, posIdx: pi });
    }
  }
  const crossingSlots = new Array(slots.length);
  for (let si = 0; si < slots.length; si++) {
    const set = new Set();
    const slot = slots[si];
    for (let pi = 0; pi < slot.length; pi++) {
      const { row, col } = getSlotCell(slot, pi);
      for (const occ of cellToSlots.get(`${row}:${col}`) ?? []) {
        if (occ.slotIdx !== si) set.add(occ.slotIdx);
      }
    }
    crossingSlots[si] = [...set];
  }
  return { cellToSlots, crossingSlots };
}

function computeSlotNumbers(slots) {
  const starts = new Map();
  for (const slot of slots) {
    const key = `${slot.row}:${slot.col}`;
    if (!starts.has(key)) starts.set(key, []);
    starts.get(key).push(slot);
  }
  const numbered = [];
  for (const [, group] of starts) {
    const across = group.filter((s) => s.direction === "across");
    const down = group.filter((s) => s.direction === "down");
    across.sort((a, b) => a.col - b.col);
    down.sort((a, b) => a.row - b.row);
    for (const s of across) numbered.push(s);
    for (const s of down) numbered.push(s);
  }
  numbered.sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row;
    if (a.col !== b.col) return a.col - b.col;
    return a.direction === "across" ? -1 : 1;
  });
  const numberMap = new Map();
  let num = 1;
  for (const slot of numbered) {
    const key = `${slot.direction}:${slot.row}:${slot.col}:${slot.length}`;
    if (!numberMap.has(key)) numberMap.set(key, num++);
  }
  return numberMap;
}

function getMatchingCandidates(si, slots, gridState, usedWords, byLength, charIndex) {
  const slot = slots[si];
  const len = slot.length;
  const pool = byLength.get(len);
  if (!pool) return [];
  const posIdx = charIndex.get(len);
  if (!posIdx) return [];

  const fixed = [];
  for (let i = 0; i < len; i++) {
    const { row, col } = getSlotCell(slot, i);
    if (gridState[row][col] !== null) {
      fixed.push([i, gridState[row][col]]);
    }
  }

  if (fixed.length === 0) {
    return pool.filter((e) => !usedWords.has(e.word));
  }

  let smallestIndices = null;
  let smallestSize = Infinity;
  for (const [pos, ch] of fixed) {
    const indices = posIdx[pos].get(ch);
    if (!indices) return [];
    if (indices.length < smallestSize) {
      smallestSize = indices.length;
      smallestIndices = indices;
    }
  }

  const result = [];
  for (const ci of smallestIndices) {
    const entry = pool[ci];
    if (usedWords.has(entry.word)) continue;
    let ok = true;
    for (const [pos, ch] of fixed) {
      if (entry.chars[pos] !== ch) { ok = false; break; }
    }
    if (ok) result.push(entry);
  }
  return result;
}

function countMatching(si, slots, gridState, usedWords, byLength, charIndex) {
  const slot = slots[si];
  const len = slot.length;
  const pool = byLength.get(len);
  if (!pool) return 0;
  const posIdx = charIndex.get(len);
  if (!posIdx) return 0;

  const fixed = [];
  for (let i = 0; i < len; i++) {
    const { row, col } = getSlotCell(slot, i);
    if (gridState[row][col] !== null) {
      fixed.push([i, gridState[row][col]]);
    }
  }

  if (fixed.length === 0) {
    let count = 0;
    for (const entry of pool) {
      if (!usedWords.has(entry.word)) count++;
    }
    return count;
  }

  let smallestIndices = null;
  let smallestSize = Infinity;
  for (const [pos, ch] of fixed) {
    const indices = posIdx[pos].get(ch);
    if (!indices) return 0;
    if (indices.length < smallestSize) {
      smallestSize = indices.length;
      smallestIndices = indices;
    }
  }

  let count = 0;
  for (const ci of smallestIndices) {
    const entry = pool[ci];
    if (usedWords.has(entry.word)) continue;
    let ok = true;
    for (const [pos, ch] of fixed) {
      if (entry.chars[pos] !== ch) { ok = false; break; }
    }
    if (ok) count++;
  }
  return count;
}

export function fillGrid({ grid, slots, lexicon, gridConstraints, wordPreferences, count }) {
  const size = gridConstraints?.size ?? grid.length;
  const byLength = buildLexiconIndex(lexicon);
  const charIndex = buildCharIndex(byLength);
  const { cellToSlots, crossingSlots } = buildSlotMeta(slots);

  const prefTags = new Set(wordPreferences?.preferredTags ?? []);
  const prefPos = new Set(wordPreferences?.preferredPos ?? []);
  const prefLevels = new Set(wordPreferences?.preferredLevels ?? []);

  function candidateScore(entry) {
    let s = 0;
    if (prefTags.size > 0 && entry.tags?.some((t) => prefTags.has(t))) s += 10;
    if (prefPos.size > 0 && prefPos.has(entry.pos)) s += 5;
    if (prefLevels.size > 0 && prefLevels.has(entry.level)) s += 3;
    return s;
  }

  const hasPrefs = prefTags.size > 0 || prefPos.size > 0 || prefLevels.size > 0;

  const slotNumberMap = computeSlotNumbers(slots);
  const slotKeys = slots.map((s) => `${s.direction}:${s.row}:${s.col}:${s.length}`);

  if (slots.length === 0) {
    const puzzles = [];
    for (let i = 0; i < count; i++) puzzles.push({ entries: [] });
    return { size, grid, slots, puzzles };
  }

  function placeSlot(si, entry, gridState) {
    const slot = slots[si];
    for (let i = 0; i < slot.length; i++) {
      const { row, col } = getSlotCell(slot, i);
      gridState[row][col] = entry.chars[i];
    }
  }

  function unplaceSlot(si, placed, gridState) {
    const slot = slots[si];
    for (let i = 0; i < slot.length; i++) {
      const { row, col } = getSlotCell(slot, i);
      const key = `${row}:${col}`;
      const occupants = cellToSlots.get(key) ?? [];
      let usedByOther = false;
      for (const occ of occupants) {
        if (occ.slotIdx !== si && placed[occ.slotIdx] !== null) {
          usedByOther = true;
          break;
        }
      }
      if (!usedByOther) gridState[row][col] = null;
    }
  }

  function solveOne(maxBacktracks) {
    const gridState = Array.from({ length: size }, () => Array(size).fill(null));
    const placed = new Array(slots.length).fill(null);
    const usedWords = new Set();
    let backtracks = 0;

    function selectNext() {
      let bestIdx = -1;
      let bestCount = Infinity;
      for (let si = 0; si < slots.length; si++) {
        if (placed[si] !== null) continue;
        const cnt = countMatching(si, slots, gridState, usedWords, byLength, charIndex);
        if (cnt === 0) return { idx: si, count: 0 };
        if (cnt < bestCount) {
          bestCount = cnt;
          bestIdx = si;
        }
      }
      if (bestIdx === -1) return null;
      return { idx: bestIdx, count: bestCount };
    }

    function solve(depth) {
      if (depth === slots.length) return true;
      if (backtracks >= maxBacktracks) return false;

      const next = selectNext();
      if (!next) return true;
      if (next.count === 0) return false;

      let cands = getMatchingCandidates(next.idx, slots, gridState, usedWords, byLength, charIndex);
      if (cands.length === 0) return false;

      // Shuffle with preference bias: preferred candidates tried first, but all remain available
      if (hasPrefs) {
        const preferred = [];
        const rest = [];
        for (const e of cands) {
          (candidateScore(e) > 0 ? preferred : rest).push(e);
        }
        for (let i = preferred.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [preferred[i], preferred[j]] = [preferred[j], preferred[i]];
        }
        for (let i = rest.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [rest[i], rest[j]] = [rest[j], rest[i]];
        }
        cands = [...preferred, ...rest];
      } else {
        for (let i = cands.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [cands[i], cands[j]] = [cands[j], cands[i]];
        }
      }

      for (const entry of cands) {
        placeSlot(next.idx, entry, gridState);
        placed[next.idx] = entry;
        usedWords.add(entry.word);

        // Forward check
        let forwardOk = true;
        for (const ci of crossingSlots[next.idx]) {
          if (placed[ci] !== null) continue;
          if (countMatching(ci, slots, gridState, usedWords, byLength, charIndex) === 0) {
            forwardOk = false;
            break;
          }
        }

        if (forwardOk && solve(depth + 1)) return true;

        unplaceSlot(next.idx, placed, gridState);
        placed[next.idx] = null;
        usedWords.delete(entry.word);
        backtracks++;
        if (backtracks >= maxBacktracks) return false;
      }
      return false;
    }

    if (!solve(0)) return null;

    const entries = [];
    for (let si = 0; si < slots.length; si++) {
      const slot = slots[si];
      const entry = placed[si];
      if (!entry) continue;
      entries.push({
        number: slotNumberMap.get(slotKeys[si]) ?? 0,
        direction: slot.direction,
        row: slot.row,
        col: slot.col,
        word: entry.word,
        reading: entry.reading,
        normalizedReading: entry.normalizedReading,
        clue: entry.clue,
      });
    }
    return entries;
  }

  function makeVariation(baseEntries, swapCount) {
    const gridState = Array.from({ length: size }, () => Array(size).fill(null));
    const usedWords = new Set();
    const entryBySlotIdx = new Array(slots.length);

    for (let si = 0; si < slots.length; si++) {
      const slot = slots[si];
      const entry = baseEntries.find(
        (e) => e.direction === slot.direction && e.row === slot.row && e.col === slot.col,
      );
      if (!entry) return null;
      const lexEntry = byLength.get(slot.length)?.find((c) => c.word === entry.word);
      if (!lexEntry) return null;
      entryBySlotIdx[si] = lexEntry;
      usedWords.add(lexEntry.word);
      for (let i = 0; i < slot.length; i++) {
        const { row, col } = getSlotCell(slot, i);
        gridState[row][col] = lexEntry.chars[i];
      }
    }

    const slotOrder = [...Array(slots.length).keys()];
    for (let i = slotOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [slotOrder[i], slotOrder[j]] = [slotOrder[j], slotOrder[i]];
    }

    let swapsDone = 0;
    for (const si of slotOrder) {
      if (swapsDone >= swapCount) break;
      const slot = slots[si];
      const currentEntry = entryBySlotIdx[si];
      const candidates = byLength.get(slot.length);
      if (!candidates) continue;

      const fixed = new Map();
      for (let i = 0; i < slot.length; i++) {
        const { row, col } = getSlotCell(slot, i);
        for (const occ of cellToSlots.get(`${row}:${col}`) ?? []) {
          if (occ.slotIdx !== si && entryBySlotIdx[occ.slotIdx] !== null) {
            fixed.set(i, gridState[row][col]);
            break;
          }
        }
      }

      const alternatives = [];
      for (const cand of candidates) {
        if (cand.word === currentEntry.word || usedWords.has(cand.word)) continue;
        let ok = true;
        for (const [idx, ch] of fixed) {
          if (cand.chars[idx] !== ch) { ok = false; break; }
        }
        if (ok) alternatives.push(cand);
      }

      if (alternatives.length === 0) continue;

      const chosen = alternatives[Math.floor(Math.random() * alternatives.length)];
      usedWords.delete(currentEntry.word);
      for (let i = 0; i < slot.length; i++) {
        const { row, col } = getSlotCell(slot, i);
        gridState[row][col] = chosen.chars[i];
      }
      entryBySlotIdx[si] = chosen;
      usedWords.add(chosen.word);
      swapsDone++;
    }

    if (swapsDone === 0) return null;

    const entries = [];
    for (let ssi = 0; ssi < slots.length; ssi++) {
      const s = slots[ssi];
      const e = entryBySlotIdx[ssi];
      entries.push({
        number: slotNumberMap.get(slotKeys[ssi]) ?? 0,
        direction: s.direction,
        row: s.row,
        col: s.col,
        word: e.word,
        reading: e.reading,
        normalizedReading: e.normalizedReading,
        clue: e.clue,
      });
    }
    return entries;
  }

  function signature(entries) {
    return entries.map((e) => e.word).sort().join(",");
  }

  const puzzles = [];
  const seen = new Set();
  const baseSolutions = [];
  const startTime = Date.now();
  const timeLimit = 28000;
  let firstSolutionTime = null;

  for (let attempt = 0; attempt < 300; attempt++) {
    if (Date.now() - startTime > timeLimit) break;
    if (puzzles.length >= count) break;

    // Bail early if no solution found within 2 seconds (likely unsolvable)
    if (!firstSolutionTime && Date.now() - startTime > 2000) break;

    const entries = solveOne(2000000);
    if (!entries) continue;
    if (!firstSolutionTime) firstSolutionTime = Date.now() - startTime;
    const sig = signature(entries);
    if (seen.has(sig)) continue;
    seen.add(sig);
    baseSolutions.push(entries);
    puzzles.push({ entries });
  }

  if (puzzles.length < count && baseSolutions.length > 0) {
    for (let swapCount = 1; swapCount <= 4 && puzzles.length < count; swapCount++) {
      let failed = 0;
      while (puzzles.length < count && failed < count * 100 && Date.now() - startTime < timeLimit) {
        const base = baseSolutions[Math.floor(Math.random() * baseSolutions.length)];
        const variation = makeVariation(base, swapCount);
        if (!variation) { failed++; continue; }
        const sig = signature(variation);
        if (seen.has(sig)) { failed++; continue; }
        seen.add(sig);
        puzzles.push({ entries: variation });
        failed = 0;
      }
    }
  }

  return { size, grid, slots, puzzles };
}
