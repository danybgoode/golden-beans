// The Scenarios & drills list, as rows — pure, and zero-import so it can be tested without a database.
//
// design-system-rails · Sprint 5, Story 5.6 — reference state `measure-scenarios`.
//
// ── Audit §6.4 is the finding this closes ─────────────────────────────────────────────────────
// *"Today this is a read-only log where the PRD describes a tool."* §7 P1 says prioritise it over
// polish elsewhere. The difference the approved state draws is one primary action and a row that
// answers a question — what held, what failed, and what has never been run — rather than a
// chronological dump of every run.
//
// ── ⚠️ An untested control is an ASSUMPTION, and that is the row this list exists for ─────────
// A drill that has never run is not a passing drill. `splitGeometry` in `design-system/charts`
// refuses to draw a 0/0 split for exactly this reason, and `neverRun` here is what puts the drill in
// its own count and its own tile rather than letting it sit quietly among the green ones.

/** A run, reduced to what a list row needs. */
export type ScenarioRunInput = {
  scenarioKey: string
  requestCount: number
  successCount: number
  failureCount: number
  /** ISO. The most recent run is the one a row describes. */
  createdAt: string
  startedAt: string | null
}

export type ScenarioDefinitionInput = {
  scenarioKey: string
  version: number
  kind: 'resilience' | 'security'
  targetKey: string
  cohort: string
  environment: string
}

export type ScenarioListRow = {
  scenarioKey: string
  version: number
  kind: 'resilience' | 'security'
  targetKey: string
  cohort: string
  environment: string
  /** `null` when this drill has never run — which is a state, not a zero. */
  lastRun: { at: string; held: number; failed: number; requests: number } | null
}

/** The most recent run per drill, folded onto its definition. */
export function projectScenarioRows(
  definitions: readonly ScenarioDefinitionInput[],
  runs: readonly ScenarioRunInput[]
): ScenarioListRow[] {
  // The latest run PER KEY. `startedAt ?? createdAt` because a run that was created and never
  // started still happened as an act, and ordering by `createdAt` alone would put a long-queued run
  // ahead of one that actually executed later.
  const latest = new Map<string, ScenarioRunInput>()
  for (const run of runs) {
    const current = latest.get(run.scenarioKey)
    const when = (input: ScenarioRunInput) => Date.parse(input.startedAt ?? input.createdAt)
    if (current === undefined || when(run) > when(current)) latest.set(run.scenarioKey, run)
  }

  // ⚠️ One row per DEFINITION, deduped to its highest version. A drill with three versions is one
  // drill; listing it three times would make "4 drills defined" disagree with the rows under it.
  const newest = new Map<string, ScenarioDefinitionInput>()
  for (const definition of definitions) {
    const current = newest.get(definition.scenarioKey)
    if (current === undefined || definition.version > current.version)
      newest.set(definition.scenarioKey, definition)
  }

  return [...newest.values()]
    .sort((a, b) => a.scenarioKey.localeCompare(b.scenarioKey))
    .map((definition) => {
      const run = latest.get(definition.scenarioKey)
      return {
        scenarioKey: definition.scenarioKey,
        version: definition.version,
        kind: definition.kind,
        targetKey: definition.targetKey,
        cohort: definition.cohort,
        environment: definition.environment,
        lastRun:
          run === undefined
            ? null
            : {
                at: run.startedAt ?? run.createdAt,
                held: run.successCount,
                failed: run.failureCount,
                requests: run.requestCount,
              },
      }
    })
}

/**
 * What a drill's last run actually says — the ONE answer the pill and the bar both read.
 *
 * ⚠️ **This exists because the pill and the bar contradicted each other on screen.** The pill was
 * derived from `failed > 0` and the bar from `splitGeometry(held, failed)`, and a run that STARTED
 * and replayed nothing satisfies both "no failures" and "nothing to draw" — so the row said
 * **Held** in green beside the sentence *"Never run — nothing here is evidence yet."* Two things
 * that must agree, computed twice (CODE-QUALITY #2), and only visible by opening the page.
 *
 * `no_traffic` is the state that was missing. A drill that ran and replayed nothing is not a held
 * drill and it is not an unrun one: it is a drill whose run produced no evidence, which is its own
 * fact and its own thing to go and look at.
 */
