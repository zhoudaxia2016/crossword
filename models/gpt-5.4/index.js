"use strict";

function normalizeInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function cloneGrid(grid) {
  return grid.map((row) => [...row]);
}

function isWhite(grid, row, col) {
  return grid[row]?.[col] === ".";
}

function getSlotCell(slot, index) {
  return slot.direction === "across"
    ? { row: slot.row, col: slot.col + index }
    : { row: slot.row + index, col: slot.col };
}

function getSlotCells(slot) {
  const cells = [];
  for (let index = 0; index < slot.length; index += 1) {
    cells.push(getSlotCell(slot, index));
  }
  return cells;
}

function whiteConnected(grid) {
  const size = grid.length;
  const seen = Array.from({ length: size }, () => Array(size).fill(false));
  let start = null;
  let total = 0;

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

    for (const [dr, dc] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
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

function validateGridAndSlots(grid, slots, gridConstraints) {
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
  if (!whiteConnected(grid)) {
    return false;
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
      const cell = getSlotCell(slot, index);
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

function normalizeEntry(entry) {
  if (!entry || typeof entry.word !== "string" || typeof entry.reading !== "string") {
    return null;
  }

  const word = entry.word.trim();
  const reading = entry.reading.trim();
  const normalizedReading = entry.normalizedReading?.trim() || reading;
  if (!word || !reading) {
    return null;
  }

  return {
    word,
    reading,
    normalizedReading,
    clue: typeof entry.clue === "string" && entry.clue.trim() ? entry.clue.trim() : undefined,
    pos: typeof entry.pos === "string" ? entry.pos.trim() : undefined,
    level: typeof entry.level === "string" ? entry.level.trim().toUpperCase() : undefined,
    tags: Array.isArray(entry.tags)
      ? entry.tags.filter((tag) => typeof tag === "string" && tag.trim()).map((tag) => tag.trim())
      : [],
    chars: Array.from(normalizedReading),
  };
}

function buildLexiconBuckets(lexicon, gridConstraints) {
  const minLength = normalizeInteger(gridConstraints?.minEntryLength, 2);
  const maxLength = normalizeInteger(gridConstraints?.maxEntryLength, Number.MAX_SAFE_INTEGER);
  const buckets = new Map();

  for (const rawEntry of lexicon) {
    const entry = normalizeEntry(rawEntry);
    if (!entry) {
      continue;
    }
    if (entry.chars.length < minLength || entry.chars.length > maxLength) {
      continue;
    }

    let bucket = buckets.get(entry.chars.length);
    if (!bucket) {
      bucket = {
        entries: [],
        byPosition: Array.from({ length: entry.chars.length }, () => new Map()),
      };
      buckets.set(entry.chars.length, bucket);
    }

    const index = bucket.entries.length;
    bucket.entries.push(entry);

    for (let charIndex = 0; charIndex < entry.chars.length; charIndex += 1) {
      const char = entry.chars[charIndex];
      const charMap = bucket.byPosition[charIndex];
      if (!charMap.has(char)) {
        charMap.set(char, []);
      }
      charMap.get(char).push(index);
    }
  }

  return buckets;
}

function buildCrossings(slots) {
  const slotCells = slots.map((slot) => getSlotCells(slot));
  const byCell = new Map();
  const crossings = Array.from({ length: slots.length }, () => []);

  for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
    for (let charIndex = 0; charIndex < slotCells[slotIndex].length; charIndex += 1) {
      const cell = slotCells[slotIndex][charIndex];
      const key = `${cell.row}:${cell.col}`;
      const existing = byCell.get(key);
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
        byCell.set(key, { slotIndex, charIndex });
      }
    }
  }

  return crossings;
}

function enumerateNumbers(slots) {
  const starts = new Map();
  const ordered = [...slots].sort((left, right) =>
    left.row - right.row || left.col - right.col || (left.direction === "across" ? -1 : 1),
  );

  let next = 1;
  for (const slot of ordered) {
    const key = `${slot.row}:${slot.col}`;
    if (!starts.has(key)) {
      starts.set(key, next);
      next += 1;
    }
  }

  return starts;
}

function preferenceScore(entry, wordPreferences) {
  let score = 0;

  if (Array.isArray(wordPreferences?.preferredPos) && wordPreferences.preferredPos.length > 0) {
    if (wordPreferences.preferredPos.includes(entry.pos)) {
      score += 12;
    } else {
      score -= 4;
    }
  }

  if (Array.isArray(wordPreferences?.preferredLevels) && wordPreferences.preferredLevels.length > 0) {
    if (wordPreferences.preferredLevels.includes(entry.level)) {
      score += 10;
    } else {
      score -= 3;
    }
  }

  if (Array.isArray(wordPreferences?.preferredTags) && wordPreferences.preferredTags.length > 0) {
    const tags = new Set(entry.tags);
    let matches = 0;
    for (const tag of wordPreferences.preferredTags) {
      if (tags.has(tag)) {
        matches += 1;
      }
    }
    score += matches * 8;
    if (matches === 0) {
      score -= 1;
    }
  }

  if (entry.clue) {
    score += 0.5;
  }

  return score;
}

function intersectSorted(left, right) {
  if (left.length === 0 || right.length === 0) {
    return [];
  }

  const result = [];
  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      result.push(left[leftIndex]);
      leftIndex += 1;
      rightIndex += 1;
    } else if (left[leftIndex] < right[rightIndex]) {
      leftIndex += 1;
    } else {
      rightIndex += 1;
    }
  }

  return result;
}

