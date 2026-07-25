import 'server-only'
import { getSupabaseServiceClient } from './supabase'

// pod-report · Sprint 1, Story 1.1 — the read side of the rendering primitive.
//
// Every hub view (journey, drill-down, horizon) renders THE LATEST artifact for a tenant, and they
// all come through here. One read path, one place where the tenant scope is applied — the same
// reasoning as lib/{tars,north-star,ab}-query.ts being the canonical reads instead of each page
// querying `events` ad hoc (AGENTS rule #1).

export type ReportArtifactKind = 'roadmap' | 'pod_report'

export type ReportArtifact<T = unknown> = {
  id: string
  version: number
  schemaVersion: number
  payload: T
  sourceCommit: string | null
  sourceRef: string | null
  generatedAt: string
  createdAt: string
}

/**
 * The latest artifact of `kind` for `projectId`, or null when the tenant has never pushed one.
 *
 * `projectId` is REQUIRED and is always resolved server-side by the caller — from the request's
 * hashed API key, or from an allow-listed slug. It is never taken from a request body (AGENTS: no
 * request-derived read path may cross projects). Passing it explicitly rather than reading ambient
 * state is what makes that reviewable at every call site.
 *
 * Returns exactly `payload` and nothing derived, which is what makes the migration's single write
 * cap on `payload` sufficient: write-accept implies read-accept by construction, with no second
 * bound to drift out of step (Roadmap/LEARNINGS.md — the two-layer measurement trap).
 */
export async function getLatestArtifact<T = unknown>(
  projectId: string,
  kind: ReportArtifactKind
): Promise<ReportArtifact<T> | null> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('report_artifacts')
    .select('id, version, schema_version, payload, source_commit, source_ref, generated_at, created_at')
    .eq('project_id', projectId)
    .eq('kind', kind)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[report-artifacts] read failed:', error)
    // A read failure and "nothing pushed yet" must NOT look the same to the caller: the hub renders
    // a deliberate, friendly empty state for the second, and that empty state would otherwise mask
    // a broken database as "no data yet" — a zero that pages nobody (Roadmap/LEARNINGS.md).
    throw new Error('Failed to read report artifact')
  }
  if (!data) return null

  return {
    id: data.id,
    version: data.version,
    schemaVersion: data.schema_version,
    payload: data.payload as T,
    sourceCommit: data.source_commit,
    sourceRef: data.source_ref,
    generatedAt: data.generated_at,
    createdAt: data.created_at,
  }
}
