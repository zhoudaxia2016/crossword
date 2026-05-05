const SMALL_TO_LARGE = new Map([
  ["ぁ", "あ"], ["ぃ", "い"], ["ぅ", "う"], ["ぇ", "え"], ["ぉ", "お"],
  ["ゃ", "や"], ["ゅ", "ゆ"], ["ょ", "よ"], ["っ", "つ"], ["ゎ", "わ"],
  ["ァ", "ア"], ["ィ", "イ"], ["ゥ", "ウ"], ["ェ", "エ"], ["ォ", "オ"],
  ["ャ", "ヤ"], ["ュ", "ユ"], ["ョ", "ヨ"], ["ッ", "ツ"], ["ヮ", "ワ"],
]);

function normalizeKana(text) {
  return Array.from(String(text ?? "")).map((c) => SMALL_TO_LARGE.get(c) ?? c).join("");
}

function slotKey(slot) {
  return `${slot.direction}:${slot.row}:${slot.col}:${slot.length}`;
}

function getSlotCells(slot) {
  const cells = [];
  for (let i = 0; i < slot.length; i++) {
    if (slot.direction === "across") {
      cells.push({ row: slot.row, col: slot.col + i });
    } else {
      cells.push({ row: slot.row + i, col: slot.col });
    }
  }
  return cells;
}

function preprocessLexicon(lexicon, gridConstraints) {
  const { minEntryLength, maxEntryLength } = gridConstraints;
  const minLen = minEntryLength ?? 1;
  const maxLen = maxEntryLength ?? Infinity;
  const result = [];
  for (const entry of lexicon) {
    const readingNorm = normalizeKana(entry.reading);
    const cells = Array.from(readingNorm);
    const len = cells.length;
    if (len < minLen || len > maxLen) continue;
    result.push({
      word: entry.word,
      reading: entry.reading,
      normalizedReading: readingNorm,
      clue: entry.clue,
      pos: entry.pos,
      level: entry.level,
      tags: entry.tags,
      _cells: cells,
      _len: len,
    });
  }
  return result;
}

function buildLexiconIndex(lexicon) {
  const byLength = new Map();
  for (const entry of lexicon) {
    if (!byLength.has(entry._len)) {
      byLength.set(entry._len, []);
    }
    byLength.get(entry._len).push(entry);
  }
  return byLength;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getCandidates(slot, cellChars, byLength, usedWords) {
  const lengthEntries = byLength.get(slot.length);
  if (!lengthEntries) return [];

  const pattern = [];
  for (const cell of slot._cells) {
    pattern.push(cellChars.get(`${cell.row}:${cell.col}`) ?? null);
  }

  const candidates = [];
  for (const entry of lengthEntries) {
    if (usedWords.has(entry.word)) continue;
    let match = true;
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i] !== null && pattern[i] !== entry._cells[i]) {
        match = false;
        break;
      }
    }
    if (match) candidates.push(entry);
  }

  return candidates;
}

function computePreferenceScore(entry, wordPreferences) {
  let score = 0;
  if (wordPreferences?.preferredTags?.length > 0) {
    const tags = new Set(entry.tags ?? []);
    if (wordPreferences.preferredTags.some((t) => tags.has(t))) score++;
  }
  if (wordPreferences?.preferredPos?.length > 0) {
    if (wordPreferences.preferredPos.includes(entry.pos)) score++;
  }
  if (wordPreferences?.preferredLevels?.length > 0) {
    if (wordPreferences.preferredLevels.includes(entry.level)) score++;
  }
  return score;
}

function selectCandidates(slot, cellChars, byLength, usedWords, wordPreferences, filledCount, bannedWords) {
  let candidates = getCandidates(slot, cellChars, byLength, usedWords);
  if (candidates.length === 0) return candidates;

  const hasPrefs =
    (wordPreferences?.preferredTags?.length ?? 0) > 0 ||
    (wordPreferences?.preferredPos?.length ?? 0) > 0 ||
    (wordPreferences?.preferredLevels?.length ?? 0) > 0;

  // Score all candidates
  for (const entry of candidates) {
    let sortScore = 0;
    if (hasPrefs) {
      sortScore += computePreferenceScore(entry, wordPreferences);
    }
    // Soft-penalize words used in previous puzzles to encourage diversity
    // -1 penalty means preferred-but-used words are tried after non-preferred fresh words
    if (bannedWords?.has(entry.word)) {
      sortScore -= 1;
    }
    entry._sortScore = sortScore;
  }

  // Shuffle first, then stable sort by score (higher first)
  shuffle(candidates);
  candidates.sort((a, b) => b._sortScore - a._sortScore);

  // Limit candidates when slot is weakly constrained
  const weakConstraint = filledCount <= 1;
  const MAX_CANDIDATES = weakConstraint ? 60 : Infinity;

  if (candidates.length > MAX_CANDIDATES) {
    candidates = candidates.slice(0, MAX_CANDIDATES);
  }

  return candidates;
}

