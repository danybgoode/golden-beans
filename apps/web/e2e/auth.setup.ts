import type { SupabaseClient } from '@supabase/supabase-js'
import { test as setup, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { hashCredential } from '@/lib/credential-hash'
import {
  AUTHED_STATE_PATH,
  IMPACT_FEATURE_KEY,
  IMPACT_INPUT_KEY,
  IMPACT_SERIES,
  FUNNEL_ADOPTED_EVENT,
  FUNNEL_FEATURE_KEY,
  FUNNEL_RETAINED_EVENT,
  FUNNEL_SUBJECTS,
  FUNNEL_TARGET_EVENT,
  SCENARIO_FIXTURE_KEY,
  SCENARIO_FLAG_KEY,
  SCENARIO_TARGET_KEY,
  SCENARIO_UNDISCLOSED_FLAG_KEY,
  SCENARIO_UNDISCLOSED_KEY,
  TEST_USER,
  TENANT_RECORD_PATH,
  type TenantRecord,
} from './helpers/authed-fixture'

// Authed browser smoke — the setup half.
//
// ── Why drive the real login form instead of injecting session cookies ────────────────────────
// Injecting cookies from an admin-issued session is faster and is what most harnesses do. It also
// means the ONE flow most likely to break silently — a real human typing an email and a password
// into our actual form — is never exercised by anything. Driving the form once per run costs a few
// seconds and covers it for free; every authed spec then reuses the resulting storageState and
// starts already signed in.
//
// ── Why this is not in the CI gate ────────────────────────────────────────────────────────────
// Chromium binaries are heavy and slow, and WAYS-OF-WORKING is explicit that the `browser` project
// is opt-in and NOT the blocking gate. The point of this harness is different: a browser spec
// REPLACES a browser smoke otherwise owed to the product owner, so it converts the mechanical half
// of that manual pass into automation and leaves him only the judgement calls.
//
// ── The fixture is DISPOSABLE and cleaned up ──────────────────────────────────────────────────
// A real auth user plus a real tenant are created here and removed by auth.teardown.ts. Everything
// is namespaced with a run-unique suffix so two concurrent runs cannot collide, and so a crashed
// run leaves an obviously-labelled orphan rather than a plausible-looking real tenant.

function admin() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to provision the authed browser fixture'
    )
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** Persist the fixture record. Called twice: once the user exists, again once the tenant does. */
function writeRecord(record: TenantRecord) {
  mkdirSync(dirname(TENANT_RECORD_PATH), { recursive: true })
  writeFileSync(TENANT_RECORD_PATH, JSON.stringify(record, null, 2))
}

