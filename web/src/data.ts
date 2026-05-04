import type { LoadedResult, ResultRecord, ResultFile, TaskFile } from "./types";

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function groupResults(records: ResultRecord[]) {
  return records.reduce<
    Array<{
      timestamp: string;
      models: Array<{
        model: string;
        tasks: ResultRecord[];
      }>;
    }>
  >((groups, record) => {
    let timeGroup = groups.find((item) => item.timestamp === record.timestamp);
    if (!timeGroup) {
      timeGroup = { timestamp: record.timestamp, models: [] };
      groups.push(timeGroup);
    }

    let modelGroup = timeGroup.models.find((item) => item.model === record.model);
    if (!modelGroup) {
      modelGroup = { model: record.model, tasks: [] };
      timeGroup.models.push(modelGroup);
    }

    modelGroup.tasks.push(record);
    return groups;
  }, []);
}

export function buildRunSummary(records: ResultRecord[], timestamp: string) {
  const runRecords = records.filter((record) => record.timestamp === timestamp);
  const grouped = groupResults(runRecords);
  const models = grouped[0]?.models ?? [];

  return models
    .map((modelGroup) => {
      const summaries = modelGroup.tasks.map((task) => task.summary).filter(Boolean);
      return {
        model: modelGroup.model,
        taskCount: modelGroup.tasks.length,
        avgFinalScore: average(summaries.map((summary) => summary?.finalScore ?? 0)),
        avgOverallScore: average(summaries.map((summary) => summary?.overallScore ?? 0)),
        avgValidPuzzleRate: average(summaries.map((summary) => summary?.validPuzzleRate ?? 0)),
        avgPreferenceFit: average(summaries.map((summary) => summary?.preferenceFit ?? 0)),
        avgCrossPuzzleVariety: average(summaries.map((summary) => summary?.crossPuzzleVariety ?? 0)),
        avgElapsedMs: average(summaries.map((summary) => summary?.elapsedMs ?? 0)),
        avgTimeScore: average(summaries.map((summary) => summary?.timeScore ?? 0)),
        tasks: [...modelGroup.tasks].sort((left, right) => left.taskName.localeCompare(right.taskName)),
      };
    })
    .sort((left, right) => right.avgFinalScore - left.avgFinalScore);
}

export async function loadManifest() {
  const response = await fetch("/api/results/index");
  if (!response.ok) {
    throw new Error("Failed to load results index");
  }

  const records = (await response.json()) as ResultRecord[];
  return records.sort((a, b) => {
    if (a.timestamp !== b.timestamp) {
      return b.timestamp.localeCompare(a.timestamp);
    }
    if (a.model !== b.model) {
      return a.model.localeCompare(b.model);
    }
    return a.taskName.localeCompare(b.taskName);
  });
}

export async function loadResult(record: ResultRecord): Promise<LoadedResult> {
  const [taskResponse, resultResponse] = await Promise.all([
    fetch(record.taskUrl),
    fetch(record.resultUrl),
  ]);

  if (!taskResponse.ok) {
    throw new Error(`Failed to load task: ${record.taskUrl}`);
  }
  if (!resultResponse.ok) {
    throw new Error(`Failed to load result: ${record.resultUrl}`);
  }

  const [task, result] = (await Promise.all([
    taskResponse.json(),
    resultResponse.json(),
  ])) as [TaskFile, ResultFile];

  return { task, result };
}
