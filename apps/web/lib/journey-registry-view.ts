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

export function mapJourneyRegistryRows(rows: JourneyRegistryRelationRow[]): JourneyRegistryView[] {
  return rows.map((registry) => ({
    id: registry.id,
    key: registry.key,
    activeVersionId: registry.active_version_id,
    createdBy: registry.created_by,
    createdAt: registry.created_at,
    versions: [...registry.versions]
      .sort((a, b) => b.version - a.version)
      .map((version) => ({
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
  }))
}
