import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { printFilledGridWithHeaders } from "./print-grid.js";

const TASKS_ROOT = resolve("tasks/fill-grid");

function loadJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function round(value) {
  return typeof value === "number" ? Number(value.toFixed(4)) : value;
}

function listResultFiles(dir) {
  const files = [];

  function walk(currentDir) {
    for (const name of readdirSync(currentDir).sort()) {
      const fullPath = join(currentDir, name);
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        walk(fullPath);
      } else if (name.endsWith(".json")) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

function summarize(result) {
  const summary = result.summary ?? {};
  const score = result.score ?? {};
  const stats = score.stats ?? {};

  return {
    overallScore: round(summary.overallScore ?? score.overallScore ?? 0),
    validPuzzleRate: round(summary.validPuzzleRate ?? score.breakdown?.validPuzzleRate ?? 0),
    preferenceFit: round(summary.preferenceFit ?? score.breakdown?.preferenceFit ?? 0),
    crossPuzzleVariety: round(summary.crossPuzzleVariety ?? score.breakdown?.crossPuzzleVariety ?? 0),
    firstIssue: summary.firstIssue ?? "",
    validCount: stats.validCount,
    requestedCount: stats.requestedCount,
    returnedCount: stats.returnedCount,
  };
}

function printResult(resultFile) {
  const result = loadJson(resultFile);
  const taskFile = join(TASKS_ROOT, `${result.taskId}.json`);
  const task = loadJson(taskFile);
  const summary = summarize(result);
  const puzzles = result.puzzles ?? [];
  const title = result.taskName ?? task.taskName ?? result.taskId ?? resultFile;

  console.log(`\n=== ${title} ===`);
  console.log(
    `overallScore=${summary.overallScore}  validPuzzleRate=${summary.validPuzzleRate}  preferenceFit=${summary.preferenceFit}  crossPuzzleVariety=${summary.crossPuzzleVariety}`,
  );

  if (summary.validCount !== undefined) {
    console.log(
      `valid=${summary.validCount}/${summary.requestedCount}  returned=${summary.returnedCount}`,
    );
  }

  if (summary.firstIssue) {
    console.log(`firstIssue=${summary.firstIssue}`);
  }

  if (!Array.isArray(puzzles) || puzzles.length === 0) {
    console.log("(no puzzles)");
    return;
  }

  for (let index = 0; index < puzzles.length; index += 1) {
    const puzzle = puzzles[index];
    console.log(`\npuzzle ${index + 1}`);
    console.log(
      printFilledGridWithHeaders({
        size: task.size,
        grid: task.grid,
        slots: task.slots,
        entries: puzzle.entries ?? [],
      }),
    );

    const entries = Array.isArray(puzzle.entries) ? [...puzzle.entries] : [];
    entries.sort((a, b) => {
      const byNumber = (a.number ?? 0) - (b.number ?? 0);
      if (byNumber !== 0) {
        return byNumber;
      }
      const byRow = (a.row ?? 0) - (b.row ?? 0);
      if (byRow !== 0) {
        return byRow;
      }
      const byCol = (a.col ?? 0) - (b.col ?? 0);
      if (byCol !== 0) {
        return byCol;
      }
      return String(a.direction ?? "").localeCompare(String(b.direction ?? ""));
    });

    if (entries.length > 0) {
      console.log("entries:");
      for (const entry of entries) {
        const location = `${entry.number ?? "-"} ${entry.direction ?? "-"} (${entry.row ?? "-"},${entry.col ?? "-"})`;
        console.log(`- ${location} | word=${entry.word ?? ""} | reading=${entry.reading ?? ""} | clue=${entry.clue ?? ""}`);
      }
    }
  }
}

function main() {
  const target = resolve(process.argv[2] ?? "results");

  if (!statSync(target).isDirectory()) {
    throw new Error(`not a directory: ${target}`);
  }

  const resultFiles = listResultFiles(target);
  console.log(`printing ${resultFiles.length} results from ${target}`);

  for (const resultFile of resultFiles) {
    printResult(resultFile);
  }
}

main();
