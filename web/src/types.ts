export type Direction = "across" | "down";

export interface Slot {
  direction: Direction;
  row: number;
  col: number;
  length: number;
}

export interface PlacedEntry {
  number: number;
  direction: Direction;
  row: number;
  col: number;
  word: string;
  reading: string;
  clue?: string;
}

export interface Puzzle {
  entries: PlacedEntry[];
}

export interface Summary {
  overallScore: number;
  validPuzzleRate: number;
  preferenceFit: number;
  crossPuzzleVariety: number;
  elapsedMs?: number;
  timeScore?: number;
  finalScore?: number;
  firstIssue?: string;
}

export interface ResultFile {
  task: string;
  input: {
    grid: string[][];
    slots: Slot[];
    gridConstraints?: {
      size: number;
      minEntryLength?: number;
      maxEntryLength?: number;
    };
  };
  output?: {
    size: number;
    grid: string[][];
    slots: Slot[];
    puzzles: Puzzle[];
  };
  summary?: Summary;
}

export interface ResultRecord {
  id: string;
  timestamp: string;
  model: string;
  fileName: string;
  taskName: string;
  url: string;
  summary?: Summary;
}
