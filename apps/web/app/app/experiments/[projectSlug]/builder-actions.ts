'use server'
import { revalidatePath } from 'next/cache'
import { requireProjectOwnership } from '@/lib/dashboard-auth'
import { isExperimentBuilderWritable, isFlagServingEnabled } from '@/lib/flags'
import { getSupabaseServiceClient } from '@/lib/supabase'
import { createBuilderIo } from '@/lib/experiment-builder-io'
import {
  retryServingCommand,
  saveExperimentDraftCommand,
  startExperimentCommand,
  type BuilderDependencies,
} from '@/lib/experiment-builder-command'
import { rolloutExperimentCommand, undoRolloutCommand } from '@/lib/experiment-rollout-command'

// experiments-for-humans · Stories 3.2 / 3.3 — the builder's three writes. Each is the command in
// lib/experiment-builder-command.ts with the real gate, ownership check and service client; the
// order, the re-planning and the partial state all live (and are tested) there.

function dependencies(): BuilderDependencies {
  return {
    builderEnabled: isExperimentBuilderWritable,
    servingEnabled: isFlagServingEnabled,
    requireOwnership: requireProjectOwnership,
    io: createBuilderIo(getSupabaseServiceClient()),
  }
}

function refresh(slug: unknown, experimentKey?: string) {
  if (typeof slug !== 'string') return
  revalidatePath(`/app/experiments/${slug}`)
  if (experimentKey) revalidatePath(`/app/experiments/${slug}/${experimentKey}`)
}

export async function saveExperimentDraftAction(slug: unknown, answers: unknown, continuing: unknown) {
  const result = await saveExperimentDraftCommand(slug, answers, continuing, dependencies())
  if (result.ok) refresh(slug, result.experimentKey)
  return result
}

export async function startExperimentAction(slug: unknown, experimentKey: unknown) {
  const result = await startExperimentCommand(slug, experimentKey, dependencies())
  if (result.ok) refresh(slug, result.experimentKey)
  return result
}

export async function retryExperimentServingAction(slug: unknown, experimentKey: unknown) {
  const result = await retryServingCommand(slug, experimentKey, dependencies())
  if (result.ok) refresh(slug, result.experimentKey)
  return result
}

// Story 4.2 (D8) — the decision's two follow-up writes. Stop and record stay the existing actions in
// ./actions.ts, unchanged: the recorder cannot touch a flag, and these cannot touch the record.
export async function rolloutExperimentAction(
  slug: unknown,
  experimentKey: unknown,
  version: unknown,
  variantKey: unknown
) {
  const result = await rolloutExperimentCommand(slug, experimentKey, version, variantKey, dependencies())
  if (result.ok && typeof experimentKey === 'string') refresh(slug, experimentKey)
  return result
}

export async function undoRolloutAction(
  slug: unknown,
  experimentKey: unknown,
  version: unknown,
  previousVersionId: unknown,
  rolloutVersionId: unknown
) {
  const result = await undoRolloutCommand(
    slug,
    experimentKey,
    version,
    previousVersionId,
    rolloutVersionId,
    dependencies()
  )
  if (result.ok && typeof experimentKey === 'string') refresh(slug, experimentKey)
  return result
}

/** Story 4.1 — "Change the plan": the next version of a started experiment, saved as a draft. */
export async function reviseExperimentPlanAction(slug: unknown, answers: unknown, experimentKey: unknown) {
  const result = await saveExperimentDraftCommand(slug, answers, experimentKey, dependencies(), {
    revise: true,
  })
  if (result.ok) refresh(slug, result.experimentKey)
  return result
}