function assignEntryNumbers(slots, placedEntries) {
  const cellToNumber = new Map();
  let nextNumber = 1;

  const sortedSlots = [...slots].sort((a, b) => a.row - b.row || a.col - b.col);

  for (const slot of sortedSlots) {
    const key = `${slot.row}:${slot.col}`;
    if (!cellToNumber.has(key)) {
      cellToNumber.set(key, nextNumber++);
    }
  }

  for (const entry of placedEntries) {
    entry.number = cellToNumber.get(`${entry.row}:${entry.col}`);
  }
}

const MAX_BACKTRACK_NODES = 5000;

function solveOne(slots, byLength, wordPreferences, bannedWords) {
  const cellChars = new Map();
  const usedWords = new Set();
  const placed = [];
  const unfilledKeys = new Set(slots.map((s) => s._key));
  const keyToSlot = new Map(slots.map((s) => [s._key, s]));
  let nodeCount = 0;

  function backtrack() {
    if (unfilledKeys.size === 0) return true;
    if (nodeCount > MAX_BACKTRACK_NODES) return false;

    // MRV: pick unfilled slot with most filled cells, break ties with longest length
    let bestSlot = null;
    let bestFilled = -1;
    let bestLength = -1;

    for (const key of unfilledKeys) {
      const slot = keyToSlot.get(key);
      let filledCount = 0;
      for (const cell of slot._cells) {
        if (cellChars.has(`${cell.row}:${cell.col}`)) filledCount++;
      }
      if (
        filledCount > bestFilled ||
        (filledCount === bestFilled && slot.length > bestLength)
      ) {
        bestFilled = filledCount;
        bestLength = slot.length;
        bestSlot = slot;
      }
    }

    const slot = bestSlot;
    const candidates = selectCandidates(
      slot,
      cellChars,
      byLength,
      usedWords,
      wordPreferences,
      bestFilled,
      bannedWords,
    );

    if (candidates.length === 0) return false;

    for (const entry of candidates) {
      nodeCount++;

      // Check for conflicts
      let conflict = false;
      for (let i = 0; i < slot._cells.length; i++) {
        const cellKey = `${slot._cells[i].row}:${slot._cells[i].col}`;
        const existing = cellChars.get(cellKey);
        if (existing !== undefined && existing !== entry._cells[i]) {
          conflict = true;
          break;
        }
      }
      if (conflict) continue;

      // Fill unfilled cells
      const newFills = [];
      for (let i = 0; i < slot._cells.length; i++) {
        const cellKey = `${slot._cells[i].row}:${slot._cells[i].col}`;
        if (cellChars.get(cellKey) === undefined) {
          cellChars.set(cellKey, entry._cells[i]);
          newFills.push(cellKey);
        }
      }

      usedWords.add(entry.word);
      unfilledKeys.delete(slot._key);
      placed.push({
        direction: slot.direction,
        row: slot.row,
        col: slot.col,
        word: entry.word,
        reading: entry.reading,
        clue: entry.clue,
      });

      if (backtrack()) return true;

      // Backtrack
      for (const ck of newFills) {
        cellChars.delete(ck);
      }
      usedWords.delete(entry.word);
      unfilledKeys.add(slot._key);
      placed.pop();

      if (nodeCount > MAX_BACKTRACK_NODES) return false;
    }

    return false;
  }

  return backtrack() ? placed : null;
}

function fillGrid({ grid, slots, lexicon, gridConstraints, wordPreferences, count }) {
  const { size } = gridConstraints;

  const processedLexicon = preprocessLexicon(lexicon, gridConstraints);
  const byLength = buildLexiconIndex(processedLexicon);

  for (const slot of slots) {
    slot._key = slotKey(slot);
    slot._cells = getSlotCells(slot);
  }

  // Early check: any slot length with zero lexicon entries → impossible
  for (const slot of slots) {
    const entries = byLength.get(slot.length);
    if (!entries || entries.length === 0) {
      for (const s of slots) {
        delete s._key;
        delete s._cells;
      }
      return { size, grid, slots, puzzles: [] };
    }
  }

  if (slots.length === 0) {
    const puzzles = [];
    for (let i = 0; i < count; i++) {
      puzzles.push({ entries: [] });
    }
    return { size, grid, slots, puzzles };
  }

  const puzzles = [];
  const maxAttempts = count * 20;
  const allUsedWords = new Set();

  for (let attempt = 0; attempt < maxAttempts && puzzles.length < count; attempt++) {
    // Pass banned words from previous puzzles to encourage diversity
    const placedEntries = solveOne(slots, byLength, wordPreferences, allUsedWords);
    if (placedEntries) {
      assignEntryNumbers(slots, placedEntries);
      puzzles.push({ entries: placedEntries });
      for (const e of placedEntries) {
        allUsedWords.add(e.word);
      }
    }
  }

  for (const slot of slots) {
    delete slot._key;
    delete slot._cells;
  }

  return { size, grid, slots, puzzles };
}

export { fillGrid };
