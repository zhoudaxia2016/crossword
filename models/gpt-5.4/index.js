"use strict";

function normalizeInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function levelRank(level) {
  if (typeof level !== "string") {
    return null;
  }
  const match = level.trim().toUpperCase().match(/^N([1-5])$/);
  return match ? Number(match[1]) : null;
}

function levelAllowed(level, maxJlptLevel) {
  const entryRank = levelRank(level);
  const maxRank = levelRank(maxJlptLevel);
  if (entryRank === null || maxRank === null) {
    return true;
  }
  return entryRank >= maxRank;
}

function hasRequiredTags(entry, requiredTags) {
  if (!Array.isArray(requiredTags) || requiredTags.length === 0) {
    return true;
  }
  const tagSet = new Set(Array.isArray(entry.tags) ? entry.tags : []);
  return requiredTags.every((tag) => tagSet.has(tag));
}

function normalizeEntry(entry) {
  if (!entry || typeof entry.word !== "string" || typeof entry.reading !== "string") {
    return null;
  }
  const word = entry.word.trim();
  const reading = entry.reading.trim();
  if (!word || !reading) {
    return null;
  }
  return {
    ...entry,
    word,
    reading,
    chars: Array.from(reading),
    pos: typeof entry.pos === "string" ? entry.pos.trim() : undefined,
    level: typeof entry.level === "string" ? entry.level.trim().toUpperCase() : undefined,
    tags: Array.isArray(entry.tags) ? entry.tags.filter((tag) => typeof tag === "string" && tag.trim()).map((tag) => tag.trim()) : [],
  };
}

function filterLexicon(lexicon, wordConstraints, gridConstraints) {
  const minLength = normalizeInteger(gridConstraints?.minEntryLength, 2);
  const maxLength = normalizeInteger(gridConstraints?.maxEntryLength, Number.MAX_SAFE_INTEGER);
  const allowedPos = Array.isArray(wordConstraints?.allowedPos) && wordConstraints.allowedPos.length > 0
    ? new Set(wordConstraints.allowedPos)
    : null;

  return lexicon
    .map(normalizeEntry)
    .filter(Boolean)
    .filter((entry) => entry.chars.length >= minLength && entry.chars.length <= maxLength)
    .filter((entry) => levelAllowed(entry.level, wordConstraints?.maxJlptLevel))
    .filter((entry) => !allowedPos || allowedPos.has(entry.pos))
    .filter((entry) => hasRequiredTags(entry, wordConstraints?.tags));
}

function cloneGrid(grid) {
  return grid.map((row) => [...row]);
}

function isWhite(grid, row, col) {
  return grid[row]?.[col] === ".";
}

function getSlotCells(slot) {
  const cells = [];
  for (let index = 0; index < slot.length; index += 1) {
    cells.push(
      slot.direction === "across"
        ? { row: slot.row, col: slot.col + index }
        : { row: slot.row + index, col: slot.col },
    );
  }
  return cells;
}

function discoverSlots(grid, gridConstraints) {
  const size = grid.length;
  const minLength = normalizeInteger(gridConstraints?.minEntryLength, 2);
  const maxLength = normalizeInteger(gridConstraints?.maxEntryLength, size);
  const slots = [];

  for (let row = 0; row < size; row += 1) {
    let col = 0;
    while (col < size) {
      if (!isWhite(grid, row, col)) {
        col += 1;
        continue;
      }
      const start = col;
      while (col < size && isWhite(grid, row, col)) {
        col += 1;
      }
      const length = col - start;
      if (length >= minLength) {
        slots.push({ direction: "across", row, col: start, length });
      }
      if (length > maxLength) {
        return { valid: false, slots: [], error: "across slot longer than maximum" };
      }
    }
  }

  for (let col = 0; col < size; col += 1) {
    let row = 0;
    while (row < size) {
      if (!isWhite(grid, row, col)) {
        row += 1;
        continue;
      }
      const start = row;
      while (row < size && isWhite(grid, row, col)) {
        row += 1;
      }
      const length = row - start;
      if (length >= minLength) {
        slots.push({ direction: "down", row: start, col, length });
      }
      if (length > maxLength) {
        return { valid: false, slots: [], error: "down slot longer than maximum" };
      }
    }
  }

  return { valid: true, slots };
}

