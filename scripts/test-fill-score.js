import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import scoreFilledPuzzles from "./fill-score.js";
import { printFilledGridWithHeaders } from "./print-grid.js";

function loadCases(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((file) => ({
      file,
      ...JSON.parse(readFileSync(join(dir, file), "utf8")),
    }));
}

function main() {
  const inputDir = resolve(process.argv[2] ?? "fill-score-cases");
  const cases = loadCases(inputDir);

  console.log(`testing ${cases.length} fill-score cases from ${inputDir}`);

  for (const testCase of cases) {
    const result = scoreFilledPuzzles(testCase);
    console.log(`\n=== ${testCase.file} ===`);
    if (testCase.name) {
      console.log(testCase.name);
    }
    console.log(`overallScore: ${result.overallScore}`);
    console.log(
      `validPuzzleRate=${result.breakdown.validPuzzleRate}  preferenceFit=${result.breakdown.preferenceFit}  crossPuzzleVariety=${result.breakdown.crossPuzzleVariety}`,
    );
    console.log(
      `valid=${result.stats.validCount}/${result.stats.requestedCount}  pairwiseOverlap=${result.stats.averagePairwiseOverlap}  globalReuseRate=${result.stats.globalReuseRate}`,
    );

    for (const [index, puzzle] of testCase.puzzles.entries()) {
      console.log(`\npuzzle ${index}: ${result.puzzles[index]?.valid ? "valid" : "invalid"}`);
      console.log(
        printFilledGridWithHeaders({
          size: testCase.size,
          slots: testCase.slots,
          entries: puzzle.entries,
        }),
      );
    }

    const invalidPuzzles = result.puzzles.filter((puzzle) => !puzzle.valid);
    if (invalidPuzzles.length > 0) {
      console.log(`invalidPuzzles: ${invalidPuzzles.length}`);
      for (const puzzle of invalidPuzzles) {
        console.log(`- puzzle ${puzzle.index}: ${puzzle.gateErrors[0]}`);
      }
    }
  }
}

main();
