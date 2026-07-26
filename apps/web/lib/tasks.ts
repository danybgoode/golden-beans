import 'server-only'
import { after } from 'next/server'
import { getSupabaseServiceClient } from './supabase'
import { isSignalsEnabled } from './flags'
import { scrubValue } from './signal-scrub'
import { impactRank } from './signal-rank'
import { DEFAULT_PROMOTION_RULE, shouldPromote, type PromotionRule } from './task-promotion'
import { taskEventForStatus, TASK_SUBJECT_TYPE, TASK_OPENED_EVENT, type TaskStatus } from './task-events'
import { tgNotify } from './telegram'
import { recordAudit } from './audit'

// signals-loop · Sprint 2, Story 2.1 — signal → task promotion, the evidence bundle, and the
// lifecycle fan-out.
//
// Everything here is scoped by a `projectId` the CALLER resolved server-side (from a hashed key, a
// connector token or a verified session). No function in this module accepts a project identifier
// from a request body, and the two RPCs it calls re-assert the scope in their own WHERE clauses —
// so a mismatched pair writes nothing rather than crossing tenants.

export type TaskRow = {
  id: string
  signalId: string
  status: TaskStatus
  title: string
  evidence: Record<string, unknown>
  impactRank: number
  claimedBy: string | null
  claimedAt: string | null
  resolvedAt: string | null
  resolution: string | null
  evidencePointer: string | null
  createdAt: string
  updatedAt: string
}

/** Per-project overrides, falling back to the conservative defaults. */
export async function loadPromotionRule(projectId: string): Promise<PromotionRule> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('task_promotion_rules')
    .select('min_users_affected, min_event_count, min_impact_score')
    .eq('project_id', projectId)
    .maybeSingle()

  if (error) {
    // Falling back rather than throwing: a config-table hiccup must not stop a real problem from
    // becoming a task. The defaults are conservative, so the failure mode is "promotes slightly
    // less than this tenant configured", never "promotes something it shouldn't".
    console.error('[tasks] promotion rule load failed:', error)
    return DEFAULT_PROMOTION_RULE
  }
  if (!data) return DEFAULT_PROMOTION_RULE

  return {
    minUsersAffected: data.min_users_affected as number,
    minEventCount: data.min_event_count as number,
    minImpactScore: data.min_impact_score as number,
  }
}

/**
 * The evidence bundle — the whole reason a task is worth more to an agent than a log line.
 *
 * EVERY field traces to a query this engine already answers: the feature registry, the funnel, the
 * signal's own scrubbed sample. Nothing here is inferred, summarised or generated, because there is
 * **no LLM anywhere in this engine** and that is the product claim, not an implementation detail.
 * The moment one field here is a guess, the differentiator is gone.
 */
async function buildEvidence(
  projectId: string,
  signal: {
    id: string
    kind: string
    featureId: string | null
    sample: Record<string, unknown>
    eventCount: number
    usersAffected: number
    firstSeenAt: string
    lastSeenAt: string
  }
): Promise<Record<string, unknown>> {
  const supabase = getSupabaseServiceClient()

  let feature: Record<string, unknown> | null = null
  if (signal.featureId) {
    const { data } = await supabase
      .from('features')
      .select('key, enabled, target_event, adopted_event, retained_event, retention_days')
      .eq('project_id', projectId)
      .eq('key', signal.featureId)
      .maybeSingle()
    if (data) {
      feature = {
        key: data.key,
        // The flag state AT PROMOTION TIME. A task saying "this broke while the feature was on"
        // is actionable; re-reading the flag when an agent opens the task days later would answer
        // a different question and quietly mislead.
        enabled: data.enabled,
        targetEvent: data.target_event,
        adoptedEvent: data.adopted_event,
        retainedEvent: data.retained_event,
        retentionDays: data.retention_days,
      }
    }
  }

  return {
    // Re-scrubbed on the way out. The sample was already redacted at ingest; doing it again is
    // cheap and means a bug in one layer cannot put raw customer data in front of an outside agent.
    // Belt and braces on the one field that carries someone else's runtime state.
    sample: scrubValue(signal.sample) as Record<string, unknown>,
    signal: {
      id: signal.id,
      kind: signal.kind,
      eventCount: signal.eventCount,
      usersAffected: signal.usersAffected,
      firstSeenAt: signal.firstSeenAt,
      lastSeenAt: signal.lastSeenAt,
    },
    feature,
    // Stamped so a reader can tell how old the bundle's view of the world is — the same freshness
    // discipline the Roadmap Hub applies to its artifacts.
    capturedAt: new Date().toISOString(),
  }
}

