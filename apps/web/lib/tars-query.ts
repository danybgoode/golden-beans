import 'server-only'
import { getSupabaseServiceClient } from './supabase'
import { computeTars, type TarsEvent } from './tars'

// Growth Engine v1 · Sprint 2, Story 2.3 — the DB-touching half of the funnel. Shared by
// both the authed JSON endpoint (app/api/v1/features/[key]/funnel/route.ts) and the
// unauthed funnel page (app/funnel/[projectSlug]/[featureKey]/page.tsx), so the page
// doesn't need its own Bearer credential to read its own project's data.

export type FunnelResult =
  | {
      ok: true
      project: { slug: string }
      feature: {
        key: string
        enabled: boolean
        targetEvent: string | null
        adoptedEvent: string | null
        retainedEvent: string | null
        retentionDays: number
        syncedAt: string
      }
      tars: ReturnType<typeof computeTars>
    }
  | { ok: false; reason: 'project_not_found' | 'feature_not_found' | 'query_failed' }

export async function getFeatureFunnel(projectSlug: string, featureKey: string): Promise<FunnelResult> {
  const supabase = getSupabaseServiceClient()
  const { data: project, error } = await supabase
    .from('projects')
    .select('id, slug')
    .eq('slug', projectSlug)
    .maybeSingle()
  if (error) {
    console.error('[tars-query] project lookup failed:', error)
    return { ok: false, reason: 'query_failed' }
  }
  if (!project) return { ok: false, reason: 'project_not_found' }
  return getFeatureFunnelByProjectId(project.id, project.slug, featureKey)
}

// Used by the Bearer-authed API route, which has already resolved `project_id` from the
// API key (Decision 8 — never re-trust a client-supplied project identifier).
export async function getFeatureFunnelByProjectId(
  projectId: string,
  projectSlug: string,
  featureKey: string,
): Promise<FunnelResult> {
  const supabase = getSupabaseServiceClient()
  const project = { id: projectId, slug: projectSlug }

  const { data: feature, error: featureError } = await supabase
    .from('features')
    .select('key, enabled, target_event, adopted_event, retained_event, retention_days, synced_at')
    .eq('project_id', project.id)
    .eq('key', featureKey)
    .maybeSingle()
  if (featureError) {
    console.error('[tars-query] feature lookup failed:', featureError)
    return { ok: false, reason: 'query_failed' }
  }
  if (!feature) return { ok: false, reason: 'feature_not_found' }

  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('user_id, event, created_at')
    .eq('project_id', project.id)
    .eq('feature_id', featureKey)
  if (eventsError) {
    console.error('[tars-query] events query failed:', eventsError)
    return { ok: false, reason: 'query_failed' }
  }

  const tarsEvents: TarsEvent[] = (events ?? []).map((e) => ({
    userId: e.user_id,
    event: e.event,
    createdAt: e.created_at,
  }))

  const tars = computeTars(tarsEvents, {
    enabled: feature.enabled,
    targetEvent: feature.target_event,
    adoptedEvent: feature.adopted_event,
    retainedEvent: feature.retained_event,
    retentionDays: feature.retention_days,
  })

  return {
    ok: true,
    project: { slug: project.slug },
    feature: {
      key: feature.key,
      enabled: feature.enabled,
      targetEvent: feature.target_event,
      adoptedEvent: feature.adopted_event,
      retainedEvent: feature.retained_event,
      retentionDays: feature.retention_days,
      syncedAt: feature.synced_at,
    },
    tars,
  }
}
