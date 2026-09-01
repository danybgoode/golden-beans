// The Experiments list, as rows — pure, and zero-import so it can be tested without a database.
//
// design-system-rails · Sprint 5, Story 5.4 — reference state `ship-experiments`.
//
// ── What the registry can answer, and what it cannot ──────────────────────────────────────────
// The approved list shows three things per row: what the experiment is, what STATE it is in, and
// its primary metric. Two of those come straight out of `listExperimentRegistries` — the key, the
// hypothesis, the lifecycle status, when it started, and the metric the immutable definition
// declares. The third does not: **"Ready to decide" is a property of the ANALYSIS**, and the
// analysis is a full fact scan per experiment.
//
// ⚠️ **So readiness is resolved for RUNNING versions only, and it is capped.** A decided experiment
// shows the decision it already has; a draft has nothing to be ready for; and a project with a
// hundred running experiments does not silently turn its list page into a hundred fact scans. Past
// the cap a row says `unresolved` and the page says so out loud rather than showing a pill it did
// not compute — which would be the one thing worse than not showing one.
//
// The split is the same one `lib/flag-list-view.ts` draws: this module owns the arithmetic and the
// shape, a query module owns the reads, and the page owns neither.

/** The lifecycle states the registry stores, restated locally so this module imports nothing. */
export type ExperimentStatus = 'draft' | 'running' | 'stopped' | 'decided' | 'invalid'

/** What a row shows in its State column. */
export type ExperimentRowState =
  /** Running, the analysis says every gate is clear, and a person can decide it now. */
  | 'ready'
  /** Running, and something is still in the way — the detail page names what. */
  | 'gathering'
  /** A human decision has been recorded against this version. */
  | 'decided'
  /** Running, and this row is past the readiness cap — NOT "not ready". */
  | 'unresolved'
  /** Never started, stopped without a decision, or invalidated. */
  | 'draft'
  | 'stopped'
  | 'invalid'

/**
 * How many running experiments a list will analyse before it stops resolving readiness.
 *
 * Twelve is a judgement, not a measurement, and it is here rather than in a page so it can be
 * changed in one place and asserted. It is generous against every real project (`miyagisanchez` has
 * two experiments, both decided, so this list runs ZERO analyses) and small enough that the worst
 * case is bounded rather than proportional to how much a tenant has created.
 */
export const READINESS_ANALYSIS_CAP = 12

export type ExperimentListInput = {
  key: string
  /** The newest version, which is the one the list describes. `null` when a registry has none. */
  version: {
    version: number
    status: ExperimentStatus
    startedAt: string | null
    hypothesis: string
    primaryMetricEvent: string
  } | null
}

export type ExperimentListRow = {
  key: string
  hypothesis: string
  primaryMetricEvent: string
  version: number | null
  state: ExperimentRowState
  /** Whole days since it started, or `null` when it never did. */
  dayCount: number | null
  /** True when this row's state needs the analysis and the cap stopped it being run. */
  needsAnalysis: boolean
}

/** Whether a status needs the analysis before its row state can be known. */
export function needsReadinessAnalysis(status: ExperimentStatus): boolean {
  return status === 'running'
}

/**
 * Which rows a list should analyse, given the cap.
 *
 * Returned as keys rather than as a boolean per row so the caller can `Promise.all` exactly this
 * set — and so the cap is applied in ONE place instead of being re-derived beside every call.
 */
export function readinessCandidates(
  inputs: readonly ExperimentListInput[],
  cap: number = READINESS_ANALYSIS_CAP
): string[] {
  return inputs
    .filter((input) => input.version !== null && needsReadinessAnalysis(input.version.status))
    .slice(0, Math.max(0, cap))
    .map((input) => input.key)
}

/** Whole days between `startedAt` and `now`, or `null` when it never started or cannot be read. */
export function dayCountSince(startedAt: string | null, now: Date = new Date()): number | null {
  if (startedAt === null) return null
  const started = Date.parse(startedAt)
  if (!Number.isFinite(started)) return null
  const days = Math.floor((now.getTime() - started) / 86_400_000)
  // A negative day count means a start time in the future — a clock problem, not a measurement.
  // `null` is the honest answer; "day -3" is a number that would send somebody looking for a bug in
  // the experiment rather than in the timestamp.
  return days < 0 ? null : days
}

/**
 * Turn registries plus whatever readiness was resolved into rows.
 *
 * `readiness` maps an experiment key to `true` (every gate clear) or `false` (something in the way).
 * A key that is ABSENT from the map is `unresolved`, and that is deliberately different from
 * `false`: "we did not look" and "it is not ready" are two different sentences, and collapsing them
 * would put a "Still gathering" pill on a row nothing measured.
 */
export function projectExperimentRows(
  inputs: readonly ExperimentListInput[],
  readiness: ReadonlyMap<string, boolean>,
  now: Date = new Date()
): ExperimentListRow[] {
  return inputs.map((input) => {
    if (input.version === null) {
      return {
        key: input.key,
        hypothesis: '',
        primaryMetricEvent: '',
        version: null,
        state: 'draft' as const,
        dayCount: null,
        needsAnalysis: false,
      }
    }
    const { status, startedAt, hypothesis, primaryMetricEvent, version } = input.version
    const resolved = readiness.get(input.key)
    // ⚠️ The non-running statuses are mapped EXPLICITLY rather than passed through. `running` is not
    // a row state — it is the state whose row state the analysis decides — and letting the status
    // fall through would have made `'running'` a legal `ExperimentRowState` that the pill has no
    // rendering for. The compiler caught it; a wider union would have shipped a blank pill.
    const state: ExperimentRowState = needsReadinessAnalysis(status)
      ? resolved === undefined
        ? 'unresolved'
        : resolved
          ? 'ready'
          : 'gathering'
      : status === 'decided'
        ? 'decided'
        : status === 'stopped'
          ? 'stopped'
          : status === 'invalid'
            ? 'invalid'
            : 'draft'
    return {
      key: input.key,
      hypothesis,
      primaryMetricEvent,
      version,
      state,
      dayCount: dayCountSince(startedAt, now),
      needsAnalysis: needsReadinessAnalysis(status),
    }
  })
}

/**
 * The list's answer line, computed from the rows it sits above.
 *
 * ⚠️ **It reports what was actually resolved.** The approved copy is *"1 experiment is ready for you
 * to decide"*, and saying that while some rows were never analysed would be a headline the list
 * beneath it does not support. When anything is unresolved the sentence says so.
 */
export function experimentAnswer(rows: readonly ExperimentListRow[]): string {
  if (rows.length === 0) return 'No experiment has been declared for this project yet.'
  const ready = rows.filter((row) => row.state === 'ready').length
  const unresolved = rows.filter((row) => row.state === 'unresolved').length
  const decided = rows.filter((row) => row.state === 'decided').length

  const parts: string[] = []
  if (ready > 0) {
    parts.push(`${ready} experiment${ready === 1 ? ' is' : 's are'} ready for you to decide.`)
  } else if (unresolved === 0) {
    parts.push('Nothing is waiting on a decision.')
  }
  if (unresolved > 0) {
    parts.push(
      `${unresolved} running experiment${unresolved === 1 ? ' was' : 's were'} not checked — this list ` +
        `resolves readiness for the first ${READINESS_ANALYSIS_CAP}. Open one to see where it stands.`
    )
  }
  if (decided > 0) {
    parts.push(`${decided} already ${decided === 1 ? 'has a decision' : 'have decisions'} on record.`)
  }
  return parts.join(' ')
}
