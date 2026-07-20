#!/usr/bin/env node
// seed-self-project.mjs — Story 3.1 (Roadmap/02-commercial/commercial-shell/sprint-3.md). Seeds
// (idempotently, re-runnable) the `golden-beans` SELF tenant — the engine's own project, the one
// the public landing dogfoods its visitor→waitlist funnel into. This is a THIRD project, separate
// from the marketing demo (`golden-beans-demo`, seed-demo-project.mjs) and from Miyagi; landing
// traffic must never mix into either (AGENTS.md rules #1/#2). Sibling of seed-demo-project.mjs and
// the same shape: the PROJECT ROW is a direct Supabase upsert (there's no self-serve signup API),
// but the Grower SIGNAL is registered through the REAL Bearer-authed API, never a raw DB write.
//
// Uses raw fetch() rather than importing @golden-beans/sdk for the same reason the demo script
// does: the SDK ships as un-transpiled TS with extensionless internal imports that plain `node`
// can't resolve (ERR_MODULE_NOT_FOUND). The /features/sync payload below is byte-identical to what
// the SDK's syncFeatures() sends (packages/sdk/src/index.ts).
//
// Env vars:
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — provisioning (the project row upsert)
//   GROWTH_ENGINE_URL                        — the running server the fetch calls target
//                                              (defaults to http://localhost:3000)
//   SELF_PROJECT_SLUG                        — optional slug override (default 'golden-beans'),
//                                              matching lib/self-track.ts's env pattern.
//   SELF_PROJECT_API_KEY                     — optional; if set, hash+upsert this fixed value
//                                              instead of minting a fresh random key each run, so
//                                              the SAME key can be exported into the app's env
//                                              (this is the key the landing's self-track helper
//                                              authenticates with).
import { createHash, randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

// The self tenant's slug. Kept in sync with lib/self-track.ts's SELF_PROJECT_SLUG (this script
// can't import that TS file — see the header comment).
export const SELF_PROJECT_SLUG = process.env.SELF_PROJECT_SLUG?.trim() || 'golden-beans'
// The demo tenant's slug (mirrors lib/public-demo.ts) — used ONLY for the isolation guard below.
const DEMO_PROJECT_SLUG = process.env.DEMO_PROJECT_SLUG?.trim() || 'golden-beans-demo'

// The Grower signal: waitlist conversion rate, as a TARS feature. targetEvent is the funnel entry
// (a landing visit), adoptedEvent is the conversion (a waitlist join) — exactly the two events
// lib/self-track.ts fires. Adopted / Targeted is the waitlist conversion rate the epic measures.
const SIGNAL_KEY = 'waitlist_conversion'
const TARGET_EVENT = 'landing_visited'
const ADOPTED_EVENT = 'waitlist_joined'
const RETENTION_DAYS = 7 // schema default; retention isn't meaningful for a one-shot join, but the
//                          column is NOT NULL-defaulted to 7 server-side — set it explicitly here.

function requireEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

function hashApiKey(key) {
  return createHash('sha256').update(key).digest('hex')
}

function supabase() {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  })
}

async function provisionProject(db) {
  const plaintextKey = process.env.SELF_PROJECT_API_KEY?.trim() || randomBytes(24).toString('hex')
  const { data, error } = await db
    .from('projects')
    .upsert({ slug: SELF_PROJECT_SLUG, api_key_hash: hashApiKey(plaintextKey) }, { onConflict: 'slug' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Failed to upsert self project: ${error?.message}`)
  return { projectId: data.id, apiKey: plaintextKey }
}

// Mirrors the SDK's syncFeatures(): POST /api/v1/features/sync, Bearer=self key. Idempotent —
// upserts on (project_id, key), so re-runs just bump synced_at. The tenant is resolved server-side
// from the Bearer key (lib/auth.ts), never from a body field — so this signal can only ever land
// on the self project, structurally.
async function registerGrowerSignal(baseUrl, apiKey) {
  const res = await fetch(`${baseUrl}/api/v1/features/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      features: [
        {
          key: SIGNAL_KEY,
          enabled: true,
          targetEvent: TARGET_EVENT,
          adoptedEvent: ADOPTED_EVENT,
          retentionDays: RETENTION_DAYS,
          description: 'Golden Beans landing dogfood funnel: visitor → waitlist (Grower signal, Story 3.1).',
        },
      ],
    }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.ok) throw new Error(`registerGrowerSignal: HTTP ${res.status} ${JSON.stringify(body)}`)
}

export async function main() {
  // Isolation guard: the self tenant must be a DIFFERENT project from the demo. Refuse to run if
  // they've been cross-wired to the same slug — otherwise the two API keys would upsert onto one
  // project row and landing traffic could mix into the demo (the exact thing the story forbids).
  if (SELF_PROJECT_SLUG === DEMO_PROJECT_SLUG) {
    throw new Error(
      `SELF_PROJECT_SLUG ('${SELF_PROJECT_SLUG}') must differ from DEMO_PROJECT_SLUG — the self ` +
        `tenant is a separate project; sharing a slug would mix landing traffic into the demo.`,
    )
  }

  const baseUrl = process.env.GROWTH_ENGINE_URL?.trim() || 'http://localhost:3000'
  const db = supabase()

  const { projectId, apiKey } = await provisionProject(db)
  await registerGrowerSignal(baseUrl, apiKey)

  console.log(
    `Seeded self project '${SELF_PROJECT_SLUG}' (${projectId}): registered Grower signal ` +
      `'${SIGNAL_KEY}' (${TARGET_EVENT} → ${ADOPTED_EVENT}).`,
  )
  // Print the API key so a human/CI can export it as SELF_PROJECT_API_KEY (matching how the demo
  // script prints its connector URL). If SELF_PROJECT_API_KEY was set going in, this echoes it back.
  console.log(`SELF_PROJECT_API_KEY=${apiKey}`)
}

// Guard main() so importing this file for its constants never re-executes it (Roadmap/LEARNINGS.md).
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  main().catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}
