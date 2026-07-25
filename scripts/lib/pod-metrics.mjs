// pod-metrics.mjs — the Pod Report's delivery metrics, computed from real git/PR data.
//
// pod-report · Sprint 2, Story 2.1. Pure: every function here takes already-gathered data and
// returns a value. No git, no network, no clock. That is what makes the sprint's headline
// acceptance criterion — "rerun from the same inputs ⇒ byte-identical artifact" — testable at all.
//
// ── The amendment this file implements (Daniel, 2026-07-25) ───────────────────────────────────
// The epic originally promised "human-baseline era vs agent-augmented era of the SAME repo". That
// comparison is not computable: medusa-bonsai is agent-native from its first commit (75% of June's
// commits carry a Claude co-author trailer, 86% of July's, 691 of 846 overall). There is no
// human-majority era to baseline against.
//
// So the baseline is PUBLISHED BENCHMARKS — our numbers computed, theirs cited — and anything the
// data cannot support renders as **not instrumented**, never as a zero. That distinction is the
// whole ethic of this epic: a fabricated 0% change-failure-rate would be the most flattering
// number on the page and the least true.
//
// NOT INSTRUMENTED, and why — each one is also a guardrail a pods engagement installs:
//   · velocity (points/sprint)     — story points do not exist anywhere in the dataset
//   · cost per shipped point       — no points, and no token/cost ledger
//   · change failure rate          — 0 true `git revert` commits in 846; no rollback mechanism
//   · failed-deployment recovery   — no incident record to measure against
//   · story-level throughput       — no per-story ship event (mb's own rail hardcodes it empty)

/** The metrics we deliberately do not compute, with the reason shown to the reader. */
export const NOT_INSTRUMENTED = [
  {
    key: 'velocity',
    label: 'Velocity (points per sprint)',
    reason: 'Story points are not tracked in this dataset — there is nothing to sum.',
    guardrail: 'Adopt a sizing convention, or accept throughput as the honest substitute.',
  },
  {
    key: 'cost_per_point',
    label: 'Cost per shipped point',
    reason: 'Needs both story points and a token/spend ledger. Neither exists.',
    guardrail: 'Instrument agent spend per epic; pair it with a sizing convention.',
  },
  {
    key: 'change_failure_rate',
    label: 'Change failure rate',
    reason:
      'Zero true revert commits across the whole history. Fixes are folded forward, so there is no ' +
      'rollback signal to count — a computed rate here would read 0% and mean "not measured", not "no failures".',
    guardrail: 'Record deploy outcomes and link incidents to the change that caused them.',
  },
  {
    key: 'recovery_time',
    label: 'Failed-deployment recovery time',
    reason: 'Requires paired incident start/resolve timestamps. No incident record exists.',
    guardrail: 'An incident log with timestamps, linked to deploys.',
  },
  {
    key: 'story_throughput',
    label: 'Throughput (stories per period)',
    reason:
      'No per-story ship event carries a timestamp. Epic-level throughput below is computed; ' +
      'story-level is not derivable without inventing a date.',
    guardrail: 'Emit a ship event per story, or track story status transitions with dates.',
  },
];

/** Percentile over an unsorted numeric array. Nearest-rank — no interpolation, so it is exact. */
export function percentile(values, p) {
  const sorted = [...values].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1];
}

export function median(values) {
  return percentile(values, 50);
}

/**
 * PR cycle time — created → merged, in hours.
 *
 * The most trustworthy metric available here: both timestamps are real, machine-written, and
 * unambiguous. Unmerged PRs are excluded rather than counted as open-forever, which would make the
 * number a measure of the backlog rather than of throughput.
 */
export function cycleTimeHours(prs) {
  const durations = (prs ?? [])
    .filter((pr) => pr.createdAt && pr.mergedAt)
    .map((pr) => (Date.parse(pr.mergedAt) - Date.parse(pr.createdAt)) / 3_600_000)
    .filter((h) => Number.isFinite(h) && h >= 0);

  if (durations.length === 0) return { count: 0, medianHours: null, p90Hours: null };
  return {
    count: durations.length,
    medianHours: round(median(durations), 2),
    p90Hours: round(percentile(durations, 90), 2),
  };
}