function whiteConnected(grid) {
  const size = grid.length;
  let start = null;
  let total = 0;
  const seen = Array.from({ length: size }, () => Array(size).fill(false));

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (isWhite(grid, row, col)) {
        total += 1;
        if (!start) {
          start = [row, col];
        }
      }
    }
  }

  if (!start || total === 0) {
    return false;
  }

  const queue = [start];
  seen[start[0]][start[1]] = true;
  let reached = 0;

  while (queue.length > 0) {
    const [row, col] = queue.shift();
    reached += 1;
    const deltas = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];
    for (const [dr, dc] of deltas) {
      const nextRow = row + dr;
      const nextCol = col + dc;
      if (
        nextRow >= 0 &&
        nextRow < size &&
        nextCol >= 0 &&
        nextCol < size &&
        !seen[nextRow][nextCol] &&
        isWhite(grid, nextRow, nextCol)
      ) {
        seen[nextRow][nextCol] = true;
        queue.push([nextRow, nextCol]);
      }
    }
  }

  return reached === total;
}

function countWhiteCells(grid) {
  let count = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell === ".") {
        count += 1;
      }
    }
  }
  return count;
}

function gridLegal(grid, gridConstraints) {
  const size = normalizeInteger(gridConstraints?.size, grid.length);
  if (!Array.isArray(grid) || grid.length !== size) {
    return false;
  }
  for (const row of grid) {
    if (!Array.isArray(row) || row.length !== size) {
      return false;
    }
  }
  if (!whiteConnected(grid)) {
    return false;
  }
  const slotsResult = discoverSlots(grid, gridConstraints);
  return slotsResult.valid && slotsResult.slots.length > 0;
}

function validateProvidedGridAndSlots(grid, slots, gridConstraints) {
  const size = normalizeInteger(gridConstraints?.size, grid.length);
  const minLength = normalizeInteger(gridConstraints?.minEntryLength, 2);
  const maxLength = normalizeInteger(gridConstraints?.maxEntryLength, size);

  if (!Array.isArray(grid) || grid.length !== size) {
    return false;
  }
  for (const row of grid) {
    if (!Array.isArray(row) || row.length !== size) {
      return false;
    }
  }
  if (!Array.isArray(slots) || slots.length === 0) {
    return false;
  }

  for (const slot of slots) {
    if (
      !slot ||
      (slot.direction !== "across" && slot.direction !== "down") ||
      !Number.isInteger(slot.row) ||
      !Number.isInteger(slot.col) ||
      !Number.isInteger(slot.length) ||
      slot.length < minLength ||
      slot.length > maxLength
    ) {
      return false;
    }

    for (let index = 0; index < slot.length; index += 1) {
      const cell = slot.direction === "across"
        ? { row: slot.row, col: slot.col + index }
        : { row: slot.row + index, col: slot.col };
      if (
        cell.row < 0 ||
        cell.row >= size ||
        cell.col < 0 ||
        cell.col >= size ||
        grid[cell.row][cell.col] === "#"
      ) {
        return false;
      }
    }
  }

  return true;
}

function enumerateNumbering(slots) {
  const starts = new Map();
  const orderedStarts = [...slots]
    .sort((a, b) => a.row - b.row || a.col - b.col || (a.direction === "across" ? -1 : 1))
    .map((slot) => `${slot.row}:${slot.col}`);

  let next = 1;
  for (const key of orderedStarts) {
    if (!starts.has(key)) {
      starts.set(key, next);
      next += 1;
    }
  }

  return starts;
}

