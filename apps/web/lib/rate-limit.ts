import 'server-only'
import { createHash } from 'node:crypto'
import { getSupabaseServiceClient } from './supabase'

// Story 1.3 (commercial-shell/sprint-1.md) — a small, reusable DB-backed rate-limit primitive for
// public write routes. DB-backed rather than in-memory: a Vercel serverless deployment doesn't
// reliably share in-memory state across invocations, so an in-process counter would under-count.
//
// Fixed-window, incremented atomically via the increment_rate_limit() Postgres function (see the
// migration) — a single `INSERT ... ON CONFLICT DO UPDATE ... RETURNING count`, not a
// select-count-then-insert (that shape races: concurrent callers can all observe the same
// pre-insert count and all pass).

export function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex')
}

export type RateLimitResult = { ok: true } | { ok: false; status: 429; error: string }

export async function checkRateLimit(
  key: string,
  opts: { windowMs: number; max: number },
): Promise<RateLimitResult> {
  const supabase = getSupabaseServiceClient()
  const windowStart = new Date(Math.floor(Date.now() / opts.windowMs) * opts.windowMs).toISOString()

  const { data, error } = await supabase.rpc('increment_rate_limit', {
    p_key: key,
    p_window_start: windowStart,
  })
  if (error) {
    console.error('[rate-limit] increment failed:', error)
    // Fail open — a rate-limit outage should not itself take down the write path.
    return { ok: true }
  }
  if ((data as number) > opts.max) {
    return { ok: false, status: 429, error: 'Too many requests — try again later.' }
  }
  return { ok: true }
}
