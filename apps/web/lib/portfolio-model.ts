// portfolio-view · Sprint 1, Stories 1.1, 1.2, 1.4 (Roadmap/02-commercial/portfolio-view — the Architecture lock).
//
// The portfolio's read model: one row per product, every figure an honest cell. ZERO imports, on purpose (D8): every
// rule that decides what a cell SAYS lives here and is asserted directly by `portfolio-model.test.ts`, with readers
// injected — no database, no session, no framework (CODE-QUALITY #5). `lib/portfolio.ts` binds the real readers and
// the one legal multi-project read; nothing else does.
//
// ── Unknown is not zero (D2) ─────────────────────────────────────────────────────────────────────────────────────────
// A cell is a value, a null WITH the sentence naming which nothing it is, or "couldn't load". A product owner compares
// these rows to choose where the next wave goes, and a fabricated 0 beside a real one is a comparison that lies
// (CODE-QUALITY #8). So no shaping rule below ever turns a missing or failed read into a number.
//
// ── One slow read costs one cell (D7) ────────────────────────────────────────────────────────────────────────────────
// Every read of every row starts at once; each is raced against its own timeout and degrades to `{ error: true }`
// alone. The North Star and funnel cells share ONE read (the outcome Today renders), so they fail together.

/** One figure on a row (D2). `as_of` is present exactly when the figure came from a pushed artifact (D4). */
export type Cell<T> = { value: T; as_of?: string } | { value: null; reason: string } | { error: true }

export type FunnelStage = 'targeted' | 'adopted' | 'retained'

export type NorthStarValue = { metric: string; inputs: number | null }
export type SpendValue = { usd: number; deltaPct: number | null; epics: number }

/** A project as `getWorkspaceProjects()` returns it — the only list a portfolio is ever built from (D1). */
export type PortfolioProject = { id: string; slug: string; role: string }

export type PortfolioRow = {
  project: PortfolioProject
  /** The stored stage, raw-validated; `lib/loop-stage.ts` owns the vocabulary. */
  loop_stage: Cell<string>
  north_star: Cell<NorthStarValue>
  funnel_stage: Cell<FunnelStage>
  experiments_running: Cell<number>
  kill_switches_off: Cell<number>
  epic_lead_time_days: Cell<number>
  spend_vs_quote: Cell<SpendValue>
}

// ── The facts each reader hands back — structural, so the real modules' results satisfy them as they are ─────────────

/** `getProjectOutcome` (lib/pod-report-query.ts), the subset this reads. */
export type OutcomeFacts = {
  unavailable: boolean
  rows: ReadonlyArray<{ tars: { targeted: number; adopted: number; retained: number } | null }>
  northStar: { metric: string | null; unavailable?: boolean; inputCount: number | null } | null
}
/** `listExperimentRegistries` (lib/experiments.ts), the subset this reads. */
export type ExperimentFacts = { versions: ReadonlyArray<{ status: string }> }
/** `projectFlagRows(…, 'production')` (lib/flag-list-view.ts), the subset this reads. */
export type FlagFacts = { polarity: string; state: string }
/** `getLatestArtifact` (lib/report-artifacts.ts), the subset this reads. */
export type ArtifactFacts = { payload: unknown; generatedAt: string }
/** finops' `EpicFinops` (lib/roadmap-finops.ts), the subset this reads. */
export type EpicSpendFacts = { quoteHigh: number | null; actualUsd: number | null }

export type PortfolioReaders = {
  loopStage(projectId: string): Promise<string | null>
  outcome(project: PortfolioProject): Promise<OutcomeFacts>
  experiments(projectId: string): Promise<readonly ExperimentFacts[]>
  flags(projectId: string): Promise<readonly FlagFacts[]>
  podReport(projectId: string): Promise<ArtifactFacts | null>
  roadmap(projectId: string): Promise<ArtifactFacts | null>
  /** finops 3.2's accessor, injected so this file keeps zero imports. */
  epicSpend(payload: unknown): readonly EpicSpendFacts[]
}

/** D7, measured at the lock: the largest live workspace holds 3 projects, so no batching — only this per-cell bound. */
export const CELL_TIMEOUT_MS = 5000