export type PromotionOutcome =
  | { promoted: true; taskId: string }
  | {
      promoted: false
      // `quiet` is its own reason, and adding it was a cross-review finding (Agy, 2026-07-26).
      // The recurrence gate suppresses a signal that has been silent since its last task closed —
      // the single most COMMON outcome once a tenant has resolved anything, and it was being
      // reported as `not_found`, which this type's own doc reserves for a bug or a cross-tenant
      // attempt. Labelling routine, correct suppression as an operational error is how a real
      // not_found stops being noticed.
      reason: 'below_threshold' | 'absorbed' | 'quiet' | 'not_found'
      taskId?: string
    }

/**
 * Promote one signal if it qualifies.
 *
 * Returns a discriminated outcome rather than a boolean because the three "no" cases mean genuinely
 * different things to a caller: below threshold is normal and expected, absorbed is a successful
 * dedupe, and not_found is a bug or a cross-tenant attempt. Collapsing them into `false` is how a
 * real failure gets logged as routine.
 */
export async function promoteSignal(projectId: string, signalId: string): Promise<PromotionOutcome> {
  const supabase = getSupabaseServiceClient()

  const { data: signal, error } = await supabase
    .from('signals')
    .select('id, kind, title, feature_id, sample, event_count, users_affected, first_seen_at, last_seen_at')
    .eq('id', signalId)
    .eq('project_id', projectId)
    .maybeSingle()

  if (error || !signal) return { promoted: false, reason: 'not_found' }

  const rule = await loadPromotionRule(projectId)
  const candidate = {
    usersAffected: signal.users_affected as number,
    eventCount: Number(signal.event_count),
    kind: signal.kind as 'error' | 'friction',
  }
  if (!shouldPromote(candidate, rule)) return { promoted: false, reason: 'below_threshold' }

  const evidence = await buildEvidence(projectId, {
    id: signal.id as string,
    kind: signal.kind as string,
    featureId: (signal.feature_id as string | null) ?? null,
    sample: (signal.sample as Record<string, unknown>) ?? {},
    eventCount: candidate.eventCount,
    usersAffected: candidate.usersAffected,
    firstSeenAt: signal.first_seen_at as string,
    lastSeenAt: signal.last_seen_at as string,
  })

  const rank = impactRank({
    usersAffected: candidate.usersAffected,
    eventCount: candidate.eventCount,
    lastSeenAt: new Date(signal.last_seen_at as string),
    now: new Date(),
  })

  const { data, error: rpcError } = await supabase
    .rpc('promote_signal_to_task', {
      p_signal_id: signalId,
      p_project_id: projectId,
      p_title: signal.title as string,
      p_evidence: evidence,
      p_impact_rank: rank,
    })
    .single<{ task_id: string | null; created: boolean }>()

  if (rpcError || !data) {
    console.error('[tasks] promote failed:', rpcError)
    return { promoted: false, reason: 'not_found' }
  }
  if (!data.created) {
    if (data.task_id) return { promoted: false, reason: 'absorbed', taskId: data.task_id }
    // No active task and nothing created. The signal row was read successfully at the top of this
    // function, so it exists and belongs to this project — which leaves exactly one explanation:
    // the recurrence gate held, because this problem has been quiet since its last task closed.
    // A genuine not_found would have returned at the `!signal` check above.
    return { promoted: false, reason: 'quiet' }
  }

  // Fan-out and the operator ping ride `after()` so neither can slow or fail the promotion that
  // already committed. Same contract as signal grouping: a derived side effect must never be able
  // to undo the write it describes.
  after(async () => {
    await emitTaskLifecycleEvent(projectId, data.task_id as string, 'open')
    await maybeNotifyFirstTask(projectId, data.task_id as string)
  })

  return { promoted: true, taskId: data.task_id as string }
}

