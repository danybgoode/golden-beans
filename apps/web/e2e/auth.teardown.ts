import { test as teardown } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { rmSync } from 'node:fs'
import {
  AUTHED_STATE_PATH,
  TENANT_RECORD_PATH,
  shouldSweepFixtureUser,
  readTenantRecord,
} from './helpers/authed-fixture'

// Authed browser smoke — the cleanup half.
//
// A fixture that creates a real auth user and a real tenant must remove them, or every run leaves
// an orphan and the database slowly fills with accounts that look real. WAYS-OF-WORKING is explicit
// about this for live confirmation: exercise real behaviour with a disposable account, then clean
// up after.
//
// Deletes by the IDs auth.setup.ts RECORDED, never by re-deriving the email — setup and teardown
// are separate processes and the run id would differ, so a re-derived address would match nothing
// and silently delete nothing (see the note on TenantRecord).
//
// Best-effort by design: a teardown failure must not turn a green run red. It reports loudly
// instead, because a missed cleanup is an untidy database, while a teardown that fails the suite
// hides whatever the suite actually found.

function admin() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

teardown('remove the disposable tenant and auth user', async () => {
  const record = readTenantRecord()
  const db = admin()

  if (!db || !record) {
    process.stderr.write(
      '[auth.teardown] no fixture record or no service credentials — nothing to clean up.\n'
    )
    return
  }

  // Order matters: membership first, then the project, then the auth user. Deleting the user while
  // rows still reference it can leave orphaned membership rows behind depending on FK behaviour.
  const steps: Array<[string, () => Promise<{ error: { message: string } | null }>]> = [
    [
      'project_members',
      async () => {
        const { error } = await db.from('project_members').delete().eq('user_id', record.userId)
        return { error }
      },
    ],
    // The project-scoped steps no-op when provisioning never got that far (projectId is null). A
    // `.eq('project_id', null)` would otherwise match nothing while looking like it worked.
    [
      'api_keys',
      async () => {
        if (!record.projectId) return { error: null }
        const { error } = await db.from('api_keys').delete().eq('project_id', record.projectId)
        return { error }
      },
    ],
    [
      'projects',
      async () => {
        if (!record.projectId) return { error: null }
        const { error } = await db.from('projects').delete().eq('id', record.projectId)
        return { error }
      },
    ],
    [
      'auth user',
      async () => {
        const { error } = await db.auth.admin.deleteUser(record.userId)
        return { error: error ? { message: error.message } : null }
      },
    ],
  ]

  for (const [label, run] of steps) {
    try {
      const { error } = await run()
      // A report_artifacts row is INTENTIONALLY undeletable while its project exists, and its own
      // trigger permits removal once the project is gone — so the projects delete above may still
      // fail if artifacts remain. That is the immutability guarantee working, not a bug; say so
      // rather than reporting a mysterious failure.
      if (error) process.stderr.write(`[auth.teardown] ${label}: ${error.message}\n`)
    } catch (err) {
      process.stderr.write(`[auth.teardown] ${label} threw: ${(err as Error).message}\n`)
    }
  }

  // ── Sweep orphans from earlier crashed runs ──────────────────────────────────────────────────
  // The record-early fix above prevents NEW orphans, but a run that died before writing anything —
  // or one from before that fix — still left a user behind. These are unmistakably fixtures (the
  // FIXTURE_PREFIX email on an `example.invalid` domain), so removing them is safe.
  //
  // The one-hour floor is what makes this safe under CONCURRENCY: a live parallel run's user is
  // seconds old, so it can never be swept by a sibling run's teardown. Without that floor this
  // would delete the very account another worker is signed in as.
  try {
    const { data: users } = await db.auth.admin.listUsers({ perPage: 200 })
    // The decision lives in a pure, unit-tested predicate (helpers/fixture-sweep.ts) rather than
    // inline here — it authorises deleting real auth users, and each of its four guards has a test.
    const orphans = (users?.users ?? []).filter((u) =>
      shouldSweepFixtureUser(u, { now: Date.now(), currentUserId: record.userId })
    )
    for (const orphan of orphans) {
      const { error } = await db.auth.admin.deleteUser(orphan.id)
      process.stderr.write(
        error
          ? `[auth.teardown] could not sweep orphan ${orphan.email}: ${error.message}\n`
          : `[auth.teardown] swept orphaned fixture user ${orphan.email} from an earlier crashed run\n`
      )
    }
  } catch (err) {
    process.stderr.write(`[auth.teardown] orphan sweep failed (non-fatal): ${(err as Error).message}\n`)
  }

  for (const path of [AUTHED_STATE_PATH, TENANT_RECORD_PATH]) {
    try {
      rmSync(path, { force: true })
    } catch {
      /* the run is over; a leftover local file is not worth failing on */
    }
  }
})