function buildCrossings(slots) {
  const slotCells = slots.map((slot) => getSlotCells(slot));
  const cellIndex = new Map();
  const crossings = Array.from({ length: slots.length }, () => []);

  for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
    for (let charIndex = 0; charIndex < slotCells[slotIndex].length; charIndex += 1) {
      const cell = slotCells[slotIndex][charIndex];
      const key = `${cell.row}:${cell.col}`;
      const existing = cellIndex.get(key);
      if (existing) {
        crossings[slotIndex].push({
          otherSlot: existing.slotIndex,
          index: charIndex,
          otherIndex: existing.charIndex,
        });
        crossings[existing.slotIndex].push({
          otherSlot: slotIndex,
          index: existing.charIndex,
          otherIndex: charIndex,
        });
      } else {
        cellIndex.set(key, { slotIndex, charIndex });
      }
    }
  }

  return crossings;
}

function buildSlotNeighbors(crossings) {
  return crossings.map((edges) => {
    const neighbors = new Set();
    for (const edge of edges) {
      neighbors.add(edge.otherSlot);
    }
    return [...neighbors];
  });
}

function createLengthBuckets(entries) {
  const buckets = new Map();
  for (const entry of entries) {
    const list = buckets.get(entry.chars.length);
    if (list) {
      list.push(entry);
    } else {
      buckets.set(entry.chars.length, [entry]);
    }
  }
  return buckets;
}

function buildPositionIndex(entriesByLength) {
  const indexByLength = new Map();

  for (const [length, entries] of entriesByLength.entries()) {
    const positions = Array.from({ length }, () => new Map());
    const wordToIndexes = new Map();

    for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
      const entry = entries[entryIndex];

      if (!wordToIndexes.has(entry.word)) {
        wordToIndexes.set(entry.word, []);
      }
      wordToIndexes.get(entry.word).push(entryIndex);

      for (let charIndex = 0; charIndex < length; charIndex += 1) {
        const char = entry.chars[charIndex];
        if (!positions[charIndex].has(char)) {
          positions[charIndex].set(char, []);
        }
        positions[charIndex].get(char).push(entryIndex);
      }
    }

    indexByLength.set(length, {
      entries,
      positions,
      wordToIndexes,
    });
  }

  return indexByLength;
}

function preferenceScore(entry, wordPreferences) {
  let score = 0;

  if (Array.isArray(wordPreferences?.preferredTags) && wordPreferences.preferredTags.length > 0) {
    const tagSet = new Set(entry.tags);
    const matched = wordPreferences.preferredTags.filter((tag) => tagSet.has(tag)).length;
    score += matched * 8;
  }

  if (Array.isArray(wordPreferences?.preferredPos) && wordPreferences.preferredPos.length > 0) {
    if (wordPreferences.preferredPos.includes(entry.pos)) {
      score += 10;
    } else {
      score -= 3;
    }
  }

  if (Array.isArray(wordPreferences?.preferredLevels) && wordPreferences.preferredLevels.length > 0) {
    if (wordPreferences.preferredLevels.includes(entry.level)) {
      score += 8;
    } else {
      score -= 2;
    }
  }

  score += clamp(entry.chars.length, 2, 8) * 0.25;
  return score;
}

function fitsPattern(entry, slotIndex, assignment, crossings) {
  for (const crossing of crossings[slotIndex]) {
    const otherAssignment = assignment[crossing.otherSlot];
    if (!otherAssignment) {
      continue;
    }
    if (entry.chars[crossing.index] !== otherAssignment.entry.chars[crossing.otherIndex]) {
      return false;
    }
  }
  return true;
}

function countFutureConflicts(entry, slotIndex, assignment, crossings, candidatesBySlot) {
  let conflicts = 0;
  for (const crossing of crossings[slotIndex]) {
    if (assignment[crossing.otherSlot]) {
      continue;
    }
    let matched = 0;
    for (const candidate of candidatesBySlot[crossing.otherSlot]) {
      if (candidate.chars[crossing.otherIndex] === entry.chars[crossing.index]) {
        matched += 1;
      }
    }
    if (matched === 0) {
      return Number.POSITIVE_INFINITY;
    }
    conflicts += 1 / matched;
  }
  return conflicts;
}

