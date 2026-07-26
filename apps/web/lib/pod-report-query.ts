import 'server-only'
import { getSupabaseServiceClient } from './supabase'
import { getLatestArtifact, type ReportArtifact } from './report-artifacts'
import { getFeatureFunnelByProjectId } from './tars-query'
import { buildPodReportView, type PodReportView } from './pod-report-view'
import { buildOutcomeSection, type OutcomeSection } from './pod-outcome'
import { applyLens, type PodReportLens } from './pod-report-lens'

// pod-report · Sprint 2.5d — the Pod Report's single read path.
//
// Same shape as lib/hub-query.ts: resolve the slug to a project_id SERVER-SIDE, read through the
// canonical seams, hand back one already-lensed object. Every surface that shows a Pod Report —
// the internal hub page, and Sprint 3's share links — comes through here, so "what a client may
// see" is decided in one place rather than re-derived per route.
//
// ── Why the report is a JOIN and not one stored document ──────────────────────────────────────
// The delivery half is computed by a Node script from a git checkout and pushed (Story 1.1's
// client-pushes rail); the outcome half needs the engine's own database, which that script has no
// business holding credentials for. So a STORED delivery artifact meets a LIVE outcome read at
// render time. That also makes the adoption numbers current rather than frozen at generation,
// which is what any reader assumes of something labelled "adoption".

export type PodReportResult =
  | {
      ok: true
      artifact: ReportArtifact
      view: PodReportView
      outcome: OutcomeSection
      lens: PodReportLens
    }
  // 'project_not_found' → notFound(); 'no_artifact' → the deliberate empty state; 'query_failed' →
  // throw at the caller. A broken database must never render identically to "nothing pushed yet"
  // (Roadmap/LEARNINGS.md — a zero that pages nobody).
  | { ok: false; reason: 'project_not_found' | 'no_artifact' | 'query_failed' }

/**
 * Read the latest Pod Report for a tenant, through a lens.
 *
 * `lens` is a parameter and not a default because every caller resolves it from a credential the
 * viewer presented — a session for the internal page, a share token for Sprint 3. There is no
 * "the usual lens": a route that forgot to decide would otherwise silently get the widest one.
 */
export async function getPodReport(projectSlug: string, lens: PodReportLens): Promise<PodReportResult> {
  const supabase = getSupabaseServiceClient()
  const { data: project, error } = await supabase
    .from('projects')
    .select('id')
    .eq('slug', projectSlug)
    .maybeSingle()
  if (error) {
    console.error('[pod-report-query] project lookup failed:', error)
    return { ok: false, reason: 'query_failed' }
  }
  if (!project) return { ok: false, reason: 'project_not_found' }

  const projectId = project.id as string

  let artifact: ReportArtifact | null
  try {
    artifact = await getLatestArtifact(projectId, 'pod_report')
  } catch {
    // getLatestArtifact throws on a real query failure and returns null for "never pushed" — the
    // distinction the empty state depends on. Preserve it rather than collapsing both to null.
    return { ok: false, reason: 'query_failed' }
  }
  if (!artifact) return { ok: false, reason: 'no_artifact' }

  const view = applyLens(buildPodReportView(artifact.payload), lens)
  const outcome = await readOutcome(projectId, projectSlug)

  return { ok: true, artifact, view, outcome, lens }
}

/**
 * The live outcome half.
 *
 * Reads the tenant's REGISTERED features and asks lib/tars-query.ts for each one's funnel — the
 * canonical read path, never a fresh query against `events` (AGENTS rule #1). A feature whose
 * funnel cannot be read yields a null-funnel row carrying its own caveat, not a row of zeros:
 * "we could not read this" and "nobody adopted it" are opposite facts and must not render alike.
 *
 * A tenant with no registered features gets an empty row list, which the page renders as "not
 * instrumented". That is the truthful answer for a pod that has not wired the engine to its
 * product yet, and it is a far better sales artifact than three confident zeros.
 */