setup('provision a disposable tenant and sign in through the real form', async ({ page }) => {
  const db = admin()

  // `email_confirm: true` because this fixture must not depend on a mail transport. It is the one
  // shortcut taken here, and it is a shortcut around EMAIL DELIVERY, not around authentication —
  // the password grant below is the same one a real user's login performs.
  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email: TEST_USER.email,
    password: TEST_USER.password,
    email_confirm: true,
  })
  if (createErr || !created?.user) {
    throw new Error(`could not create the disposable auth user: ${createErr?.message ?? 'no user returned'}`)
  }
  const userId = created.user.id

  // ── Record the user IMMEDIATELY, before anything that can fail ──────────────────────────────
  // Teardown deletes what this file recorded. If the record is only written at the END (as the
  // first version did), then any failure in between — a broken login form, a provisioning bug,
  // a timeout — leaves a real auth user behind that teardown cannot see and therefore cannot
  // remove. That is not hypothetical: this fixture's own first run threw at the provisioning
  // check and leaked exactly one orphaned user, found by querying auth.users afterwards rather
  // than by trusting the teardown's success message.
  //
  // So the record is written here with what is known, and enriched below once the tenant exists.
  // Teardown tolerates a null projectId for precisely this reason.
  writeRecord({ userId, projectId: null, slug: null, email: TEST_USER.email })

  // Provision a tenant for the user the same way the app does — through a real signup/callback —
  // rather than hand-inserting rows, so the fixture cannot drift from production behaviour. The
  // app provisions on first sign-in via /app/provision, so signing in below is what creates it.
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(TEST_USER.email)
  await page.getByLabel(/password/i).fill(TEST_USER.password)
  await page.getByRole('button', { name: /sign in|log in/i }).click()

  // A successful login lands somewhere inside /app. Asserting we LEFT /login is the honest check:
  // asserting a specific destination would couple this fixture to a redirect target that is free to
  // change without breaking authentication.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 })
  await expect(page).not.toHaveURL(/\/login/)

  // ── Wait for PROVISIONING, which is a separate round-trip from signing in ───────────────────
  // Signing in only sets a session. The tenant is created when /app notices the user has none and
  // redirects to /app/provision (a Route Handler, because only one of those can set the one-time
  // key cookie), which provisions and redirects back. Leaving /login therefore happens BEFORE the
  // tenant exists — the first version of this fixture read the membership table right here and
  // found nothing, then blamed the provisioning path.
  //
  // So: land on /app deliberately, and wait until the redirect chain settles somewhere that is not
  // the provisioning route itself.
  await page.goto('/app')
  await page.waitForURL((url) => !url.pathname.startsWith('/app/provision'), { timeout: 30_000 })

  // `?provision=failed` is the app's own loop-breaker for a provisioning failure. Reading it here
  // turns a silent "no tenant" into the real diagnosis.
  if (page.url().includes('provision=failed')) {
    throw new Error(
      'the app reported provision=failed — tenant provisioning genuinely failed. Check that ' +
        'SIGNUP_ENABLED=true is set on the RUNNING server process (it gates the provisioning ' +
        'redirect), then re-run.'
    )
  }

  // Resolve the tenant the app just provisioned, so specs can address it by slug and teardown can
  // remove exactly it.
  const { data: membership, error: memErr } = await db
    .from('project_members')
    .select('project_id, projects(slug)')
    .eq('user_id', userId)
    .maybeSingle()
  if (memErr) throw new Error(`could not resolve the provisioned tenant: ${memErr.message}`)
  if (!membership) {
    throw new Error(
      'sign-in succeeded but no tenant was provisioned — the app provisions on first sign-in, so ' +
        'this means the provisioning path itself is broken, which is exactly what this fixture ' +
        'should surface loudly rather than work around.'
    )
  }

  const slug = (membership.projects as unknown as { slug: string } | null)?.slug ?? null
  // Enrich the record now that the tenant exists. The email is recorded, never re-derived by
  // teardown — see the note on TenantRecord.
  writeRecord({ userId, projectId: membership.project_id as string, slug, email: TEST_USER.email })

  await seedImpactFixture(db, membership.project_id as string)
  await seedFunnelFixture(db, membership.project_id as string)
  await seedScenarioFixture(db, membership.project_id as string, userId)

  await page.context().storageState({ path: AUTHED_STATE_PATH })
})

/**
 * Seed the ONE fixture feature that has a funnel — design-system-rails Story 4.2.
 *
 * ⚠️ **A funnel needs a row in a DIFFERENT registry from the one a flag lives in.**
 * `getFeatureFunnelByProjectId` reads `features` (the TARS signal registry); a flag lives in
 * `flag_registries`. The two have separate lifecycles and separate naming conventions, and on
 * production `miyagisanchez` they have ZERO overlap — 42 flag registries, one TARS feature
 * (`setup_guide`), so every flag a reader can click renders the Funnel tab's empty state.
 *
 * That empty state is a deliverable and is asserted on a scenario flag. What could NOT be asserted
 * without this is the other half: that when a feature does have a funnel, the tab renders NUMBERS.
 * The sprint contract puts that spec on `setup_guide`, which is production data CI cannot reach —
 * so this is its local counterpart, registered in BOTH registries with a real event history.
 *
 * Written through the service client rather than `/api/v1/features/sync` + `/api/v1/track` because
 * both need a project API key, and the fixture never captures one: provisioning shows the plaintext
 * once, in the onboarding UI, and never again. Same reasoning as `seedImpactFixture` above, and the
 * same teardown story — every table here is `REFERENCES projects(id) ON DELETE CASCADE`.
 *
 * The counts are 3 targeted / 2 adopted / 1 retained, deliberately all different: a spec asserting
 * "the funnel renders numbers" against three equal values could pass on a page rendering one number
 * three times.
 */
