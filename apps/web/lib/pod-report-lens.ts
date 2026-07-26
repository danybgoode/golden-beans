// pod-report · Sprint 2.5b — the audience lens.
//
// Three audiences read the same artifact and must not read the same page: the team wants every
// row, a client wants their own pod's picture without our internal build minutiae, an investor
// wants the shape of the thing without per-story internals (epic README, Decision 3).
//
// ── Zero imports, on purpose ──────────────────────────────────────────────────────────────────
// This is the policy Sprint 3's share links enforce on data they hand to people outside the
// company, and a policy that can only be tested through HTTP is a policy whose branches never get
// exercised (Roadmap/LEARNINGS.md — multi-tenant-activation S1 shipped four security specs that
// passed identically against a deliberately re-broken build, because the guard sat behind an auth
// precondition the harness could not satisfy). Everything here is a pure function over plain data,
// so a unit test reaches every branch directly and a mutation check has something to break.
//
// ── The invariant this module exists to make structural ───────────────────────────────────────
// A lens narrows DETAIL. A lens may never narrow HONESTY. The not-instrumented rows, the caveats
// and the verdict's not-instrumented count survive every lens, including the investor one — which
// is the lens most tempting to flatter and the one Story 2.4's acceptance criteria name explicitly.
// `applyLens` is written so that dropping them is not a thing a caller can ask for: they are copied
// unconditionally, outside any per-lens branch.

/** Who is reading. Always resolved server-side from a credential — never from a URL segment. */
export type PodReportLens = 'team' | 'client' | 'investor'

export const POD_REPORT_LENSES: readonly PodReportLens[] = ['team', 'client', 'investor'] as const

/**
 * Narrow an unknown string to a lens, or null.
 *
 * Returns null rather than defaulting to `team`, and that direction is the whole point: an
 * unrecognised value must fail closed at the caller, not silently resolve to the widest audience.
 */
export function parseLens(raw: unknown): PodReportLens | null {
  return typeof raw === 'string' && (POD_REPORT_LENSES as readonly string[]).includes(raw)
    ? (raw as PodReportLens)
    : null
}

/** What a lens is allowed to show. Detail only — never a switch over the honesty fields. */
export type LensPolicy = {
  /** Per-month agent-authorship composition rows. Internal build texture; not a client's business. */
  showComposition: boolean
  /** The criterion-by-criterion maturity ladder. The verdict is shown to everyone regardless. */
  showMaturityRows: boolean
  /** Evidence pointers resolve to PR numbers and CI check names — internal objects. */
  showEvidencePointers: boolean
  /** Raw source counts (commit totals, epic totals, the measurement window). */
  showSourceCounts: boolean
  /**
   * The build-order journey — which epics shipped and which is in flight, epic by epic.
   * The epic's Decision 3 gives this to team and client ("their pod's journey"), not to investors,
   * for whom per-epic sequencing is per-story internals by another name.
   */
  showJourney: boolean
  /**
   * The horizon: destinations and how much of each is lit. Decision 3's investor scope
   * ("portfolio horizon + momentum"). Shown to everyone — it is the least granular view there is,
   * and it is the one that reads as progress-against-a-destination rather than as a backlog.
   */
  showHorizon: boolean
  /** A short line naming who this view was prepared for, rendered on the page. */
  audienceNote: string
}