async function readOutcome(projectId: string, projectSlug: string): Promise<OutcomeSection> {
  const supabase = getSupabaseServiceClient()

  const { data: features, error } = await supabase
    .from('features')
    .select('key')
    .eq('project_id', projectId)
    .eq('enabled', true)
    // Bounded on purpose. The outcome section is a summary, not an inventory, and an unbounded
    // fan-out of funnel queries would make one tenant's feature count the page's latency budget.
    .order('key', { ascending: true })
    .limit(8)

  if (error) {
    console.error('[pod-report-query] feature list failed:', error)
    // ── Cross-review (Agy, PR #33) caught this being wrong in exactly the way its own comment
    // warned about ──────────────────────────────────────────────────────────────────────────────
    // The previous version returned `features: []` here, which the renderer showed as "no features
    // are registered, so there is no adoption to read" — a truthful-sounding sales sentence produced
    // by a database outage. The comment said "a read failure produces NO rows and no claim"; the
    // code produced a claim. That is the prose-as-evidence trap this repo has a LEARNINGS entry for.
    //
    // `unavailable: true` is a THIRD state, deliberately not a thrown error: the delivery half of
    // this report is fine and still worth rendering, so failing the whole page would destroy real
    // information to report a partial failure. The renderer says the layer could not be read.
    return buildOutcomeSection({ tenant: projectSlug, features: [], northStar: null, unavailable: true })
  }

  const keys = (features ?? []).map((f) => f.key as string)
  const rows = await Promise.all(
    keys.map(async (key) => {
      const funnel = await getFeatureFunnelByProjectId(projectId, projectSlug, key)
      if (!funnel.ok) return { key, tars: null }
      return {
        key,
        tars: {
          targeted: funnel.tars.targeted,
          adopted: funnel.tars.adopted,
          retained: funnel.tars.retained,
        },
      }
    })
  )

  return buildOutcomeSection({ tenant: projectSlug, features: rows, northStar: await readNorthStar(projectId) })
}

/**
 * The North-Star level, if one is registered.
 *
 * Deliberately reports a LEVEL and never a trend: `OUTCOME_NOT_INSTRUMENTED` already declares that
 * movement needs at least two recorded values, and drawing a direction through one point would
 * invent it. `latestValue` stays null when nothing has been recorded — distinct from a recorded
 * zero, which lib/pod-outcome.ts turns into two different sentences.
 */
async function readNorthStar(
  projectId: string
): Promise<{
  metric: string | null
  inputCount: number | null
  latestValue: number | null
  unavailable?: boolean
} | null> {
  const supabase = getSupabaseServiceClient()

  const { data: metric, error } = await supabase
    .from('north_star_metrics')
    .select('key')
    .eq('project_id', projectId)
    .maybeSingle()
  if (error) {
    // NOT `return null`. Cross-review round 2 (Agy): null means "no metric is registered", so
    // collapsing an error into it renders a database failure as a truthful-sounding absence — the
    // same defect fixed one round earlier in readOutcome, in its sibling function. Hardening one
    // instance and leaving the other is precisely what a later review round finds.
    console.error('[pod-report-query] north-star lookup failed:', error)
    return { metric: null, inputCount: null, latestValue: null, unavailable: true }
  }
  if (!metric) return null // genuinely none registered — a truthful answer, not a failure

  const { count, error: countError } = await supabase
    .from('leading_inputs')
    .select('key', { count: 'exact', head: true })
    .eq('project_id', projectId)
  if (countError) console.error('[pod-report-query] leading_inputs count failed:', countError)

  // `count ?? null`, never `?? 0`. Cross-review (Agy, PR #33): a failed count resolves to null, and
  // coercing that to 0 asserts "no leading inputs are registered" on the strength of a query that
  // never answered. Same not-zero rule the rest of this file follows.
  return { metric: metric.key as string, inputCount: count ?? null, latestValue: null }
}
