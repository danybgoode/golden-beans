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

export type ExperimentVersionInput = {
  version: number
  status: ExperimentStatus
  startedAt: string | null
  hypothesis: string
  primaryMetricEvent: string
}

export type ExperimentListInput = {
  key: string
  /**
   * EVERY version, in any order. The module picks which one the row describes — see
   * `describingVersion`, and the reason that is not simply "the newest".
   */
  versions: readonly ExperimentVersionInput[]
}

/**
 * Which version a row describes, and which draft is waiting above it.
 *
 * ⚠️ **NOT simply the newest, and finding that out cost a rendered page.** The first fix for the
 * ordering bug took the highest version number — and on a fixture with v1 `running` and v2 `draft`
 * the row then read **Draft · v2** and the answer line said *"Nothing is waiting on a decision"*,
 * hiding a live experiment behind an unstarted plan. Correct arithmetic, wrong question.
 *
 * The question this list answers is *"which experiments need me?"*, so the row describes the newest
 * version that has actually **started** — the one with operational state — and a newer draft above
 * it is flagged separately. That is exactly the model `lib/journey-list-view.ts` already uses
 * ("Active · v4" plus "Draft v5 waiting"), which is what the approved design means by *"same row,
 * same state pill, same version words"*.
 *
 * A draft BELOW the described version is not waiting for anything, for the same reason it is not in
 * journeys: it has been superseded. Production `miyagisanchez` has exactly that shape —
 * `fundadoras_promise_cta` is v1 `stopped`, v2 `draft`, v3 `decided`.
 */
export function describingVersion(versions: readonly ExperimentVersionInput[]): {
  describes: ExperimentVersionInput | null
  waitingDraftVersion: number | null
} {
  const started = versions.filter((version) => version.status !== 'draft')
  const describes = newestVersion(started.length > 0 ? started : versions)
  const waitingDraft = newestVersion(
    versions.filter(
      (version) => version.status === 'draft' && (describes === null || version.version > describes.version)
    )
  )
  return { describes, waitingDraftVersion: waitingDraft?.version ?? null }
}

/**
 * The version a list row describes: the HIGHEST-numbered one.
 *
 * ⚠️ **This exists because `.at(-1)` was wrong, and the comment beside it asserted the opposite of
 * what the code does.** `mapExperimentRegistryRows` sorts versions **descending**
 * (`b.version - a.version`), so `versions.at(-1)` is the OLDEST — and on production `miyagisanchez`
 * right now, `fundadoras_promise_cta` has v1 `stopped`, v2 `draft`, v3 `decided`. The list would
 * have shown **Stopped · v1** for an experiment whose current plan is v3 and decided. A live defect,
 * on live data, found by verifying a claim I had written in a comment (CODE-QUALITY #3).
 *
 * Computing the maximum makes the ordering irrelevant: whatever a mapper decides to do with `sort`
 * later cannot reach this. That is the difference between fixing the instance and making the class
 * unrepresentable (CODE-QUALITY #2).
 */
export function newestVersion<T extends { version: number }>(versions: readonly T[]): T | null {
  if (versions.length === 0) return null
  return versions.reduce((newest, candidate) => (candidate.version > newest.version ? candidate : newest))
}

export type ExperimentListRow = {
  key: string
  hypothesis: string
  primaryMetricEvent: string
  version: number | null
  state: ExperimentRowState
  /** A newer draft than the version this row describes, or `null`. Same shape as a journey row. */
  waitingDraftVersion: number | null
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
    .filter((input) => {
      const { describes } = describingVersion(input.versions)
      return describes !== null && needsReadinessAnalysis(describes.status)
    })
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
    const { describes, waitingDraftVersion } = describingVersion(input.versions)
    if (describes === null) {
      return {
        key: input.key,
        hypothesis: '',
        primaryMetricEvent: '',
        version: null,
        state: 'draft' as const,
        waitingDraftVersion: null,
        dayCount: null,
        needsAnalysis: false,
      }
    }
    const { status, startedAt, hypothesis, primaryMetricEvent, version } = describes
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
      waitingDraftVersion,
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
  // A draft above the running plan is the other thing worth knowing from this list — same clause the
  // journeys answer carries, and for the same reason: a draft changes nothing until it is started.
  const waiting = rows.filter((row) => row.waitingDraftVersion !== null).length
  if (waiting > 0) {
    parts.push(
      `${waiting} ${waiting === 1 ? 'has a newer draft' : 'have newer drafts'} waiting — a draft changes nothing until you start it.`
    )
  }
  return parts.join(' ')
}
