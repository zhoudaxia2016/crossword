import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import scoreGrid from "./grid-score.js";
import { printGridWithHeaders } from "./print-grid.js";

function loadCasesFromDirectory(dir) {
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort();

  return files.map((file) => {
    const fullPath = join(dir, file);
    const data = JSON.parse(readFileSync(fullPath, "utf8"));
    return {
      file,
      ...data,
    };
  });
}

function main() {
  const inputDir = resolve(process.argv[2] ?? "grids/manual");
  const cliMinEntryLength = process.argv[3] ? Number(process.argv[3]) : 2;
  const cases = loadCasesFromDirectory(inputDir);

  console.log(`testing ${cases.length} grids from ${inputDir}`);

  for (const testCase of cases) {
    if (!Array.isArray(testCase.slots)) {
      throw new Error(`${testCase.file} is missing slots`);
    }

    const gridConstraints = {
      size: testCase.size,
      minEntryLength: cliMinEntryLength,
      maxEntryLength: testCase.size,
    };

    const slots = testCase.slots;
    const result = scoreGrid({
      grid: testCase.grid,
      slots,
      gridConstraints,
    });

    console.log(`\n=== ${testCase.file} ===`);
    if (testCase.name) {
      console.log(testCase.name);
    }
    if (testCase.note) {
      console.log(testCase.note);
    }
    if (testCase.title) {
      console.log(testCase.title);
    }
    console.log(printGridWithHeaders(testCase.grid, slots));
    console.log(`score: ${result.score}`);
    if (result.breakdown) {
      const parts = Object.entries(result.breakdown).map(([key, value]) => `${key}=${value}`);
      console.log(parts.join("  "));
    }
    
    if (!result.valid) {
      console.log("valid: false");
      const preview = result.errors.slice(0, 5);
      console.log(`errors: ${result.errors.length}`);
      for (const error of preview) {
        console.log(`- ${error}`);
      }
      if (result.errors.length > preview.length) {
        console.log(`- ... ${result.errors.length - preview.length} more`);
      }
    }

    if (process.argv.includes("--details")) {
      console.log("breakdown:");
      for (const [key, value] of Object.entries(result.breakdown)) {
        console.log(`- ${key}: ${value}`);
      }

      if (result.stats) {
        console.log("stats:");
        for (const [key, value] of Object.entries(result.stats)) {
          console.log(`- ${key}: ${value}`);
        }
      }
    }
  }
}

main();
