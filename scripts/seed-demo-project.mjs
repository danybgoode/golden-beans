#!/usr/bin/env node
// seed-demo-project.mjs — Story 1.2 (Roadmap/02-commercial/commercial-shell/sprint-1.md). Seeds
// (idempotently, re-runnable) the synthetic `golden-beans-demo` project the public landing's
// live-proof section reads. Everything below the project-row upsert goes through the REAL
// Bearer-authed API, the same surface any customer uses — never a raw DB insert for content.
//
// Uses raw fetch() rather than importing @golden-beans/sdk: the SDK ships as un-transpiled TS
// source with extensionless internal imports (`./bucketing`), which Next.js's bundler resolves
// fine but plain `node` cannot (ERR_MODULE_NOT_FOUND — no TS/extensionless-ESM loader outside a
// bundler). The payloads below are byte-identical to what the SDK's track()/trackAdoption()/
// trackExposure()/syncFeatures() send (packages/sdk/src/index.ts) — same wire contract, just
// without importing the package a plain Node script can't resolve.
//
// Env vars:
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — provisioning (project row + content reset)
//   GROWTH_ENGINE_URL                        — the running server the fetch calls target
//                                               (defaults to http://localhost:3000)
//   DEMO_PROJECT_API_KEY                     — optional; if set, hash+upsert this fixed value
//                                               instead of a fresh random key each run, so a
//                                               developer can curl the demo project manually.
import { createHash, randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

export const DEMO_PROJECT_SLUG = process.env.DEMO_PROJECT_SLUG?.trim() || 'golden-beans-demo'
const FEATURE_KEY = 'setup_guide'
const TARGET_EVENT = 'setup_guide_viewed'
const ADOPTED_EVENT = 'setup_guide_step_completed'
const RETAINED_EVENT = 'setup_guide_share_tapped'
const NORTH_STAR_KEY = 'payable_sellers'
const INPUT_KEY = 'setup_guide_completions'
const EXPERIMENT_KEY = 'quick-upload-ui'
const CONVERSION_EVENT = 'upload_completed'

// Small, deliberately modest counts — enough to produce a realistic, non-trivial narrowing
// funnel and A/B lift without a long-running seed script.
const TARGETED_USERS = 60
const ADOPTED_USERS = 39 // 65% of targeted
const RETAINED_USERS = 16 // ~41% of adopted
const AB_EXPOSURES_PER_VARIANT = 80
const AB_CONTROL_CONVERSIONS = 5 // ~6%
const AB_TREATMENT_CONVERSIONS = 6 // ~7.5%

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
  const plaintextKey = process.env.DEMO_PROJECT_API_KEY?.trim() || randomBytes(24).toString('hex')
  const { data, error } = await db
    .from('projects')
    .upsert({ slug: DEMO_PROJECT_SLUG, api_key_hash: hashApiKey(plaintextKey) }, { onConflict: 'slug' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Failed to upsert demo project: ${error?.message}`)
  // multi-tenant-activation Story 1.3: lib/auth.ts resolves the Bearer key from api_keys now, so
  // the provisioned key needs an active api_keys row (projects.api_key_hash alone no longer auths).
  await ensureActiveApiKey(db, data.id, plaintextKey)
  return { projectId: data.id, apiKey: plaintextKey }
}

// Idempotent: the same key hash is a no-op on re-run (unique key_hash); a rotated key just adds a
// new active row. Never revokes here — that's a deliberate dashboard action, not a seed side effect.
async function ensureActiveApiKey(db, projectId, plaintextKey) {
  const { error } = await db
    .from('api_keys')
    .upsert(
      { project_id: projectId, key_hash: hashApiKey(plaintextKey), label: 'default (seed)' },
      { onConflict: 'key_hash', ignoreDuplicates: true },
    )
  if (error) throw new Error(`Failed to upsert demo api key: ${error.message}`)
}

// Story 2.1 (commercial-shell/sprint-2.md) — provisioning-only, like the project row above: a
// direct DB upsert, not a call through the real API (there is no self-serve token-minting
// endpoint in v1). Reuses an existing non-revoked token if one exists (idempotent re-runs), else
// mints one matching lib/connector-tokens.ts's format (kept in sync manually — this script can't
// import that TS file, see the header comment).
async function provisionConnectorToken(db, projectId) {
  const { data: existing, error: existingError } = await db
    .from('connector_tokens')
    .select('token')
    .eq('project_id', projectId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existingError) throw new Error(`Failed to look up existing connector token: ${existingError.message}`)
  if (existing) return existing.token

  const token = process.env.DEMO_CONNECTOR_TOKEN?.trim() || `gb_connector_${randomBytes(24).toString('base64url')}`
  const { error: insertError } = await db.from('connector_tokens').insert({ project_id: projectId, token })
  if (insertError) throw new Error(`Failed to insert connector token: ${insertError.message}`)
  return token
}

// Bounded, destructive maintenance scoped to this one project_id — not a substitute for the real
// seeding below, just a clean slate so the funnel/A-B numbers don't double on reseed.
//
// Deliberately does NOT touch north_star_metrics/leading_inputs/feature_inputs/input_values:
// input_values has a hard, permanent append-only trigger (BEFORE UPDATE OR DELETE, raises) — and
// that trigger fires even on a DELETE cascaded in from north_star_metrics via the FK, so a
// north_star_metrics delete fails outright the moment any input_values rows exist (i.e. on every
// run after the first). North Star reseed idempotency instead relies on the real API's own
// idempotent behavior: registerNorthStar/linkFeatureInput upsert on conflict (no duplicate rows),
// and seedNorthStarTrend's daily pushes dedupe by (input_id, occurredOn) — re-running on the same
// day is a complete no-op; running on a later day naturally extends the trend forward, which is
// correct behavior for a real, growing ledger, not a bug to work around.
async function resetProjectContent(db, projectId) {
  const { error: eventsError } = await db.from('events').delete().eq('project_id', projectId)
  if (eventsError) throw new Error(`Failed to reset events: ${eventsError.message}`)
  const { error: featuresError } = await db.from('features').delete().eq('project_id', projectId)
  if (featuresError) throw new Error(`Failed to reset features: ${featuresError.message}`)
}

// Mirrors packages/sdk/src/index.ts's track(): POST /api/v1/track, { userId, event, ...props }.
async function track(baseUrl, apiKey, userId, event, props = {}) {
  const res = await fetch(`${baseUrl}/api/v1/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ userId, event, ...props }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.ok) {
    throw new Error(`track(${event}) for ${userId}: HTTP ${res.status} ${JSON.stringify(body)}`)
  }
}

