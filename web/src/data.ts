import type { LoadedResult, ResultRecord, ResultFile, TaskFile } from "./types";

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