/**
 * Emit a task lifecycle event through the ENGINE'S OWN ingest path (Amendment 4.1).
 *
 * Calling `ingest_event` — the same function `/v1/track` calls — is what makes this free: the event
 * lands in `events`, the transactional outbox fans it out to every destination whose filter matches,
 * and the tenant's existing signed webhook carries it to Linear or Slack or anywhere else. We build
 * zero integrations, and delivery inherits the retries, dead-lettering and operator replay the
 * router epic already paid for.
 *
 * The task id rides as `context.subject`, which is the join key every downstream projection in this
 * engine already understands.
 */
export async function emitTaskLifecycleEvent(
  projectId: string,
  taskId: string,
  status: TaskStatus,
  actor?: string | null
): Promise<void> {
  try {
    const supabase = getSupabaseServiceClient()
    const { error } = await supabase.rpc('ingest_event', {
      p_project_id: projectId,
      // The ENGINE is the actor, not a tenant user. Using the claiming agent's opaque label here
      // would pollute `userId` — the field every TARS funnel and A/B comparison counts DISTINCT on
      // — with non-user values, which is the "honest-looking zero" failure this repo has hit three
      // times. The agent's identity travels in tags, where it belongs.
      p_user_id: 'golden-beans-engine',
      p_event: taskEventForStatus(status),
      p_feature_id: null,
      p_tags: actor ? { actor } : {},
      p_metadata: {},
      p_context_version: 1,
      p_actor_type: 'system',
      p_actor_id: 'signals-loop',
      p_subject_type: TASK_SUBJECT_TYPE,
      p_subject_id: taskId,
      p_correlation_id: null,
      p_occurred_at: null,
      // A stable idempotency key per (task, status): a retried emit returns the original event
      // rather than delivering the same transition twice to a tenant's automation. `task_opened`
      // fires once per task by construction, and a re-emitted claim/resolve is the retry case this
      // guards. Uses the engine's existing dedupe rather than inventing a second one.
      p_idempotency_key: `task:${taskId}:${status}`,
      p_idempotency_fingerprint: null,
    })
    if (error) {
      console.error('[tasks] lifecycle emit failed:', error)
      await recordEmitFailure(projectId, taskId, status, error.message)
    }
  } catch (err) {
    console.error('[tasks] lifecycle emit threw:', err)
    await recordEmitFailure(projectId, taskId, status, err instanceof Error ? err.message : 'unknown')
  }
}

/**
 * Records a failed lifecycle emit in the append-only audit trail.
 *
 * ── Why this is the right size of fix, and what it deliberately is NOT ──────────────────────
 * Cross-review (Codex round 1) flagged that a failed emit is never retried: the transition commits,
 * the event is absent, and every later call returns already-claimed/terminal so nothing re-fires.
 * That is accurate.
 *
 * What it does NOT mean is that state is lost. The `tasks` row holds the truth — status,
 * `claimed_by`, `claimed_at`, `resolved_at`, `resolution` — so a missing event costs a
 * NOTIFICATION, never the fact. The event stream is how a tenant's automation hears about a
 * transition; the table is the record of it. Those are different jobs and only one of them is
 * load-bearing for correctness.
 *
 * A durable emit queue is therefore the wrong answer here: it would be a second outbox in front of
 * the outbox, with its own dispatcher, its own retry budget and its own failure modes, to make an
 * advisory notification exactly-once — for a system whose delivery contract is already explicitly
 * at-LEAST-once. The proportionate answer is that a failure leaves a durable, queryable trace
 * instead of only a log line nobody greps, so "why did our Slack channel miss that resolve?" has an
 * answer. The emit itself is already idempotent (a stable key per task+status), so a future
 * reconciliation pass can replay from these rows without risking duplicates.
 *
 * Recorded as a KNOWN LIMITATION in sprint-2.md rather than silently accepted.
 */
