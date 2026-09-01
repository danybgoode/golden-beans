import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Shared constants + the tenant record for the authed browser harness.
//
// Kept in its own module so auth.setup.ts, auth.teardown.ts and every authed spec agree on WHERE
// the state lives and WHICH user it belongs to. Three files inventing the same path independently
// is how a teardown ends up deleting nothing while the specs read a stale session.

// Written under .auth/ inside the Playwright test dir. `test-results/` and `playwright/.cache/` are
// already gitignored; this path is added to .gitignore alongside them, because storageState
// contains a REAL (if disposable) session token and must never be committed.
const AUTH_DIR = join(__dirname, '..', '.auth')

export const AUTHED_STATE_PATH = join(AUTH_DIR, 'browser-state.json')
export const TENANT_RECORD_PATH = join(AUTH_DIR, 'tenant.json')

// The fixture prefix + the sweep predicate live in ./fixture-sweep.ts (pure, zero-import) and are
// re-exported here for convenience. They are NOT declared in this file because it resolves paths
// from `__dirname`, which is undefined under a plain `node --test` ESM run — a pure helper sharing
// a file with environment-dependent code cannot be unit-tested at all (Roadmap/LEARNINGS.md).
export { FIXTURE_PREFIX, shouldSweepFixtureUser } from './fixture-sweep'
import { FIXTURE_PREFIX } from './fixture-sweep'

// Run-unique so two concurrent runs cannot collide on one email, and so a crashed run leaves an
// obviously-labelled orphan rather than something mistakable for a real account.

const runId = process.env.PLAYWRIGHT_RUN_ID || `${Date.now()}-${process.pid}`

export const TEST_USER = {
  email: `${FIXTURE_PREFIX}+${runId}@example.invalid`,
  // A random-enough disposable password. Not a secret worth protecting: the account exists for the
  // length of one run, on a database that also holds only fixtures, and teardown deletes it. It is
  // generated rather than hardcoded so a leaked copy of this file is not a working credential.
  password: `Gb!${runId}!${Math.random().toString(36).slice(2, 10)}`,
}

// The record carries the EMAIL as well as the ids, and that is load-bearing rather than
// informational. `runId` above is derived from Date.now()+pid, and setup and teardown run in
// SEPARATE PROCESSES — so a teardown that recomputed TEST_USER.email would compute a different
// address than the one setup created and would cheerfully delete nothing, leaving a real auth user
// behind on every run. Teardown therefore keys off what setup actually wrote, never off a value it
// re-derives.
// `projectId`/`slug` are nullable because the record is written the moment the auth USER exists —
// before the tenant does — so that a failure in between still leaves teardown something to clean.
export type TenantRecord = {
  userId: string
  projectId: string | null
  slug: string | null
  email: string
}

/** The tenant auth.setup.ts provisioned, or null when setup has not run. */
export function readTenantRecord(): TenantRecord | null {
  if (!existsSync(TENANT_RECORD_PATH)) return null
  try {
    return JSON.parse(readFileSync(TENANT_RECORD_PATH, 'utf8')) as TenantRecord
  } catch {
    return null
  }
}

// app-component-kit-adoption · Sprint 2 — the impact fixture.
//
// `/app/impact/[projectSlug]/[featureKey]` is the one converted route the authed rail could not
// reach, because the page needs a feature with a linked input and a recorded series and the fixture
// provisioned a bare tenant (cross-review, Agy, PR #83). auth.setup.ts now seeds exactly enough for
// the page to render: one metric, one `external_push` input, the feature link, and three days of
// values.
//
// `external_push` rather than `telemetry_event` on purpose — a pushed series is written directly and
// is deterministic, where a telemetry series would depend on ingesting events and would bucket by
// TODAY, making the row count depend on when the suite runs.
//
// Nothing extra is needed in auth.teardown.ts: every one of these tables is
// `REFERENCES projects(id) ON DELETE CASCADE`, and teardown already deletes the project.
export const IMPACT_FEATURE_KEY = 'gb-e2e-impact-feature'
export const IMPACT_INPUT_KEY = 'gb-e2e-impact-revenue'
export const IMPACT_SERIES: ReadonlyArray<{ occurredOn: string; value: number }> = [
  { occurredOn: '2026-03-01', value: 120.5 },
  { occurredOn: '2026-03-02', value: 80 },
  { occurredOn: '2026-03-03', value: 240.25 },
]

/**
 * design-system-rails · Story 4.2 — the ONE fixture feature that has a funnel.
 *
 * ⚠️ **A flag key and a TARS signal key are different registries, and a feature only has a funnel
 * when the SAME key exists in both.** Production `miyagisanchez` holds 42 flag registries and
 * exactly one TARS feature (`setup_guide`), and the two sets do not overlap — so 42 of 42 flags
 * render the Funnel tab's empty state, and that empty state is the deliverable (epic D10).
 *
 * The sprint contract's fourth row says the *funnel-renders-numbers* spec belongs on a feature that
 * HAS a funnel, because "asserting numbers on a flag's tab is a test that cannot pass". `setup_guide`
 * is production data that CI cannot reach, so this is its local counterpart: one key registered in
 * BOTH registries, with enough events for a real Targeted/Adopted/Retained. D10 assigns exactly this
 * job to the local fixture — "populated states are asserted by the visual gate against the local
 * fixture tenant, which the `authed` rail seeds".
 *
 * The key deliberately looks nothing like the two scenario flags, so a spec asserting the EMPTY
 * state can pick one of those and a spec asserting NUMBERS can pick this one, without either
 * depending on row order.
 */
export const FUNNEL_FEATURE_KEY = 'gb.e2e.funnel.measured'
export const FUNNEL_TARGET_EVENT = 'gb_e2e_funnel_targeted'
export const FUNNEL_ADOPTED_EVENT = 'gb_e2e_funnel_adopted'
export const FUNNEL_RETAINED_EVENT = 'gb_e2e_funnel_retained'
/** Three targeted, two adopted, one retained — so every row of the funnel is a DIFFERENT number. */
export const FUNNEL_SUBJECTS = ['gb-e2e-funnel-a', 'gb-e2e-funnel-b', 'gb-e2e-funnel-c'] as const

export const SCENARIO_FIXTURE_KEY = 'gb_e2e_owner_scenario'
export const SCENARIO_TARGET_KEY = 'gb.e2e.owner.probe'
export const SCENARIO_FLAG_KEY = 'gb.e2e.owner.fault'
export const SCENARIO_UNDISCLOSED_KEY = 'gb_e2e_undisclosed_scenario'
export const SCENARIO_UNDISCLOSED_FLAG_KEY = 'gb.e2e.owner.noop'

// ── design-system-rails · Sprint 5, Story 5.4 — the experiment fixture ────────────────────────
//
// Production `miyagisanchez` has two experiments and both are `decided` (epic D10), so neither the
// `experiment-ready` nor the `experiment-blocked` state is reachable on a live tenant. The counts
// below are chosen so the 95% interval on the relative lift sits WELL clear of zero: an interval
// that crossed it would make the spec's assertion turn on rounding, which is a fixture that goes red
// for the wrong reason one release later.
export const EXPERIMENT_FIXTURE_KEY = 'gb-e2e-checkout-one-page'
export const EXPERIMENT_METRIC_EVENT = 'gb_e2e_checkout_completed'
export const EXPERIMENT_EXPOSURES_PER_ARM = 200
export const EXPERIMENT_CONTROL_CONVERSIONS = 40
export const EXPERIMENT_TREATMENT_CONVERSIONS = 70
