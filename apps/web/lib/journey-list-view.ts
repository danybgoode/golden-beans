// The Journeys list, as rows — pure, and zero-import so it can be tested without a database.
//
// design-system-rails · Sprint 5, Story 5.5 — reference state `measure-journeys`.
//
// ── Deliberately the SAME shape as Ship › Features ────────────────────────────────────────────
// The approved state says so in its own callout: *"Deliberately the same list as Ship › Features —
// same row, same state pill, same version words. A journey and a feature are different things, but
// 'a registry of definitions with versions, one of which is active' is the same job, and learning it
// twice is a tax."*
//
// So the page renders `ListCard` / `Row` / `RowState`, and this module produces the same shape
// `lib/experiment-list-view.ts` does — for the same reason: the arithmetic is testable without a
// browser, and a headline that contradicts the rows beneath it is worse than no headline.

/** The states a journey VERSION can be in, restated locally so this module imports nothing. */
export type JourneyVersionState = 'draft' | 'active' | 'superseded'

export type JourneyListInput = {
  key: string
  description: string
  activeVersionId: string | null
  versions: readonly { id: string; version: number; state: JourneyVersionState }[]
}

export type JourneyListRow = {
  key: string
  description: string
  /** The version currently counting people, or `null` when nothing has been activated. */
  activeVersion: number | null
  /** The highest draft above the active one — the "waiting for you" version. `null` when none. */
  waitingDraftVersion: number | null
  /** How many people this journey is counting. `null` when it was not read. */
  subjectCount: number | null
}

/**
 * The active version, and the draft waiting above it.
 *
 * ⚠️ **A draft BELOW the active version is not waiting for anything**, and this is the distinction
 * `canActivateJourneyVersion` already draws in `lib/journey-registry-view.ts`: a draft can only be
 * activated when its number is higher than the active one. Reporting a stale draft as "waiting"
 * would put a call to action on a row where the control is disabled.
 */
export function projectJourneyRows(
  inputs: readonly JourneyListInput[],
  subjectCounts: ReadonlyMap<string, number>
): JourneyListRow[] {
  return inputs.map((input) => {
    const active = input.versions.find((version) => version.id === input.activeVersionId) ?? null
    const drafts = input.versions
      .filter((version) => version.state === 'draft')
      .filter((version) => active === null || version.version > active.version)
      .map((version) => version.version)
    return {
      key: input.key,
      description: input.description,
      activeVersion: active?.version ?? null,
      waitingDraftVersion: drafts.length === 0 ? null : Math.max(...drafts),
      // ABSENT rather than zero when the count was not read. "Nobody is in this journey" and "we did
      // not read how many are" are different sentences, and the second must not render as the first.
      subjectCount: subjectCounts.has(input.key) ? (subjectCounts.get(input.key) as number) : null,
    }
  })
}

/** How many journeys are live, and how many drafts are waiting — the four summary tiles' figures. */
export type JourneySummary = {
  active: number
  draftsWaiting: number
  /** `null` when any row's count is unread — a total over a partial set is not a total. */
  subjectsCounted: number | null
}

export function summariseJourneys(rows: readonly JourneyListRow[]): JourneySummary {
  const counted = rows.map((row) => row.subjectCount)
  return {
    active: rows.filter((row) => row.activeVersion !== null).length,
    draftsWaiting: rows.filter((row) => row.waitingDraftVersion !== null).length,
    // ⚠️ `null` if ANY row is unread. Summing the ones that answered and presenting it as the total
    // would be a number that is confidently too small — the honest-looking-zero failure with extra
    // steps, and the harder one to notice because it is not zero.
    subjectsCounted: counted.some((count) => count === null)
      ? null
      : counted.reduce((total: number, count) => total + (count as number), 0),
  }
}

/**
 * The list's answer line, computed from the rows it sits above.
 *
 * The approved copy is *"3 journeys are running and 1 has a draft waiting for you. A draft changes
 * nothing until you activate it."* — and the second sentence only belongs there when there IS a
 * draft, which is what makes this a function rather than a string.
 */
export function journeyAnswer(rows: readonly JourneyListRow[]): string {
  if (rows.length === 0) {
    return 'No journey has been defined for this project yet. A journey is the path you want somebody to walk, and each one counts how far people actually get.'
  }
  const summary = summariseJourneys(rows)
  const running =
    summary.active === 0
      ? 'Nothing is counting anyone yet — every definition here is still a draft.'
      : `${summary.active} journey${summary.active === 1 ? ' is' : 's are'} running.`
  if (summary.draftsWaiting === 0) return running
  return `${running} ${summary.draftsWaiting} ${
    summary.draftsWaiting === 1 ? 'has a draft' : 'have drafts'
  } waiting for you — a draft changes nothing until you activate it.`
}