async function recordEmitFailure(
  projectId: string,
  taskId: string,
  status: TaskStatus,
  detail: string
): Promise<void> {
  await recordAudit({
    action: 'task_event_emit_failed',
    projectId,
    metadata: { taskId, status, detail: detail.slice(0, 500) },
  })
}

/**
 * One Telegram line the first time a project ever produces a task (Amendment 4.4).
 *
 * ── Why "is this task the OLDEST?" and not "is the count 1?" ────────────────────────────────
 * The first version asked `count === 1` after the fact, which cross-review (Codex round 2)
 * correctly called race-prone: two promotions in the same pass both run their callback after both
 * rows exist, both see a count above one, and NOBODY sends the notification. A first-task ping that
 * silently never fires on a busy first day is worse than no ping, because its absence reads as
 * "nothing happened yet".
 *
 * Asking whether THIS task is the project's oldest is race-free without a marker column, a
 * migration, or a lock — because the question has exactly one answer no matter how many callbacks
 * ask it concurrently. Only one row can be the oldest, so at most one caller matches, and any
 * caller that runs later still gets the same answer rather than a different one. Idempotent by
 * construction rather than by coordination.
 *
 * Ties are handled by ordering on `created_at` then `id`: two rows can share a timestamp at
 * Postgres' resolution, and a bare timestamp sort would make "the oldest" ambiguous — which is the
 * same non-determinism the count version had, just moved.
 *
 * Best-effort and silent on failure throughout: an operator convenience must never affect a
 * tenant's queue.
 */
async function maybeNotifyFirstTask(projectId: string, taskId: string): Promise<void> {
  try {
    const supabase = getSupabaseServiceClient()
    const { data, error } = await supabase
      .from('tasks')
      .select('id')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (error || !data || data.id !== taskId) return

    const { data: project } = await supabase.from('projects').select('slug').eq('id', projectId).maybeSingle()

    await tgNotify(`🔔 First signals-loop task created for <b>${project?.slug ?? projectId}</b>`)
  } catch (err) {
    console.error('[tasks] first-task notify threw:', err)
  }
}

export type TransitionResult = {
  ok: boolean
  reason: string
  fromStatus: string | null
}

/**
 * The ONE status-change path, shared by the dashboard and (in Sprint 3) the connector write tools.
 *
 * Sharing it is deliberate: two implementations of "may this task be claimed?" is one too many, and
 * the second copy is the one that forgets a rule. The database function it calls holds the actual
 * lifecycle logic behind a row lock.
 */
export async function transitionTask(
  projectId: string,
  taskId: string,
  toStatus: TaskStatus,
  options: { actor?: string | null; resolution?: string | null; evidencePointer?: string | null } = {}
): Promise<TransitionResult> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .rpc('transition_task', {
      p_task_id: taskId,
      p_project_id: projectId,
      p_to_status: toStatus,
      p_actor: options.actor ?? null,
      p_resolution: options.resolution ?? null,
      p_evidence_pointer: options.evidencePointer ?? null,
    })
    .single<{ ok: boolean; reason: string; from_status: string | null }>()

  if (error || !data) {
    console.error('[tasks] transition failed:', error)
    return { ok: false, reason: 'error', fromStatus: null }
  }

  if (data.ok) {
    after(async () => {
      await emitTaskLifecycleEvent(projectId, taskId, toStatus, options.actor ?? null)
    })
  }

  return { ok: data.ok, reason: data.reason, fromStatus: data.from_status }
}

