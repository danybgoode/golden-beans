const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function toMs(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function round(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function inWindow(value, sinceISO, untilISO) {
  const t = toMs(value);
  const since = toMs(sinceISO);
  const until = toMs(untilISO);
  if (t === null || since === null || until === null) return false;
  return t >= since && t < until;
}

export function median(values) {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

export function percentile(values, p) {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  if (nums.length === 1) return nums[0];
  const idx = Math.ceil((p / 100) * nums.length) - 1;
  return nums[Math.max(0, Math.min(nums.length - 1, idx))];
}

export function parseStoryProgress(value) {
  const m = /^(\d+)\/(\d+)\s+stories\b/i.exec(String(value ?? '').trim());
  if (!m) return { done: 0, total: 0 };
  return { done: Number(m[1]), total: Number(m[2]) };
}

export function summarizePrCycleTimes(prs, { sinceISO, untilISO } = {}) {
  const merged = prs.filter((pr) => {
    if (!pr.mergedAt || !pr.createdAt) return false;
    return sinceISO && untilISO ? inWindow(pr.mergedAt, sinceISO, untilISO) : true;
  });
  const hours = merged
    .map((pr) => (toMs(pr.mergedAt) - toMs(pr.createdAt)) / HOUR_MS)
    .filter((v) => Number.isFinite(v) && v >= 0);
  const total = hours.reduce((sum, v) => sum + v, 0);
  return {
    count: hours.length,
    averageHours: hours.length ? round(total / hours.length) : null,
    medianHours: round(median(hours)),
    p90Hours: round(percentile(hours, 90)),
  };
}

export function summarizeEpicLeadTime(epics, { sinceISO, untilISO } = {}) {
  const shipped = epics.filter((epic) => {
    if (!epic.scaffoldedAt || !epic.shippedAt) return false;
    return sinceISO && untilISO ? inWindow(epic.shippedAt, sinceISO, untilISO) : true;
  });
  const days = shipped
    .map((epic) => (toMs(epic.shippedAt) - toMs(epic.scaffoldedAt)) / DAY_MS)
    .filter((v) => Number.isFinite(v) && v >= 0);
  const total = days.reduce((sum, v) => sum + v, 0);
  return {
    count: days.length,
    averageDays: days.length ? round(total / days.length) : null,
    medianDays: round(median(days)),
  };
}

export function summarizeDeployFrequency(repoResults, { deployRepos = [] } = {}) {
  const allowed = deployRepos.length ? new Set(deployRepos) : null;
  const byRepo = {};
  let total = 0;
  let unavailable = 0;
  for (const result of repoResults) {
    if (allowed && !allowed.has(result.repo)) continue;
    if (!result.available) {
      byRepo[result.repo] = null;
      unavailable += 1;
      continue;
    }
    const count = result.prs?.length ?? 0;
    byRepo[result.repo] = count;
    total += count;
  }
  return { total, byRepo, unavailable };
}

export function summarizeChangeFailProxy(items, { sinceISO, untilISO } = {}) {
  const matches = [];
  for (const item of items) {
    const date = item.mergedAt || item.date || item.createdAt;
    if (sinceISO && untilISO && !inWindow(date, sinceISO, untilISO)) continue;
    const text = `${item.title ?? ''} ${item.message ?? ''}`.toLowerCase();
    if (/\brevert\b/.test(text) || /\bhotfix\b/.test(text)) {
      matches.push(item);
    }
  }
  return { count: matches.length, items: matches };
}

export function summarizeThroughput({
  roadmapRows = [],
  epicStatusFlips = [],
  storyShipEvents = [],
  sinceISO,
  untilISO,
}) {
  const shippedEpicFlips = epicStatusFlips.filter(
    (flip) => flip.status === 'shipped' && inWindow(flip.date, sinceISO, untilISO)
  );
  const closedEpicFlips = epicStatusFlips.filter(
    (flip) => ['shipped', 'archived'].includes(flip.status) && inWindow(flip.date, sinceISO, untilISO)
  );
  const shippedStories = storyShipEvents.filter((event) =>
    inWindow(event.shippedAt || event.date, sinceISO, untilISO)
  );
  const currentStoryProgress = roadmapRows
    .filter((row) => row.grain === 'Sprint' || row.grain === 'Epic')
    .map((row) => parseStoryProgress(row.sprint_progress))
    .reduce(
      (acc, progress) => ({
        done: acc.done + progress.done,
        total: acc.total + progress.total,
      }),
      { done: 0, total: 0 }
    );

  return {
    shippedStories: shippedStories.length,
    shippedEpics: shippedEpicFlips.length,
    closedEpics: closedEpicFlips.length,
    currentStoryProgress,
  };
}

export function summarizeDocOps({ docChanges = [], learningsPromotions = [], shippedEpics = [] } = {}) {
  const docsTouchedByEpic = {};
  for (const change of docChanges) {
    if (!change.epicSlug) continue;
    if (!docsTouchedByEpic[change.epicSlug]) docsTouchedByEpic[change.epicSlug] = new Set();
    docsTouchedByEpic[change.epicSlug].add(change.path);
  }
  const docsTouchedPerEpic = Object.fromEntries(
    Object.entries(docsTouchedByEpic).map(([slug, paths]) => [slug, paths.size])
  );
  const retroCovered = shippedEpics.filter((epic) => epic.hasRetrospective).length;
  return {
    docsTouchedPerEpic,
    learningsPromotions: learningsPromotions.length,
    retroCoverage: {
      covered: retroCovered,
      total: shippedEpics.length,
      percent: shippedEpics.length ? round((retroCovered / shippedEpics.length) * 100, 0) : null,
    },
  };
}

export function baselineSummary({ repoResults = [], roadmapRows = [], docChanges = [] } = {}) {
  const openPrs = repoResults.reduce((sum, result) => sum + (result.openPrs?.length ?? 0), 0);
  const recentlyMergedPrs = repoResults.reduce((sum, result) => sum + (result.prs?.length ?? 0), 0);
  const roadmapItems = roadmapRows.length;
  return {
    openPrs,
    recentlyMergedPrs,
    roadmapItems,
    docChanges: docChanges.length,
  };
}

export function formatBaselineSummary(summary) {
  return [
    'PMO baseline established',
    `${summary.openPrs} open PRs`,
    `${summary.recentlyMergedPrs} recently merged PRs`,
    `${summary.roadmapItems} Roadmap rows`,
    `${summary.docChanges} doc changes`,
  ].join(' · ');
}

export function summarizePmoMetrics(input) {
  const { sinceISO, untilISO } = input;
  return {
    window: { sinceISO, untilISO },
    throughput: summarizeThroughput(input),
    prCycleTime: summarizePrCycleTimes(input.prs || [], { sinceISO, untilISO }),
    epicLeadTime: summarizeEpicLeadTime(input.epics || [], { sinceISO, untilISO }),
    deployFrequency: summarizeDeployFrequency(input.repoResults || [], input),
    changeFailProxy: summarizeChangeFailProxy(input.changeItems || input.prs || [], { sinceISO, untilISO }),
    docOps: summarizeDocOps(input),
  };
}
