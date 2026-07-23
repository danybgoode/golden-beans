import type { JourneyDefinition } from './journey-definition'

// One embedded PostgREST relationship = one SQL statement/snapshot. Keep the select string shared
// with the focused DB proof so a relationship-name drift cannot leave the app untested.
export const JOURNEY_REGISTRY_RELATIONAL_SELECT = `
  id,
  key,
  active_version_id,
  created_by,
  created_at,
  versions:journey_definition_versions!journey_definition_versions_journey_fk(
    id,
    version,
    definition,
    created_by,
    created_at,
    activated_by,
    activated_at
  )
`

export type JourneyRegistryRelationRow = {
  id: string
  key: string
  active_version_id: string | null
  created_by: string
  created_at: string
  versions: Array<{
    id: string
    version: number
    definition: JourneyDefinition
    created_by: string
    created_at: string
    activated_by: string | null
    activated_at: string | null
  }>
}

export type JourneyVersionView = {
  id: string
  version: number
  definition: JourneyDefinition
  createdBy: string
  createdAt: string
  activatedBy: string | null
  activatedAt: string | null
  state: 'draft' | 'active' | 'superseded'
}

export type JourneyRegistryView = {
  id: string
  key: string
  activeVersionId: string | null
  createdBy: string
  createdAt: string
  versions: JourneyVersionView[]
}

export function canActivateJourneyVersion(
  registry: JourneyRegistryView,
  candidate: JourneyVersionView,
): boolean {
  if (candidate.state !== 'draft') return false
  if (registry.activeVersionId === null) return true
  const active = registry.versions.find((version) => version.id === registry.activeVersionId)
  return active !== undefined && candidate.version > active.version
}

export function mapJourneyRegistryRows(rows: JourneyRegistryRelationRow[]): JourneyRegistryView[] {
  return rows.map((registry) => {
    const sortedVersions = [...registry.versions].sort((a, b) => b.version - a.version)
    const activeVersion = sortedVersions.find((version) => version.id === registry.active_version_id)
    // Once a later version is active, a never-activated older draft cannot become active and cannot
    // be edited (versions are immutable). Keep activation history plus newer actionable drafts, but
    // do not expose those obsolete dead-end documents in the management view.
    const visibleVersions = sortedVersions.filter(
      (version) =>
        activeVersion === undefined ||
        version.activated_at !== null ||
        version.version > activeVersion.version,
    )

    return {
      id: registry.id,
      key: registry.key,
      activeVersionId: registry.active_version_id,
      createdBy: registry.created_by,
      createdAt: registry.created_at,
      versions: visibleVersions.map((version) => ({
        id: version.id,
        version: version.version,
        definition: version.definition,
        createdBy: version.created_by,
        createdAt: version.created_at,
        activatedBy: version.activated_by,
        activatedAt: version.activated_at,
        state:
          registry.active_version_id === version.id
            ? 'active'
            : version.activated_at
              ? 'superseded'
              : 'draft',
      })),
    }
  })
}
