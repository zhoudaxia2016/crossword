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

export interface TaskFile {
  taskId: number;
  taskKey: string;
  taskName: string;
  size: number;
  grid: string[][];
  slots: Slot[];
  minEntryLength?: number;
  maxEntryLength?: number;
  title?: string;
  name?: string;
  note?: string;
  page?: number;
  url?: string;
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
  taskId: number;
  taskKey: string;
  taskName?: string;
  puzzles: Puzzle[];
  summary?: Summary;
  error?: string;
}

export interface LoadedResult {
  task: TaskFile;
  result: ResultFile;
}

export interface ResultRecord {
  id: string;
  timestamp: string;
  model: string;
  fileName: string;
  taskId: number;
  taskKey: string;
  taskName: string;
  resultUrl: string;
  taskUrl: string;
  summary?: Summary;
}
