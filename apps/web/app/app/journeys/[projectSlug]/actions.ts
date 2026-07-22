'use server'
import { revalidatePath } from 'next/cache'
import { notFound } from 'next/navigation'
import { requireProjectOwnership } from '@/lib/dashboard-auth'
import { isJourneyProjectionsEnabled } from '@/lib/flags'
import { createJourneyVersionAfterGate } from '@/lib/journey-create-command'
import { activateJourneyVersion, createJourneyVersion } from '@/lib/journeys'

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid ${field}`)
  return value
}

function requireGate() {
  // Gate before argument/auth work: while dark, a forged action learns nothing about this seam and
  // no old surface changes behavior.
  if (!isJourneyProjectionsEnabled()) notFound()
}

export async function createJourneyVersionAction(
  slug: unknown,
  journeyKey: unknown,
  definitionJson: unknown,
) {
  requireGate()
  const command = await createJourneyVersionAfterGate(slug, journeyKey, definitionJson, {
    // Session identity, never an API key, supplies both project ownership and the audit actor.
    requireOwnership: requireProjectOwnership,
    createVersion: createJourneyVersion,
  })
  if (command.result.ok) revalidatePath(`/app/journeys/${command.slug}`)
  return command.result
}
export async function activateJourneyVersionAction(
  slug: unknown,
  journeyId: unknown,
  versionId: unknown,
) {
  requireGate()
  const safeSlug = requireString(slug, 'project')
  const safeJourneyId = requireString(journeyId, 'journey id')
  const safeVersionId = requireString(versionId, 'version id')
  const { projectId, userId } = await requireProjectOwnership(safeSlug)
  const result = await activateJourneyVersion(projectId, safeJourneyId, safeVersionId, userId)
  if (result.ok) revalidatePath(`/app/journeys/${safeSlug}`)
  return result
}
