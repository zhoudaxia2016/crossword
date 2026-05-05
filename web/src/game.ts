import type { Direction, PlacedEntry, Puzzle, Slot } from "./types";
import { normalizeKanaText, toKanaCells } from "./kana";

export interface CellPosition {
  row: number;
  col: number;
}

export interface SlotWithNumber extends Slot {
  number: number;
}

export interface CellState {
  isBlack: boolean;
  expected?: string;
  actual?: string;
  isCorrect: boolean;
  labels: string[];
}

export function slotKey(direction: Direction, number: number) {
  return `${number}-${direction}`;
}

export function entryKey(entry: Pick<PlacedEntry, "direction" | "number">) {
  return slotKey(entry.direction, entry.number);
}

export function cellKey(position: CellPosition) {
  return `${position.row}:${position.col}`;
}

export function deriveSlotsWithNumbers(slots: Slot[]) {
  const startMap = new Map<string, number>();
  let nextNumber = 1;

  return [...slots]
    .sort((left, right) => {
      if (left.row !== right.row) return left.row - right.row;
      if (left.col !== right.col) return left.col - right.col;
      return left.direction.localeCompare(right.direction);
    })
    .map((slot) => {
      const start = `${slot.row}:${slot.col}`;
      let number = startMap.get(start);
      if (!number) {
        number = nextNumber;
        startMap.set(start, number);
        nextNumber += 1;
      }

      return { ...slot, number };
    });
}

export function buildExpectedCellMap(puzzle: Puzzle) {
  const map = new Map<string, string>();
  for (const entry of puzzle.entries) {
    const chars = toKanaCells(entry.reading);
    for (let index = 0; index < chars.length; index += 1) {
      const row = entry.direction === "down" ? entry.row + index : entry.row;
      const col = entry.direction === "across" ? entry.col + index : entry.col;
      map.set(cellKey({ row, col }), chars[index]);
    }
  }
  return map;
}

export function isCellInSlot(slot: Slot, row: number, col: number) {
  if (slot.direction === "across") {
    return slot.row === row && col >= slot.col && col < slot.col + slot.length;
  }
  return slot.col === col && row >= slot.row && row < slot.row + slot.length;
}

export function getPrimarySlotAtCell(slots: SlotWithNumber[], row: number, col: number) {
  const starting = slots.filter((slot) => slot.row === row && slot.col === col);
  const prioritize = (items: SlotWithNumber[]) =>
    [...items].sort((left, right) => {
      if (left.direction === right.direction) return left.number - right.number;
      return left.direction === "across" ? -1 : 1;
    })[0];

  if (starting.length > 0) {
    return prioritize(starting);
  }

  const across = slots.find((slot) => slot.direction === "across" && isCellInSlot(slot, row, col));
  if (across) {
    return across;
  }

  return slots.find((slot) => slot.direction === "down" && isCellInSlot(slot, row, col));
}

export function buildBoardState(
  size: number,
  grid: string[][],
  puzzle: Puzzle,
  cellValues: Record<string, string>,
) {
  const expectedMap = buildExpectedCellMap(puzzle);
  const labels = new Map<string, string[]>();

  for (const entry of puzzle.entries) {
    const expectedChars = toKanaCells(entry.reading);
    for (let index = 0; index < expectedChars.length; index += 1) {
      const row = entry.direction === "down" ? entry.row + index : entry.row;
      const col = entry.direction === "across" ? entry.col + index : entry.col;
      const coord = cellKey({ row, col });
      if (!labels.has(coord)) {
        labels.set(coord, []);
      }
      labels.get(coord)!.push(`${entry.number}${entry.direction === "across" ? "A" : "D"}`);
    }
  }

  const cells: CellState[][] = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => {
      if (grid[row][col] === "#") {
        return {
          isBlack: true,
          isCorrect: false,
          labels: [],
        };
      }

      const coord = cellKey({ row, col });
      const expected = expectedMap.get(coord);
      const actual = cellValues[coord];
      const isCorrect = expected !== undefined && actual === expected;

      return {
        isBlack: false,
        expected,
        actual,
        isCorrect,
        labels: labels.get(coord) ?? [],
      };
    }),
  );

  const playableCellCount = cells.flat().filter((cell) => !cell.isBlack).length;
  const filledCellCount = cells.flat().filter((cell) => !cell.isBlack && Boolean(cell.actual)).length;
  const percent = playableCellCount === 0 ? 0 : Math.round((filledCellCount / playableCellCount) * 100);

  return {
    cells,
    filledCellCount,
    playableCellCount,
    percent,
  };
}

export function isSolved(entry: PlacedEntry, answer: string) {
  return normalizeKanaText(answer) === normalizeKanaText(entry.reading);
}

export function getSlotCurrentText(slot: Slot, cellValues: Record<string, string>) {
  const chars = [];
  for (let index = 0; index < slot.length; index += 1) {
    const row = slot.direction === "down" ? slot.row + index : slot.row;
    const col = slot.direction === "across" ? slot.col + index : slot.col;
    const char = cellValues[cellKey({ row, col })];
    if (char) {
      chars.push(char);
    }
  }
  return chars.join("");
}

export function getSlotResolvedText(slot: Slot, cellValues: Record<string, string>) {
  const chars = [];
  for (let index = 0; index < slot.length; index += 1) {
    const row = slot.direction === "down" ? slot.row + index : slot.row;
    const col = slot.direction === "across" ? slot.col + index : slot.col;
    const char = cellValues[cellKey({ row, col })];
    chars.push(char ?? "");
  }
  return chars.join("");
}

export function applySlotDraft(
  slot: Slot,
  draft: string,
  currentCells: Record<string, string>,
) {
  const nextCells = { ...currentCells };
  const chars = toKanaCells(draft);

  for (let index = 0; index < slot.length; index += 1) {
    const row = slot.direction === "down" ? slot.row + index : slot.row;
    const col = slot.direction === "across" ? slot.col + index : slot.col;
    const key = cellKey({ row, col });
    const char = chars[index];
    if (char) {
      nextCells[key] = char;
    } else {
      delete nextCells[key];
    }
  }

  return nextCells;
}
