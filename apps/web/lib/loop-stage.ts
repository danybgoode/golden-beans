// portfolio-view · Sprint 1, Story 1.3 (Roadmap/02-commercial/portfolio-view — the Architecture lock, D3, D11, C4).
//
// The loop stage's vocabulary and its ONE write decision, as pure functions. ZERO imports, on purpose: the decision
// is an authorization boundary, and this repo asserts boundaries of that kind directly (`loop-stage.test.ts`) rather
// than through a page or a session the harness may not reach (CODE-QUALITY #5).
//
// The stage is a judgment the owner writes. Nothing in this file — or anywhere — derives it from a metric (D3).

export const LOOP_STAGES = ['consider', 'operate', 'exit'] as const
export type LoopStage = (typeof LOOP_STAGES)[number]

export const LOOP_STAGE_LABELS: Record<LoopStage, string> = {
  consider: 'Consider',
  operate: 'Operate',
  exit: 'Exit',
}

/** A stored or submitted value → a stage, or null. Anything that is not exactly one of the three is null. */
export function parseLoopStage(value: unknown): LoopStage | null {
  return typeof value === 'string' && (LOOP_STAGES as readonly string[]).includes(value)
    ? (value as LoopStage)
    : null
}

export type LoopStageWriteDecision = 'ok' | 'forbidden' | 'not_found'

/**
 * May this caller set a project's loop stage?
 *
 * `membership` is what `getMembershipByProjectId` returned for the SESSION user — null when they are not a member, the
 * project is in a workspace that is not theirs, or the lookup failed (it fails closed). Those are all "not found":
 * a non-member must not learn the project exists (AGENTS § The tenancy invariant). A member who is not the owner is
 * "forbidden". Only an exact `owner` role writes, matching `isOwner` in `lib/roles.ts` — an unknown role fails closed.
 *
 * Takes the role structurally rather than importing `Membership`, so this file stays import-free.
 */
export function loopStageWriteDecision(membership: { role: string } | null): LoopStageWriteDecision {
  if (membership === null) return 'not_found'
  return membership.role === 'owner' ? 'ok' : 'forbidden'
}
