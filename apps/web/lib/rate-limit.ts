import 'server-only'
import { createHash } from 'node:crypto'
import { getSupabaseServiceClient } from './supabase'

// Story 1.3 (commercial-shell/sprint-1.md) — a small, reusable DB-backed rate-limit primitive for
// public write routes. DB-backed rather than in-memory: a Vercel serverless deployment doesn't
// reliably share in-memory state across invocations, so an in-process counter would under-count.

export function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex')
}

export type RateLimitResult = { ok: true } | { ok: false; status: 429; error: string }

export async function checkRateLimit(
  key: string,
  opts: { windowMs: number; max: number },
): Promise<RateLimitResult> {
  const supabase = getSupabaseServiceClient()
  const since = new Date(Date.now() - opts.windowMs).toISOString()

  const { count, error } = await supabase
    .from('rate_limit_hits')
    .select('id', { count: 'exact', head: true })
    .eq('key', key)
    .gte('created_at', since)
  if (error) {
    console.error('[rate-limit] count query failed:', error)
    // Fail open — a rate-limit outage should not itself take down the write path.
    return { ok: true }
  }
  if ((count ?? 0) >= opts.max) {
    return { ok: false, status: 429, error: 'Too many requests — try again later.' }
  }

  const { error: insertError } = await supabase.from('rate_limit_hits').insert({ key })
  if (insertError) {
    console.error('[rate-limit] hit insert failed:', insertError)
  }
  return { ok: true }
}
