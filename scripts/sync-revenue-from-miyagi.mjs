#!/usr/bin/env node
// sync-revenue-from-miyagi.mjs — the "one-command sync run" for Story 3.3
// (Roadmap/01-growth-engine/growth-engine-v1/sprint-3.md). Reads Miyagi's LIVE
// `financial_event` ledger DIRECTLY (medusa-bonsai apps/backend/src/modules/profit —
// the shipped profit-analyzer epic's append-only revenue ledger) and pushes a DERIVED
// daily aggregate into golden-beans' `attributed_revenue` input via
// POST /v1/inputs/attributed_revenue/values.
//
// CORRECTED (2026-07-15, first live run attempt): `financial_event` is a Medusa CORE
// MODULE table — it lives in Medusa's own primary Postgres (`DATABASE_URL`), NOT in the
// small auxiliary Supabase project `platform_flags`/seller-Clerk-linkage rows use. The
// original version of this script assumed both lived behind the same Supabase REST API
// (mirroring scripts/sync-features-from-miyagi.mjs's platform_flags read) — that
// assumption was wrong and failed loudly (404 "table not found in schema cache") on the
// first real run, rather than silently. Connects via a raw Postgres client instead.
//
// Read-only against Miyagi's DB — no mutation, no new medusa-bonsai code. This is the
// reuse Sprint 3's commerce-truth boundary is built on: golden-beans never stores a copy
// of Medusa's order/payment rows, only the derived daily rollup pushed below.
//
// Registry sync stays a command, not a product surface — run this by hand whenever a
// fresh revenue figure is needed (no schedule, no UI). Idempotent: POST /v1/inputs/
// attributed_revenue/values dedupes by day, so re-running this script is always safe.
//
// Env vars:
//   MIYAGI_DATABASE_URL         — Medusa's own primary Postgres connection string (read financial_event)
//   GROWTH_ENGINE_URL / GROWTH_ENGINE_API_KEY — push the aggregated payload
import pg from 'pg'
import { aggregateDailyRevenue } from './lib/revenue-sync-payload.mjs'

const ATTRIBUTED_REVENUE_INPUT_KEY = 'attributed_revenue'

function requireEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

const FETCH_PAGE_SIZE = 1000

async function fetchMiyagiRevenueEvents() {
  const connectionString = requireEnv('MIYAGI_DATABASE_URL')
  // No SSL override here: `pg` honors the connection string's own sslmode (managed
  // Postgres providers — Neon included — encode it via `?sslmode=require` and expect
  // full certificate verification); weakening that to skip cert checks is never
  // appropriate for a real production credential and was not asked for.
  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    // Read-only: financial_event is append-only in Miyagi too (financial_event_no_mutation
    // trigger) — this SELECT is the only statement this script ever runs against it.
    //
    // Paginated via LIMIT/OFFSET with a deterministic ORDER BY (captured_at, id) — a raw
    // Postgres connection has no PostgREST-style default row cap, but chunking still
    // avoids holding an unbounded ledger fully in memory, and keeps the "did we get
    // everything" loop shape consistent with the rest of this codebase's sync scripts.
    const rows = []
    for (let offset = 0; ; offset += FETCH_PAGE_SIZE) {
      const { rows: page } = await client.query(
        `SELECT amount_cents, captured_at FROM financial_event
         WHERE event_type = 'revenue'
         ORDER BY captured_at ASC, id ASC
         LIMIT $1 OFFSET $2`,
        [FETCH_PAGE_SIZE, offset],
      )
      rows.push(...page)
      if (page.length < FETCH_PAGE_SIZE) break
    }
    return rows.map((row) => ({ amountCents: row.amount_cents, capturedAt: row.captured_at }))
  } finally {
    await client.end()
  }
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
