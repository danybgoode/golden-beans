import { parseJourneyDefinition, validateJourneyKey, type JourneyDefinition } from './journey-definition'

// entity-journeys-projections · PR #17 review hardening.
// Import-safe orchestration for the create-version Server Action. Authorization deliberately
// precedes every journey-key/JSON/definition check so a non-owner cannot use validation responses
// as an oracle for a management seam they are not allowed to invoke.

export const MAX_JOURNEY_DEFINITION_BYTES = 32 * 1024

type OwnerIdentity = { projectId: string; userId: string }

export type JourneyVersionCreationResult =
  | { ok: true; journeyId: string; versionId: string; version: number }
  | { ok: false; error: string }

export type JourneyCreateCommandDependencies = {
  requireOwnership: (slug: string) => Promise<OwnerIdentity>
  createVersion: (
    projectId: string,
    journeyKey: string,
    definition: JourneyDefinition,
    userId: string,
  ) => Promise<JourneyVersionCreationResult>
}

export type JourneyCreateCommandResult = {
  slug: string
  result: JourneyVersionCreationResult
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid ${field}`)
  return value
}

/** Called only after the enablement gate has passed. */
export async function createJourneyVersionAfterGate(
  slug: unknown,
  journeyKey: unknown,
  definitionJson: unknown,
  dependencies: JourneyCreateCommandDependencies,
): Promise<JourneyCreateCommandResult> {
  const safeSlug = requireString(slug, 'project')

  // Keep this immediately after the only information needed to authorize: the string slug.
  // Everything below can produce a distinguishable validation response and therefore belongs
  // behind the owner boundary.
  const { projectId, userId } = await dependencies.requireOwnership(safeSlug)

  const safeKey = requireString(journeyKey, 'journey key')
  const raw = requireString(definitionJson, 'definition')
  if (!validateJourneyKey(safeKey)) {
    return {
      slug: safeSlug,
      result: { ok: false, error: 'Journey key must be lower_snake_case (1-64 characters).' },
    }
  }
  if (Buffer.byteLength(raw, 'utf8') > MAX_JOURNEY_DEFINITION_BYTES) {
    return {
      slug: safeSlug,
      result: { ok: false, error: 'Definition is too large (maximum 32 KiB).' },
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { slug: safeSlug, result: { ok: false, error: 'Definition must be valid JSON.' } }
  }
  const checked = parseJourneyDefinition(parsed)
  if (!checked.ok) {
    return { slug: safeSlug, result: { ok: false, error: checked.errors.join(' · ') } }
  }

  return {
    slug: safeSlug,
    result: await dependencies.createVersion(projectId, safeKey, checked.definition, userId),
  }
}
