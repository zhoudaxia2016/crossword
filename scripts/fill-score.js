import { readFileSync } from "node:fs";
import { normalizeKanaText, toKanaCells } from "./kana.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function slotKey(slot) {
  return `${slot.direction}:${slot.row}:${slot.col}:${slot.length}`;
}

function entryKey(entry) {
  return `${entry.word}::${normalizeKanaText(entry.reading)}`;
}

function entrySlotMatch(entry, slot) {
  return (
    entry.direction === slot.direction &&
    entry.row === slot.row &&
    entry.col === slot.col
  );
}

function getSlotCell(slot, index) {
  if (slot.direction === "across") {
    return { row: slot.row, col: slot.col + index };
  }
  return { row: slot.row + index, col: slot.col };
}

function buildLexiconIndex(lexicon) {
  const index = new Map();

  for (const entry of lexicon) {
    index.set(entryKey(entry), entry);
  }

  return index;
}

function validatePuzzle({
  puzzle,
  slots,
  lexiconIndex,
  size,
}) {
  const errors = [];
  const entries = Array.isArray(puzzle?.entries) ? puzzle.entries : [];
  const seenSlots = new Set();
  const seenWords = new Set();
  const cellMap = new Map();

  if (entries.length !== slots.length) {
    errors.push(`entry count mismatch: expected ${slots.length}, got ${entries.length}`);
  }

  for (const entry of entries) {
    const readingChars = toKanaCells(entry.reading ?? "");
    const matchedSlot = slots.find((slot) => entrySlotMatch(entry, slot));

    if (!matchedSlot) {
      errors.push(`entry does not match any slot: ${entry.direction} at (${entry.row}, ${entry.col})`);
      continue;
    }

    const currentSlotKey = slotKey(matchedSlot);
    if (seenSlots.has(currentSlotKey)) {
      errors.push(`duplicate slot fill: ${currentSlotKey}`);
      continue;
    }
    seenSlots.add(currentSlotKey);

    if (readingChars.length !== matchedSlot.length) {
      errors.push(`reading length mismatch at ${currentSlotKey}`);
    }

    const lexiconEntry = lexiconIndex.get(entryKey(entry));
    if (!lexiconEntry) {
      errors.push(`entry not found in lexicon: ${entry.word} / ${entry.reading}`);
    }

    if (seenWords.has(entry.word)) {
      errors.push(`duplicate word in puzzle: ${entry.word}`);
    }
    seenWords.add(entry.word);

    for (let index = 0; index < matchedSlot.length; index += 1) {
      const char = readingChars[index];
      const cell = getSlotCell(matchedSlot, index);

      if (cell.row < 0 || cell.row >= size || cell.col < 0 || cell.col >= size) {
        errors.push(`entry out of bounds: ${entry.word}`);
        break;
      }
      if (typeof char !== "string" || char.length === 0) {
        errors.push(`missing reading char: ${entry.word}`);
        break;
      }

      const key = `${cell.row}:${cell.col}`;
      const existing = cellMap.get(key);
      if (existing && existing !== char) {
        errors.push(`crossing mismatch at (${cell.row}, ${cell.col})`);
      } else {
        cellMap.set(key, char);
      }
    }
  }

  for (const slot of slots) {
    if (!seenSlots.has(slotKey(slot))) {
      errors.push(`unfilled slot: ${slotKey(slot)}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function scoreSoftConstraintFit({ puzzle, lexiconIndex, wordPreferences = {} }) {
  const entries = Array.isArray(puzzle?.entries) ? puzzle.entries : [];
  if (entries.length === 0) {
    return {
      score: 1,
      breakdown: {},
    };
  }

  const parts = [];
  const breakdown = {};

  if (Array.isArray(wordPreferences.preferredTags) && wordPreferences.preferredTags.length > 0) {
    let matches = 0;
    for (const entry of entries) {
      const lexiconEntry = lexiconIndex.get(entryKey(entry));
      const tags = new Set(lexiconEntry?.tags ?? []);
      if (wordPreferences.preferredTags.some((tag) => tags.has(tag))) {
        matches += 1;
      }
    }
    breakdown.preferredTags = matches / entries.length;
    parts.push(breakdown.preferredTags);
  }

  if (Array.isArray(wordPreferences.preferredPos) && wordPreferences.preferredPos.length > 0) {
    let matches = 0;
    for (const entry of entries) {
      const lexiconEntry = lexiconIndex.get(entryKey(entry));
      if (wordPreferences.preferredPos.includes(lexiconEntry?.pos)) {
        matches += 1;
      }
    }
    breakdown.preferredPos = matches / entries.length;
    parts.push(breakdown.preferredPos);
  }

  if (Array.isArray(wordPreferences.preferredLevels) && wordPreferences.preferredLevels.length > 0) {
    let matches = 0;
    for (const entry of entries) {
      const lexiconEntry = lexiconIndex.get(entryKey(entry));
      if (wordPreferences.preferredLevels.includes(lexiconEntry?.level)) {
        matches += 1;
      }
    }
    breakdown.preferredLevels = matches / entries.length;
    parts.push(breakdown.preferredLevels);
  }

  if (parts.length === 0) {
    return {
      score: 1,
      breakdown,
    };
  }

  const score = parts.reduce((sum, value) => sum + value, 0) / parts.length;
  return {
    score,
    breakdown,
  };
}

function jaccard(setA, setB) {
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) {
      intersection += 1;
    }
  }
  return intersection / union.size;
}

function scoreWordReuse(validPuzzles) {
  if (validPuzzles.length <= 1) {
    return {
      score: 1,
      averagePairwiseOverlap: 0,
      globalReuseRate: 0,
    };
  }

  const wordSets = validPuzzles.map((puzzle) => new Set(puzzle.entries.map((entry) => entry.word)));
  let pairCount = 0;
  let pairwiseOverlapSum = 0;

  for (let i = 0; i < wordSets.length; i += 1) {
    for (let j = i + 1; j < wordSets.length; j += 1) {
      pairwiseOverlapSum += jaccard(wordSets[i], wordSets[j]);
      pairCount += 1;
    }
  }

  const allWords = [];
  for (const wordSet of wordSets) {
    allWords.push(...wordSet);
  }
  const uniqueWords = new Set(allWords);
  const globalReuseRate = allWords.length === 0 ? 0 : 1 - uniqueWords.size / allWords.length;
  const averagePairwiseOverlap = pairCount === 0 ? 0 : pairwiseOverlapSum / pairCount;

  return {
    score: clamp(1 - 0.7 * averagePairwiseOverlap - 0.3 * globalReuseRate, 0, 1),
    averagePairwiseOverlap,
    globalReuseRate,
  };
}

export function scoreFilledPuzzles({
  size,
  slots,
  lexicon,
  puzzles,
  wordPreferences = {},
  expectedCount,
}) {
  if (!Array.isArray(slots)) {
    throw new Error("scoreFilledPuzzles requires slots");
  }
  if (!Array.isArray(lexicon)) {
    throw new Error("scoreFilledPuzzles requires lexicon");
  }
  if (!Array.isArray(puzzles)) {
    throw new Error("scoreFilledPuzzles requires puzzles");
  }

  const lexiconIndex = buildLexiconIndex(lexicon);
  const puzzleResults = [];
  const validPuzzles = [];

  for (const [index, puzzle] of puzzles.entries()) {
    const gate = validatePuzzle({
      puzzle,
      slots,
      lexiconIndex,
      size,
    });

    const soft = gate.valid
      ? scoreSoftConstraintFit({ puzzle, lexiconIndex, wordPreferences })
      : { score: 0, breakdown: {} };

    const result = {
      index,
      valid: gate.valid,
      gateErrors: gate.errors,
      softConstraintFit: Number(soft.score.toFixed(4)),
      softBreakdown: Object.fromEntries(
        Object.entries(soft.breakdown).map(([key, value]) => [key, Number(value.toFixed(4))]),
      ),
    };

    if (gate.valid) {
      validPuzzles.push(puzzle);
    }

    puzzleResults.push(result);
  }

  const requestedCount = expectedCount ?? puzzles.length;
  const validityRate = requestedCount === 0 ? 0 : validPuzzles.length / requestedCount;
  const averageSoftConstraintFit =
    validPuzzles.length === 0
      ? 0
      : puzzleResults
          .filter((result) => result.valid)
          .reduce((sum, result) => sum + result.softConstraintFit, 0) / validPuzzles.length;
  const reuse = scoreWordReuse(validPuzzles);
  const score =
    validPuzzles.length === 0
      ? 0
      : 0.5 * validityRate +
        0.25 * averageSoftConstraintFit +
        0.25 * reuse.score;

  return {
    overallScore: Number(score.toFixed(4)),
    breakdown: {
      validPuzzleRate: Number(validityRate.toFixed(4)),
      preferenceFit: Number(averageSoftConstraintFit.toFixed(4)),
      crossPuzzleVariety: Number(reuse.score.toFixed(4)),
    },
    stats: {
      requestedCount,
      returnedCount: puzzles.length,
      validCount: validPuzzles.length,
      invalidCount: puzzles.length - validPuzzles.length,
      averagePairwiseOverlap: Number(reuse.averagePairwiseOverlap.toFixed(4)),
      globalReuseRate: Number(reuse.globalReuseRate.toFixed(4)),
    },
    puzzles: puzzleResults,
  };
}

export default scoreFilledPuzzles;

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const inputPath = process.argv[2];

  if (!inputPath) {
    console.error("usage: node scripts/fill-score.js <input.json>");
    process.exit(1);
  }

  const input = JSON.parse(readFileSync(inputPath, "utf8"));
  const result = scoreFilledPuzzles(input);
  console.log(JSON.stringify(result, null, 2));
}
