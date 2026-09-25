import {
  buildExperimentPlan,
  parseExperimentBuilderAnswers,
  type ExperimentCheck,
  type ExperimentPlan,
} from './experiment-builder-plan'
import type { BuilderIo } from './experiment-builder-io'

// experiments-for-humans · Stories 3.2 / 3.3 (epic README D7, as corrected before Sprint 3).
//
// The builder's three writes, as ORDER. No database client, no framework: the gates, the ownership
// check and the I/O are handed in, so the specs run these exact functions against real Postgres with
// the gate switched on, and the server actions are three lines each.
//
// The browser sends ANSWERS, never a definition: every definition and flag version written here is
// rebuilt by the planner on the server, from the CURRENT served feature and catalog.

export type BuilderDependencies = {
  builderEnabled: () => boolean
  servingEnabled: () => boolean
  requireOwnership: (slug: string) => Promise<{ projectId: string; userId: string }>
  io: BuilderIo
}

export const BUILDER_PAUSED = 'Creating experiments is paused.'

type Failure = { ok: false; error: string; checks?: ExperimentCheck[] }

export type SaveDraftResult =
  { ok: true; experimentKey: string; version: number; created: boolean; failing: number } | Failure

export type StartResult =
  | {
      ok: true
      experimentKey: string
      version: number
      flagKey: string
      weights: number[]
      /** D7's honest partial state: running, but the split is not serving yet. */
      serving: boolean
    }
  | Failure

async function planFor(
  deps: BuilderDependencies,
  projectId: string,
  rawAnswers: unknown,
  draft: {
    experimentKey: string
    flagKey: string | null
    version: number
    window?: { startAt: string; endAt: string }
  } | null
): Promise<
  | { ok: true; plan: ExperimentPlan; answers: import('./experiment-builder-plan').ExperimentBuilderAnswers }
  | Failure
> {
  const parsed = parseExperimentBuilderAnswers(rawAnswers)
  if (!parsed.ok) return { ok: false, error: parsed.error }
  const context = await deps.io.loadPlanningContext(projectId, parsed.answers.flagKey)
  const result = buildExperimentPlan(parsed.answers, {
    ...context,
    now: new Date(),
    nextVersion: draft ? draft.version + 1 : 1,
    ...(draft?.window ? { savedWindow: draft.window } : {}),
    ...(draft && draft.flagKey
      ? { draft: { experimentKey: draft.experimentKey, flagKey: draft.flagKey } }
      : {}),
  })
  if (!result.ok) return { ok: false, error: result.errors[0] ?? 'This plan cannot be saved.' }
  return { ok: true, plan: result.plan, answers: parsed.answers }
}

/**
 * Save draft — never activates anything. `continuing` names the draft being re-saved, so it keeps
 * its experiment key and feature key instead of minting `…_2` names.
 */
export async function saveExperimentDraftCommand(
  slug: unknown,
  rawAnswers: unknown,
  continuing: unknown,
  deps: BuilderDependencies
): Promise<SaveDraftResult> {
  // The gate FIRST — an OFF deployment must not reach ownership, the database, or the planner.
  if (!deps.builderEnabled()) return { ok: false, error: BUILDER_PAUSED }
  if (typeof slug !== 'string') return { ok: false, error: 'Invalid project.' }
  const { projectId, userId } = await deps.requireOwnership(slug)
  let draft = null
  if (continuing !== null && continuing !== undefined) {
    if (typeof continuing !== 'string') return { ok: false, error: 'Invalid draft.' }
    const stored = await deps.io.loadDraft(projectId, continuing)
    if (!stored) return { ok: false, error: 'That draft no longer exists.' }
    draft = { experimentKey: continuing, flagKey: stored.flagKey, version: stored.version }
  }
  const planned = await planFor(deps, projectId, rawAnswers, draft)
  if (!planned.ok) return planned
  const saved = await deps.io.saveDraft({
    projectId,
    experimentKey: planned.plan.experimentKey,
    definition: planned.plan.definition,
    flagKey: planned.plan.flagKey,
    flagDefinition: planned.plan.flagDefinition,
    answers: planned.answers,
    actorUserId: userId,
  })
  if (!saved.ok) return saved
  return {
    ok: true,
    experimentKey: planned.plan.experimentKey,
    version: saved.saved.version,
    created: saved.saved.created,
    failing: planned.plan.failing,
  }
}

