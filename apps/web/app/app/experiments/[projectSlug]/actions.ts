'use server'
import { revalidatePath } from 'next/cache'
import { notFound } from 'next/navigation'
import { requireProjectOwnership } from '@/lib/dashboard-auth'
import { createExperimentVersionAfterGate } from '@/lib/experiment-create-command'
import {
  createExperimentVersion,
  transitionExperimentVersion,
  type ExperimentTransitionTarget,
} from '@/lib/experiments'
import { isExperimentGovernanceEnabled } from '@/lib/flags'

function requireGate() {
  if (!isExperimentGovernanceEnabled()) notFound()
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid ${field}`)
  return value
}

export async function createExperimentVersionAction(
  slug: unknown,
  experimentKey: unknown,
  definitionJson: unknown,
) {
  requireGate()
  const command = await createExperimentVersionAfterGate(
    slug,
    experimentKey,
    definitionJson,
    {
      requireOwnership: requireProjectOwnership,
      createVersion: createExperimentVersion,
    },
  )
  if (command.result.ok) revalidatePath(`/app/experiments/${command.slug}`)
  return command.result
}

export async function transitionExperimentVersionAction(
  slug: unknown,
  experimentId: unknown,
  versionId: unknown,
  targetStatus: unknown,
) {
  requireGate()
  const safeSlug = requireString(slug, 'project')
  // Resolve ownership before lifecycle-specific validation to avoid a management oracle.
  const { projectId, userId } = await requireProjectOwnership(safeSlug)
  const safeExperimentId = requireString(experimentId, 'experiment id')
  const safeVersionId = requireString(versionId, 'version id')
  if (targetStatus !== 'running' && targetStatus !== 'stopped' && targetStatus !== 'invalid') {
    return { ok: false as const, error: 'Invalid lifecycle target.' }
  }
  const result = await transitionExperimentVersion(
    projectId,
    safeExperimentId,
    safeVersionId,
    targetStatus as ExperimentTransitionTarget,
    userId,
  )
  if (result.ok) revalidatePath(`/app/experiments/${safeSlug}`)
  return result
}
