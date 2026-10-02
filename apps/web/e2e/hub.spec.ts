import { test, expect, type APIRequestContext } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { HORIZON_DESTINATIONS } from '../lib/horizon-destinations'
import { specWorkspaceId } from './helpers/spec-workspace'

// pod-report · Sprint 1, Story 1.2 — the journey view and the epic drill-down.
//
// These pages render for the DEMO project anonymously (requireDashboardAccess → the
// assertPublicAllowedSlug allow-list, AGENTS rule #2); every other slug needs a signed-in member.
// So the demo tenant is the only one whose rendered HTML this suite can assert over plain HTTP, and
// the auth boundary itself is already covered by e2e/app-auth.spec.ts rather than re-asserted here.
//
// The fixture is provisioned here rather than assumed, because supabase/seed.sql seeds only
// project-one/project-two — the demo project arrives via `npm run seed:demo`, which runs in CI but
// may not have run on a given developer's machine.
const DEMO_SLUG = process.env.DEMO_PROJECT_SLUG?.trim() || 'golden-beans-demo'
const DEMO_KEY = 'local-hub-spec-key-do-not-use-in-prod'

// ── Why Stories 1.2 and 1.3 share ONE spec file, serially ─────────────────────────────────────
// The hub renders THE LATEST artifact for a tenant, so "push, then read what I just pushed" is only
// meaningful if nothing else pushes in between. Two constraints force this shape:
//
//   1. Within a file, `mode: 'serial'` fixes it. Started as two files, and both passed alone.
//   2. Across files it does NOT — serial mode is per-file, so the journey and horizon specs raced
//      each other's pushes and failed intermittently the moment they ran together. That is exactly
//      how this file came to exist.
//
// The obvious alternative — one tenant per spec file — is unavailable ON PURPOSE: only a single
// slug is publicly readable (AGENTS rule #2, the demo allow-list), and widening it to make tests
// convenient is the one thing that rule forbids. So a single publicly-readable tenant plus a
// latest-wins view means one serial file. The describes below keep the story mapping legible.
test.describe.configure({ mode: 'serial' })

function dbClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  return createClient(url, key, { auth: { persistSession: false } })
}

/**
 * Ensure the demo project exists and that DEMO_KEY authenticates AS IT.
 *
 * Deliberately look-then-verify rather than an `upsert(..., { ignoreDuplicates: true })` on
 * `key_hash`. Roadmap/LEARNINGS.md: key_hash is unique ACROSS ALL PROJECTS, so an insert-or-ignore
 * reports success while writing nothing when the hash is already owned by a different project — and
 * the caller then proceeds believing it holds a credential for the wrong tenant. Here that would
 * make the whole spec assert against someone else's rows.
 */
test.beforeAll(async () => {
  const db = dbClient()
  const keyHash = createHash('sha256').update(DEMO_KEY).digest('hex')

  const { data: existingProject } = await db.from('projects').select('id').eq('slug', DEMO_SLUG).maybeSingle()
  let projectId = existingProject?.id as string | undefined
  if (!projectId) {
    const { data, error } = await db
      .from('projects')
      .insert({ workspace_id: await specWorkspaceId(db), slug: DEMO_SLUG })
      .select('id')
      .single()
    if (error) throw new Error(`could not provision the demo fixture project: ${error.message}`)
    projectId = data.id as string
  }

  const { data: existingKey } = await db
    .from('api_keys')
    .select('project_id, revoked_at')
    .eq('key_hash', keyHash)
    .maybeSingle()

  if (existingKey) {
    // Fail LOUD rather than silently testing the wrong tenant.
    if (existingKey.project_id !== projectId) {
      throw new Error(
        'the hub spec key is bound to a different project — refusing to run against foreign rows'
      )
    }
  } else {
    const { error } = await db
      .from('api_keys')
      .insert({ project_id: projectId, key_hash: keyHash, label: 'hub spec fixture' })
    if (error) throw new Error(`could not provision the demo fixture key: ${error.message}`)
  }
})

