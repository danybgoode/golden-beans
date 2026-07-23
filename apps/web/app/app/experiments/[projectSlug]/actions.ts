'use server'
import { revalidatePath } from 'next/cache'
import { notFound } from 'next/navigation'
import { requireProjectOwnership } from '@/lib/dashboard-auth'
import {
  parseExperimentDecisionCommand,
  prepareExperimentDecisionSnapshot,
} from '@/lib/experiment-decision-contract'
import { recordExperimentDecision } from '@/lib/experiment-decision-query'
import { createExperimentVersionAfterGate } from '@/lib/experiment-create-command'
import { getExperimentAnalysisByProjectId } from '@/lib/experiment-analysis-query'
import {
  createExperimentVersion,
  transitionExperimentVersion,
  type ExperimentTransitionTarget,
} from '@/lib/experiments'
import { validateExperimentKey } from '@/lib/experiment-definition'
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

export async function recordExperimentDecisionAction(
  slug: unknown,
  experimentKey: unknown,
  definitionVersion: unknown,
  recordKind: unknown,
  supersedesRecordId: unknown,
  outcome: unknown,
  chosenVariantKey: unknown,
  rationale: unknown,
  idempotencyKey: unknown,
) {
  requireGate()
  const safeSlug = requireString(slug, 'project')
  // Resolve an owner before validating experiment identifiers so this mutation cannot become a
  // foreign-project or registry-discovery oracle.
  const { projectId, userId } = await requireProjectOwnership(safeSlug)
  if (!validateExperimentKey(experimentKey)) {
    return { ok: false as const, error: 'Invalid experiment key.' }
  }
  const version = typeof definitionVersion === 'number'
    ? definitionVersion
    : Number(definitionVersion)
  if (!Number.isSafeInteger(version) || version < 1 || version > 1_000_000) {
    return { ok: false as const, error: 'Invalid experiment definition version.' }
  }

  // Snapshot evidence is always recomputed inside this trusted server action. The browser supplies
  // only the human choice and stable identifiers; it can never forge plan or analysis evidence.
  const capturedAt = new Date().toISOString()
  const governed = await getExperimentAnalysisByProjectId(
    projectId,
    safeSlug,
    experimentKey,
    { version, asOf: capturedAt },
  )
  if (!governed.ok) {
    return { ok: false as const, error: 'Could not capture governed analysis for this decision.' }
  }
  const parsed = parseExperimentDecisionCommand(
    {
      recordKind,
      outcome,
      chosenVariantKey,
      rationale,
      supersedesRecordId,
      idempotencyKey,
    },
    {
      definition: governed.experiment.definition,
      lifecycle: governed.experiment.lifecycle,
      currentDecisionId: governed.decisions.current?.id ?? null,
    },
  )
  if (!parsed.ok) return parsed

  let analysisSnapshot: Record<string, unknown>
  try {
    analysisSnapshot = prepareExperimentDecisionSnapshot(governed.analysis, capturedAt)
  } catch (error) {
    console.error('[experiments/actions] decision snapshot rejected:', error)
    return { ok: false as const, error: 'The governed analysis snapshot is not safe to record.' }
  }
  const result = await recordExperimentDecision(
    projectId,
    governed.experiment.id,
    governed.experiment.versionId,
    userId,
    parsed.command,
    analysisSnapshot,
  )
  if (result.ok) {
    revalidatePath(`/app/experiments/${safeSlug}`)
    revalidatePath(`/app/experiments/${safeSlug}/${experimentKey}`)
  }
  return result
}
