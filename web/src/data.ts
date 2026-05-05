import type { LoadedResult, ResultRecord, ResultFile, TemplateFile } from "./types";

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
        templates: ResultRecord[];
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
      modelGroup = { model: record.model, templates: [] };
      timeGroup.models.push(modelGroup);
    }

    modelGroup.templates.push(record);
    return groups;
  }, []);
}

export function buildRunSummary(records: ResultRecord[], timestamp: string) {
  const runRecords = records.filter((record) => record.timestamp === timestamp);
  const grouped = groupResults(runRecords);
  const models = grouped[0]?.models ?? [];

  return models
    .map((modelGroup) => {
      const summaries = modelGroup.templates.map((template) => template.summary).filter(Boolean);
      return {
        model: modelGroup.model,
        templateCount: modelGroup.templates.length,
        avgFinalScore: average(summaries.map((summary) => summary?.finalScore ?? 0)),
        avgOverallScore: average(summaries.map((summary) => summary?.overallScore ?? 0)),
        avgValidPuzzleRate: average(summaries.map((summary) => summary?.validPuzzleRate ?? 0)),
        avgPreferenceFit: average(summaries.map((summary) => summary?.preferenceFit ?? 0)),
        avgCrossPuzzleVariety: average(summaries.map((summary) => summary?.crossPuzzleVariety ?? 0)),
        avgElapsedMs: average(summaries.map((summary) => summary?.elapsedMs ?? 0)),
        avgTimeScore: average(summaries.map((summary) => summary?.timeScore ?? 0)),
        templates: [...modelGroup.templates].sort((left, right) => left.templateName.localeCompare(right.templateName)),
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
    return a.templateName.localeCompare(b.templateName);
  });
}

export async function loadResult(record: ResultRecord): Promise<LoadedResult> {
  const [templateResponse, resultResponse] = await Promise.all([
    fetch(record.templateUrl),
    fetch(record.resultUrl),
  ]);

  if (!templateResponse.ok) {
    throw new Error(`Failed to load template: ${record.templateUrl}`);
  }
  if (!resultResponse.ok) {
    throw new Error(`Failed to load result: ${record.resultUrl}`);
  }

  const [template, result] = (await Promise.all([
    templateResponse.json(),
    resultResponse.json(),
  ])) as [TemplateFile, ResultFile];

  return { template, result };
}
