import { planExperimentRollout } from './experiment-builder-plan'
import { BUILDER_PAUSED, type BuilderDependencies } from './experiment-builder-command'

// experiments-for-humans · Story 4.2 (epic README D8) — "Set ‹version› for everyone in Production".
//
// A SEPARATE write from the decision, on purpose: the decision recorder stays structurally unable to
// touch a flag (it is unchanged by this epic), and this cannot touch the decision record — it never
// reads or writes `experiment_decision_records`. It runs only after a decision exists, only through
// `planExperimentRollout` (which refuses to strip any experiment but the one named), and it returns
// the version it replaced so the page can offer a 10-second undo.

export type RolloutResult =
  | {
      ok: true
      flagKey: string
      variantKey: string
      previousVersionId: string
      rolloutVersionId: string
      serving: boolean
    }
  | { ok: false; error: string }

export async function rolloutExperimentCommand(
  slug: unknown,
  experimentKey: unknown,
  version: unknown,
  variantKey: unknown,
  deps: BuilderDependencies
): Promise<RolloutResult> {
  if (!deps.builderEnabled()) return { ok: false, error: BUILDER_PAUSED }
  if (typeof slug !== 'string' || typeof experimentKey !== 'string' || typeof variantKey !== 'string')
    return { ok: false, error: 'Invalid request.' }
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1)
    return { ok: false, error: 'Invalid version.' }
  if (!deps.servingEnabled()) return { ok: false, error: 'Flag serving is unavailable in this deployment.' }
  const { projectId, userId } = await deps.requireOwnership(slug)

  const stored = await deps.io.loadDraft(projectId, experimentKey)
  if (!stored || stored.version !== version || !stored.flagId)
    return { ok: false, error: 'That experiment version is not the latest one.' }
  if (stored.status !== 'decided')
    return { ok: false, error: 'Record the decision first; the rollout follows it.' }
  if (!stored.definition.variants.some((variant) => variant.key === variantKey))
    return { ok: false, error: 'That version is not part of this test.' }
  // The roll-out sets exactly what the RECORD says, enforced here rather than trusted from the page
  // (fresh reviewer, #172): ship → the chosen treatment, keep → the control, anything else → nothing.
  const decision = await deps.io.currentDecision(projectId, stored.versionId)
  const decided =
    decision?.outcome === 'ship_treatment'
      ? decision.chosenVariantKey
      : decision?.outcome === 'keep_control'
        ? stored.definition.controlVariantKey
        : null
  if (decided === null) return { ok: false, error: 'This decision doesn’t set a version for everyone.' }
  if (decided !== variantKey) return { ok: false, error: 'The roll-out must match the recorded decision.' }

  const served = await deps.io.productionVersion(projectId, stored.flagId)
  if (!served) return { ok: false, error: 'The feature is not serving in Production.' }
  const plan = planExperimentRollout(served.definition, variantKey, { experimentKey, version })
  if (!plan.ok) return { ok: false, error: plan.errors[0] ?? 'Nothing was changed.' }

  const created = await deps.io.createFlagVersion({
    projectId,
    flagKey: served.flagKey,
    definition: plan.plan.definition,
    reason: `Roll out ${variantKey} to everyone after ${experimentKey} v${version}`,
    actorUserId: userId,
  })
  if (!created) return { ok: false, error: 'The rollout could not be written; nothing was changed.' }
  // Only over the version the rollout was planned from — a change that landed since is never
  // rolled back by a rollout either.
  const outcome = await deps.io.activateInProduction({
    projectId,
    flagId: stored.flagId,
    flagVersionId: created.versionId,
    actorUserId: userId,
    reason: `Roll out ${variantKey} to everyone after ${experimentKey} v${version}`,
    replacing: served.versionId,
  })
  if (outcome === 'moved')
    return {
      ok: false,
      error: 'The feature changed while you were rolling out. Nothing was changed; try again.',
    }
  const serving = outcome === 'serving'
  return {
    ok: true,
    flagKey: served.flagKey,
    variantKey,
    previousVersionId: served.versionId,
    rolloutVersionId: created.versionId,
    serving,
  }
}

/**
 * The 10-second undo: re-activate exactly the version that was serving before. It can only name a
 * version of THIS experiment's feature; it cannot touch the decision, which is immutable.
 */
export async function undoRolloutCommand(
  slug: unknown,
  experimentKey: unknown,
  previousVersionId: unknown,
  rolloutVersionId: unknown,
  deps: BuilderDependencies
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!deps.builderEnabled()) return { ok: false, error: BUILDER_PAUSED }
  if (!deps.servingEnabled()) return { ok: false, error: 'Flag serving is unavailable in this deployment.' }
  if (
    typeof slug !== 'string' ||
    typeof experimentKey !== 'string' ||
    typeof previousVersionId !== 'string' ||
    typeof rolloutVersionId !== 'string'
  )
    return { ok: false, error: 'Invalid request.' }
  const { projectId, userId } = await deps.requireOwnership(slug)
  const stored = await deps.io.loadDraft(projectId, experimentKey)
  if (!stored?.flagId || !(await deps.io.flagVersionBelongs(projectId, stored.flagId, previousVersionId)))
    return { ok: false, error: 'Nothing to undo.' }
  // The undo replaces only the rollout it undoes: if anything was activated since, undoing would
  // roll THAT back, so it refuses.
  const outcome = await deps.io.activateInProduction({
    projectId,
    flagId: stored.flagId,
    flagVersionId: previousVersionId,
    actorUserId: userId,
    reason: `Undo the rollout after ${experimentKey}`,
    replacing: rolloutVersionId,
  })
  if (outcome === 'serving') return { ok: true }
  return {
    ok: false,
    error:
      outcome === 'moved'
        ? 'The feature changed after the rollout, so undoing it now would undo that too. Nothing was changed.'
        : 'The undo could not be applied.',
  }
}
