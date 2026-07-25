import { test as setup, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { AUTHED_STATE_PATH, TEST_USER, TENANT_RECORD_PATH, type TenantRecord } from './helpers/authed-fixture'

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

  await page.context().storageState({ path: AUTHED_STATE_PATH })
})
