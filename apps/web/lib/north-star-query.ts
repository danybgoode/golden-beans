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

/**
 * The PROJECT's North Star — mockups-as-built Story 3.1, reference state `measure-north-star`.
 *
 * ⚠️ **`metric` is the registration and `latestValue` is deliberately absent from this shape.** The
 * schema has no table holding a level for the metric itself: `north_star_metrics` registers a key,
 * `leading_inputs` registers the things that feed it, and `input_values` belongs to an INPUT.
 * `readNorthStar` in `lib/pod-report-query.ts` says the same thing and returns `latestValue: null`
 * unconditionally. A field here would be a slot that is always empty, read by a page that would then
 * have to explain the emptiness anyway — so the page states it once, in words, and this type does
 * not pretend there is a number coming.
 *
 * This is the same read `/app/impact/[projectSlug]/[featureKey]` performs, WITHOUT the
 * `feature_inputs` join: that page answers "what does this feature feed", this one answers "what
 * feeds the North Star", and the second is not a subset of the first — an input attached to no
 * feature is invisible to the feature-scoped read and still feeds the metric.
 */
export type ProjectNorthStarResult =
  | {
      ok: true
      project: { slug: string }
      metricKey: string | null
      inputs: FeatureImpactInput[]
    }
  | { ok: false; reason: 'project_not_found' | 'query_failed' }

export async function getFeatureImpact(
  projectSlug: string,
  featureKey: string
): Promise<FeatureImpactResult> {
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
  featureKey: string
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

    const read = await readInputSeries(projectId, link.input_id, input, featureKey)
    if (!read.ok) return { ok: false, reason: 'query_failed' }
    const series = read.series

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

/**
 * One input's series, from whichever of the two sources it declares.
 *
 * ⚠️ **Extracted so the feature-scoped and project-scoped reads cannot disagree.** They were one
 * body until Story 3.1 needed the second; two copies of "how a telemetry input becomes a daily
 * series" is exactly the CODE-QUALITY #2 shape the block vocabulary is also written against.
 *
 * `featureKey` is optional, and its absence is the whole difference between the two callers: the
 * feature page counts the events THIS feature emitted, and the North Star page counts every event
 * matching the input's source event across the project. Narrowing the project read to one feature
 * would silently under-count the metric's own inputs.
 */
async function readInputSeries(
  projectId: string,
  inputId: string,
  input: { value_source: 'telemetry_event' | 'external_push'; source_event: string | null },
  featureKey?: string
): Promise<{ ok: true; series: DailySeriesPoint[] } | { ok: false }> {
  const supabase = getSupabaseServiceClient()
  // `source_event` is required by the sync schema (lib/north-star-schema.ts) whenever
  // value_source is 'telemetry_event' — the null case can't happen through the API, but
  // TypeScript can't see that correlation across a nullable DB column, so guard it here.
  if (input.value_source === 'telemetry_event' && input.source_event) {
    const sourceEvent = input.source_event
    let query = supabase
      .from('events')
      .select('event, created_at')
      .eq('project_id', projectId)
      .eq('event', sourceEvent)
    if (featureKey !== undefined) query = query.eq('feature_id', featureKey)
    const { data: events, error: eventsError } = await query
    if (eventsError) {
      console.error('[north-star-query] events query failed:', eventsError)
      return { ok: false }
    }
    return {
      ok: true,
      series: computeDailySeries(
        (events ?? []).map((e) => ({ event: e.event, createdAt: e.created_at })),
        sourceEvent
      ),
    }
  }
  if (input.value_source === 'telemetry_event') {
    return { ok: true, series: [] } // defensive only — unreachable via the API's own write path
  }
  const { data: values, error: valuesError } = await supabase
    .from('input_values')
    .select('occurred_on, value')
    .eq('project_id', projectId)
    .eq('input_id', inputId)
    .order('occurred_on')
  if (valuesError) {
    console.error('[north-star-query] input_values query failed:', valuesError)
    return { ok: false }
  }
  return {
    ok: true,
    series: (values ?? []).map((v) => ({ date: v.occurred_on, value: Number(v.value) })),
  }
}

/**
 * Everything the `measure-north-star` state needs, for a project rather than a feature.
 *
 * ⚠️ **A registered metric with no inputs and an unregistered metric are DIFFERENT answers**, and so
 * is a failed query — the same rule `readNorthStar` follows one file over. `metricKey: null` with
 * `ok: true` means nothing is registered; a read that fails returns `ok: false` and the page throws
 * rather than rendering an outage as a truthful-sounding absence.
 */
export async function getProjectNorthStarByProjectId(
  projectId: string,
  projectSlug: string
): Promise<ProjectNorthStarResult> {
  const supabase = getSupabaseServiceClient()

  const { data: metric, error: metricError } = await supabase
    .from('north_star_metrics')
    .select('key')
    .eq('project_id', projectId)
    .maybeSingle()
  if (metricError) {
    console.error('[north-star-query] north_star_metrics lookup failed:', metricError)
    return { ok: false, reason: 'query_failed' }
  }

  const { data: rows, error: inputsError } = await supabase
    .from('leading_inputs')
    .select('id, key, name, value_source, source_event, north_star_metrics(key)')
    .eq('project_id', projectId)
    .order('key')
  if (inputsError) {
    console.error('[north-star-query] leading_inputs lookup failed:', inputsError)
    return { ok: false, reason: 'query_failed' }
  }

  const inputs: FeatureImpactInput[] = []
  for (const row of rows ?? []) {
    // supabase-js types a to-one joined relation loosely when no generated Database type is wired
    // up — the same cast `getFeatureImpactByProjectId` makes above, for the same reason.
    const joined = row as unknown as {
      id: string
      key: string
      name: string
      value_source: 'telemetry_event' | 'external_push'
      source_event: string | null
      north_star_metrics: { key: string } | null
    }
    const read = await readInputSeries(projectId, joined.id, joined)
    if (!read.ok) return { ok: false, reason: 'query_failed' }
    inputs.push({
      key: joined.key,
      name: joined.name,
      metricKey: joined.north_star_metrics?.key ?? '',
      valueSource: joined.value_source,
      series: read.series,
    })
  }

  return {
    ok: true,
    project: { slug: projectSlug },
    metricKey: (metric?.key as string | undefined) ?? null,
    inputs,
  }
}