export const REASONS = {
  notPlaced: 'Not placed',
  noNorthStar: 'no North Star set',
  noFeatures: 'no features registered',
  nobodyTargeted: 'nobody targeted yet',
  noExperiments: 'no experiments defined',
  noKillSwitches: 'no kill switches registered',
  noReport: 'no report pushed',
  noLeadTime: 'no epic lead time measured yet',
  noQuotes: 'no quotes yet',
} as const

const ERROR = { error: true } as const
const absent = (reason: string) => ({ value: null, reason }) as const

/**
 * Settle `promise` within `ms`, or report it unsettled. Never rejects: a failure and a timeout are both `ok: false`,
 * which every caller renders as "couldn't load" for its own cell only. The timer is cleared either way, so a fast
 * read leaves nothing keeping the process alive.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number
): Promise<{ ok: true; value: T } | { ok: false }> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<{ ok: false }>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false }), ms)
  })
  try {
    return await Promise.race([
      promise.then(
        (value) => ({ ok: true as const, value }),
        () => ({ ok: false as const })
      ),
      timeout,
    ])
  } finally {
    clearTimeout(timer)
  }
}

// ── The shaping rules, one per cell ─────────────────────────────────────────────────────────────────────────────────

export function loopStageCell(stored: string | null): Cell<string> {
  return stored === null ? absent(REASONS.notPlaced) : { value: stored }
}

/**
 * C1: the metric has no stored level (only its leading inputs do), so the cell names the metric and how many inputs
 * feed it — never a number for the metric itself, and no week-over-week.
 */
export function northStarCell(outcome: OutcomeFacts): Cell<NorthStarValue> {
  // ⚠️ First, and not optional: when the outcome read failed, `getProjectOutcome` hands back `northStar: null` because
  // it never READ the metric — the same null that means "none registered". Checking `northStar` first rendered an
  // outage as "no North Star set" beside a funnel cell that correctly said "couldn't load" (cross-review, PR #234).
  if (outcome.unavailable) return ERROR
  const ns = outcome.northStar
  if (ns === null) return absent(REASONS.noNorthStar)
  if (ns.unavailable || ns.metric === null) return ERROR
  return { value: { metric: ns.metric, inputs: ns.inputCount } }
}

/**
 * C6: the furthest TARS stage ANY registered feature has reached. A feature whose funnel could not be read is skipped;
 * if every one of them failed, the cell could not be read — it is not "nobody targeted".
 */
export function funnelStageCell(outcome: OutcomeFacts): Cell<FunnelStage> {
  if (outcome.unavailable) return ERROR
  if (outcome.rows.length === 0) return absent(REASONS.noFeatures)
  const read = outcome.rows.flatMap((row) => (row.tars ? [row.tars] : []))
  if (read.length === 0) return ERROR
  if (read.some((t) => t.retained > 0)) return { value: 'retained' }
  if (read.some((t) => t.adopted > 0)) return { value: 'adopted' }
  if (read.some((t) => t.targeted > 0)) return { value: 'targeted' }
  return absent(REASONS.nobodyTargeted)
}

/** Experiments with a running version. No experiments defined is not "0 running" — it is nothing to run. */
export function experimentsRunningCell(registries: readonly ExperimentFacts[]): Cell<number> {
  if (registries.length === 0) return absent(REASONS.noExperiments)
  return { value: registries.filter((r) => r.versions.some((v) => v.status === 'running')).length }
}

/** C5: kill-switch-polarity flags deliberately switched OFF in production. With none registered there is no count. */
export function killSwitchesOffCell(flags: readonly FlagFacts[]): Cell<number> {
  const killSwitches = flags.filter((f) => f.polarity === 'killswitch')
  if (killSwitches.length === 0) return absent(REASONS.noKillSwitches)
  return { value: killSwitches.filter((f) => f.state === 'off').length }
}