export type ScenarioOutcome = 'never_run' | 'no_traffic' | 'failed' | 'held'

export function scenarioOutcome(row: Pick<ScenarioListRow, 'lastRun'>): ScenarioOutcome {
  if (row.lastRun === null) return 'never_run'
  if (row.lastRun.requests === 0) return 'no_traffic'
  return row.lastRun.failed > 0 ? 'failed' : 'held'
}

/** The word, the pill tone, and the sentence a bar shows when it cannot be drawn. TOTAL over the union. */
export const SCENARIO_OUTCOME_WORDS: Record<
  ScenarioOutcome,
  { label: string; tone: 'on' | 'off' | 'never'; unreadable: string }
> = {
  never_run: {
    label: 'Never run',
    tone: 'never',
    unreadable: 'Never run — nothing here is evidence yet, it is a plan.',
  },
  no_traffic: {
    label: 'Ran, replayed nothing',
    tone: 'never',
    unreadable:
      'This drill ran and replayed no requests, so it produced no evidence. That is not the same as holding.',
  },
  failed: {
    label: 'Something failed',
    tone: 'off',
    unreadable: 'This run recorded failures but no requests, which should not be possible — report it.',
  },
  held: { label: 'Held', tone: 'on', unreadable: 'This run held every request it sent.' },
}

export type ScenarioSummary = {
  defined: number
  resilience: number
  security: number
  neverRun: number
  requestsReplayed: number
  failed: number
  /** Share of everything sent that held, or `null` when nothing was sent at all. */
  heldRate: number | null
}

export function summariseScenarios(rows: readonly ScenarioListRow[]): ScenarioSummary {
  const runs = rows.map((row) => row.lastRun).filter((run): run is NonNullable<typeof run> => run !== null)
  const requestsReplayed = runs.reduce((total, run) => total + run.requests, 0)
  const failed = runs.reduce((total, run) => total + run.failed, 0)
  return {
    defined: rows.length,
    resilience: rows.filter((row) => row.kind === 'resilience').length,
    security: rows.filter((row) => row.kind === 'security').length,
    // ⚠️ A run that replayed NOTHING counts here too. The tile asks "how many controls have no
    // evidence either way", and a drill whose only run sent zero requests has exactly as little
    // evidence as one that never ran — the difference is why it happened, not what it proves.
    neverRun: rows.filter((row) => scenarioOutcome(row) !== 'failed' && scenarioOutcome(row) !== 'held')
      .length,
    requestsReplayed,
    failed,
    // ⚠️ `null`, never 100%, when nothing has been sent. "Everything held" over zero requests is the
    // most dangerous reading available of a control nobody has tested — the same rule
    // `splitGeometry` follows when it refuses to draw a 0/0 split.
    heldRate: requestsReplayed === 0 ? null : (requestsReplayed - failed) / requestsReplayed,
  }
}

/**
 * The list's answer line.
 *
 * The approved copy is *"3 of 2,836 requests failed across the last runs. One drill has never been
 * run — an untested control is an assumption."* Both halves are conditional on the data, which is
 * why this is a function.
 */
export function scenarioAnswer(rows: readonly ScenarioListRow[]): string {
  if (rows.length === 0) {
    return 'No drill has been defined for this project yet. A drill breaks something on purpose, in a controlled way, and keeps the evidence of what held — so a control you believe in becomes a control you have tested.'
  }
  const summary = summariseScenarios(rows)
  const first =
    summary.requestsReplayed === 0
      ? 'Nothing has been replayed yet, so there is no evidence either way.'
      : `${summary.failed.toLocaleString('en-US')} of ${summary.requestsReplayed.toLocaleString('en-US')} requests failed across the last runs.`
  if (summary.neverRun === 0) return first
  return `${first} ${
    summary.neverRun === 1 ? 'One drill has' : `${summary.neverRun} drills have`
  } never been run — an untested control is an assumption.`
}
