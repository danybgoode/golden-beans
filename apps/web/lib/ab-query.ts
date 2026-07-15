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

  // Two separate queries, not one `.in('event', [...])` scoped by feature_id for both: exposure
  // events are feature_id-scoped (Story 4.2 tags them with the experiment key), but a real metric
  // event (checkout_completed, signup, ...) fired through the normal track() path won't carry
  // featureId set to an unrelated experiment's key — that's not how business events get tracked,
  // and requiring it would silently report 0 conversions for the realistic case instead of the
  // caller's actual data. computeVariantComparison already scopes correctly by only counting a
  // conversion for an exposed user (via the userId join) — it doesn't need the metric row itself
  // to carry this experiment's feature_id.
  const { data: exposureRows, error: exposureError } = await supabase
    .from('events')
    .select('user_id, tags')
    .eq('project_id', projectId)
    .eq('feature_id', experimentKey)
    .eq('event', 'experiment_exposed')
  if (exposureError) {
    console.error('[ab-query] exposure events query failed:', exposureError)
    return { ok: false, reason: 'query_failed' }
  }

  const { data: metricRows, error: metricError } = await supabase
    .from('events')
    .select('user_id')
    .eq('project_id', projectId)
    .eq('event', metricEvent)
  if (metricError) {
    console.error('[ab-query] metric events query failed:', metricError)
    return { ok: false, reason: 'query_failed' }
  }

  const abEvents: AbEvent[] = [
    ...(exposureRows ?? []).map((e) => ({
      userId: e.user_id,
      event: 'experiment_exposed',
      variant: ((e.tags as Record<string, unknown> | null)?.variant as string | undefined) ?? null,
    })),
    ...(metricRows ?? []).map((e) => ({ userId: e.user_id, event: metricEvent, variant: null })),
  ]

  return {
    ok: true,
    project: { slug: projectSlug },
    experimentKey,
    metricEvent,
    comparison: computeVariantComparison(abEvents, metricEvent),
  }
}
