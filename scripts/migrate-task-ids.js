import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const TASKS_ROOT = resolve("tasks/fill-grid");
const RESULTS_ROOT = resolve("results");

function listJsonFiles(root) {
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

  walk(root);
  return files.sort();
}

function loadJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function saveJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function main() {
  const taskFiles = listJsonFiles(TASKS_ROOT);
  const taskEntries = taskFiles.map((file, index) => {
    const taskKey = relative(TASKS_ROOT, file).replace(/\\/g, "/").replace(/\.json$/u, "");
    return {
      file,
      taskKey,
      taskId: index + 1,
    };
  });

  const byLegacyKey = new Map(taskEntries.map((entry) => [entry.taskKey, entry]));
  const byNumericId = new Map(taskEntries.map((entry) => [entry.taskId, entry]));

  for (const entry of taskEntries) {
    const task = loadJson(entry.file);
    saveJson(entry.file, {
      ...task,
      taskId: entry.taskId,
      taskKey: entry.taskKey,
    });
  }

  const resultFiles = statSync(RESULTS_ROOT, { throwIfNoEntry: false })?.isDirectory()
    ? listJsonFiles(RESULTS_ROOT)
    : [];

  for (const file of resultFiles) {
    const result = loadJson(file);
    const currentTaskId = result.taskId;
    const currentTaskKey =
      typeof result.taskKey === "string" && result.taskKey
        ? result.taskKey
        : typeof currentTaskId === "string"
          ? currentTaskId
          : "";

    const entry =
      (currentTaskKey ? byLegacyKey.get(currentTaskKey) : undefined)
      ?? (typeof currentTaskId === "number" ? byNumericId.get(currentTaskId) : undefined);

    if (!entry) {
      throw new Error(`unable to map result file to task: ${file}`);
    }

    saveJson(file, {
      ...result,
      taskId: entry.taskId,
      taskKey: entry.taskKey,
    });
  }

  console.log(`migrated ${taskEntries.length} tasks and ${resultFiles.length} result files`);
}

main();