// Mirrors the SDK's trackExposure(): 'experiment_exposed' with featureId=experimentKey and the
// variant carried in tags.variant.
async function trackExposure(baseUrl, apiKey, userId, experimentKey, variant) {
  await track(baseUrl, apiKey, userId, 'experiment_exposed', { featureId: experimentKey, tags: { variant } })
}

async function seedFunnel(baseUrl, apiKey) {
  for (let i = 0; i < TARGETED_USERS; i++) {
    await track(baseUrl, apiKey, `demo-user-${i}`, TARGET_EVENT, { featureId: FEATURE_KEY })
  }
  for (let i = 0; i < ADOPTED_USERS; i++) {
    await track(baseUrl, apiKey, `demo-user-${i}`, ADOPTED_EVENT, { featureId: FEATURE_KEY })
  }
  for (let i = 0; i < RETAINED_USERS; i++) {
    await track(baseUrl, apiKey, `demo-user-${i}`, RETAINED_EVENT, { featureId: FEATURE_KEY })
  }
}

// Mirrors the SDK's syncFeatures(): POST /api/v1/features/sync.
async function registerFeature(baseUrl, apiKey) {
  const res = await fetch(`${baseUrl}/api/v1/features/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      features: [
        {
          key: FEATURE_KEY,
          enabled: true,
          targetEvent: TARGET_EVENT,
          adoptedEvent: ADOPTED_EVENT,
          retainedEvent: RETAINED_EVENT,
          retentionDays: 7,
          description: 'Synthetic demo-project setup-guide funnel (commercial-shell Story 1.2).',
        },
      ],
    }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.ok) throw new Error(`registerFeature: HTTP ${res.status} ${JSON.stringify(body)}`)
}

async function registerNorthStar(baseUrl, apiKey) {
  const res = await fetch(`${baseUrl}/api/v1/north-star/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      metric: { key: NORTH_STAR_KEY, name: 'Payable sellers', description: 'Synthetic demo North Star metric.' },
      inputs: [{ key: INPUT_KEY, name: 'Setup-guide completions', valueSource: 'external_push' }],
    }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.ok) throw new Error(`registerNorthStar: HTTP ${res.status} ${JSON.stringify(body)}`)
}

