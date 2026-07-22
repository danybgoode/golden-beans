'use server'
import { revalidatePath } from 'next/cache'
import { notFound } from 'next/navigation'
import { requireProjectOwnership } from '@/lib/dashboard-auth'
import { isJourneyProjectionsEnabled } from '@/lib/flags'
import { parseJourneyDefinition, validateJourneyKey } from '@/lib/journey-definition'
import { activateJourneyVersion, createJourneyVersion } from '@/lib/journeys'

const MAX_DEFINITION_BYTES = 32 * 1024

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
  const safeSlug = requireString(slug, 'project')
  const safeKey = requireString(journeyKey, 'journey key')
  const raw = requireString(definitionJson, 'definition')
  if (!validateJourneyKey(safeKey)) {
    return { ok: false as const, error: 'Journey key must be lower_snake_case (1-64 characters).' }
  }
  if (Buffer.byteLength(raw, 'utf8') > MAX_DEFINITION_BYTES) {
    return { ok: false as const, error: 'Definition is too large (maximum 32 KiB).' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false as const, error: 'Definition must be valid JSON.' }
  }
  const checked = parseJourneyDefinition(parsed)
  if (!checked.ok) return { ok: false as const, error: checked.errors.join(' · ') }

  // Session identity, never an API key, supplies both project ownership and the audit actor.
  const { projectId, userId } = await requireProjectOwnership(safeSlug)
  const result = await createJourneyVersion(projectId, safeKey, checked.definition, userId)
  if (result.ok) revalidatePath(`/app/journeys/${safeSlug}`)
  return result
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
