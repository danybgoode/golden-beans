import 'server-only'
import { getSupabaseServiceClient } from './supabase'
import { getLatestArtifact, type ReportArtifact } from './report-artifacts'
import { summarizeRoadmap, type RoadmapRow } from './roadmap-artifact-schema'

// pod-report · Sprint 1, Story 1.2 — the journey view and the epic drill-down's single read path.
//
// Same shape as lib/tars-query.ts: resolves the URL's `projectSlug` to a project_id SERVER-SIDE
// (never trusting a URL segment as an id — AGENTS: no request-derived read path may cross
// projects) and hands back the SAME summarized artifact both hub pages render, so "what counts as
// shipped" and "how sprints nest under an epic" stay derived in exactly one place
// (roadmap-artifact-schema.ts's summarizeRoadmap) instead of each page re-querying and
// re-deriving slightly differently.

export type RoadmapArtifactPayload = { items: RoadmapRow[] }
export type RoadmapSummary = ReturnType<typeof summarizeRoadmap>

export type HubRoadmapResult =
  | { ok: true; artifact: ReportArtifact<RoadmapArtifactPayload>; summary: RoadmapSummary }
  // 'project_not_found' → notFound(); 'no_artifact' → the deliberate empty state; 'query_failed' →
  // throw (a broken database must never render identically to "nothing pushed yet").
  | { ok: false; reason: 'project_not_found' | 'no_artifact' | 'query_failed' }

export async function getHubRoadmap(projectSlug: string): Promise<HubRoadmapResult> {
  const supabase = getSupabaseServiceClient()
  const { data: project, error } = await supabase
    .from('projects')
    .select('id')
    .eq('slug', projectSlug)
    .maybeSingle()
  if (error) {
    console.error('[hub-query] project lookup failed:', error)
    return { ok: false, reason: 'query_failed' }
  }
  if (!project) return { ok: false, reason: 'project_not_found' }

  const artifact = await getLatestArtifact<RoadmapArtifactPayload>(project.id as string, 'roadmap')
  if (!artifact) return { ok: false, reason: 'no_artifact' }

  const items = Array.isArray(artifact.payload?.items) ? artifact.payload.items : []
  return { ok: true, artifact, summary: summarizeRoadmap(items) }
}