function computeLetterStats(positionIndexByLength) {
  const stats = new Map();

  for (const [length, bucket] of positionIndexByLength.entries()) {
    const positions = bucket.positions.map((charMap) => {
      const counts = new Map();
      for (const [char, indexes] of charMap.entries()) {
        counts.set(char, indexes.length);
      }
      return counts;
    });
    stats.set(length, positions);
  }

  return stats;
}

function intersectIndexLists(left, right) {
  if (left.length === 0 || right.length === 0) {
    return [];
  }

  const result = [];
  let i = 0;
  let j = 0;

  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      result.push(left[i]);
      i += 1;
      j += 1;
    } else if (left[i] < right[j]) {
      i += 1;
    } else {
      j += 1;
    }
  }

  return result;
}

function filterDomainByUsedWords(domain, entries, usedWords) {
  if (usedWords.size === 0) {
    return domain;
  }
  return domain.filter((candidateIndex) => !usedWords.has(entries[candidateIndex].word));
}

function filterDomainByConstraints(slotIndex, domain, assignment, usedWords, slots, crossings, positionIndexByLength) {
  const slot = slots[slotIndex];
  const bucket = positionIndexByLength.get(slot.length);
  if (!bucket) {
    return [];
  }

  let nextDomain = filterDomainByUsedWords(domain, bucket.entries, usedWords);

  for (const crossing of crossings[slotIndex]) {
    const otherAssignment = assignment[crossing.otherSlot];
    if (!otherAssignment) {
      continue;
    }
    const char = otherAssignment.entry.chars[crossing.otherIndex];
    const matching = bucket.positions[crossing.index].get(char) ?? [];
    nextDomain = intersectIndexLists(nextDomain, matching);
    if (nextDomain.length === 0) {
      return nextDomain;
    }
  }

  return nextDomain;
}

function scoreCandidate(entry, slotIndex, slot, crossings, wordPreferences, globalUsage, letterStats, puzzleIndex) {
  let score = preferenceScore(entry, wordPreferences);
  score -= (globalUsage.get(entry.word) ?? 0) * 5;
  score -= entry.word.length * 0.01;

  const slotCrossings = crossings[slotIndex];
  const statsForLength = letterStats.get(slot.length) ?? [];
  for (const crossing of slotCrossings) {
    const count = statsForLength[crossing.index]?.get(entry.chars[crossing.index]) ?? 0;
    score -= Math.log(count + 1) * 0.35;
  }

  score += ((entry.word.charCodeAt(0) + slotIndex * 17 + puzzleIndex * 29) % 31) * 0.0001;
  return score;
}

