import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import scoreFilledPuzzles from "./fill-score.js";

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function send(message) {
  if (typeof process.send === "function") {
    process.send(message);
  }
}

function roundMs(value) {
  return Number(Math.max(value, 0.0001).toFixed(4));
}

async function loadModel(entryFile) {
  const mod = await import(pathToFileURL(entryFile).href);
  const exported = mod.default ?? mod;
  return {
    fillGrid: exported.fillGrid ?? mod.fillGrid,
  };
}

async function benchmarkModel({ modelName, entryFile, templates, lexicon, cliOptions }) {
  const model = await loadModel(entryFile);
  if (typeof model.fillGrid !== "function") {
    return {
      name: modelName,
      available: false,
      averageOverallScore: 0,
      averageValidPuzzleRate: 0,
      averageFinalScore: 0,
      results: [],
    };
  }

  const results = [];
  send({ type: "progress", modelName, completed: 0, total: templates.length });

  for (let templateIndex = 0; templateIndex < templates.length; templateIndex += 1) {
    const template = templates[templateIndex];
    const input = {
      ...template.input,
      lexicon,
      wordPreferences: {
        preferredTags: cliOptions.tags,
        preferredPos: cliOptions.pos,
        preferredLevels: cliOptions.levels,
      },
      count: cliOptions.count,
    };

    try {
      const startedAt = performance.now();
      const output = await model.fillGrid(input);
      const elapsedMs = roundMs(performance.now() - startedAt);
      const sameGrid = deepEqual(output.grid, input.grid);
      const sameSlots = deepEqual(output.slots, input.slots);

      if (!sameGrid || !sameSlots) {
        const firstIssue = !sameGrid ? "fillGrid changed grid" : "fillGrid changed slots";
        results.push({
          template: template.templateName,
          templateId: template.templateId,
          templateKey: template.templateKey,
          templateName: template.templateName,
          puzzles: Array.isArray(output?.puzzles) ? output.puzzles : [],
          score: 0,
          validPuzzleRate: 0,
          preferenceFit: 0,
          crossPuzzleVariety: 0,
          elapsedMs,
          firstIssue,
          error: firstIssue,
        });
        send({ type: "progress", modelName, completed: templateIndex + 1, total: templates.length });
        continue;
      }

      const score = scoreFilledPuzzles({
        size: output.size,
        slots: output.slots,
        lexicon,
        puzzles: output.puzzles,
        wordPreferences: input.wordPreferences,
        expectedCount: input.count,
      });

      const invalidPuzzles = score.puzzles
        .filter((puzzle) => !puzzle.valid)
        .map((puzzle) => ({
          index: puzzle.index,
          firstError: puzzle.gateErrors[0] ?? "invalid puzzle",
        }));

      let firstIssue = invalidPuzzles[0]?.firstError ?? "";
      if (!Array.isArray(output.puzzles)) {
        firstIssue = "output.puzzles is not an array";
      } else if (output.puzzles.length === 0 && input.count > 0) {
        firstIssue = "returned no puzzles";
      } else if (score.stats.returnedCount < score.stats.requestedCount && !firstIssue) {
        firstIssue = "returned fewer puzzles than requested";
      }

      results.push({
        template: template.templateName,
        templateId: template.templateId,
        templateKey: template.templateKey,
        templateName: template.templateName,
        puzzles: output.puzzles ?? [],
        score: score.overallScore,
        validPuzzleRate: score.breakdown.validPuzzleRate,
        preferenceFit: score.breakdown.preferenceFit,
        crossPuzzleVariety: score.breakdown.crossPuzzleVariety,
        elapsedMs,
        stats: score.stats,
        invalidPuzzles,
        firstIssue,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        template: template.templateName,
        templateId: template.templateId,
        templateKey: template.templateKey,
        templateName: template.templateName,
        puzzles: [],
        score: 0,
        validPuzzleRate: 0,
        preferenceFit: 0,
        crossPuzzleVariety: 0,
        elapsedMs: null,
        firstIssue: message,
        error: message,
      });
    }

    send({ type: "progress", modelName, completed: templateIndex + 1, total: templates.length });
  }

  return {
    name: modelName,
    available: true,
    averageOverallScore: 0,
    averageValidPuzzleRate: 0,
    averageFinalScore: 0,
    results,
  };
}

async function main() {
  const payloadPath = process.argv[2];
  const payload = JSON.parse(readFileSync(payloadPath, "utf8"));
  const result = await benchmarkModel(payload);
  send({ type: "done", result });
}

main().catch((error) => {
  send({
    type: "fatal",
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