const POLICIES: Record<PodReportLens, LensPolicy> = {
  team: {
    showComposition: true,
    showMaturityRows: true,
    showEvidencePointers: true,
    showSourceCounts: true,
    showJourney: true,
    showHorizon: true,
    audienceNote: 'Team view — every row, every evidence pointer, nothing withheld.',
  },
  client: {
    showComposition: true,
    showMaturityRows: true,
    // An evidence pointer reads "PR #92" against a repository the client cannot open, so it proves
    // nothing to them and leaks our internal numbering. The row's own proxy note still renders, so
    // the claim still arrives qualified — the pointer is dropped, the honesty is not.
    showEvidencePointers: false,
    showSourceCounts: true,
    showJourney: true,
    showHorizon: true,
    audienceNote: 'Client view — your pod, measured. Internal PR references are omitted.',
  },
  investor: {
    showComposition: false,
    // Criterion-by-criterion detail is per-story internals by another name. The VERDICT survives,
    // and so does its not-instrumented count — see `applyLens`.
    showMaturityRows: false,
    showEvidencePointers: false,
    showSourceCounts: true,
    // No epic-by-epic sequencing: which epic is in flight this week is exactly the per-story
    // internals Decision 3 keeps out of this lens. The horizon carries the momentum instead.
    showJourney: false,
    showHorizon: true,
    audienceNote: 'Investor view — portfolio shape and momentum, without per-story internals.',
  },
}

export function lensPolicy(lens: PodReportLens): LensPolicy {
  return POLICIES[lens]
}

/**
 * The fields no lens may ever drop.
 *
 * Exported so a spec can assert the list itself, and so a future lens author reads the constraint
 * before writing the policy rather than after review finds it missing.
 */
export const LENS_INVARIANT_FIELDS = ['notInstrumented', 'caveats', 'verdictNotInstrumentedCount'] as const

/** The shape `applyLens` operates on — structurally what `buildPodReportView` returns. */
export type LensableView = {
  speed: unknown[]
  composition: unknown[]
  notInstrumented: unknown[]
  caveats: string[]
  benchmarks: unknown[]
  source: Record<string, unknown>
  maturity: {
    verdict: { step: number; stepLabel: string; metCriteria: number; totalCriteria: number; notInstrumentedCount: number } | null
    rows: Array<Record<string, unknown>>
    notInstrumented: unknown[]
    ladder: Record<string, unknown> | null
  } | null
}

/**
 * Apply a lens to a built view.
 *
 * Read the ordering below literally: the honesty fields are assigned FIRST and unconditionally,
 * before any policy branch runs, so no later edit can accidentally place one inside an `if`. The
 * per-lens branches may only remove detail from `composition`, `maturity.rows` and the evidence
 * pointers within them.
 */
export function applyLens<T extends LensableView>(view: T, lens: PodReportLens): T {
  const policy = POLICIES[lens]

  // ── Unconditional. Every lens. ──────────────────────────────────────────────────────────────
  const honest = {
    notInstrumented: view.notInstrumented,
    caveats: view.caveats,
    benchmarks: view.benchmarks,
    // Speed is never narrowed either: a report that shows a lens fewer stability-relevant numbers
    // than another lens would let an audience be shown a rosier subset, which is Decision 4's
    // failure mode with extra steps.
    speed: view.speed,
  }

  let maturity = view.maturity
  if (maturity) {
    const rows = policy.showMaturityRows
      ? maturity.rows.map((row) => (policy.showEvidencePointers ? row : stripEvidence(row)))
      : []
    maturity = {
      ...maturity,
      rows,
      // The verdict and its notInstrumentedCount ride through untouched even when rows are hidden.
      // Story 2.4: "the not-instrumented count is visible wherever the verdict is, INCLUDING the
      // investor lens." Hiding the rows is exactly the moment that criterion would be lost, so it
      // is deliberately not expressible here.
      verdict: maturity.verdict,
      notInstrumented: maturity.notInstrumented,
    }
  }

  return {
    ...view,
    ...honest,
    composition: policy.showComposition ? view.composition : [],
    source: policy.showSourceCounts ? view.source : {},
    maturity,
  }
}

/**
 * Remove an evidence pointer while KEEPING the row's own qualification.
 *
 * `evidence` goes; `proxyNote`, `reason`, `status` and `criterion` stay. A row that loses its
 * pointer must not also lose the sentence explaining that it is a proxy — that would upgrade a
 * qualified claim into a bare one purely by changing audience.
 */
function stripEvidence(row: Record<string, unknown>): Record<string, unknown> {
  const { evidence: _evidence, ...rest } = row
  return { ...rest, evidence: null, evidenceWithheld: true }
}
