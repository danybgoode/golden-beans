#!/usr/bin/env node
// sync-features-from-miyagi.mjs — the "one-command seed run" for Story 2.1
// (Roadmap/01-growth-engine/growth-engine-v1/sprint-2.md). Reads Miyagi's LIVE
// `platform_flags` rows (never lib/flags.ts code defaults — those are fail-safe
// fallbacks and systematically say OFF) and pushes them into golden-beans' feature
// registry via POST /v1/features/sync.
//
// Registry sync stays a command, not a product surface — run this by hand whenever
// Miyagi's flag state has moved (no schedule, no UI).
//
// Env vars (both sides' credentials — this script talks to two separate Supabase
// projects/services):
//   MIYAGI_SUPABASE_URL / MIYAGI_SUPABASE_SERVICE_ROLE_KEY  — read platform_flags
//   GROWTH_ENGINE_URL / GROWTH_ENGINE_API_KEY                — push the sync payload
//
// FEATURE_MAP below is intentionally small and hand-maintained: golden-beans only
// registers a feature once it's been taught that feature's event-name shape (see
// scripts/lib/feature-sync-payload.mjs). Add an entry here when a new Miyagi feature
// gets instrumented, mirroring the pattern from Story 1.3's setup-guide funnel.
import { createClient } from '@supabase/supabase-js'
import { buildFeatureSyncPayload } from './lib/feature-sync-payload.mjs'

const FEATURE_MAP = {
  'growth.telemetry_enabled': {
    featureKey: 'setup_guide',
    targetEvent: 'setup_guide_viewed',
    adoptedEvent: 'setup_guide_step_completed',
    retainedEvent: 'setup_guide_share_tapped',
    retentionDays: 7,
    description: 'Miyagi setup-guide funnel (Sprint 1, Story 1.3).',
  },
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

async function fetchMiyagiFlagRows() {
  const url = requireEnv('MIYAGI_SUPABASE_URL')
  const key = requireEnv('MIYAGI_SUPABASE_SERVICE_ROLE_KEY')
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const { data, error } = await supabase.from('platform_flags').select('key, enabled')
  if (error) throw new Error(`Failed to read Miyagi platform_flags: ${error.message}`)
  return data ?? []
}

async function pushSync(features) {
  const baseUrl = requireEnv('GROWTH_ENGINE_URL')
  const apiKey = requireEnv('GROWTH_ENGINE_API_KEY')
  const res = await fetch(`${baseUrl}/api/v1/features/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ features }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.ok) {
    throw new Error(`Sync failed: HTTP ${res.status} ${JSON.stringify(body)}`)
  }
  return body
}

export async function main() {
  const flagRows = await fetchMiyagiFlagRows()
  const payload = buildFeatureSyncPayload(flagRows, FEATURE_MAP)
  if (payload.length === 0) {
    console.log('No known features matched a live Miyagi flag — nothing to sync.')
    return
  }
  const result = await pushSync(payload)
  console.log(`Synced ${result.synced} feature(s): ${payload.map((f) => f.key).join(', ')}`)
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
