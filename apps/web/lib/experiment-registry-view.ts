import type { ExperimentDefinition } from './experiment-definition'

export const EXPERIMENT_REGISTRY_RELATIONAL_SELECT = `
  id,
  project_id,
  key,
  created_by,
  created_at,
  versions:experiment_definition_versions!experiment_versions_registry_fk(
    id,
    project_id,
    version,
    definition,
    status,
    created_by,
    created_at,
    started_by,
    started_at,
    ended_by,
    ended_at,
    invalidated_by,
    invalidated_at
  )
`

// `decided` is reserved in Sprint 1's durable state contract, but only Sprint 3's atomic
// decision-record RPC may enter it. The generic lifecycle action deliberately excludes it.
export type ExperimentLifecycleState = 'draft' | 'running' | 'stopped' | 'decided' | 'invalid'

export type ExperimentRegistryRelationRow = {
  id: string
  project_id: string
  key: string
  created_by: string
  created_at: string
  versions: Array<{
    id: string
    project_id: string
    version: number
    definition: ExperimentDefinition
    status: ExperimentLifecycleState
    created_by: string
    created_at: string
    started_by: string | null
    started_at: string | null
    ended_by: string | null
    ended_at: string | null
    invalidated_by: string | null
    invalidated_at: string | null
  }>
}

export type ExperimentVersionView = {
  id: string
  projectId: string
  version: number
  definition: ExperimentDefinition
  status: ExperimentLifecycleState
  createdBy: string
  createdAt: string
  startedBy: string | null
  startedAt: string | null
  endedBy: string | null
  endedAt: string | null
  invalidatedBy: string | null
  invalidatedAt: string | null
}

export type ExperimentRegistryView = {
  id: string
  projectId: string
  key: string
  createdBy: string
  createdAt: string
  versions: ExperimentVersionView[]
}

export function mapExperimentRegistryRows(
  rows: ExperimentRegistryRelationRow[],
): ExperimentRegistryView[] {
  return rows.map((registry) => ({
    id: registry.id,
    projectId: registry.project_id,
    key: registry.key,
    createdBy: registry.created_by,
    createdAt: registry.created_at,
    versions: [...registry.versions]
      .sort((a, b) => b.version - a.version)
      .map((version) => ({
        id: version.id,
        projectId: version.project_id,
        version: version.version,
        definition: version.definition,
        status: version.status,
        createdBy: version.created_by,
        createdAt: version.created_at,
        startedBy: version.started_by,
        startedAt: version.started_at,
        endedBy: version.ended_by,
        endedAt: version.ended_at,
        invalidatedBy: version.invalidated_by,
        invalidatedAt: version.invalidated_at,
      })),
  }))
}

export function allowedExperimentTargets(
  registry: ExperimentRegistryView,
  candidate: ExperimentVersionView,
): Array<'running' | 'stopped' | 'invalid'> {
  if (candidate.status === 'draft') {
    const hasRunning = registry.versions.some((version) => version.status === 'running')
    const latestEverStarted = Math.max(
      0,
      ...registry.versions
        .filter((version) => version.startedAt !== null)
        .map((version) => version.version),
    )
    return [
      ...(!hasRunning && candidate.version > latestEverStarted ? ['running' as const] : []),
      'invalid',
    ]
  }
  if (candidate.status === 'running') return ['stopped', 'invalid']
  if (candidate.status === 'stopped') return ['invalid']
  return []
}