async function seedFunnelFixture(db: SupabaseClient, projectId: string) {
  const { error: featureError } = await db.from('features').insert({
    project_id: projectId,
    key: FUNNEL_FEATURE_KEY,
    enabled: true,
    target_event: FUNNEL_TARGET_EVENT,
    adopted_event: FUNNEL_ADOPTED_EVENT,
    retained_event: FUNNEL_RETAINED_EVENT,
    retention_days: 7,
    description: 'Disposable measured feature, so the Funnel tab has numbers to render.',
  })
  if (featureError) throw new Error(`could not seed the funnel feature: ${featureError.message}`)

  // `feature_id` is the FEATURE KEY on `events`, not a foreign key — the ingest path writes the
  // string the SDK sent. Matching `tars-query`'s own `.eq('feature_id', featureKey)`.
  //
  // ⚠️ **The TIMESTAMPS are explicit, and without them `retained` is always 0.** `computeTars`
  // anchors the retention window to each user's earliest ADOPTING event and requires a later
  // qualifying event strictly after it (`t > baseline`). Inserting six rows in one statement gives
  // them all the same `now()` default, so the retained event lands exactly ON the baseline and the
  // funnel reads 3 / 2 / 0 — a number that looks like a measurement and is an artefact of the seed.
  // Found by running the spec rather than by reading the query.
  const [first, second, third] = FUNNEL_SUBJECTS
  const hourAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()
  const rows = [
    { user_id: first, event: FUNNEL_TARGET_EVENT, created_at: hourAgo(72) },
    { user_id: second, event: FUNNEL_TARGET_EVENT, created_at: hourAgo(72) },
    { user_id: third, event: FUNNEL_TARGET_EVENT, created_at: hourAgo(72) },
    { user_id: first, event: FUNNEL_ADOPTED_EVENT, created_at: hourAgo(48) },
    { user_id: second, event: FUNNEL_ADOPTED_EVENT, created_at: hourAgo(48) },
    // Inside the feature's 7-day retention window, and strictly after the adoption above.
    { user_id: first, event: FUNNEL_RETAINED_EVENT, created_at: hourAgo(24) },
  ].map((row) => ({ ...row, project_id: projectId, feature_id: FUNNEL_FEATURE_KEY }))
  const { error: eventsError } = await db.from('events').insert(rows)
  if (eventsError) throw new Error(`could not seed the funnel events: ${eventsError.message}`)
}

