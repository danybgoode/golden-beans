import 'server-only'
import { getSupabaseServiceClient } from './supabase'
import { isSignalsEnabled } from './flags'
import {
  DEFAULT_FRICTION_RULES,
  evaluateFriction,
  type FrictionRule,
  type FunnelCounts,
} from './friction-rules'
import { computeSignalFingerprint, signalTitle } from './signal-fingerprint'

// signals-loop · Sprint 1, Story 1.3 — lazy, project-scoped friction evaluation.
//
// ── Why there is no cron here, and why that was the whole point ───────────────────────────────
// The obvious design is a scheduled sweep, like `dispatch-deliveries`. It would need a
// `projects_with_friction_due()` function — a cross-tenant read — and therefore a NEW ROW in
// AGENTS.md's scheduler-exemption registry. That file is explicit that such a row is a deliberate,
// recorded decision and "never inferred by analogy" from an existing one, and that an agent who
// thinks it needs a new exemption almost certainly does not.
//
// It doesn't. Detection runs inside read paths that have ALREADY resolved exactly one tenant, for
// that tenant only (epic README, Amendment 3 — Daniel, 2026-07-26). No cross-tenant read exists to
// exempt. The accepted cost, stated plainly: a friction signal materialises when someone or their
// agent looks, not before. For a queue whose entire purpose is to be pulled, that is the right
// trade — and it is reversible into a cron later without changing anything a caller sees.

/** How long a project's evaluation stands before another read may redo it. */
export const FRICTION_THROTTLE_SECONDS = 900

/**
 * Loads a project's rules, falling back to the conservative defaults.
 *
 * A project with NO rows uses `DEFAULT_FRICTION_RULES`, so friction works out of the box and tuning
 * is opt-in. Where a project HAS rows, they replace the defaults wholesale rather than merging:
 * a half-overridden rule set is the shape where someone disables a detector, sees it keep firing
 * from a default they forgot about, and stops trusting the whole feature.
 */
export async function loadFrictionRules(projectId: string): Promise<readonly FrictionRule[]> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('friction_rules')
    .select('key, kind, threshold, min_sample, enabled')
    .eq('project_id', projectId)
    .order('key', { ascending: true })

  if (error) {
    console.error('[friction] rule load failed:', error)
    return DEFAULT_FRICTION_RULES
  }
  if (!data || data.length === 0) return DEFAULT_FRICTION_RULES

  return data.map((r) => ({
    key: r.key as string,
    kind: r.kind as FrictionRule['kind'],
    threshold: Number(r.threshold),
    minSample: r.min_sample as number,
    enabled: r.enabled as boolean,
  }))
}

/**
 * Evaluates one project's friction detectors and persists any findings as `$friction` signals.
 *
 * Returns the number of findings recorded, or `null` when the evaluation was SKIPPED — either
 * because the seam is dark or because another reader already holds this window. `null` and `0` are
 * deliberately different: "we looked and found nothing" and "we did not look" must not read the
 * same to a caller deciding whether to show an empty state.
 */