function buildSolver(slots, lexiconBuckets, wordPreferences) {
  const crossings = buildCrossings(slots);
  const neighbors = crossings.map((edges) => {
    const seen = new Set();
    for (const edge of edges) {
      seen.add(edge.otherSlot);
    }
    return [...seen];
  });
  const candidateIndexesBySlot = [];
  const rarityBySlot = [];

  for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
    const slot = slots[slotIndex];
    const bucket = lexiconBuckets.get(slot.length);
    if (!bucket || bucket.entries.length === 0) {
      return null;
    }

    const candidates = bucket.entries.map((_, index) => index);
    candidateIndexesBySlot.push(candidates);

    const rarity = new Map();
    for (const candidateIndex of candidates) {
      const entry = bucket.entries[candidateIndex];
      for (const crossing of crossings[slotIndex]) {
        const key = `${crossing.index}:${entry.chars[crossing.index]}`;
        rarity.set(key, (rarity.get(key) ?? 0) + 1);
      }
    }
    rarityBySlot.push(rarity);
  }

  const baseScoresBySlot = slots.map((slot, slotIndex) => {
    const bucket = lexiconBuckets.get(slot.length);
    const scores = new Map();
    for (const candidateIndex of candidateIndexesBySlot[slotIndex]) {
      const entry = bucket.entries[candidateIndex];
      let score = preferenceScore(entry, wordPreferences);
      for (const crossing of crossings[slotIndex]) {
        const key = `${crossing.index}:${entry.chars[crossing.index]}`;
        score -= Math.log((rarityBySlot[slotIndex].get(key) ?? 0) + 1) * 0.35;
      }
      scores.set(candidateIndex, score);
    }
    return scores;
  });

  function domainForSlot(slotIndex, assignmentBySlot, usedWords) {
    const slot = slots[slotIndex];
    const bucket = lexiconBuckets.get(slot.length);
    let domain = candidateIndexesBySlot[slotIndex];

    for (const crossing of crossings[slotIndex]) {
      const other = assignmentBySlot[crossing.otherSlot];
      if (!other) {
        continue;
      }
      const char = other.chars[crossing.otherIndex];
      const constrained = bucket.byPosition[crossing.index].get(char) ?? [];
      domain = intersectSorted(domain, constrained);
      if (domain.length === 0) {
        return domain;
      }
    }

    if (usedWords.size === 0) {
      return domain;
    }

    const filtered = [];
    for (const candidateIndex of domain) {
      if (!usedWords.has(bucket.entries[candidateIndex].word)) {
        filtered.push(candidateIndex);
      }
    }
    return filtered;
  }

  return {
    crossings,
    neighbors,
    domainForSlot,
    lexiconBuckets,
    baseScoresBySlot,
  };
}

