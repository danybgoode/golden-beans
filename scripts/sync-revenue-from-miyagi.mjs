#!/usr/bin/env node
// sync-revenue-from-miyagi.mjs — the "one-command sync run" for Story 3.3
// (Roadmap/01-growth-engine/growth-engine-v1/sprint-3.md). Reads Miyagi's LIVE
// `financial_event` ledger DIRECTLY (medusa-bonsai apps/backend/src/modules/profit —
// the shipped profit-analyzer epic's append-only revenue ledger) and pushes a DERIVED
// daily aggregate into golden-beans' `attributed_revenue` input via
// POST /v1/inputs/attributed_revenue/values.
//
// Mirrors scripts/sync-features-from-miyagi.mjs's shape exactly (same two-Supabase-
// credentials pattern) — this is the reuse Sprint 3's commerce-truth boundary is built
// on: golden-beans never stores a copy of Medusa's order/payment rows, only this
// derived rollup. Read-only against Miyagi's DB — no mutation, no new medusa-bonsai code.
//
// Registry sync stays a command, not a product surface — run this by hand whenever a
// fresh revenue figure is needed (no schedule, no UI). Idempotent: POST /v1/inputs/
// attributed_revenue/values dedupes by day, so re-running this script is always safe.
//
// Env vars (both sides' credentials — this script talks to two separate Supabase
// projects/services):
//   MIYAGI_SUPABASE_URL / MIYAGI_SUPABASE_SERVICE_ROLE_KEY  — read financial_event
//   GROWTH_ENGINE_URL / GROWTH_ENGINE_API_KEY                — push the aggregated payload
import { createClient } from '@supabase/supabase-js'
import { aggregateDailyRevenue } from './lib/revenue-sync-payload.mjs'

const ATTRIBUTED_REVENUE_INPUT_KEY = 'attributed_revenue'

function requireEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

const FETCH_PAGE_SIZE = 1000

async function fetchMiyagiRevenueEvents() {
  const url = requireEnv('MIYAGI_SUPABASE_URL')
  const key = requireEnv('MIYAGI_SUPABASE_SERVICE_ROLE_KEY')
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  // Read-only: financial_event is append-only in Miyagi too (financial_event_no_mutation
  // trigger) — this SELECT is the only operation this script ever performs against it.
  //
  // Paginated via .range() — PostgREST's default row cap would otherwise silently
  // truncate the result set once the ledger grows past it, under-reporting real revenue
  // while the request still returns success. Loop until a page comes back short of a
  // full page (the standard "did we get everything" signal for offset pagination).
  const rows = []
  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('financial_event')
      .select('amount_cents, captured_at')
      .eq('event_type', 'revenue')
      .order('captured_at', { ascending: true })
      .range(from, from + FETCH_PAGE_SIZE - 1)
    if (error) throw new Error(`Failed to read Miyagi financial_event: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < FETCH_PAGE_SIZE) break
  }
  return rows.map((row) => ({ amountCents: row.amount_cents, capturedAt: row.captured_at }))
}

async function pushValues(values) {
  const baseUrl = requireEnv('GROWTH_ENGINE_URL')
  const apiKey = requireEnv('GROWTH_ENGINE_API_KEY')
  const res = await fetch(`${baseUrl}/api/v1/inputs/${ATTRIBUTED_REVENUE_INPUT_KEY}/values`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ values }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.ok) {
    throw new Error(`Revenue sync failed: HTTP ${res.status} ${JSON.stringify(body)}`)
  }
  return body
}

export async function main() {
  const revenueEvents = await fetchMiyagiRevenueEvents()
  const dailyValues = aggregateDailyRevenue(revenueEvents)
  if (dailyValues.length === 0) {
    console.log('No revenue events found in Miyagi — nothing to sync.')
    return
  }
  const result = await pushValues(dailyValues)
  console.log(
    `Synced ${dailyValues.length} day(s) of revenue: ${result.inserted} new, ${result.skippedDuplicates} already present.`,
  )
  if (result.mismatchedDuplicates?.length > 0) {
    console.warn(
      `WARNING: ${result.mismatchedDuplicates.length} day(s) had a different revenue figure than what's already ` +
        `stored (dates: ${result.mismatchedDuplicates.join(', ')}) — the append-only ledger kept the ORIGINAL ` +
        'value. If Miyagi corrected a past day, this sync run did not apply that correction.',
    )
  }
}

// Guard main() so importing this file for its pure helpers never re-executes it for
// real (Roadmap/LEARNINGS.md — a script imported by a test must not fire its side
// effects at module load time).
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  main().catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}