async function linkFeatureInput(baseUrl, apiKey) {
  const res = await fetch(`${baseUrl}/api/v1/features/${FEATURE_KEY}/link-input`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ inputKey: INPUT_KEY }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.ok) throw new Error(`linkFeatureInput: HTTP ${res.status} ${JSON.stringify(body)}`)
}

// external_push (not fabricated created_at via direct DB writes) so every North Star number is a
// real row inserted through the real, dedupe-safe, intended API — ~14 days of gently rising
// completions.
async function seedNorthStarTrend(baseUrl, apiKey) {
  const values = []
  const today = new Date()
  for (let daysAgo = 13; daysAgo >= 0; daysAgo--) {
    const date = new Date(today)
    date.setUTCDate(date.getUTCDate() - daysAgo)
    const occurredOn = date.toISOString().slice(0, 10)
    const value = 18 + Math.round((13 - daysAgo) * 1.3)
    values.push({ occurredOn, value })
  }
  const res = await fetch(`${baseUrl}/api/v1/inputs/${INPUT_KEY}/values`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ values }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.ok) throw new Error(`seedNorthStarTrend: HTTP ${res.status} ${JSON.stringify(body)}`)
}

// Exposure + conversion, matching lib/ab-query.ts's documented, realistic behavior: a real
// conversion event fired through the normal track() path does NOT carry an unrelated experiment's
// featureId — that's not how business events get tracked, and the growth-engine-v1 retrospective
// already flagged tagging conversions with the experiment key as a mistake to avoid repeating.
async function seedExperiment(baseUrl, apiKey) {
  for (let i = 0; i < AB_EXPOSURES_PER_VARIANT; i++) {
    await trackExposure(baseUrl, apiKey, `demo-ab-control-${i}`, EXPERIMENT_KEY, 'control')
  }
  for (let i = 0; i < AB_EXPOSURES_PER_VARIANT; i++) {
    await trackExposure(baseUrl, apiKey, `demo-ab-treatment-${i}`, EXPERIMENT_KEY, 'treatment')
  }
  for (let i = 0; i < AB_CONTROL_CONVERSIONS; i++) {
    await track(baseUrl, apiKey, `demo-ab-control-${i}`, CONVERSION_EVENT)
  }
  for (let i = 0; i < AB_TREATMENT_CONVERSIONS; i++) {
    await track(baseUrl, apiKey, `demo-ab-treatment-${i}`, CONVERSION_EVENT)
  }
}

export async function main() {
  const baseUrl = process.env.GROWTH_ENGINE_URL?.trim() || 'http://localhost:3000'
  const db = supabase()

  const { projectId, apiKey } = await provisionProject(db)
  await resetProjectContent(db, projectId)

  await registerFeature(baseUrl, apiKey)
  await registerNorthStar(baseUrl, apiKey)
  await linkFeatureInput(baseUrl, apiKey)
  await seedFunnel(baseUrl, apiKey)
  await seedNorthStarTrend(baseUrl, apiKey)
  await seedExperiment(baseUrl, apiKey)
  const connectorToken = await provisionConnectorToken(db, projectId)

  console.log(
    `Seeded demo project '${DEMO_PROJECT_SLUG}' (${projectId}): ` +
      `${TARGETED_USERS} targeted / ${ADOPTED_USERS} adopted / ${RETAINED_USERS} retained, ` +
      `14-day North Star trend, ${AB_EXPOSURES_PER_VARIANT * 2} A/B exposures.`,
  )
  console.log(`Connector URL: ${baseUrl}/api/v1/public/mcp/c/${connectorToken}`)
}

// Guard main() so importing this file for its constants (DEMO_PROJECT_SLUG) never re-executes it
// for real (Roadmap/LEARNINGS.md).
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  main().catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}
