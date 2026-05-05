import { execFileSync, fork } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeKanaText } from "./kana.js";

const MODELS_DIR = resolve("models");
const RESULTS_DIR = resolve("results");
const TEMPLATES_ROOT = resolve("templates/fill-grid");
const DEFAULT_LEXICON_XLSX = resolve("词汇表.xlsx");
const DEFAULT_COUNT = 5;
const DEFAULT_CONCURRENCY = Math.max(1, Math.min(4, availableParallelism?.() ?? 2));
const RUN_ID = formatRunId(new Date());
const RUN_RESULTS_DIR = join(RESULTS_DIR, RUN_ID);
const WORKER_FILE = fileURLToPath(new URL("./benchmark-fill-grid-worker.js", import.meta.url));
const progressState = new Map();
let progressOrder = [];
let renderedProgressLines = 0;

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

function renderProgressLines() {
  return progressOrder.map((modelName) => {
    const state = progressState.get(modelName) ?? { completed: 0, total: 1 };
    return `${modelName}: ${renderProgressBar(state.completed, state.total)} ${state.completed}/${state.total}`;
  });
}

function redrawProgress() {
  const lines = renderProgressLines();

  if (!process.stdout.isTTY) {
    for (const line of lines) {
      console.log(line);
    }
    return;
  }

  if (renderedProgressLines > 0) {
    for (let index = 0; index < renderedProgressLines; index += 1) {
      process.stdout.write("\x1b[1A\x1b[2K");
    }
  }

  process.stdout.write(lines.join("\n"));
  process.stdout.write("\n");
  renderedProgressLines = lines.length;
}

function initializeProgress(models, total) {
  progressOrder = models.map((model) => model.name);
  progressState.clear();
  for (const model of models) {
    progressState.set(model.name, { completed: 0, total });
  }
  redrawProgress();
}

function printModelProgress(modelName, completed, total) {
  progressState.set(modelName, { completed, total });
  redrawProgress();
}

