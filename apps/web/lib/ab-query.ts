import 'server-only'
import { getSupabaseServiceClient } from './supabase'
import { computeVariantComparison, type AbEvent } from './ab'

// Growth Engine v1 · Sprint 4, Story 4.3 — the DB-touching half of the variant comparison view.
// Shared by both the authed JSON endpoint (app/api/v1/experiments/[key]/compare/route.ts) and the
// unauthed comparison page (app/experiments/[projectSlug]/[experimentKey]/page.tsx), same split as
// tars-query.ts / north-star-query.ts. No experiments registry table — computed live from the
// events Sprint 1's `/v1/track` (and Story 4.1/4.2's SDK) already persist.

export type ExperimentComparisonResult =
  | {
      ok: true
      project: { slug: string }
      experimentKey: string
      metricEvent: string
      comparison: ReturnType<typeof computeVariantComparison>
    }
  | { ok: false; reason: 'project_not_found' | 'query_failed' }

export async function getExperimentComparison(
  projectSlug: string,
  experimentKey: string,
  metricEvent: string,
): Promise<ExperimentComparisonResult> {
  const supabase = getSupabaseServiceClient()
  const { data: project, error } = await supabase
    .from('projects')
    .select('id, slug')
    .eq('slug', projectSlug)
    .maybeSingle()
  if (error) {
    console.error('[ab-query] project lookup failed:', error)
    return { ok: false, reason: 'query_failed' }
  }
  if (!project) return { ok: false, reason: 'project_not_found' }
  return getExperimentComparisonByProjectId(project.id, project.slug, experimentKey, metricEvent)
}

// Used by the Bearer-authed API route, which has already resolved `project_id` from the API key
// (Decision 8 — never re-trust a client-supplied project identifier).
export async function getExperimentComparisonByProjectId(
  projectId: string,
  projectSlug: string,
  experimentKey: string,
  metricEvent: string,
): Promise<ExperimentComparisonResult> {
  const supabase = getSupabaseServiceClient()

  const { data: events, error } = await supabase
    .from('events')
    .select('user_id, event, tags')
    .eq('project_id', projectId)
    .eq('feature_id', experimentKey)
    .in('event', [...new Set(['experiment_exposed', metricEvent])])
  if (error) {
    console.error('[ab-query] events query failed:', error)
    return { ok: false, reason: 'query_failed' }
  }

  const abEvents: AbEvent[] = (events ?? []).map((e) => ({
    userId: e.user_id,
    event: e.event,
    variant:
      e.event === 'experiment_exposed'
        ? ((e.tags as Record<string, unknown> | null)?.variant as string | undefined) ?? null
        : null,
  }))

  return {
    ok: true,
    project: { slug: projectSlug },
    experimentKey,
    metricEvent,
    comparison: computeVariantComparison(abEvents, metricEvent),
  }
}