function solveOnePuzzle(context) {
  const {
    slots,
    entriesByLength,
    crossings,
    wordPreferences,
    globalUsage,
    puzzleIndex,
  } = context;

  const candidatesBySlot = slots.map((slot) => entriesByLength.get(slot.length) ?? []);
  if (candidatesBySlot.some((candidates) => candidates.length === 0)) {
    return null;
  }

  const assignment = Array(slots.length).fill(null);
  const usedWords = new Set();
  const rarityStatsBySlot = slots.map((slot, slotIndex) => {
    const rarityStats = new Map();
    for (const entry of candidatesBySlot[slotIndex]) {
      for (const crossing of crossings[slotIndex]) {
        const key = `${crossing.index}:${entry.chars[crossing.index]}`;
        rarityStats.set(key, (rarityStats.get(key) ?? 0) + 1);
      }
    }
    return rarityStats;
  });
  const baseScoreBySlot = slots.map((slot, slotIndex) => {
    const rarityStats = rarityStatsBySlot[slotIndex];
    const baseScores = new Map();
    for (const entry of candidatesBySlot[slotIndex]) {
      let value = preferenceScore(entry, wordPreferences);
      for (const crossing of crossings[slotIndex]) {
        const key = `${crossing.index}:${entry.chars[crossing.index]}`;
        value -= Math.log((rarityStats.get(key) ?? 0) + 1) * 0.3;
      }
      value += ((entry.word.charCodeAt(0) + slotIndex * 17 + puzzleIndex * 29) % 31) * 0.0001;
      baseScores.set(entry, value);
    }
    candidatesBySlot[slotIndex].sort((left, right) => baseScores.get(right) - baseScores.get(left));
    return baseScores;
  });

  function fits(entry, slotIndex) {
    if (usedWords.has(entry.word)) {
      return false;
    }
    for (const crossing of crossings[slotIndex]) {
      const otherEntry = assignment[crossing.otherSlot];
      if (!otherEntry) {
        continue;
      }
      if (entry.chars[crossing.index] !== otherEntry.chars[crossing.otherIndex]) {
        return false;
      }
    }
    return true;
  }

  function chooseNextSlot() {
    let best = -1;
    let bestDomain = [];

    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      if (assignment[slotIndex]) {
        continue;
      }
      const domain = [];
      for (const entry of candidatesBySlot[slotIndex]) {
        if (fits(entry, slotIndex)) {
          domain.push(entry);
        }
      }
      if (domain.length === 0) {
        return { slotIndex, domain };
      }
      if (domain.length === 1) {
        return { slotIndex, domain };
      }
      if (
        best === -1 ||
        domain.length < bestDomain.length ||
        (
          domain.length === bestDomain.length &&
          crossings[slotIndex].length > crossings[best].length
        )
      ) {
        best = slotIndex;
        bestDomain = domain;
      }
    }

    return best === -1 ? null : { slotIndex: best, domain: bestDomain };
  }

  function orderCandidates(slotIndex, domain) {
    const baseScores = baseScoreBySlot[slotIndex];
    return [...domain].sort((left, right) => {
      const leftScore = baseScores.get(left) - (globalUsage.get(left.word) ?? 0) * 5;
      const rightScore = baseScores.get(right) - (globalUsage.get(right.word) ?? 0) * 5;
      return rightScore - leftScore;
    });
  }

  function backtrack() {
    const next = chooseNextSlot();
    if (!next) {
      return true;
    }
    if (next.domain.length === 0) {
      return false;
    }

    const ordered = orderCandidates(next.slotIndex, next.domain);

    for (const entry of ordered) {
      if (!fits(entry, next.slotIndex)) {
        continue;
      }

      assignment[next.slotIndex] = entry;
      usedWords.add(entry.word);

      if (backtrack()) {
        return true;
      }

      usedWords.delete(entry.word);
      assignment[next.slotIndex] = null;
    }

    return false;
  }

  if (!backtrack()) {
    return null;
  }

  return assignment;
}

function buildPuzzleEntries(slots, assignment) {
  const numbering = enumerateNumbering(slots);
  return slots.map((slot, index) => {
    const entry = assignment[index];
    return {
      number: numbering.get(`${slot.row}:${slot.col}`),
      direction: slot.direction,
      row: slot.row,
      col: slot.col,
      word: entry.word,
      reading: entry.reading,
      clue: typeof entry.clue === "string" && entry.clue.trim() ? entry.clue.trim() : undefined,
    };
  });
}

function buildSparseBlockGrid(size, blockSize) {
  const grid = Array.from({ length: size }, () => Array(size).fill("#"));
  const startRow = Math.floor((size - blockSize) / 2);
  const startCol = Math.floor((size - blockSize) / 2);
  for (let row = 0; row < blockSize; row += 1) {
    for (let col = 0; col < blockSize; col += 1) {
      grid[startRow + row][startCol + col] = ".";
    }
  }
  return { grid, startRow, startCol };
}