async function seedScenarioFixture(db: SupabaseClient, projectId: string, ownerId: string) {
  const flagDefinition = {
    valueType: 'json',
    description: 'Disposable owner-authoring fault payload.',
    defaultVariantKey: 'control',
    variants: [
      { key: 'control', value: { kind: 'none' } },
      { key: 'delay', value: { kind: 'delay', delayMs: 25 } },
    ],
    rules: [
      {
        priority: 1,
        clauses: [{ field: 'source', operator: 'equals', value: 'internal' }],
        variantKey: 'delay',
      },
    ],
  }
  const { data: flag, error: flagError } = await db.rpc('create_flag_definition_version', {
    p_project_id: projectId,
    p_flag_key: SCENARIO_FLAG_KEY,
    p_definition: flagDefinition,
    p_reason: 'seed owner scenario browser fixture',
    p_actor_user_id: ownerId,
  })
  if (flagError || !flag?.[0]) throw new Error(`could not seed scenario fault flag: ${flagError?.message}`)

  const adminKey = `gb_key_${crypto.randomUUID().replaceAll('-', '')}`
  const { error: keyError } = await db.rpc('create_flag_admin_key', {
    p_project_id: projectId,
    p_environment: 'production',
    p_key_hash: hashCredential(adminKey),
    p_label: 'Owner scenario browser fixture',
    p_expires_at: null,
    p_actor_user_id: ownerId,
  })
  if (keyError) throw new Error(`could not seed scenario admin key: ${keyError.message}`)
  const challengeHash = hashCredential(`challenge-${crypto.randomUUID()}`)
  const { data: target, error: targetError } = await db.rpc('register_scenario_target', {
    p_key_hash: hashCredential(adminKey),
    p_target_key: SCENARIO_TARGET_KEY,
    p_target_kind: 'miyagi_resilience_probe_v1',
    p_origin: 'https://owner-scenario.example.test',
    p_ownership_challenge_hash: challengeHash,
    p_reason: 'seed owner scenario browser fixture',
    p_external_actor_id: 'user_OwnerBrowserFixture',
  })
  if (targetError || !target?.[0]) throw new Error(`could not seed scenario target: ${targetError?.message}`)
  const { error: verifyError } = await db.rpc('verify_scenario_target', {
    p_key_hash: hashCredential(adminKey),
    p_target_id: target[0].target_id,
    p_expected_challenge_hash: challengeHash,
    p_reason: 'verify owner scenario browser fixture',
    p_external_actor_id: 'user_OwnerBrowserFixture',
  })
  if (verifyError) throw new Error(`could not verify scenario target: ${verifyError.message}`)

  const definition = {
    contractVersion: 1,
    kind: 'resilience',
    targetKey: SCENARIO_TARGET_KEY,
    environment: 'production',
    cohort: 'synthetic',
    startAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    limits: { requestCap: 3, concurrencyCap: 2, leaseTtlSeconds: 10 },
    guardrails: { abortAfterFailures: 1, maxErrorRateBasisPoints: 10_000 },
    flag: { key: SCENARIO_FLAG_KEY, definitionVersion: Number(flag[0].version) },
  }
  const { error: definitionError } = await db.rpc('owner_create_scenario_definition_version', {
    p_project_id: projectId,
    p_environment: 'production',
    p_actor_user_id: ownerId,
    p_scenario_key: SCENARIO_FIXTURE_KEY,
    p_definition: definition,
    p_reason: 'seed owner scenario browser fixture',
  })
  if (definitionError) throw new Error(`could not seed scenario definition: ${definitionError.message}`)

  // A historic but database-valid closed-fault flag can contain only the no-op variant. The modern
  // disclosure helper intentionally refuses to launch it because there is no injected payload to
  // describe. Seed one already-running run to pin the inverse safety rule: disclosure may block a
  // new launch, but it must never prevent stopping work that is already running.
  const { data: undisclosedFlag, error: undisclosedFlagError } = await db.rpc(
    'create_flag_definition_version',
    {
      p_project_id: projectId,
      p_flag_key: SCENARIO_UNDISCLOSED_FLAG_KEY,
      p_definition: {
        valueType: 'json',
        description: 'Historic no-op-only scenario flag.',
        defaultVariantKey: 'control',
        variants: [{ key: 'control', value: { kind: 'none' } }],
        rules: [],
      },
      p_reason: 'seed undisclosed stop regression',
      p_actor_user_id: ownerId,
    }
  )
  if (undisclosedFlagError || !undisclosedFlag?.[0])
    throw new Error(`could not seed undisclosed scenario flag: ${undisclosedFlagError?.message}`)
  const undisclosedDefinition = {
    ...definition,
    flag: {
      key: SCENARIO_UNDISCLOSED_FLAG_KEY,
      definitionVersion: Number(undisclosedFlag[0].version),
    },
  }
  const { data: undisclosedVersion, error: undisclosedDefinitionError } = await db.rpc(
    'owner_create_scenario_definition_version',
    {
      p_project_id: projectId,
      p_environment: 'production',
      p_actor_user_id: ownerId,
      p_scenario_key: SCENARIO_UNDISCLOSED_KEY,
      p_definition: undisclosedDefinition,
      p_reason: 'seed undisclosed stop regression',
    }
  )
  if (undisclosedDefinitionError || !undisclosedVersion?.[0])
    throw new Error(`could not seed undisclosed scenario definition: ${undisclosedDefinitionError?.message}`)
  const { data: undisclosedRun, error: undisclosedRunError } = await db.rpc('owner_create_scenario_run', {
    p_project_id: projectId,
    p_environment: 'production',
    p_actor_user_id: ownerId,
    p_scenario_version_id: undisclosedVersion[0].scenario_version_id,
    p_reason: 'seed running undisclosed stop regression',
  })
  if (undisclosedRunError || !undisclosedRun?.[0])
    throw new Error(`could not seed undisclosed scenario run: ${undisclosedRunError?.message}`)
  const { error: undisclosedStartError } = await db.rpc('owner_start_scenario_run', {
    p_project_id: projectId,
    p_environment: 'production',
    p_actor_user_id: ownerId,
    p_run_id: undisclosedRun[0].run_id,
    p_expected_revision: undisclosedRun[0].revision,
    p_reason: 'start undisclosed stop regression',
  })
  if (undisclosedStartError)
    throw new Error(`could not start undisclosed scenario run: ${undisclosedStartError.message}`)
}