export async function evaluateFrictionForProject(
  projectId: string,
  options: { force?: boolean } = {},
): Promise<number | null> {
  if (!isSignalsEnabled()) return null

  const supabase = getSupabaseServiceClient()

  // ── The throttle claim, and why it is not an advisory lock ──────────────────────────────────
  // A transaction-scoped advisory lock (`pg_try_advisory_xact_lock`) would be released when the RPC
  // returns — BEFORE the evaluation below runs — so every concurrent reader would acquire it in
  // turn and every one of them would do the work. A lock that reads as protection and provides
  // none is worse than no lock, because it stops anyone looking again.
  //
  // `claim_friction_evaluation` is a single conditional UPDATE instead: exactly one caller can
  // match the predicate and move the stamp, and the losers see zero rows because the winner's
  // committed write moved the row out of their WHERE clause. See the migration for the full note.
  const { data: claimed, error: claimError } = await supabase.rpc('claim_friction_evaluation', {
    p_project_id: projectId,
    p_throttle_seconds: options.force ? 0 : FRICTION_THROTTLE_SECONDS,
  })

  if (claimError) {
    console.error('[friction] claim failed:', claimError)
    return null
  }
  if (claimed !== true) return null

  const [rules, funnels] = await Promise.all([
    loadFrictionRules(projectId),
    loadProjectFunnels(projectId),
  ])

  const findings = evaluateFriction(rules, funnels)

  for (const finding of findings) {
    const fingerprint = computeSignalFingerprint({
      kind: 'friction',
      name: finding.ruleKey,
      // The DESCRIPTION, which is stable for a given situation, not the observed ratio — which
      // drifts by a fraction of a percent on every evaluation. Fingerprinting a moving number would
      // create a brand-new signal each time the detector ran, which is the noise failure the epic
      // names as its own biggest risk to trust in the queue.
      message: finding.description,
      stack: null,
      featureId: finding.featureKey,
    })

    const { error } = await supabase.rpc('record_signal', {
      p_project_id: projectId,
      p_kind: 'friction',
      p_fingerprint: fingerprint,
      p_title: signalTitle(finding.kind, finding.description),
      p_feature_id: finding.featureKey,
      // Friction is DERIVED from an aggregate over many users, so there is no single user to
      // attribute it to. Passing null keeps users_affected at 0 rather than inventing a "1" that
      // would make the impact rank (users × frequency) silently wrong.
      p_user_id: null,
      p_sample: {
        rule: finding.ruleKey,
        kind: finding.kind,
        feature: finding.featureKey,
        observed: finding.observed,
        threshold: finding.threshold,
        sample: finding.sample,
      },
      p_occurred_at: null,
    })
    if (error) console.error('[friction] record_signal failed:', error)
  }

  return findings.length
}

/**
 * The funnel aggregates the detectors read.
 *
 * Deliberately derived from the SAME registry + events the TARS funnel already reads, rather than a
 * new measurement: friction is a reading of numbers this engine has had since v1, which is why the
 * story ships with no new client instrumentation at all.
 */
async function loadProjectFunnels(projectId: string): Promise<FunnelCounts[]> {
  const supabase = getSupabaseServiceClient()
  const { data: features, error } = await supabase
    .from('features')
    .select('key, target_event, adopted_event, retained_event')
    .eq('project_id', projectId)

  if (error || !features) {
    console.error('[friction] feature load failed:', error)
    return []
  }

  const funnels: FunnelCounts[] = []
  for (const feature of features) {
    const targetEvent = feature.target_event as string | null
    const adoptedEvent = feature.adopted_event as string | null
    const retainedEvent = feature.retained_event as string | null
    // A feature with no declared funnel events has no funnel to have friction in. Skipped rather
    // than counted as zeros, which would make every unconfigured feature look like a dead end.
    if (!targetEvent || !adoptedEvent) continue

    const [targeted, adopted, retained] = await Promise.all([
      countDistinctUsers(projectId, feature.key as string, targetEvent),
      countDistinctUsers(projectId, feature.key as string, adoptedEvent),
      retainedEvent ? countDistinctUsers(projectId, feature.key as string, retainedEvent) : Promise.resolve(0),
    ])

    funnels.push({ featureKey: feature.key as string, targeted, adopted, retained })
  }

  // Sorted by key so two evaluations over the same data emit findings in the same order — the
  // "deterministic on rerun" acceptance criterion, at the seam where it is easiest to lose.
  return funnels.sort((a, b) => a.featureKey.localeCompare(b.featureKey))
}

async function countDistinctUsers(
  projectId: string,
  featureKey: string,
  event: string,
): Promise<number> {
  const supabase = getSupabaseServiceClient()
  // `feature_id` is filtered here for the same reason lib/tars-query.ts filters it — and it is worth
  // naming the scar: an event written WITHOUT a feature tag belongs to no funnel and is invisible
  // forever, which shipped to production once and read as an honest zero for weeks
  // (Roadmap/LEARNINGS.md, the bug class this repo has now hit three times).
  const { data, error } = await supabase
    .from('events')
    .select('user_id')
    .eq('project_id', projectId)
    .eq('feature_id', featureKey)
    .eq('event', event)

  if (error) {
    console.error('[friction] count failed:', error)
    return 0
  }
  return new Set((data ?? []).map((r) => r.user_id as string)).size
}