function findWordSquare(entries, size) {
  const words = entries.filter((entry) => entry.chars.length === size);
  if (words.length < size * 2) {
    return null;
  }

  const byReading = new Map();
  const prefixes = Array.from({ length: size + 1 }, () => new Set());
  for (const entry of words) {
    if (!byReading.has(entry.reading)) {
      byReading.set(entry.reading, []);
    }
    byReading.get(entry.reading).push(entry);
    for (let prefixLength = 0; prefixLength <= size; prefixLength += 1) {
      prefixes[prefixLength].add(entry.chars.slice(0, prefixLength).join(""));
    }
  }

  const rows = [];
  const usedWords = new Set();

  function chooseEntry(reading, excludedWords) {
    const candidates = byReading.get(reading) ?? [];
    for (const candidate of candidates) {
      if (!excludedWords.has(candidate.word)) {
        return candidate;
      }
    }
    return null;
  }

  function backtrack() {
    const depth = rows.length;
    if (depth === size) {
      const columnReadings = [];
      for (let col = 0; col < size; col += 1) {
        const reading = rows.map((row) => row.chars[col]).join("");
        if (!byReading.has(reading)) {
          return null;
        }
        columnReadings.push(reading);
      }

      const chosenColumns = [];
      const reservedWords = new Set(usedWords);
      for (const reading of columnReadings) {
        const entry = chooseEntry(reading, reservedWords);
        if (!entry) {
          return null;
        }
        chosenColumns.push(entry);
        reservedWords.add(entry.word);
      }

      return {
        rows: [...rows],
        cols: chosenColumns,
      };
    }

    for (const entry of words) {
      if (usedWords.has(entry.word)) {
        continue;
      }

      let valid = true;
      for (let col = 0; col < size; col += 1) {
        const prefix = rows.map((row) => row.chars[col]).join("") + entry.chars[col];
        if (!prefixes[depth + 1].has(prefix)) {
          valid = false;
          break;
        }
      }

      if (!valid) {
        continue;
      }

      rows.push(entry);
      usedWords.add(entry.word);
      const solved = backtrack();
      if (solved) {
        return solved;
      }
      usedWords.delete(entry.word);
      rows.pop();
    }

    return null;
  }

  return backtrack();
}

function generatePatternGrid(gridConstraints) {
  const size = normalizeInteger(gridConstraints?.size, 6);
  const minLength = normalizeInteger(gridConstraints?.minEntryLength, 2);
  const maxLength = normalizeInteger(gridConstraints?.maxEntryLength, size);
  const grid = Array.from({ length: size }, () => Array(size).fill("."));
  const maxBlackRatio = size <= 5 ? 0.18 : size <= 7 ? 0.24 : 0.28;
  const targetBlackCells = Math.floor(size * size * maxBlackRatio);

  function evaluate(candidateGrid) {
    const result = discoverSlots(candidateGrid, { size, minEntryLength: minLength, maxEntryLength: maxLength });
    if (!result.valid || !whiteConnected(candidateGrid)) {
      return Number.NEGATIVE_INFINITY;
    }

    const ideal = clamp(Math.round(size * 0.58), minLength, Math.min(maxLength, size));
    let score = 0;
    for (const slot of result.slots) {
      score -= Math.abs(slot.length - ideal);
      if (slot.length === size) {
        score -= 1.6;
      }
      if (slot.length >= ideal && slot.length <= ideal + 1) {
        score += 1.5;
      }
    }
    score += result.slots.length * 0.2;
    score += ((size * size) - countWhiteCells(candidateGrid)) * 0.08;
    return score;
  }

  const shapes = [
    [
      [0, 0],
    ],
    [
      [0, 0],
      [0, 1],
    ],
    [
      [0, 0],
      [1, 0],
    ],
    [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ],
  ];

  let currentScore = evaluate(grid);
  let improved = true;

  while (improved && (size * size) - countWhiteCells(grid) < targetBlackCells) {
    improved = false;
    let bestGrid = null;
    let bestScore = currentScore;

    for (const shape of shapes) {
      const shapeHeight = Math.max(...shape.map(([dr]) => dr)) + 1;
      const shapeWidth = Math.max(...shape.map(([, dc]) => dc)) + 1;
      const rowStart = size >= 5 ? 1 : 0;
      const colStart = size >= 5 ? 1 : 0;
      const rowEnd = size >= 5 ? size - shapeHeight - 1 : size - shapeHeight;
      const colEnd = size >= 5 ? size - shapeWidth - 1 : size - shapeWidth;

      for (let row = rowStart; row <= rowEnd; row += 1) {
        for (let col = colStart; col <= colEnd; col += 1) {
          const nextGrid = cloneGrid(grid);
          let validPlacement = true;

          for (const [dr, dc] of shape) {
            const nextRow = row + dr;
            const nextCol = col + dc;
            if (
              nextRow < 0 ||
              nextRow >= size ||
              nextCol < 0 ||
              nextCol >= size ||
              nextGrid[nextRow][nextCol] === "#"
            ) {
              validPlacement = false;
              break;
            }
            nextGrid[nextRow][nextCol] = "#";
          }

          if (!validPlacement) {
            continue;
          }

          const blackCount = (size * size) - countWhiteCells(nextGrid);
          if (blackCount > targetBlackCells) {
            continue;
          }

          const nextScore = evaluate(nextGrid);
          if (nextScore > bestScore + 0.01) {
            bestScore = nextScore;
            bestGrid = nextGrid;
          }
        }
      }
    }

    if (bestGrid) {
      for (let row = 0; row < size; row += 1) {
        grid[row] = bestGrid[row];
      }
      currentScore = bestScore;
      improved = true;
    }
  }

  return grid;
}