/**
 * Start (D7): re-plan on the server from the stored answers against the CURRENT feature and catalog;
 * refuse while any check fails; save if the plan moved (a no-op otherwise); then (1) running, and
 * only then (2) the flag version in Production. Exposures can never arrive for a version that is not
 * running, and a failed (2) is reported as the partial state it is.
 */
export async function startExperimentCommand(
  slug: unknown,
  experimentKey: unknown,
  deps: BuilderDependencies
): Promise<StartResult> {
  if (!deps.builderEnabled()) return { ok: false, error: BUILDER_PAUSED }
  if (typeof slug !== 'string' || typeof experimentKey !== 'string')
    return { ok: false, error: 'Invalid request.' }
  const { projectId, userId } = await deps.requireOwnership(slug)
  if (!deps.servingEnabled()) return { ok: false, error: 'Flag serving is unavailable in this deployment.' }

  const stored = await deps.io.loadDraft(projectId, experimentKey)
  if (!stored || stored.status !== 'draft') return { ok: false, error: 'There is no draft to start.' }
  if (!stored.answers)
    return { ok: false, error: 'This draft was not made in the builder; start it from its plan.' }
  const base = { experimentKey, flagKey: stored.flagKey, version: stored.version }

  let planned = await planFor(deps, projectId, stored.answers, {
    ...base,
    window: stored.definition.plannedWindow,
  })
  if (!planned.ok) return planned
  const failing = planned.plan.checks.filter((check) => check.status === 'fail')
  if (failing.length > 0 && failing.every((check) => check.fix?.kind === 'replan-from-today')) {
    // A6: the saved dates ran out. Re-date from now — a new, still-inert version — and re-check.
    planned = await planFor(deps, projectId, stored.answers, base)
    if (!planned.ok) return planned
  }
  const stillFailing = planned.plan.checks.filter((check) => check.status === 'fail')
  if (stillFailing.length > 0) {
    return {
      ok: false,
      error: `Fix ${stillFailing.length} thing${stillFailing.length === 1 ? '' : 's'} to start.`,
      checks: planned.plan.checks,
    }
  }

  // Idempotent: returns the stored draft when nothing moved; a new version when the feature or the
  // window did — so a flag version built from a stale served definition is never activated.
  const saved = await deps.io.saveDraft({
    projectId,
    experimentKey,
    definition: planned.plan.definition,
    flagKey: planned.plan.flagKey,
    flagDefinition: planned.plan.flagDefinition,
    answers: planned.answers,
    actorUserId: userId,
  })
  if (!saved.ok) return saved
  const { saved: version } = saved

  if (!(await deps.io.transitionToRunning(projectId, version.experimentId, version.versionId, userId))) {
    return { ok: false, error: 'The experiment could not be started.' }
  }
  const serving = await deps.io.activateInProduction({
    projectId,
    flagId: version.flagId,
    flagVersionId: version.flagVersionId,
    actorUserId: userId,
    reason: `Start experiment ${experimentKey} v${version.version}`,
  })
  return {
    ok: true,
    experimentKey,
    version: version.version,
    flagKey: planned.plan.flagKey,
    weights: planned.plan.weights,
    serving,
  }
}

/** The partial state's one-click retry: step (2) only, for a RUNNING version whose split isn't serving. */
export async function retryServingCommand(
  slug: unknown,
  experimentKey: unknown,
  deps: BuilderDependencies
): Promise<StartResult> {
  if (!deps.builderEnabled()) return { ok: false, error: BUILDER_PAUSED }
  if (typeof slug !== 'string' || typeof experimentKey !== 'string')
    return { ok: false, error: 'Invalid request.' }
  const { projectId, userId } = await deps.requireOwnership(slug)
  if (!deps.servingEnabled()) return { ok: false, error: 'Flag serving is unavailable in this deployment.' }
  const stored = await deps.io.loadDraft(projectId, experimentKey)
  if (!stored || stored.status !== 'running' || !stored.flagId || !stored.flagVersionId || !stored.flagKey) {
    return { ok: false, error: 'Only a running experiment can be retried.' }
  }
  const serving =
    (await deps.io.servingInProduction(projectId, stored.flagId, stored.flagVersionId)) ||
    (await deps.io.activateInProduction({
      projectId,
      flagId: stored.flagId,
      flagVersionId: stored.flagVersionId,
      actorUserId: userId,
      reason: `Retry serving experiment ${experimentKey} v${stored.version}`,
    }))
  return {
    ok: true,
    experimentKey,
    version: stored.version,
    flagKey: stored.flagKey,
    weights: stored.definition.variants.map((variant) => variant.weight),
    serving,
  }
}