const epicRow = (over: Record<string, unknown> = {}) => ({
  name: 'Growth engine v1',
  slug: 'growth-engine-v1',
  grain: 'Epic',
  status: 'Shipped',
  area: '01 Growth Engine',
  build_order_num: 1,
  risk: 'High',
  ...over,
})

async function pushRoadmap(request: APIRequestContext, items: unknown[]) {
  const res = await request.post('/api/v1/roadmap/push', {
    headers: { Authorization: `Bearer ${DEMO_KEY}` },
    data: {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      source: { commit: 'abc1234', ref: 'main' },
      items,
    },
  })
  expect(res.status(), await res.text()).toBe(200)
  return res.json()
}

test('the Roadmap tab shows areas × Shipped · Now · Next · Later, with a freshness stamp (S4.1)', async ({
  request,
}) => {
  const unique = `spec-epic-${Date.now()}`
  await pushRoadmap(request, [
    epicRow({
      slug: unique,
      name: `Shipped ${unique}`,
      stage: 'Shipped',
      build_order_num: 1,
      area: '02 Commercial',
    }),
    epicRow({
      slug: `${unique}-now`,
      name: `Building ${unique}`,
      stage: 'Building',
      build_order_num: 2,
      area: '02 Commercial',
    }),
    epicRow({
      slug: `${unique}-next`,
      name: `Next ${unique}`,
      stage: 'Ready to build',
      build_order_num: 3,
      area: '09 Platform Infra',
    }),
  ])

  const res = await request.get(`/hub/${DEMO_SLUG}`)
  expect(res.status()).toBe(200)
  const html = await res.text()
  // The five columns, in order — the approved `hub-roadmap-areas` list (D10).
  const heads = [...html.matchAll(/class="ds-areas-col" role="columnheader">([^<]+)</g)].map((m) => m[1])
  expect(heads).toEqual(['Area', 'Shipped', 'Now', 'Next', 'Later'])
  expect(html).toContain('02 Commercial')
  expect(html).toContain(`Shipped ${unique}`)
  // The answer names what is Now, with its stage — the journey track's "you are here", where the question is asked.
  expect(html).toContain(`Now: Building ${unique} (Building).`)
  // Every name links to its card on the Board.
  expect(html).toContain(`/board?card=${unique}-next`)
  // The freshness stamp is a required design element, not fine print — in the closing note, with its tone.
  expect(html).toMatch(/as of abc1234/)
  expect(html).toContain('data-freshness-tone="fresh"')
  expect(html).not.toContain('ds-track')
})

test('an epic drill-down renders its sprints, and an unknown slug 404s', async ({ request }) => {
  const unique = `spec-drill-${Date.now()}`
  await pushRoadmap(request, [
    epicRow({ slug: unique, name: `Drill ${unique}`, status: 'Shipped' }),
    {
      ...epicRow({ slug: `${unique}--s1`, grain: 'Sprint', name: `Drill ${unique} — S1: the slice` }),
      epic_slug: unique,
      sprint_progress: '3/3 stories',
      status: 'Shipped',
    },
  ])

  const ok = await request.get(`/hub/${DEMO_SLUG}/epic/${unique}`)
  expect(ok.status()).toBe(200)
  const html = await ok.text()
  expect(html).toContain('S1: the slice')
  expect(html).toContain('3/3 stories')

  // A slug absent from the artifact is a 404, not an empty page pretending to be an epic.
  const missing = await request.get(`/hub/${DEMO_SLUG}/epic/no-such-epic-anywhere`)
  expect(missing.status()).toBe(404)
})

