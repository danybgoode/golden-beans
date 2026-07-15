import 'server-only'
import { getSupabaseServiceClient } from './supabase'
import { computeDailySeries, type DailySeriesPoint } from './north-star'

// Growth Engine v1 · Sprint 3, Story 3.4 — the DB-touching half of the per-feature
// impact report. Shared by both the authed JSON endpoint
// (app/api/v1/features/[key]/impact/route.ts) and the unauthed impact page
// (app/impact/[projectSlug]/[featureKey]/page.tsx), mirroring lib/tars-query.ts's shape
// exactly (same page-needs-no-Bearer-credential rationale).

export interface FeatureImpactInput {
  key: string
  name: string
  metricKey: string
  valueSource: 'telemetry_event' | 'external_push'
  series: DailySeriesPoint[]
}

export type FeatureImpactResult =
  | { ok: true; project: { slug: string }; feature: { key: string }; inputs: FeatureImpactInput[] }
  | { ok: false; reason: 'project_not_found' | 'feature_not_found' | 'query_failed' }

export async function getFeatureImpact(projectSlug: string, featureKey: string): Promise<FeatureImpactResult> {
  const supabase = getSupabaseServiceClient()
  const { data: project, error } = await supabase
    .from('projects')
    .select('id, slug')
    .eq('slug', projectSlug)
    .maybeSingle()
  if (error) {
    console.error('[north-star-query] project lookup failed:', error)
    return { ok: false, reason: 'query_failed' }
  }
  if (!project) return { ok: false, reason: 'project_not_found' }
  return getFeatureImpactByProjectId(project.id, project.slug, featureKey)
}

// Used by the Bearer-authed API route, which has already resolved `project_id` from the
// API key (Decision 8 — never re-trust a client-supplied project identifier).
export async function getFeatureImpactByProjectId(
  projectId: string,
  projectSlug: string,
  featureKey: string,
): Promise<FeatureImpactResult> {
  const supabase = getSupabaseServiceClient()

  const { data: links, error: linksError } = await supabase
    .from('feature_inputs')
    .select('input_id, leading_inputs(key, name, value_source, source_event, north_star_metrics(key))')
    .eq('project_id', projectId)
    .eq('feature_key', featureKey)
  if (linksError) {
    console.error('[north-star-query] feature_inputs lookup failed:', linksError)
    return { ok: false, reason: 'query_failed' }
  }
  if (!links || links.length === 0) return { ok: false, reason: 'feature_not_found' }

  const inputs: FeatureImpactInput[] = []
  for (const link of links) {
    // supabase-js types a to-one joined relation loosely (sometimes as an array) when no
    // generated Database type is wired up — same situation lib/tars-query.ts works around
    // for `projects.slug`. The runtime shape here is a single object (or null); cast it
    // explicitly once so every subsequent property access below is properly typed.
    const input = link.leading_inputs as unknown as {
      key: string
      name: string
      value_source: 'telemetry_event' | 'external_push'
      source_event: string | null
      north_star_metrics: { key: string } | null
    } | null
    if (!input) continue

    let series: DailySeriesPoint[]
    // `source_event` is required by the sync schema (lib/north-star-schema.ts) whenever
    // value_source is 'telemetry_event' — the null case can't happen through the API, but
    // TypeScript can't see that correlation across a nullable DB column, so guard it here.
    if (input.value_source === 'telemetry_event' && input.source_event) {
      const sourceEvent = input.source_event
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('event, created_at')
        .eq('project_id', projectId)
        .eq('feature_id', featureKey)
        .eq('event', sourceEvent)
      if (eventsError) {
        console.error('[north-star-query] events query failed:', eventsError)
        return { ok: false, reason: 'query_failed' }
      }
      series = computeDailySeries(
        (events ?? []).map((e) => ({ event: e.event, createdAt: e.created_at })),
        sourceEvent,
      )
    } else if (input.value_source === 'telemetry_event') {
      series = [] // defensive only — unreachable via the API's own write path
    } else {
      const { data: values, error: valuesError } = await supabase
        .from('input_values')
        .select('occurred_on, value')
        .eq('project_id', projectId)
        .eq('input_id', link.input_id)
        .order('occurred_on')
      if (valuesError) {
        console.error('[north-star-query] input_values query failed:', valuesError)
        return { ok: false, reason: 'query_failed' }
      }
      series = (values ?? []).map((v) => ({ date: v.occurred_on, value: Number(v.value) }))
    }

    inputs.push({
      key: input.key,
      name: input.name,
      metricKey: input.north_star_metrics?.key ?? '',
      valueSource: input.value_source,
      series,
    })
  }

  return { ok: true, project: { slug: projectSlug }, feature: { key: featureKey }, inputs }
}