function finishProgress() {
  if (process.stdout.isTTY && renderedProgressLines > 0) {
    renderedProgressLines = 0;
  }
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

function saveModelTemplateResult(modelName, templateKey, payload) {
  const modelDir = join(RUN_RESULTS_DIR, modelName);
  const outputFile = join(modelDir, `${templateKey}.json`);
  mkdirSync(dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return outputFile;
}

function computeTimeScores(allResults) {
  const fastestByTask = new Map();

  for (const result of allResults) {
    for (const task of result.results) {
      if (task.error || typeof task.elapsedMs !== "number" || task.elapsedMs <= 0) {
        continue;
      }

      const current = fastestByTask.get(task.templateKey);
      if (current === undefined || task.elapsedMs < current) {
        fastestByTask.set(task.templateKey, task.elapsedMs);
      }
    }
  }

  for (const result of allResults) {
    for (const task of result.results) {
      const fastestMs = fastestByTask.get(task.templateKey);
      const relativeTimeScore =
        !task.error && typeof task.elapsedMs === "number" && task.elapsedMs > 0 && typeof fastestMs === "number"
          ? Math.min(1, fastestMs / task.elapsedMs)
          : 0;
      const finalScore = task.score > 0 ? task.score * (0.8 + 0.2 * relativeTimeScore) : 0;

      task.fastestMs = fastestMs ?? null;
      task.timeScore = round(relativeTimeScore);
      task.finalScore = round(finalScore);

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
      const reading = normalizeKanaText(row[readingIndex]?.trim());

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

function loadTemplates(templatesDir, cliOptions) {
  const dir = resolve(templatesDir);
  const isUnderTemplatesRoot = dir === TEMPLATES_ROOT || dir.startsWith(`${TEMPLATES_ROOT}/`);
  const templateFiles = [];

  function walk(currentDir) {
    for (const name of readdirSync(currentDir).sort()) {
      const fullPath = join(currentDir, name);
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        walk(fullPath);
      } else if (name.endsWith(".json")) {
        templateFiles.push(fullPath);
      }
    }
  }

  walk(dir);

  return templateFiles
    .sort()
    .map((fullPath) => {
      const data = loadJson(fullPath);
      const size = cliOptions.size ?? data.size;
      const minEntryLength = cliOptions.minEntryLength ?? data.minEntryLength ?? 3;
      const maxEntryLength = cliOptions.maxEntryLength ?? data.maxEntryLength ?? size;
      const templateId = data.templateId;
      const templateKey =
        data.templateKey
        ?? (isUnderTemplatesRoot
          ? relative(TEMPLATES_ROOT, fullPath).replace(/\\/g, "/").replace(/\.json$/u, "")
          : relative(dir, fullPath).replace(/\\/g, "/").replace(/\.json$/u, ""));
      const templateName = data.templateName ?? data.title ?? data.name ?? templateKey.split("/").at(-1);

      if (!Number.isInteger(templateId) || templateId <= 0) {
        throw new Error(`template file is missing numeric templateId: ${fullPath}`);
      }

      return {
        templateId,
        templateKey,
        templateName,
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

function runModelWorker(modelInfo, templates, lexicon, cliOptions) {
  return new Promise((resolvePromise, rejectPromise) => {
    const payloadFile = join(RUN_RESULTS_DIR, `.worker-${modelInfo.name}.json`);
    mkdirSync(dirname(payloadFile), { recursive: true });
    writeFileSync(
      payloadFile,
      `${JSON.stringify({
        modelName: modelInfo.name,
        entryFile: modelInfo.entry,
        templates,
        lexicon,
        cliOptions,
      })}\n`,
      "utf8",
    );

    const child = fork(WORKER_FILE, [payloadFile], {
      cwd: process.cwd(),
      stdio: ["inherit", "inherit", "inherit", "ipc"],
    });

    let settled = false;
    function cleanup() {
      rmSync(payloadFile, { force: true });
    }

    child.on("message", (message) => {
      if (!message || typeof message !== "object") {
        return;
      }
      if (message.type === "progress") {
        printModelProgress(message.modelName, message.completed, message.total);
        return;
      }
      if (message.type === "done") {
        settled = true;
        cleanup();
        resolvePromise(message.result);
        return;
      }
      if (message.type === "fatal") {
        settled = true;
        cleanup();
        rejectPromise(new Error(message.error || `worker failed: ${modelInfo.name}`));
      }
    });

    child.on("exit", (code) => {
      if (!settled) {
        cleanup();
        rejectPromise(new Error(`worker exited before completion: ${modelInfo.name} (${code ?? "unknown"})`));
      }
    });
    child.on("error", (error) => {
      cleanup();
      rejectPromise(error);
    });
  });
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runOne() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, () => runOne());
  await Promise.all(workers);
  return results;
}

function persistResults(allResults) {
  for (const modelResult of allResults) {
    for (const template of modelResult.results) {
      saveModelTemplateResult(modelResult.name, template.templateKey, {
        templateId: template.templateId,
        templateKey: template.templateKey,
        templateName: template.templateName,
        puzzles: template.puzzles ?? [],
        ...(template.error ? { error: template.error } : {}),
        summary: {
          overallScore: template.score ?? 0,
          validPuzzleRate: template.validPuzzleRate ?? 0,
          preferenceFit: template.preferenceFit ?? 0,
          crossPuzzleVariety: template.crossPuzzleVariety ?? 0,
          elapsedMs: template.elapsedMs ?? null,
          fastestMs: template.fastestMs ?? null,
          timeScore: template.timeScore ?? 0,
          finalScore: template.finalScore ?? 0,
          firstIssue: template.firstIssue ?? "",
        },
      });
    }
  }
}

function printUsage() {
  console.log("usage:");
  console.log("  node scripts/benchmark-fill-grid.js --templates-dir <dir> [--lexicon-xlsx <file>]");
  console.log("    [--size <n>] [--minEntryLength <n>] [--maxEntryLength <n>]");
  console.log("    [--levels <a,b,c>] [--pos <a,b,c>] [--tags <a,b,c>]");
  console.log("    [--model <name>]");
  console.log("    [--count <n>]");
  console.log("    [--concurrency <n>]");
  console.log("");
  console.log("examples:");
  console.log("  node scripts/benchmark-fill-grid.js --templates-dir templates/fill-grid/site-6x6 --count 5");
  console.log("  node scripts/benchmark-fill-grid.js --model gpt-5.4 --templates-dir templates/fill-grid/manual --minEntryLength 3 --count 5 --concurrency 1");
}

function printModelSummary(result) {
  console.log(`\n## ${result.name}`);
  console.log(
    formatTable(
      ["finalScore", "overallScore", "validPuzzleRate"],
      [[result.averageFinalScore, result.averageOverallScore, result.averageValidPuzzleRate]],
    ),
  );

  const templateRows = result.results.map((template) => {
    if (template.error) {
      return [template.template, 0, 0, 0, 0, "-", "-", "-", "-", template.error];
    }

    return [
      template.template,
      template.finalScore,
      template.score,
      template.validPuzzleRate,
      template.preferenceFit,
      template.crossPuzzleVariety,
      template.elapsedMs,
      template.timeScore,
      `${template.stats.validCount}/${template.stats.requestedCount}`,
      template.stats.returnedCount,
      template.firstIssue ?? "",
    ];
  });

  console.log(
    formatTable(
      [
        "template",
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
      templateRows,
    ),
  );

  for (const template of result.results) {
    if (template.error) {
      continue;
    }
    if (Array.isArray(template.invalidPuzzles) && template.invalidPuzzles.length > 0) {
      console.log(`\n${template.template} issues:`);
      for (const puzzle of template.invalidPuzzles.slice(0, 3)) {
        console.log(`- puzzle ${puzzle.index + 1}: ${puzzle.firstError}`);
      }
      if (template.invalidPuzzles.length > 3) {
        console.log(`- ... ${template.invalidPuzzles.length - 3} more invalid puzzles`);
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
  const templatesDir = args["templates-dir"];

  if (args.help || !templatesDir) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }

  const cliOptions = {
    size: args.size ? Number(args.size) : undefined,
    minEntryLength: args.minEntryLength ? Number(args.minEntryLength) : undefined,
    maxEntryLength: args.maxEntryLength ? Number(args.maxEntryLength) : undefined,
    levels: parseListArg(args.levels),
    pos: parseListArg(args.pos),
    tags: parseListArg(args.tags),
    count: args.count ? Number(args.count) : DEFAULT_COUNT,
    concurrency: args.concurrency ? Number(args.concurrency) : DEFAULT_CONCURRENCY,
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
  if (!Number.isInteger(cliOptions.concurrency) || cliOptions.concurrency <= 0) {
    throw new Error("concurrency must be a positive integer");
  }

  const lexiconXlsx = resolve(args["lexicon-xlsx"] ?? DEFAULT_LEXICON_XLSX);
  const lexicon = loadLexiconFromXlsx(lexiconXlsx);
  const templates = loadTemplates(templatesDir, cliOptions);
  const models = selectModels(discoverModels(), args.model);

  if (models.length === 0) {
    throw new Error(`no model implementations found in ${MODELS_DIR}`);
  }

  console.log(`benchmarking ${models.length} fillGrid models from ${MODELS_DIR}`);
  console.log(`templates: ${templates.length} from ${resolve(templatesDir)}`);
  console.log(`lexicon: ${lexicon.length} entries from ${lexiconXlsx}`);
  console.log(`concurrency: ${cliOptions.concurrency}`);
  console.log(`results: ${RUN_RESULTS_DIR}`);
  initializeProgress(models, templates.length);

  const allResults = await runWithConcurrency(
    models,
    cliOptions.concurrency,
    async (modelInfo) => runModelWorker(modelInfo, templates, lexicon, cliOptions),
  );

  computeTimeScores(allResults);
  persistResults(allResults);
  finishProgress();

  for (const summary of allResults) {
    printModelSummary(summary);
  }

  printLeaderboard(allResults);
}

await main();