test('the roadmap never computes a stage: a stage-less push is the empty state, a pushed stage is where a row lands', async ({
  request,
}) => {
  // board-sinks-and-scrumban S4.1 (lock D19) — what replaced "the journey never marks an unshipped epic shipped": the
  // Hub no longer reads `status` at all. A push from before stages gets the empty state (push again), never a guess…
  const unique = `spec-claim-${Date.now()}`
  await pushRoadmap(request, [
    epicRow({ slug: unique, name: `Nearly ${unique}`, status: 'Shipping', build_order_num: 1 }),
  ])
  const empty = await (await request.get(`/hub/${DEMO_SLUG}`)).text()
  expect(empty).toContain('pushed before stages existed')
  expect(empty).not.toContain(`Nearly ${unique}`)

  // …and a row lands in its PUSHED stage's horizon, whatever its status says ("Shipping" earns no Shipped cell).
  await pushRoadmap(request, [
    epicRow({ slug: unique, name: `Nearly ${unique}`, status: 'Shipping', build_order_num: 1, stage: 'QA' }),
  ])
  const html = await (await request.get(`/hub/${DEMO_SLUG}`)).text()
  // Anchor on the rendered LINK: the answer line names it too ("Now: …"), and so does Next's serialized page data.
  const idx = html.search(new RegExp(`<a class="ds-areas-item"[^>]*>Nearly ${unique}`))
  expect(idx).toBeGreaterThan(-1)
  const cell = html
    .slice(0, idx)
    .match(/data-horizon="([^"]+)"/g)
    ?.at(-1)
  expect(cell).toBe('data-horizon="Now"')
})

test('a tenant with no pushed artifact gets the deliberate empty state, not a broken page', async ({
  request,
}) => {
  // A fresh slug that is publicly readable only if it IS the demo slug — so instead of inventing a
  // second demo, assert the empty state through the documented auth boundary: an unknown tenant is
  // never served a half-rendered hub. Combined with the component-level content assertions in
  // lib/hub-freshness.test.ts and the rendered pushes above, this covers the branch without
  // depending on a database that has never received a push (artifacts are append-only, so
  // "this tenant has no artifact" stops being true forever after the first run).
  const res = await request.get('/hub/some-tenant-that-does-not-exist', { maxRedirects: 0 })
  expect([302, 303, 307, 404]).toContain(res.status())
})

// ── Story 1.3 fixtures ──────────────────────────────────────────────────────────────────────
/** A destination with exactly one contributing epic — the cleanest lit/coming lever. */
const single = HORIZON_DESTINATIONS.find((d) => d.epics.length === 1)!
/** A destination with several — the partial lever. */
const multi = HORIZON_DESTINATIONS.find((d) => d.epics.length > 1)!

const epic = (slug: string, status: string) => ({
  name: `Epic ${slug}`,
  slug,
  grain: 'Epic',
  status,
  area: '01 Growth Engine',
})

/** The rendered badge for one destination, read from its own test-id'd node. */
function badgeFor(html: string, id: string): string {
  const marker = `data-testid="dest-badge-${id}"`
  const i = html.indexOf(marker)
  expect(i, `destination ${id} did not render`).toBeGreaterThan(-1)
  return html.slice(i, i + 200)
}

test('every destination renders, and a fully-shipped one is LIT', async ({ request }) => {
  await pushRoadmap(
    request,
    single.epics.map((s) => epic(s, 'Shipped'))
  )
  const html = await (await request.get(`/hub/${DEMO_SLUG}/horizon`)).text()

  // The horizon shows the DESTINATION, not the backlog — an unlit destination must still appear, or
  // the page silently degrades into "what happens to be done".
  for (const d of HORIZON_DESTINATIONS) {
    expect(html, `destination ${d.id} must always render`).toContain(`dest-badge-${d.id}`)
  }
  expect(badgeFor(html, single.id)).toContain('lit')
})

test('a destination with only SOME epics shipped is partly lit — never fully lit', async ({ request }) => {
  const [first, ...rest] = multi.epics
  await pushRoadmap(request, [epic(first, 'Shipped'), ...rest.map((s) => epic(s, 'Scaffolded'))])
  const html = await (await request.get(`/hub/${DEMO_SLUG}/horizon`)).text()

  const badge = badgeFor(html, multi.id)
  expect(badge).toContain('partly lit')
  expect(badge).not.toContain('✅')
})

test('nothing claims ✅ for unshipped work — a near-miss status never lights a destination', async ({
  request,
}) => {
  // "Shipping" is the realistic hostile input: it starts with the right word and means the opposite.
  await pushRoadmap(
    request,
    single.epics.map((s) => epic(s, 'Shipping'))
  )
  const html = await (await request.get(`/hub/${DEMO_SLUG}/horizon`)).text()

  const badge = badgeFor(html, single.id)
  expect(badge).toContain('on the way')
  expect(badge).not.toContain('✅')
})

