export type Direction = "across" | "down";

export type GridMatrix = string[][];

export interface LexiconEntry {
  word: string;
  reading: string;
  clue?: string;
  pos?: string;
  level?: string;
  tags?: string[];
  [key: string]: unknown;
}

export interface GridConstraints {
  size: number;
  minEntryLength?: number;
  maxEntryLength?: number;
}

export interface WordPreferences {
  preferredTags?: string[];
  preferredPos?: string[];
  preferredLevels?: string[];
}

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

export interface BenchmarkModule {
  fillGrid(input: {
    grid: GridMatrix;
    slots: Slot[];
    lexicon: LexiconEntry[];
    gridConstraints: GridConstraints;
    wordPreferences?: WordPreferences;
    count: number;
  }): {
    size: number;
    grid: GridMatrix;
    slots: Slot[];
    puzzles: Array<{
      entries: PlacedEntry[];
    }>;
  };
}
