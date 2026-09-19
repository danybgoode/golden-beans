const DEFAULT_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function floorToHour(date) {
  return new Date(Math.floor(date.getTime() / HOUR_MS) * HOUR_MS);
}

export function parsePmoLog(content) {
  if (!content) return [];
  return content
    .trim()
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

export function lastPmoLogEntry(content) {
  const entries = parsePmoLog(content);
  return entries.length ? entries[entries.length - 1] : null;
}

export function computePmoWindow(lastLogEntry, now, { sinceISO = null, untilISO = null } = {}) {
  const roundedNow = floorToHour(now);
  const end = untilISO || roundedNow.toISOString();
  if (sinceISO) return { sinceISO, untilISO: end };
  if (lastLogEntry?.windowEnd) return { sinceISO: lastLogEntry.windowEnd, untilISO: end };
  return {
    sinceISO: new Date(new Date(end).getTime() - DEFAULT_WINDOW_DAYS * DAY_MS).toISOString(),
    untilISO: end,
    baseline: true,
  };
}

export function pmoLogLine({ window, metrics, baselineEstablished }) {
  return (
    JSON.stringify({
      ts: new Date().toISOString(),
      windowStart: window.sinceISO,
      windowEnd: window.untilISO,
      baselineEstablished: !!baselineEstablished,
      summary: {
        shippedStories: metrics.throughput.shippedStories,
        shippedEpics: metrics.throughput.shippedEpics,
        deploys: metrics.deployFrequency.total,
        changeFailProxy: metrics.changeFailProxy.count,
        learningsPromotions: metrics.docOps.learningsPromotions,
      },
    }) + '\n'
  );
}

export function formatPmoReport({ metrics, baselineLine = null }) {
  const { sinceISO, untilISO } = metrics.window;
  const hours = (value) => (value === null || value === undefined ? 'n/a' : `${value}h`);
  const lines = [`PMO operational report · ${sinceISO} → ${untilISO}`];
  if (baselineLine) lines.push(baselineLine);

  const progress = metrics.throughput.currentStoryProgress;
  lines.push(
    `Throughput: ${metrics.throughput.shippedStories} stories shipped · ${metrics.throughput.shippedEpics} epics shipped · ${metrics.throughput.closedEpics} epics closed · Roadmap progress ${progress.done}/${progress.total} stories`
  );
  lines.push(
    `PR cycle time: ${metrics.prCycleTime.count} merged PRs · median ${hours(metrics.prCycleTime.medianHours)} · avg ${hours(metrics.prCycleTime.averageHours)} · p90 ${hours(metrics.prCycleTime.p90Hours)}`
  );

  const repoCounts = Object.entries(metrics.deployFrequency.byRepo)
    .map(([repo, count]) => `${repo.split('/').pop()}: ${count ?? 'unavailable'}`)
    .join(' · ');
  lines.push(
    `Deploy frequency: ${metrics.deployFrequency.total} merges to main${repoCounts ? ` (${repoCounts})` : ''}`
  );
  lines.push(`Change-fail proxy: ${metrics.changeFailProxy.count} revert/hotfix PRs`);

  const docCounts = Object.entries(metrics.docOps.docsTouchedPerEpic);
  const shownDocCounts = docCounts.slice(0, 12);
  const docSummary = docCounts.length
    ? shownDocCounts
        .map(([slug, count]) => `${slug}: ${count}`)
        .concat(
          docCounts.length > shownDocCounts.length
            ? [`and ${docCounts.length - shownDocCounts.length} more`]
            : []
        )
        .join(' · ')
    : 'none';
  const retro = metrics.docOps.retroCoverage;
  lines.push(
    `Doc-ops: Roadmap docs touched per epic: ${docSummary} · LEARNINGS promotions ${metrics.docOps.learningsPromotions} · retro coverage ${retro.covered}/${retro.total}${retro.percent === null ? '' : ` (${retro.percent}%)`}`
  );

  return lines.join('\n');
}
