import 'server-only'
import { checkRateLimit } from './rate-limit'
import { getSupabaseServiceClient } from './supabase'
import { monthWindowStart, monthWindowEnd, MAX_TRACK_PAYLOAD_BYTES } from './quota-window'

// Re-exported so callers have ONE import site for the guardrails, pure and impure alike.
export { MAX_TRACK_PAYLOAD_BYTES, monthWindowStart, monthWindowEnd }

// multi-tenant-activation · Sprint 2, Story 2.2 — per-tenant isolation guardrails on the shared
// ingest path. Open signup means a stranger's runaway loop shares this route with Miyagi's real
// traffic and with the bill, so ingest needs three independent bounds:
//
//   1. a PAYLOAD cap        — bytes, checked before parsing (below)
//   2. a per-KEY rate limit — bursts, per api_keys row
//   3. a per-PROJECT quota  — sustained volume, per calendar month
//
// (2) and (3) are the SAME primitive at two different window sizes. Rather than building a second
// counter table, both ride lib/rate-limit.ts's `increment_rate_limit()` — a single atomic
// `INSERT ... ON CONFLICT DO UPDATE ... RETURNING count`, which is exactly the shape a quota
// needs and is already proven under concurrency (see the rate_limit migration's note on why the
// naive select-then-insert races). This is AGENTS.md's "reuse before rebuild" applied literally:
// a monthly quota is a fixed-window counter whose window happens to be a month.
//
// The alternative — `SELECT count(*) FROM events WHERE project_id = ? AND created_at >= ?` on
// every single ingest call — was rejected: it is an unbounded scan that gets slower exactly as a
// tenant gets more valuable, and it races the same way the naive rate limit did.
//
// Both bounds inherit rate-limit.ts's FAIL-OPEN behaviour on a DB error, deliberately: a counter
// outage must not take down ingest for every tenant. The failure mode is "briefly unenforced",
// not "everyone is down".

/** Per-key ingest burst window. Paired with `projects.ingest_rate_per_min` (per project row, so
 *  a real customer's ceiling is an UPDATE, never a deploy). */
const INGEST_WINDOW_MS = 60 * 1000

export type GuardResult = { ok: true } | { ok: false; status: number; error: string }

// Per-API-KEY, not per project: one runaway integration must not starve a tenant's other,
// healthy integrations, and revoking that one key is then a complete fix.
export async function checkIngestRate(apiKeyId: string, perMinute: number): Promise<GuardResult> {
  const result = await checkRateLimit(`ingest:${apiKeyId}`, {
    windowMs: INGEST_WINDOW_MS,
    max: perMinute,
  })
  if (result.ok) return { ok: true }
  return {
    ok: false,
    status: 429,
    error: `Ingest rate limit exceeded for this API key (${perMinute}/min). Slow down, or ask for a higher ceiling.`,
  }
}

// The window is the calendar month in UTC, passed to checkRateLimit EXPLICITLY rather than as a
// windowMs — see lib/quota-window.ts for why that distinction is load-bearing.
export async function checkMonthlyQuota(projectId: string, quota: number): Promise<GuardResult> {
  const windowStart = monthWindowStart()
  const result = await checkRateLimit(`quota:${projectId}`, { windowStart, max: quota })
  if (result.ok) return { ok: true }
  const resetsOn = monthWindowEnd(windowStart).toISOString().slice(0, 10)
  return {
    ok: false,
    status: 429,
    error: `Monthly event quota exceeded (${quota} events). It resets on ${resetsOn}.`,
  }
}

// Hands back one unit of monthly quota. Called only when an event was CHARGED (the counter was
// incremented) but then failed to persist — see the ingest route. Best-effort by design: a failed
// refund must not turn a 500 into two problems, and the ceiling self-heals at the month boundary
// regardless.
export async function refundMonthlyQuota(projectId: string): Promise<void> {
  try {
    const supabase = getSupabaseServiceClient()
    const { error } = await supabase.rpc('decrement_rate_limit', {
      p_key: `quota:${projectId}`,
      p_window_start: monthWindowStart().toISOString(),
    })
    if (error) console.error('[quota] refund failed:', error)
  } catch (err) {
    console.error('[quota] refund threw:', err)
  }
}
