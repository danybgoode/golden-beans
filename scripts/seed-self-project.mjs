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
// multi-tenant-activation Story 3.3 — the ACTIVATION funnel, the second signal this tenant
// measures. Three real stages, so all three TARS slots are meaningful here (unlike the one-shot
// waitlist join): signup submitted -> email confirmed + tenant provisioned -> first event ingested.
// Mirrors lib/self-track.ts's ACTIVATION_SIGNAL_KEY / *_EVENT constants — the app tags every event
// with one of these feature keys, and an event whose feature_id doesn't match a REGISTERED feature
// is invisible to lib/tars-query.ts forever (it filters on feature_id). Registering it here is what
// makes the funnel renderable at all.
const ACTIVATION_KEY = 'activation'
const ACTIVATION_TARGET_EVENT = 'signup_started'
const ACTIVATION_ADOPTED_EVENT = 'account_confirmed'
const ACTIVATION_RETAINED_EVENT = 'first_event_ingested'
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

// A cross-review catch (commercial-shell Sprint 3 PR): a bare re-run with SELF_PROJECT_API_KEY
// unset must NOT rotate the key of an already-provisioned project — that would silently invalidate
// whatever key is configured as SELF_PROJECT_API_KEY in the running app (self-tracking then just
// 401s, swallowed+logged into a no-op by lib/self-track.ts's total-failure design, so the breakage
// would be near-silent). A fresh random key is only minted on FIRST creation; re-running against an
// existing row without an explicit override key is a true no-op on the credential. Passing
// SELF_PROJECT_API_KEY explicitly still works as a deliberate, visible rotation.
async function provisionProject(db) {
  const { data: existing, error: existingError } = await db
    .from('projects')
    .select('id')
    .eq('slug', SELF_PROJECT_SLUG)
    .maybeSingle()
  if (existingError) throw new Error(`Failed to look up self project: ${existingError.message}`)

  const overrideKey = process.env.SELF_PROJECT_API_KEY?.trim()
  if (existing && !overrideKey) {
    // Already provisioned, no explicit key given: leave the credential untouched.
    return { projectId: existing.id, apiKey: null }
  }

  const plaintextKey = overrideKey || randomBytes(24).toString('hex')
  const { data, error } = await db
    .from('projects')
    .upsert({ slug: SELF_PROJECT_SLUG, api_key_hash: hashApiKey(plaintextKey) }, { onConflict: 'slug' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Failed to upsert self project: ${error?.message}`)
  // multi-tenant-activation Story 1.3: lib/auth.ts resolves the Bearer key from api_keys now, so
  // the provisioned key needs an active api_keys row (only on the paths where we set the key —
  // the existing-project-no-override no-op above intentionally leaves the credential untouched).
  await ensureActiveApiKey(db, data.id, plaintextKey)
  return { projectId: data.id, apiKey: plaintextKey }
}

// Idempotent, but NEVER silently cross-tenant. key_hash is globally unique, so a pre-existing row
// for this hash might belong to a DIFFERENT project — an `ignoreDuplicates` upsert would report
// success and hand back a plaintext key that authenticates as that other tenant (cross-review
// catch, Codex 2026-07-20). Only a row belonging to THIS project and still active is acceptable;
// anything else fails loud.
async function ensureActiveApiKey(db, projectId, plaintextKey) {
  const keyHash = hashApiKey(plaintextKey)
  const { data: existing, error: lookupError } = await db
    .from('api_keys')
    .select('project_id, revoked_at')
    .eq('key_hash', keyHash)
    .maybeSingle()
  if (lookupError) throw new Error(`Failed to look up self api key: ${lookupError.message}`)

  if (existing) {
    if (existing.project_id !== projectId) {
      throw new Error('Refusing to seed: this API key hash already belongs to a different project.')
    }
    if (existing.revoked_at) {
      throw new Error('Refusing to seed: this API key exists but is revoked — issue a new key instead.')
    }
    return
  }

  const { error } = await db
    .from('api_keys')
    .insert({ project_id: projectId, key_hash: keyHash, label: 'default (seed)' })
  if (error) throw new Error(`Failed to insert self api key: ${error.message}`)
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
        {
          key: ACTIVATION_KEY,
          enabled: true,
          targetEvent: ACTIVATION_TARGET_EVENT,
          adoptedEvent: ACTIVATION_ADOPTED_EVENT,
          retainedEvent: ACTIVATION_RETAINED_EVENT,
          retentionDays: RETENTION_DAYS,
          description: 'Golden Beans activation funnel: signup → confirmed → first event (multi-tenant-activation Story 3.3).',
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

  if (!apiKey) {
    // Already provisioned, no override key given: we deliberately left the credential untouched
    // (see provisionProject's header comment), which means we no longer HOLD the plaintext key
    // (only its hash is stored) — so we structurally CANNOT re-authenticate to re-sync the
    // feature registry here. Say so plainly rather than crash or silently skip without a trace.
    console.log(
      `Self project '${SELF_PROJECT_SLUG}' (${projectId}) already exists — credential left ` +
        `untouched (no SELF_PROJECT_API_KEY given). Skipped re-syncing the '${SIGNAL_KEY}' signal: ` +
        `re-run with SELF_PROJECT_API_KEY set to the project's EXISTING key to also re-sync it.`,
    )
    return
  }

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