function generateGrid(input) {
  const gridConstraints = input?.gridConstraints ?? {};
  const size = normalizeInteger(gridConstraints.size, 6);
  const normalizedConstraints = {
    size,
    minEntryLength: normalizeInteger(gridConstraints.minEntryLength, 2),
    maxEntryLength: normalizeInteger(gridConstraints.maxEntryLength, size),
  };

  let grid = generatePatternGrid(normalizedConstraints);
  let slotsResult = discoverSlots(grid, normalizedConstraints);

  if (!slotsResult.valid || !whiteConnected(grid)) {
    grid = Array.from({ length: size }, () => Array(size).fill("."));
    slotsResult = discoverSlots(grid, normalizedConstraints);
  }

  return {
    size,
    grid,
    slots: slotsResult.slots,
  };
}

function fillGrid(input) {
  const size = normalizeInteger(input?.gridConstraints?.size, input?.grid?.length ?? 0);
  const gridConstraints = {
    size,
    minEntryLength: normalizeInteger(input?.gridConstraints?.minEntryLength, 2),
    maxEntryLength: normalizeInteger(input?.gridConstraints?.maxEntryLength, size),
  };
  const grid = cloneGrid(input.grid);
  const slots = Array.isArray(input?.slots) ? input.slots.map((slot) => ({ ...slot })) : [];
  const count = normalizeInteger(input?.count, 1);

  if (!validateProvidedGridAndSlots(grid, slots, gridConstraints)) {
    return { size, grid, slots, puzzles: [] };
  }

  const lexicon = filterLexicon(input.lexicon ?? [], input.wordConstraints, gridConstraints);
  const entriesByLength = createLengthBuckets(lexicon);
  const crossings = buildCrossings(slots);
  const globalUsage = new Map();
  const puzzles = [];
  const seenSignatures = new Set();

  for (let puzzleIndex = 0; puzzleIndex < count; puzzleIndex += 1) {
    const assignment = solveOnePuzzle({
      slots,
      entriesByLength,
      crossings,
      wordPreferences: input.wordPreferences ?? {},
      globalUsage,
      puzzleIndex,
    });

    if (!assignment) {
      break;
    }

    const signature = assignment.map((entry) => `${entry.word}::${entry.reading}`).sort().join("|");
    if (seenSignatures.has(signature)) {
      for (const entry of assignment) {
        globalUsage.set(entry.word, (globalUsage.get(entry.word) ?? 0) + 2);
      }
      const retryAssignment = solveOnePuzzle({
        slots,
        entriesByLength,
        crossings,
        wordPreferences: input.wordPreferences ?? {},
        globalUsage,
        puzzleIndex: puzzleIndex + count,
      });
      if (!retryAssignment) {
        break;
      }
      const retrySignature = retryAssignment.map((entry) => `${entry.word}::${entry.reading}`).sort().join("|");
      if (seenSignatures.has(retrySignature)) {
        break;
      }
      seenSignatures.add(retrySignature);
      for (const entry of retryAssignment) {
        globalUsage.set(entry.word, (globalUsage.get(entry.word) ?? 0) + 1);
      }
      puzzles.push({ entries: buildPuzzleEntries(slots, retryAssignment) });
      continue;
    }

    seenSignatures.add(signature);
    for (const entry of assignment) {
      globalUsage.set(entry.word, (globalUsage.get(entry.word) ?? 0) + 1);
    }
    puzzles.push({ entries: buildPuzzleEntries(slots, assignment) });
  }

  return {
    size,
    grid,
    slots,
    puzzles,
  };
}