/** The pod report's median epic lead time (`delivery.epicLeadTime.medianDays`), as of its push (D4). */
export function leadTimeCell(artifact: ArtifactFacts | null): Cell<number> {
  if (artifact === null) return absent(REASONS.noReport)
  const delivery = (artifact.payload as { delivery?: { epicLeadTime?: { medianDays?: unknown } } } | null)
    ?.delivery
  const days = delivery?.epicLeadTime?.medianDays
  if (typeof days !== 'number' || !Number.isFinite(days) || days < 0) return absent(REASONS.noLeadTime)
  return { value: days, as_of: artifact.generatedAt }
}

/**
 * C7: over this product's epics carrying BOTH a quote and an actual — the sum of actuals, and how far it sits from the
 * sum of quote tops (finops' own "over" rule). With none quoted, or no roadmap pushed, "no quotes yet": this cell
 * never waits on finops and never invents a figure.
 */
export function spendCell(
  artifact: ArtifactFacts | null,
  epicSpend: PortfolioReaders['epicSpend']
): Cell<SpendValue> {
  if (artifact === null) return absent(REASONS.noQuotes)
  const quoted = epicSpend(artifact.payload).filter(
    (e): e is { quoteHigh: number; actualUsd: number } => e.quoteHigh !== null && e.actualUsd !== null
  )
  if (quoted.length === 0) return absent(REASONS.noQuotes)
  const usd = quoted.reduce((sum, e) => sum + e.actualUsd, 0)
  const quoteTop = quoted.reduce((sum, e) => sum + e.quoteHigh, 0)
  const deltaPct = quoteTop > 0 ? Math.round(((usd - quoteTop) / quoteTop) * 100) : null
  return { value: { usd, deltaPct, epics: quoted.length }, as_of: artifact.generatedAt }
}

/** `≈$410 · +18% (5 quoted epics)` — the cell's one line. */
export function spendLabel(spend: SpendValue): string {
  const usd = spend.usd >= 100 ? Math.round(spend.usd).toString() : spend.usd.toFixed(2)
  const delta =
    spend.deltaPct === null
      ? ''
      : ` · ${spend.deltaPct > 0 ? '+' : spend.deltaPct < 0 ? '−' : '±'}${Math.abs(spend.deltaPct)}%`
  return `≈$${usd}${delta} (${spend.epics} quoted epic${spend.epics === 1 ? '' : 's'})`
}

// ── The assembler ────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * One row per project in `projects`, in its order, and nothing else (D1, D6: no totals, no ranking). `projects` is
 * whatever `getWorkspaceProjects()` returned — this function never looks a project up on its own.
 */
export async function assemblePortfolio(
  projects: readonly PortfolioProject[],
  readers: PortfolioReaders,
  timeoutMs: number = CELL_TIMEOUT_MS
): Promise<PortfolioRow[]> {
  return Promise.all(
    projects.map(async (project): Promise<PortfolioRow> => {
      // A reader may throw synchronously; `run` turns that into a rejected promise so it costs one cell, not the page.
      const run = <T>(read: () => Promise<T>) => withTimeout(Promise.resolve().then(read), timeoutMs)
      const [loopStage, outcome, experiments, flags, pod, roadmap] = await Promise.all([
        run(() => readers.loopStage(project.id)),
        run(() => readers.outcome(project)),
        run(() => readers.experiments(project.id)),
        run(() => readers.flags(project.id)),
        run(() => readers.podReport(project.id)),
        run(() => readers.roadmap(project.id)),
      ])
      const shaped = <T, C>(
        read: { ok: true; value: T } | { ok: false },
        shape: (value: T) => Cell<C>
      ): Cell<C> => {
        if (!read.ok) return ERROR
        try {
          return shape(read.value)
        } catch {
          return ERROR
        }
      }
      return {
        project,
        loop_stage: shaped(loopStage, loopStageCell),
        north_star: shaped(outcome, northStarCell),
        funnel_stage: shaped(outcome, funnelStageCell),
        experiments_running: shaped(experiments, experimentsRunningCell),
        kill_switches_off: shaped(flags, killSwitchesOffCell),
        epic_lead_time_days: shaped(pod, leadTimeCell),
        spend_vs_quote: shaped(roadmap, (artifact) => spendCell(artifact, readers.epicSpend)),
      }
    })
  )
}
