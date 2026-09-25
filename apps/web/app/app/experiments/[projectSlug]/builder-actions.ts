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
