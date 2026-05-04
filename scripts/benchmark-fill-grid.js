import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import scoreFilledPuzzles from "./fill-score.js";

const MODELS_DIR = resolve("models");
const RESULTS_DIR = resolve("results");
const DEFAULT_LEXICON_XLSX = resolve("词汇表.xlsx");
const DEFAULT_COUNT = 5;
const RUN_ID = formatRunId(new Date());
const RUN_RESULTS_DIR = join(RESULTS_DIR, RUN_ID);

function average(values) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value) {
  return Number(value.toFixed(4));
}

function formatRunId(date) {
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "-",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ];
  return parts.join("");
}

function pad(text, width) {
  return String(text).padEnd(width, " ");
}

function formatTable(headers, rows) {
  const widths = headers.map((header, index) =>
    Math.max(String(header).length, ...rows.map((row) => String(row[index] ?? "").length)),
  );

  const renderRow = (row) =>
    `| ${row.map((cell, index) => pad(cell ?? "", widths[index])).join(" | ")} |`;

  const divider = `|-${widths.map((width) => "-".repeat(width)).join("-|-")}-|`;

  return [renderRow(headers), divider, ...rows.map(renderRow)].join("\n");
}

function renderProgressBar(completed, total, width = 24) {
  const safeTotal = Math.max(total, 1);
  const ratio = Math.max(0, Math.min(1, completed / safeTotal));
  const filled = Math.round(ratio * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}

function printModelProgress(modelName, completed, total) {
  const line = `${modelName}: ${renderProgressBar(completed, total)} ${completed}/${total}`;
  if (process.stdout.isTTY) {
    process.stdout.write(`\r${line}`);
    if (completed >= total) {
      process.stdout.write("\n");
    }
    return;
  }
  console.log(line);
}

function buildGridFromSlots(size, slots) {
  const grid = Array.from({ length: size }, () => Array(size).fill("#"));
  for (const slot of slots) {
    for (let index = 0; index < slot.length; index += 1) {
      const row = slot.direction === "across" ? slot.row : slot.row + index;
      const col = slot.direction === "across" ? slot.col + index : slot.col;
      grid[row][col] = ".";
    }
  }
  return grid;
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

function loadJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function saveModelTaskResult(modelName, taskName, payload) {
  const modelDir = join(RUN_RESULTS_DIR, modelName);
  mkdirSync(modelDir, { recursive: true });
  const safeTaskName = String(taskName).replace(/[^a-zA-Z0-9._-]+/g, "_");
  const outputFile = join(modelDir, `${safeTaskName}.json`);
  writeFileSync(outputFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return outputFile;
}

function updateSavedResult(file, updater) {
  const current = loadJson(file);
  const next = updater(current);
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

function computeTimeScores(allResults) {
  const fastestByTask = new Map();

  for (const result of allResults) {
    for (const task of result.results) {
      if (task.error || typeof task.elapsedMs !== "number" || task.elapsedMs <= 0) {
        continue;
      }

      const current = fastestByTask.get(task.task);
      if (current === undefined || task.elapsedMs < current) {
        fastestByTask.set(task.task, task.elapsedMs);
      }
    }
  }

  for (const result of allResults) {
    for (const task of result.results) {
      const fastestMs = fastestByTask.get(task.task);
      const relativeTimeScore =
        !task.error && typeof task.elapsedMs === "number" && task.elapsedMs > 0 && typeof fastestMs === "number"
          ? Math.min(1, fastestMs / task.elapsedMs)
          : 0;
      const finalScore = task.score > 0 ? task.score * (0.8 + 0.2 * relativeTimeScore) : 0;

      task.fastestMs = fastestMs ?? null;
      task.timeScore = round(relativeTimeScore);
      task.finalScore = round(finalScore);

      if (task.resultFile) {
        updateSavedResult(task.resultFile, (saved) => ({
          ...saved,
          summary: {
            ...(saved.summary ?? {}),
            elapsedMs: task.elapsedMs ?? null,
            fastestMs: task.fastestMs,
            timeScore: task.timeScore,
            finalScore: task.finalScore,
          },
        }));
      }
    }

    result.averageOverallScore = round(average(result.results.map((task) => task.score ?? 0)));
    result.averageValidPuzzleRate = round(average(result.results.map((task) => task.validPuzzleRate ?? 0)));
    result.averageFinalScore = round(average(result.results.map((task) => task.finalScore ?? 0)));
    result.averageTimeScore = round(average(result.results.map((task) => task.timeScore ?? 0)));
    result.averageElapsedMs = round(
      average(
        result.results
          .map((task) => task.elapsedMs)
          .filter((elapsedMs) => typeof elapsedMs === "number"),
      ),
    );
  }
}

function parseListArg(value) {
  if (!value) {
    return undefined;
  }
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function unzipText(xlsxPath, internalPath) {
  return execFileSync("unzip", ["-p", xlsxPath, internalPath], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function decodeXml(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function parseSharedStrings(xml) {
  const values = [];
  const regex = /<si[\s\S]*?>([\s\S]*?)<\/si>/g;
  let match;

  while ((match = regex.exec(xml))) {
    const textParts = [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1]));
    values.push(textParts.join(""));
  }

  return values;
}

function columnLettersToIndex(letters) {
  let value = 0;
  for (const char of letters) {
    value = value * 26 + (char.charCodeAt(0) - 64);
  }
  return value - 1;
}

function parseWorksheetRows(xml, sharedStrings) {
  const rows = [];
  const rowRegex = /<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(xml))) {
    const cells = [];
    const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cellMatch;

    while ((cellMatch = cellRegex.exec(rowMatch[2]))) {
      const attrs = cellMatch[1] ?? "";
      const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1];
      if (!ref) {
        continue;
      }

      const columnIndex = columnLettersToIndex(ref);
      const type = attrs.match(/\bt="([^"]+)"/)?.[1] ?? "";
      const body = cellMatch[2];
      const rawValue = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
      let value = "";

      if (type === "s") {
        value = sharedStrings[Number(rawValue)] ?? "";
      } else if (type === "inlineStr") {
        value = decodeXml(body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? "");
      } else {
        value = decodeXml(rawValue);
      }

      cells[columnIndex] = value;
    }

    rows.push(cells);
  }

  return rows;
}

function splitTags(value) {
  if (!value) {
    return undefined;
  }
  const items = value
    .split(/[;,，、]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function normalizePos(value) {
  if (!value) {
    return undefined;
  }
  return value.trim();
}

function normalizeLevel(value) {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toUpperCase();
  return normalized.startsWith("N") ? normalized : value.trim();
}

function loadLexiconFromXlsx(xlsxPath) {
  const sharedStrings = parseSharedStrings(unzipText(xlsxPath, "xl/sharedStrings.xml"));
  const worksheet = unzipText(xlsxPath, "xl/worksheets/sheet1.xml");
  const rows = parseWorksheetRows(worksheet, sharedStrings);

  if (rows.length === 0) {
    return [];
  }

  const header = rows[0];
  const indexByName = new Map(header.map((name, index) => [name, index]));
  const wordIndex = indexByName.get("单词");
  const readingIndex = indexByName.get("假名");
  const clueIndex = indexByName.get("释义");
  const posIndex = indexByName.get("词性");
  const tagsIndex = indexByName.get("分类");
  const levelIndex = indexByName.get("等级");

  if (wordIndex === undefined || readingIndex === undefined) {
    throw new Error("xlsx lexicon must contain 单词 and 假名 columns");
  }

  return rows
    .slice(1)
    .map((row) => {
      const word = row[wordIndex]?.trim();
      const reading = row[readingIndex]?.trim();

      if (!word || !reading) {
        return null;
      }

      return {
        word,
        reading,
        clue: clueIndex !== undefined ? row[clueIndex]?.trim() || undefined : undefined,
        pos: posIndex !== undefined ? normalizePos(row[posIndex]) : undefined,
        level: levelIndex !== undefined ? normalizeLevel(row[levelIndex]) : undefined,
        tags: tagsIndex !== undefined ? splitTags(row[tagsIndex]) : undefined,
      };
    })
    .filter(Boolean);
}

function loadGridTasks(gridsDir, cliOptions) {
  const dir = resolve(gridsDir);

  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((file) => {
      const data = loadJson(join(dir, file));
      const size = cliOptions.size ?? data.size;
      const minEntryLength = cliOptions.minEntryLength ?? data.minEntryLength ?? 3;
      const maxEntryLength = cliOptions.maxEntryLength ?? data.maxEntryLength ?? size;

      return {
        name: data.name ?? file,
        input: {
          grid: data.grid ?? buildGridFromSlots(size, data.slots),
          slots: data.slots,
          gridConstraints: {
            size,
            minEntryLength,
            maxEntryLength,
          },
        },
      };
    });
}

function discoverModels() {
  if (!existsSync(MODELS_DIR)) {
    throw new Error(`models directory not found: ${MODELS_DIR}`);
  }

  const models = [];

  for (const name of readdirSync(MODELS_DIR).sort()) {
    const fullPath = join(MODELS_DIR, name);
    if (!statSync(fullPath).isDirectory()) {
      continue;
    }

    const entry = join(fullPath, "index.js");
    if (!existsSync(entry)) {
      continue;
    }

    models.push({ name, entry });
  }

  return models;
}

function selectModels(models, modelName) {
  if (!modelName) {
    return models;
  }

  const filtered = models.filter((model) => model.name === modelName);
  if (filtered.length === 0) {
    throw new Error(`model not found: ${modelName}`);
  }
  return filtered;
}

async function loadModel(entryFile) {
  const mod = await import(pathToFileURL(entryFile).href);
  const exported = mod.default ?? mod;
  return {
    fillGrid: exported.fillGrid ?? mod.fillGrid,
  };
}

async function benchmarkModel(model, modelName, tasks, lexicon, cliOptions) {
  if (typeof model.fillGrid !== "function") {
    return {
      available: false,
      averageOverallScore: 0,
      averageValidPuzzleRate: 0,
      averageFinalScore: 0,
      results: [],
    };
  }

  const results = [];
  printModelProgress(modelName, 0, tasks.length);

  for (let taskIndex = 0; taskIndex < tasks.length; taskIndex += 1) {
    const task = tasks[taskIndex];
    const input = {
      ...task.input,
      lexicon,
      wordConstraints: {
        maxJlptLevel: cliOptions.maxJlptLevel,
        allowedPos: cliOptions.allowedPos,
        tags: cliOptions.tags,
      },
      wordPreferences: {
        preferredTags: cliOptions.preferredTags,
        preferredPos: cliOptions.preferredPos,
        preferredLevels: cliOptions.preferredLevels,
      },
      count: cliOptions.count,
    };

    try {
      const startedAt = Date.now();
      const output = await model.fillGrid(input);
      const elapsedMs = Date.now() - startedAt;
      const sameGrid = deepEqual(output.grid, input.grid);
      const sameSlots = deepEqual(output.slots, input.slots);

      if (!sameGrid || !sameSlots) {
        const firstIssue = !sameGrid ? "fillGrid changed grid" : "fillGrid changed slots";
        const resultFile = saveModelTaskResult(modelName, task.name, {
          task: task.name,
          input,
          output,
          summary: {
            overallScore: 0,
            validPuzzleRate: 0,
            preferenceFit: 0,
            crossPuzzleVariety: 0,
            elapsedMs,
            firstIssue,
          },
        });
        results.push({
          task: task.name,
          score: 0,
          validPuzzleRate: 0,
          elapsedMs,
          resultFile,
          error: firstIssue,
        });
        printModelProgress(modelName, taskIndex + 1, tasks.length);
        continue;
      }

      const score = scoreFilledPuzzles({
        size: output.size,
        slots: output.slots,
        lexicon,
        puzzles: output.puzzles,
        wordConstraints: input.wordConstraints,
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

      const resultFile = saveModelTaskResult(modelName, task.name, {
        task: task.name,
        input,
        output,
        score,
        summary: {
          overallScore: score.overallScore,
          validPuzzleRate: score.breakdown.validPuzzleRate,
          preferenceFit: score.breakdown.preferenceFit,
          crossPuzzleVariety: score.breakdown.crossPuzzleVariety,
          elapsedMs,
          firstIssue,
        },
      });

      results.push({
        task: task.name,
        score: score.overallScore,
        validPuzzleRate: score.breakdown.validPuzzleRate,
        preferenceFit: score.breakdown.preferenceFit,
        crossPuzzleVariety: score.breakdown.crossPuzzleVariety,
        elapsedMs,
        resultFile,
        stats: score.stats,
        invalidPuzzles,
        firstIssue,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const resultFile = saveModelTaskResult(modelName, task.name, {
        task: task.name,
        input,
        error: message,
        summary: {
          overallScore: 0,
          validPuzzleRate: 0,
          preferenceFit: 0,
          crossPuzzleVariety: 0,
          firstIssue: message,
        },
      });
      results.push({
        task: task.name,
        score: 0,
        validPuzzleRate: 0,
        elapsedMs: null,
        resultFile,
        error: message,
      });
    }

    printModelProgress(modelName, taskIndex + 1, tasks.length);
  }

  return {
    available: true,
    averageOverallScore: round(average(results.map((result) => result.score))),
    averageValidPuzzleRate: round(average(results.map((result) => result.validPuzzleRate ?? 0))),
    averageFinalScore: 0,
    results,
  };
}

function printUsage() {
  console.log("usage:");
  console.log("  node scripts/benchmark-fill-grid.js --grids-dir <dir> [--lexicon-xlsx <file>]");
  console.log("    [--size <n>] [--minEntryLength <n>] [--maxEntryLength <n>]");
  console.log("    [--maxJlptLevel <level>] [--allowedPos <a,b,c>] [--tags <a,b,c>]");
  console.log("    [--model <name>]");
  console.log("    [--preferredTags <a,b,c>] [--preferredPos <a,b,c>] [--preferredLevels <a,b,c>] [--count <n>]");
}

function printModelSummary(result) {
  console.log(`\n## ${result.name}`);
  console.log(
    formatTable(
      ["finalScore", "overallScore", "validPuzzleRate"],
      [[result.averageFinalScore, result.averageOverallScore, result.averageValidPuzzleRate]],
    ),
  );

  const taskRows = result.results.map((task) => {
    if (task.error) {
      return [task.task, 0, 0, 0, 0, "-", "-", "-", "-", task.error];
    }

    return [
      task.task,
      task.finalScore,
      task.score,
      task.validPuzzleRate,
      task.preferenceFit,
      task.crossPuzzleVariety,
      task.elapsedMs,
      task.timeScore,
      `${task.stats.validCount}/${task.stats.requestedCount}`,
      task.stats.returnedCount,
      task.firstIssue ?? "",
    ];
  });

  console.log(
    formatTable(
      [
        "task",
        "finalScore",
        "overallScore",
        "validPuzzleRate",
        "preferenceFit",
        "crossPuzzleVariety",
        "elapsedMs",
        "timeScore",
        "valid/expected",
        "returned",
        "firstIssue",
      ],
      taskRows,
    ),
  );

  for (const task of result.results) {
    if (task.error) {
      continue;
    }
    if (Array.isArray(task.invalidPuzzles) && task.invalidPuzzles.length > 0) {
      console.log(`\n${task.task} issues:`);
      for (const puzzle of task.invalidPuzzles.slice(0, 3)) {
        console.log(`- puzzle ${puzzle.index + 1}: ${puzzle.firstError}`);
      }
      if (task.invalidPuzzles.length > 3) {
        console.log(`- ... ${task.invalidPuzzles.length - 3} more invalid puzzles`);
      }
    }
  }
}

function printLeaderboard(results) {
  console.log("\n# Leaderboard");
  const sorted = [...results].sort((a, b) => b.averageFinalScore - a.averageFinalScore);
  const rows = sorted.map((result, index) => [
    index + 1,
    result.name,
    result.averageFinalScore,
    result.averageOverallScore,
    result.averageValidPuzzleRate,
    result.averageTimeScore,
    result.averageElapsedMs,
  ]);
  console.log(
    formatTable(
      ["rank", "model", "finalScore", "overallScore", "validPuzzleRate", "timeScore", "elapsedMs"],
      rows,
    ),
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args["grids-dir"]) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }

  const cliOptions = {
    size: args.size ? Number(args.size) : undefined,
    minEntryLength: args.minEntryLength ? Number(args.minEntryLength) : undefined,
    maxEntryLength: args.maxEntryLength ? Number(args.maxEntryLength) : undefined,
    maxJlptLevel: args.maxJlptLevel ?? undefined,
    allowedPos: parseListArg(args.allowedPos),
    tags: parseListArg(args.tags),
    preferredTags: parseListArg(args.preferredTags),
    preferredPos: parseListArg(args.preferredPos),
    preferredLevels: parseListArg(args.preferredLevels),
    count: args.count ? Number(args.count) : DEFAULT_COUNT,
  };

  if (cliOptions.size !== undefined && (!Number.isInteger(cliOptions.size) || cliOptions.size <= 0)) {
    throw new Error("size must be a positive integer");
  }
  if (
    cliOptions.minEntryLength !== undefined &&
    (!Number.isInteger(cliOptions.minEntryLength) || cliOptions.minEntryLength <= 0)
  ) {
    throw new Error("minEntryLength must be a positive integer");
  }
  if (
    cliOptions.maxEntryLength !== undefined &&
    (!Number.isInteger(cliOptions.maxEntryLength) || cliOptions.maxEntryLength <= 0)
  ) {
    throw new Error("maxEntryLength must be a positive integer");
  }
  if (!Number.isInteger(cliOptions.count) || cliOptions.count <= 0) {
    throw new Error("count must be a positive integer");
  }

  const lexiconXlsx = resolve(args["lexicon-xlsx"] ?? DEFAULT_LEXICON_XLSX);
  const lexicon = loadLexiconFromXlsx(lexiconXlsx);
  const tasks = loadGridTasks(args["grids-dir"], cliOptions);
  const models = selectModels(discoverModels(), args.model);

  if (models.length === 0) {
    throw new Error(`no model implementations found in ${MODELS_DIR}`);
  }

  console.log(`benchmarking ${models.length} fillGrid models from ${MODELS_DIR}`);
  console.log(`grids: ${tasks.length} from ${resolve(args["grids-dir"])}`);
  console.log(`lexicon: ${lexicon.length} entries from ${lexiconXlsx}`);
  console.log(`results: ${RUN_RESULTS_DIR}`);

  const allResults = [];

  for (const modelInfo of models) {
    const model = await loadModel(modelInfo.entry);
    const result = await benchmarkModel(model, modelInfo.name, tasks, lexicon, cliOptions);
    const summary = {
      name: modelInfo.name,
      ...result,
    };
    allResults.push(summary);
  }

  computeTimeScores(allResults);

  for (const summary of allResults) {
    printModelSummary(summary);
  }

  printLeaderboard(allResults);
}

await main();