function generateCrossword(input) {
  const gridConstraints = input?.gridConstraints ?? {};
  const size = normalizeInteger(gridConstraints.size, 6);
  const normalizedConstraints = {
    size,
    minEntryLength: normalizeInteger(gridConstraints.minEntryLength, 2),
    maxEntryLength: normalizeInteger(gridConstraints.maxEntryLength, size),
  };

  const filteredLexicon = filterLexicon(input.lexicon ?? [], input.wordConstraints, normalizedConstraints);

  for (let blockSize = normalizedConstraints.minEntryLength; blockSize <= Math.min(3, normalizedConstraints.maxEntryLength, size); blockSize += 1) {
    const square = findWordSquare(filteredLexicon, blockSize);
    if (!square) {
      continue;
    }

    const sparse = buildSparseBlockGrid(size, blockSize);
    const slots = [];
    for (let row = 0; row < blockSize; row += 1) {
      slots.push({
        direction: "across",
        row: sparse.startRow + row,
        col: sparse.startCol,
        length: blockSize,
      });
    }
    for (let col = 0; col < blockSize; col += 1) {
      slots.push({
        direction: "down",
        row: sparse.startRow,
        col: sparse.startCol + col,
        length: blockSize,
      });
    }

    const numbering = enumerateNumbering(slots);
    const entries = [];
    for (let index = 0; index < blockSize; index += 1) {
      entries.push({
        number: numbering.get(`${sparse.startRow + index}:${sparse.startCol}`),
        direction: "across",
        row: sparse.startRow + index,
        col: sparse.startCol,
        word: square.rows[index].word,
        reading: square.rows[index].reading,
        clue: square.rows[index].clue,
      });
    }
    for (let index = 0; index < blockSize; index += 1) {
      entries.push({
        number: numbering.get(`${sparse.startRow}:${sparse.startCol + index}`),
        direction: "down",
        row: sparse.startRow,
        col: sparse.startCol + index,
        word: square.cols[index].word,
        reading: square.cols[index].reading,
        clue: square.cols[index].clue,
      });
    }

    return {
      size,
      grid: sparse.grid,
      slots,
      entries,
    };
  }

  let fallback = null;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const generated = generateGrid({ gridConstraints: normalizedConstraints });
    const filled = fillGrid({
      grid: generated.grid,
      slots: generated.slots,
      lexicon: filteredLexicon,
      gridConstraints: normalizedConstraints,
      wordConstraints: input.wordConstraints,
      wordPreferences: {
        preferredTags: input.wordConstraints?.tags,
      },
      count: 1,
    });

    if (filled.puzzles.length > 0) {
      return {
        size,
        grid: generated.grid,
        slots: generated.slots,
        entries: filled.puzzles[0].entries,
      };
    }

    if (!fallback || generated.slots.length < fallback.slots.length) {
      fallback = generated;
    }
  }

  const backup = fallback ?? generateGrid({ gridConstraints: normalizedConstraints });
  const finalFill = fillGrid({
    grid: backup.grid,
    slots: backup.slots,
    lexicon: filteredLexicon,
    gridConstraints: normalizedConstraints,
    wordConstraints: input.wordConstraints,
    count: 1,
  });

  return {
    size,
    grid: backup.grid,
    slots: backup.slots,
    entries: finalFill.puzzles[0]?.entries ?? [],
  };
}

module.exports = {
  generateGrid,
  fillGrid,
  generateCrossword,
};
