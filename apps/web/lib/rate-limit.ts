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

// `windowMs` floors the CURRENT time into a fixed-size bucket — right for "5 per 10 minutes",
// wrong for any window whose length varies. Callers with a calendar-aligned window (a monthly
// quota — lib/quota.ts) pass `windowStart` explicitly instead: months are not a fixed number of
// milliseconds, so flooring by "milliseconds in this month" would land on an arbitrary multiple
// of that duration since the Unix epoch, NOT on the first of the month. Exactly one of the two
// must be supplied.
export async function checkRateLimit(
  key: string,
  opts: { max: number } & ({ windowMs: number; windowStart?: never } | { windowStart: Date; windowMs?: never }),
): Promise<RateLimitResult> {
  const supabase = getSupabaseServiceClient()
  const windowStart = (
    opts.windowStart ?? new Date(Math.floor(Date.now() / opts.windowMs!) * opts.windowMs!)
  ).toISOString()

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