/** A project's task queue, most impactful first. */
export async function listTasksByProjectId(
  projectId: string,
  options: { status?: TaskStatus; limit?: number } = {}
): Promise<TaskRow[]> {
  const supabase = getSupabaseServiceClient()
  let query = supabase
    .from('tasks')
    .select(
      'id, signal_id, status, title, evidence, impact_rank, claimed_by, claimed_at, resolved_at, resolution, evidence_pointer, created_at, updated_at'
    )
    .eq('project_id', projectId)
  if (options.status) query = query.eq('status', options.status)

  const { data, error } = await query
    .order('impact_rank', { ascending: false })
    // Tie-breakers, and they matter more here than they look. Ranks collide readily — two signals
    // with the same users × frequency produce the identical rounded score — and without a stable
    // secondary sort the queue silently re-orders between two reads of unchanged data. That makes
    // "is this list still the same?" unanswerable for a human, and breaks pagination for an agent
    // walking the queue. Newest-first among equals, then id as the final deterministic arbiter
    // (two rows can share a created_at at Postgres' resolution). Cross-review, Agy round 4.
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(Math.min(Math.max(options.limit ?? 50, 1), 200))

  if (error) {
    // Thrown, not flattened to []. An empty queue renders as "nothing to do", which during an
    // outage is the most dangerous lie a task queue can tell.
    console.error('[tasks] list failed:', error)
    throw new Error('Could not load tasks')
  }
  return (data ?? []).map(mapTaskRow)
}

/** One task with its full evidence bundle. Returns null for a task belonging to another tenant. */
export async function getTaskByProjectId(projectId: string, taskId: string): Promise<TaskRow | null> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('tasks')
    .select(
      'id, signal_id, status, title, evidence, impact_rank, claimed_by, claimed_at, resolved_at, resolution, evidence_pointer, created_at, updated_at'
    )
    .eq('id', taskId)
    .eq('project_id', projectId)
    .maybeSingle()

  if (error || !data) return null
  return mapTaskRow(data)
}

function mapTaskRow(r: Record<string, unknown>): TaskRow {
  return {
    id: r.id as string,
    signalId: r.signal_id as string,
    status: r.status as TaskStatus,
    title: r.title as string,
    evidence: (r.evidence as Record<string, unknown>) ?? {},
    impactRank: Number(r.impact_rank),
    claimedBy: (r.claimed_by as string | null) ?? null,
    claimedAt: (r.claimed_at as string | null) ?? null,
    resolvedAt: (r.resolved_at as string | null) ?? null,
    resolution: (r.resolution as string | null) ?? null,
    evidencePointer: (r.evidence_pointer as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

/**
 * Promote every qualifying signal for a project, and return how many tasks were created.
 *
 * This is the function the read paths call (Story 2.3), which is also where friction evaluation is
 * triggered — so opening the queue is what makes the queue current. Gated here, in one place, so no
 * caller has to remember the flag.
 */
export async function promoteEligibleSignals(projectId: string): Promise<number> {
  if (!isSignalsEnabled()) return 0

  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('signals')
    .select('id')
    .eq('project_id', projectId)
    .order('users_affected', { ascending: false })
    // Bounded. A tenant with thousands of signals must not turn one queue read into an unbounded
    // write storm; the ranking means the most impactful are the ones considered first, and the rest
    // are picked up on subsequent reads.
    .limit(100)

  if (error || !data) return 0

  // ── Bounded CONCURRENCY, not a sequential walk ──────────────────────────────────────────────
  // This runs on a read path — a dashboard render and an MCP `list_tasks` call — so its latency is
  // a user-visible cost, and each signal costs several round trips (rule load, feature lookup, the
  // promotion RPC). Sequentially that is up to 100 × N round trips before a page paints.
  //
  // Chunked rather than a single Promise.all over all 100: unbounded parallelism against Postgres
  // trades a latency problem for a connection-pool problem, which is the worse one because it
  // degrades every OTHER tenant's request rather than just this render. Eight is comfortably under
  // the pool and turns the worst case into ~13 sequential batches.
  //
  // Order does not matter here — each promotion is independent, and the queue is sorted on read.
  const CONCURRENCY = 8
  let created = 0
  for (let i = 0; i < data.length; i += CONCURRENCY) {
    const batch = data.slice(i, i + CONCURRENCY)
    const outcomes = await Promise.all(
      batch.map((row) =>
        promoteSignal(projectId, row.id as string).catch(() => ({ promoted: false }) as const)
      )
    )
    created += outcomes.filter((o) => o.promoted).length
  }
  return created
}

export { TASK_OPENED_EVENT }