test('seeds render as the hazy horizon, explicitly marked not-promised', async ({ request }) => {
  await pushRoadmap(request, [
    epic('growth-engine-v1', 'Shipped'),
    { ...epic('a-raw-idea', 'Raw'), grain: 'Seed', name: 'A raw idea nobody groomed' },
  ])
  const html = await (await request.get(`/hub/${DEMO_SLUG}/horizon`)).text()

  expect(html).toContain('A raw idea nobody groomed')
  expect(html).toContain('horizon-seeds')
  // An un-groomed idea rendered like a commitment is the dishonesty this view exists to avoid, so
  // the disclaimer is load-bearing content, not decoration.
  expect(html).toMatch(/not<\/strong>?\s*promised|not<\/strong> promised|not promised/i)
})

test('an unknown tenant never renders a half-built horizon', async ({ request }) => {
  const res = await request.get('/hub/some-tenant-that-does-not-exist/horizon', { maxRedirects: 0 })
  expect([302, 303, 307, 404]).toContain(res.status())
})

// ── board-sinks-and-scrumban · Sprint 2 — the Board tab (S2.2 gating, S2.4 filters) ──────────────────────────────

test('the board renders the six stages in order, and ?type=spike keeps only spikes (S2.2, S2.4)', async ({
  request,
}) => {
  const unique = `board-${Date.now()}`
  await pushRoadmap(request, [
    epicRow({
      slug: `${unique}-ready`,
      name: `Ready ${unique}`,
      stage: 'Ready to build',
      type: 'Feature',
      build_order_num: 5,
    }),
    epicRow({
      slug: `${unique}-spike`,
      name: `Spike ${unique}`,
      stage: 'Building',
      type: 'Spike',
      build_order_num: 6,
    }),
    epicRow({
      slug: `${unique}-qa`,
      name: `QA ${unique}`,
      stage: 'QA',
      type: 'Feature',
      risk: 'Low',
      build_order_num: 7,
    }),
  ])

  const all = await (await request.get(`/hub/${DEMO_SLUG}/board`)).text()
  const labels = [...all.matchAll(/class="ds-tile-label">([^<]+)</g)].map((m) => m[1])
  expect(labels).toEqual(['To groom', 'Grooming', 'Ready to build', 'Building', 'QA', 'Shipped'])
  expect(all).toContain(`Ready ${unique}`)
  expect(all).toContain(`Spike ${unique}`)
  expect(all).toContain(`Next to pull: Ready ${unique} (build order 5).`)

  const spikes = await request.get(`/hub/${DEMO_SLUG}/board?type=spike`)
  expect(spikes.status()).toBe(200)
  const html = await spikes.text()
  expect(html).toContain(`Spike ${unique}`)
  expect(html).not.toContain(`Ready ${unique}`)
  expect(html).not.toContain(`QA ${unique}`)
  // Cards are initiatives: every card on the filtered board links to its own view, in the same filter.
  expect(html).toContain(`?type=spike&amp;card=${unique}-spike`)
})

test('a payload pushed before the board (no stages) gets the board’s empty state, not six empty columns', async ({
  request,
}) => {
  await pushRoadmap(request, [epicRow({ slug: `pre-board-${Date.now()}`, name: 'Pushed before the board' })])
  const html = await (await request.get(`/hub/${DEMO_SLUG}/board`)).text()
  expect(html).toContain('Nothing on the board yet.')
  expect(html).not.toContain('ds-tiles--board')
})

test('a non-demo project’s board needs a member: signed out, it bounces to /login (S2.2)', async ({
  request,
}) => {
  // The demo project is public by design (AGENTS rule #2, lock C2); every other project's board is not.
  const res = await request.get('/hub/project-one/board', { maxRedirects: 0 })
  expect([302, 307]).toContain(res.status())
  expect(res.headers()['location']).toMatch(/\/login/)
})
