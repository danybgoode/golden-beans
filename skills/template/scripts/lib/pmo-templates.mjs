import { brotliCompressSync, constants as zlibConstants } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { kitRoot } from './project-root.mjs';


const TEMPLATE_DIR = join(kitRoot(), 'pmo', 'templates'); // D2: a kit asset

const TEMPLATE_FILES = {
  weekly: 'weekly-story-deck.md',
  monthly: 'monthly-stakeholder-packet.md',
  sheet: 'metrics-sheet.md',
};

function getPath(obj, path) {
  return path.split('.').reduce((cur, part) => (cur == null ? undefined : cur[part]), obj);
}

function formatNumber(value, fallback = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return value;
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function windowDays(metrics) {
  const since = new Date(metrics.window.sinceISO).getTime();
  const until = new Date(metrics.window.untilISO).getTime();
  if (!Number.isFinite(since) || !Number.isFinite(until) || until <= since) return 7;
  return (until - since) / (24 * 60 * 60 * 1000);
}

function benchmarkSourceLine(benchmarks) {
  const firstSource = benchmarks.sources?.[0];
  if (!firstSource) return 'Benchmarks no cargados.';
  return `${firstSource.publisher} (${firstSource.publishedDate}; accessed ${firstSource.accessedDate})`;
}

export function buildTemplateData(metrics, { benchmarks = {}, generatedAt = new Date() } = {}) {
  const generatedDate = generatedAt.toISOString().slice(0, 10);
  const days = windowDays(metrics);
  const deploysPerWeek = round((formatNumber(metrics.deployFrequency.total) / days) * 7);
  const changeFailureRatePercent = metrics.deployFrequency.total
    ? round((formatNumber(metrics.changeFailProxy.count) / metrics.deployFrequency.total) * 100)
    : 0;
  return {
    window: {
      sinceISO: metrics.window.sinceISO,
      untilISO: metrics.window.untilISO,
      label: `${metrics.window.sinceISO.slice(0, 10)} to ${metrics.window.untilISO.slice(0, 10)}`,
      generatedDate,
    },
    throughput: {
      shippedStories: formatNumber(metrics.throughput.shippedStories),
      shippedEpics: formatNumber(metrics.throughput.shippedEpics),
      closedEpics: formatNumber(metrics.throughput.closedEpics),
    },
    cycle: {
      medianHours: formatNumber(metrics.prCycleTime.medianHours),
      averageHours: formatNumber(metrics.prCycleTime.averageHours),
      p90Hours: formatNumber(metrics.prCycleTime.p90Hours),
    },
    epics: {
      medianDays: formatNumber(metrics.epicLeadTime.medianDays),
      averageDays: formatNumber(metrics.epicLeadTime.averageDays),
    },
    deploys: {
      total: formatNumber(metrics.deployFrequency.total),
      perWeek: deploysPerWeek,
    },
    quality: {
      changeFailProxy: formatNumber(metrics.changeFailProxy.count),
      changeFailureRatePercent,
    },
    docOps: {
      learningsPromotions: formatNumber(metrics.docOps.learningsPromotions),
      retroCovered: formatNumber(metrics.docOps.retroCoverage.covered),
      retroTotal: formatNumber(metrics.docOps.retroCoverage.total),
      retroPercent: formatNumber(metrics.docOps.retroCoverage.percent),
    },
    benchmarks: {
      deploysPerWeek: formatNumber(benchmarks.deploysPerWeek),
      prCycleMedianHours: formatNumber(benchmarks.prCycleMedianHours),
      epicLeadMedianDays: formatNumber(benchmarks.epicLeadMedianDays),
      changeFailureRatePercent: formatNumber(benchmarks.changeFailureRatePercent),
      restoreTimeHours: formatNumber(benchmarks.restoreTimeHours),
      framing: benchmarks.framing || 'Diferencial operativo, no experimento controlado.',
      sourceLine: benchmarkSourceLine(benchmarks),
    },
  };
}

export function fillTemplate(template, metrics, options = {}) {
  const data = buildTemplateData(metrics, options);
  return template.replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (match, key) => {
    const value = getPath(data, key);
    return value === undefined ? match : String(value);
  });
}

export function loadPmoTemplate(name) {
  const file = TEMPLATE_FILES[name];
  if (!file) throw new Error(`Unknown PMO template "${name}"`);
  return readFileSync(join(TEMPLATE_DIR, file), 'utf8');
}

export function fillPmoTemplate(name, metrics, options = {}) {
  return fillTemplate(loadPmoTemplate(name), metrics, options);
}

function toBase64Url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

// A URL-hash markdown viewer: the whole document rides in the fragment (brotli + base64url), so the
// viewer never stores anything and the link IS the artifact. `baseUrl` is the project's own viewer
// deployment (reporting.config.json → artifacts.docViewerUrl) and is REQUIRED — there is no default,
// because a default points every project's reports at one project's hosting.
export function buildDocViewerUrl(markdown, { baseUrl, present = false } = {}) {
  if (!baseUrl)
    throw new Error('buildDocViewerUrl: no baseUrl — set artifacts.docViewerUrl in reporting.config.json');
  const compressed = brotliCompressSync(Buffer.from(markdown, 'utf8'), {
    params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
  });
  const params = new URLSearchParams({ md: toBase64Url(compressed) });
  if (present) params.set('present', '0');
  return `${baseUrl}/#${params.toString()}`;
}
