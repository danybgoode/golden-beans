import {
  MAX_EXPERIMENT_DEFINITION_BYTES,
  parseExperimentDefinition,
  validateExperimentKey,
  type ExperimentDefinition,
} from './experiment-definition'

type OwnerIdentity = { projectId: string; userId: string }

export type ExperimentVersionCreationResult =
  | {
      ok: true
      projectId: string
      experimentId: string
      versionId: string
      version: number
      status: 'draft'
    }
  | { ok: false; error: string }

export type ExperimentCreateCommandDependencies = {
  requireOwnership: (slug: string) => Promise<OwnerIdentity>
  createVersion: (
    projectId: string,
    experimentKey: string,
    definition: ExperimentDefinition,
    userId: string,
  ) => Promise<ExperimentVersionCreationResult>
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

export async function createExperimentVersionAfterGate(
  slug: unknown,
  experimentKey: unknown,
  definitionJson: unknown,
  dependencies: ExperimentCreateCommandDependencies,
): Promise<{ slug: string; result: ExperimentVersionCreationResult }> {
  if (typeof slug !== 'string') throw new Error('Invalid project')
  // Authorization precedes every distinguishable payload response.
  const { projectId, userId } = await dependencies.requireOwnership(slug)

  if (!validateExperimentKey(experimentKey)) {
    return {
      slug,
      result: {
        ok: false,
        error: 'Experiment key must be 1-64 lowercase letters, numbers, hyphens or underscores.',
      },
    }
  }
  if (typeof definitionJson !== 'string') {
    return { slug, result: { ok: false, error: 'Definition must be a JSON string.' } }
  }
  if (Buffer.byteLength(definitionJson, 'utf8') > MAX_EXPERIMENT_DEFINITION_BYTES) {
    return { slug, result: { ok: false, error: 'Definition is too large (maximum 32 KiB).' } }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(definitionJson)
  } catch {
    return { slug, result: { ok: false, error: 'Definition must be valid JSON.' } }
  }
  // Close and bound the shape before recursively rendering PostgreSQL's JSONB text spelling.
  // A small but pathologically deep unknown payload must fail validation, not overflow this walk.
  const checked = parseExperimentDefinition(parsed)
  if (!checked.ok) {
    return { slug, result: { ok: false, error: checked.errors.join(' · ') } }
  }
  if (Buffer.byteLength(postgresJsonbText(parsed), 'utf8') > MAX_EXPERIMENT_DEFINITION_BYTES) {
    return { slug, result: { ok: false, error: 'Definition is too large (maximum 32 KiB).' } }
  }
  return {
    slug,
    result: await dependencies.createVersion(
      projectId,
      experimentKey,
      checked.definition,
      userId,
    ),
  }
}
