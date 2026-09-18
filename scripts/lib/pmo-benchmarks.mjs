import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
export const BENCHMARKS_PATH = join(ROOT, 'scripts', 'pmo', 'benchmarks.json');

const REQUIRED_SOURCE_FIELDS = ['title', 'publisher', 'url', 'publishedDate', 'accessedDate'];

export function validateBenchmarkDataset(dataset) {
  const errors = [];
  if (dataset?.schema !== 'pmo-benchmarks-v1') errors.push('schema must be pmo-benchmarks-v1');
  if (!dataset?.generatedAt) errors.push('generatedAt is required');
  if (!dataset?.framing || !/not a controlled experiment/i.test(dataset.framing)) {
    errors.push('framing must include the honest "not a controlled experiment" caveat');
  }
  if (!dataset?.figures || typeof dataset.figures !== 'object') {
    errors.push('figures object is required');
    return errors;
  }

  for (const [key, figure] of Object.entries(dataset.figures)) {
    if (typeof figure.value !== 'number' || !Number.isFinite(figure.value)) {
      errors.push(`${key}: numeric value is required`);
    }
    if (!figure.unit) errors.push(`${key}: unit is required`);
    if (!['higher_is_better', 'lower_is_better'].includes(figure.direction)) {
      errors.push(`${key}: direction must be higher_is_better or lower_is_better`);
    }
    for (const field of REQUIRED_SOURCE_FIELDS) {
      if (!figure.source?.[field]) errors.push(`${key}: source.${field} is required`);
    }
    if (figure.source?.url && !/^https:\/\//.test(figure.source.url)) {
      errors.push(`${key}: source.url must be https`);
    }
  }
  return errors;
}

export function loadBenchmarkDataset(path = BENCHMARKS_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function benchmarkTemplateValues(dataset) {
  const f = dataset.figures;
  return {
    framing: dataset.framing,
    deploysPerWeek: f.deploysPerWeekDailyThreshold.value,
    prCycleMedianHours: f.prCycleMedianHoursOneDayThreshold.value,
    epicLeadMedianDays: f.epicLeadMedianDaysOneWeekThreshold.value,
    changeFailureRatePercent: f.changeFailureRateMaxPercent.value,
    restoreTimeHours: f.restoreTimeHoursOneDayThreshold.value,
    sources: Object.values(f).map((figure) => ({
      label: figure.label,
      title: figure.source.title,
      publisher: figure.source.publisher,
      url: figure.source.url,
      publishedDate: figure.source.publishedDate,
      accessedDate: figure.source.accessedDate,
    })),
  };
}