function solveOnePuzzle({ slots, solver, globalUsage, puzzleSeed, nodeBudget }) {
  const assignmentBySlot = Array(slots.length).fill(null);
  const usedWords = new Set();
  let visitedNodes = 0;

  function chooseNextSlot() {
    let bestSlot = -1;
    let bestDomain = null;

    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      if (assignmentBySlot[slotIndex]) {
        continue;
      }

      const domain = solver.domainForSlot(slotIndex, assignmentBySlot, usedWords);
      if (domain.length === 0) {
        return { slotIndex, domain };
      }

      if (
        bestSlot === -1 ||
        domain.length < bestDomain.length ||
        (domain.length === bestDomain.length && solver.crossings[slotIndex].length > solver.crossings[bestSlot].length)
      ) {
        bestSlot = slotIndex;
        bestDomain = domain;
      }
    }

    return bestSlot === -1 ? null : { slotIndex: bestSlot, domain: bestDomain };
  }

  function orderedDomain(slotIndex, domain) {
    const bucket = solver.lexiconBuckets.get(slots[slotIndex].length);
    const baseScores = solver.baseScoresBySlot[slotIndex];
    const diversityWeight = 6 + Math.min(4, Math.floor(puzzleSeed / 11));

    return [...domain].sort((left, right) => {
      const leftEntry = bucket.entries[left];
      const rightEntry = bucket.entries[right];
      const leftScore =
        baseScores.get(left) -
        (globalUsage.get(leftEntry.word) ?? 0) * diversityWeight +
        ((leftEntry.word.charCodeAt(0) + slotIndex * 17 + puzzleSeed * 31) % 37) * 0.0001;
      const rightScore =
        baseScores.get(right) -
        (globalUsage.get(rightEntry.word) ?? 0) * diversityWeight +
        ((rightEntry.word.charCodeAt(0) + slotIndex * 17 + puzzleSeed * 31) % 37) * 0.0001;
      return rightScore - leftScore;
    });
  }

  function backtrack() {
    visitedNodes += 1;
    if (visitedNodes > nodeBudget) {
      return false;
    }

    const next = chooseNextSlot();
    if (!next) {
      return true;
    }
    if (next.domain.length === 0) {
      return false;
    }

    const slot = slots[next.slotIndex];
    const bucket = solver.lexiconBuckets.get(slot.length);

    for (const candidateIndex of orderedDomain(next.slotIndex, next.domain)) {
      const entry = bucket.entries[candidateIndex];
      assignmentBySlot[next.slotIndex] = entry;
      usedWords.add(entry.word);

      let viable = true;
      for (const neighborSlot of solver.neighbors[next.slotIndex]) {
        if (assignmentBySlot[neighborSlot]) {
          continue;
        }
        if (solver.domainForSlot(neighborSlot, assignmentBySlot, usedWords).length === 0) {
          viable = false;
          break;
        }
      }

      if (viable && backtrack()) {
        return true;
      }

      usedWords.delete(entry.word);
      assignmentBySlot[next.slotIndex] = null;
    }

    return false;
  }

  return backtrack() ? assignmentBySlot : null;
}

function buildPuzzleEntries(slots, assignment) {
  const numbering = enumerateNumbers(slots);

  return slots.map((slot, slotIndex) => {
    const entry = assignment[slotIndex];
    return {
      number: numbering.get(`${slot.row}:${slot.col}`),
      direction: slot.direction,
      row: slot.row,
      col: slot.col,
      word: entry.word,
      reading: entry.reading,
      normalizedReading: entry.normalizedReading,
      clue: entry.clue,
    };
  });
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

  if (!validateGridAndSlots(grid, slots, gridConstraints)) {
    return { size, grid, slots, puzzles: [] };
  }

  const lexiconBuckets = buildLexiconBuckets(input.lexicon ?? [], gridConstraints);
  const solver = buildSolver(slots, lexiconBuckets, input.wordPreferences ?? {});
  if (!solver) {
    return { size, grid, slots, puzzles: [] };
  }

  const globalUsage = new Map();
  const seenSignatures = new Set();
  const puzzles = [];
  const solvedAssignments = [];

  for (let puzzleIndex = 0; puzzleIndex < count; puzzleIndex += 1) {
    let assignment = null;
    let fallbackAssignment = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const solved = solveOnePuzzle({
        slots,
        solver,
        globalUsage,
        puzzleSeed: puzzleIndex * 11 + attempt,
        nodeBudget: puzzleIndex === 0 ? 250000 : 25000,
      });

      if (!solved) {
        continue;
      }

      if (!fallbackAssignment) {
        fallbackAssignment = solved;
      }

      const signature = solved.map((entry) => entry.word).sort().join("|");
      if (!seenSignatures.has(signature)) {
        assignment = solved;
        seenSignatures.add(signature);
        break;
      }

      for (const entry of solved) {
        globalUsage.set(entry.word, (globalUsage.get(entry.word) ?? 0) + 3);
      }
    }

    if (!assignment) {
      assignment = fallbackAssignment;
    }

    if (!assignment) {
      break;
    }

    const signature = assignment.map((entry) => entry.word).sort().join("|");
    if (!seenSignatures.has(signature)) {
      seenSignatures.add(signature);
    }

    for (const entry of assignment) {
      globalUsage.set(entry.word, (globalUsage.get(entry.word) ?? 0) + 1);
    }

    solvedAssignments.push(assignment);
    puzzles.push({
      entries: buildPuzzleEntries(slots, assignment),
    });
  }

  while (puzzles.length < count && solvedAssignments.length > 0) {
    const fallback = solvedAssignments[puzzles.length % solvedAssignments.length];
    puzzles.push({
      entries: buildPuzzleEntries(slots, fallback),
    });
  }

  return {
    size,
    grid,
    slots,
    puzzles,
  };
}

module.exports = {
  fillGrid,
};