/**
 * Seed exactly enough for `/app/impact/<slug>/<featureKey>` to render.
 *
 * Added by app-component-kit-adoption Sprint 2: that route was the one converted surface the authed
 * rail could not assert, because a bare tenant has no feature with a linked input and the page 500s
 * without one (cross-review, Agy, PR #83).
 *
 * Written through the service client rather than the public API, because the seeding path needs a
 * project API key and the fixture never captures one — provisioning shows the plaintext once, in the
 * onboarding UI, and never again.
 *
 * No teardown counterpart is needed: every table here is `REFERENCES projects(id) ON DELETE
 * CASCADE`, and auth.teardown.ts already deletes the project.
 */
async function seedImpactFixture(db: SupabaseClient, projectId: string) {
  const { data: metric, error: metricError } = await db
    .from('north_star_metrics')
    .insert({ project_id: projectId, key: 'gb-e2e-impact-metric', name: 'Impact fixture metric' })
    .select('id')
    .single()
  if (metricError || !metric) throw new Error(`could not seed the impact metric: ${metricError?.message}`)

  const { data: input, error: inputError } = await db
    .from('leading_inputs')
    .insert({
      project_id: projectId,
      metric_id: metric.id,
      key: IMPACT_INPUT_KEY,
      name: 'Revenue (fixture)',
      value_source: 'external_push',
    })
    .select('id')
    .single()
  if (inputError || !input) throw new Error(`could not seed the impact input: ${inputError?.message}`)

  const { error: linkError } = await db
    .from('feature_inputs')
    .insert({ project_id: projectId, feature_key: IMPACT_FEATURE_KEY, input_id: input.id })
  if (linkError) throw new Error(`could not link the impact input to a feature: ${linkError.message}`)

  // `dedupe_key` is GLOBALLY unique, not per project — so it is keyed by the project id, which is
  // unique per run. A fixed string would collide with the previous run's leftover row on the second
  // execution and fail a fixture for a reason that has nothing to do with the code under test.
  const { error: valuesError } = await db.from('input_values').insert(
    IMPACT_SERIES.map((point) => ({
      project_id: projectId,
      input_id: input.id,
      occurred_on: point.occurredOn,
      value: point.value,
      dedupe_key: `gb-e2e-impact:${projectId}:${point.occurredOn}`,
    }))
  )
  if (valuesError) throw new Error(`could not seed the impact series: ${valuesError.message}`)
}
