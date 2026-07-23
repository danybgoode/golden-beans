import { parseJourneyDefinition, validateJourneyKey, type JourneyDefinition } from './journey-definition'

// entity-journeys-projections · PR #17 review hardening.
// Import-safe orchestration for the create-version Server Action. Authorization deliberately
// precedes every journey-key/JSON/definition check so a non-owner cannot use validation responses
// as an oracle for a management seam they are not allowed to invoke.

export const MAX_JOURNEY_DEFINITION_BYTES = 32 * 1024

/**
 * PostgreSQL renders JSONB with `: ` and `, ` separators before the migration applies its
 * 32 KiB backstop. Mirror that representation's byte length so a compact near-limit request gets
 * the same friendly validation result here instead of a generic RPC failure.
 *
 * Object key order is irrelevant to the length. Journey definitions contain only JSON scalars,
 * arrays and objects, so this recursive formatter covers the complete closed contract.
 */
export function postgresJsonbTextByteLength(value: unknown): number {
  return Buffer.byteLength(postgresJsonbText(value), 'utf8')
}

function postgresJsonbText(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(postgresJsonbText).join(', ')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .map(([key, child]) => `${JSON.stringify(key)}: ${postgresJsonbText(child)}`)
      .join(', ')}}`
  }
  const encoded = JSON.stringify(value)
  if (encoded === undefined) throw new Error('invalid JSON value')
  return encoded
}

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

  if (typeof journeyKey !== 'string') {
    return {
      slug: safeSlug,
      result: { ok: false, error: 'Journey key must be lower_snake_case (1-64 characters).' },
    }
  }
  const safeKey = journeyKey
  if (typeof definitionJson !== 'string') {
    return {
      slug: safeSlug,
      result: { ok: false, error: 'Definition must be a JSON string.' },
    }
  }
  const raw = definitionJson
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
  if (postgresJsonbTextByteLength(parsed) > MAX_JOURNEY_DEFINITION_BYTES) {
    return {
      slug: safeSlug,
      result: { ok: false, error: 'Definition is too large (maximum 32 KiB).' },
    }
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