/**
 * Epic lead time — first commit touching the epic's docs → the commit that flipped it to shipped.
 *
 * Days, not hours: an epic spans days and reporting it to two decimal places would imply a
 * precision the underlying "when did this really start" question does not have.
 */
export function epicLeadTimeDays(epics) {
  const spans = (epics ?? [])
    .filter((e) => e.startedAt && e.shippedAt)
    .map((e) => (Date.parse(e.shippedAt) - Date.parse(e.startedAt)) / 86_400_000)
    .filter((d) => Number.isFinite(d) && d >= 0);

  if (spans.length === 0) return { count: 0, medianDays: null, p90Days: null };
  return {
    count: spans.length,
    medianDays: round(median(spans), 1),
    p90Days: round(percentile(spans, 90), 1),
  };
}

/**
 * Deploy frequency — a LABELLED PROXY, and the label is not optional.
 *
 * There is no deploy log in the dataset, so this counts merged PRs per week and says so. medusa-
 * bonsai's own pmo-report calls its equivalent field `changeFailProxy` in its source; we inherit
 * the caveat rather than quietly dropping it. A reader who sees "deploys per week" without the
 * proxy note has been misled, which is why `isProxy` is a required part of the shape rather than a
 * comment.
 */
export function deployFrequency(prs, windowDays) {
  const merged = (prs ?? []).filter((pr) => pr.mergedAt).length;
  const weeks = windowDays > 0 ? windowDays / 7 : 0;
  return {
    isProxy: true,
    proxyNote:
      'Merged pull requests per week. No deploy log exists in this dataset, so this is a proxy for deploy frequency, not a measurement of it.',
    mergedPrs: merged,
    perWeek: weeks > 0 ? round(merged / weeks, 1) : null,
  };
}

/** Epic throughput — the one throughput figure that IS derivable (status flips carry commit dates). */
export function epicThroughput(epics, windowDays) {
  const shipped = (epics ?? []).filter((e) => e.shippedAt).length;
  const weeks = windowDays > 0 ? windowDays / 7 : 0;
  return { shipped, perWeek: weeks > 0 ? round(shipped / weeks, 2) : null };
}

/**
 * Agent-authorship share, by month.
 *
 * Reported as a COMPOSITION fact, never as a productivity claim. It says who co-authored the
 * commits, which is exactly what the trailer records — it does not say the agents wrote most of the
 * value, and the report must not imply that. This is also the evidence that killed the original
 * human-vs-agent framing, so it earns its place on the page by explaining why that comparison is
 * absent.
 */
export function authorshipByMonth(commits) {
  const months = new Map();
  for (const c of commits ?? []) {
    const month = (c.date ?? '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    if (!months.has(month)) months.set(month, { month, total: 0, agentCoAuthored: 0 });
    const row = months.get(month);
    row.total++;
    if (c.agentCoAuthored) row.agentCoAuthored++;
  }
  return [...months.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((r) => ({ ...r, agentShare: r.total > 0 ? round(r.agentCoAuthored / r.total, 3) : null }));
}

/**
 * Assemble the full delivery section.
 *
 * DETERMINISM: this function must be a pure map from `input` to output. It takes no clock — the
 * caller supplies `generatedAt` — because a `new Date()` in here would make every run differ and
 * quietly break the sprint's byte-identical acceptance criterion.
 */
export function computeDelivery(input) {
  const { prs = [], epics = [], commits = [], windowDays = 0, generatedAt } = input;
  return {
    windowDays,
    generatedAt,
    cycleTime: cycleTimeHours(prs),
    epicLeadTime: epicLeadTimeDays(epics),
    deployFrequency: deployFrequency(prs, windowDays),
    epicThroughput: epicThroughput(epics, windowDays),
    authorship: authorshipByMonth(commits),
    notInstrumented: NOT_INSTRUMENTED,
  };
}

/**
 * Round half-up to `places`.
 *
 * `Math.round` alone is not enough: it is subject to binary floating-point representation, so
 * `Math.round(1.005 * 100) / 100` yields 1 rather than 1.01 and two runs over the same data could
 * differ in the last digit. Rounding through a fixed-precision string removes that class of drift,
 * which matters because determinism is an acceptance criterion here, not a nicety.
 */
export function round(n, places) {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  return Number(Number(n).toFixed(places));
}
