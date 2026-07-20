import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

// Story 3.1 (commercial-shell/sprint-3.md) — the dogfood funnel: the landing instruments ITSELF
// (Golden Beans as its own tenant) via the real SDK. Two halves:
//   - entry:      POST /v1/public/self-visit fires `landing_visited` and mints the visitor cookie
//   - conversion: POST /v1/public/waitlist (successful, non-honeypot) fires `waitlist_joined`
// under the SAME visitor id.
//
// The first three tests assert an invariant that holds REGARDLESS of tracking config: neither
// route may ever 500 or delay its response because of trackSelfEvent — true whether the key is
// unset (a clean no-op) or the call fails for any other reason (swallowed+logged), and true in
// EVERY environment now that both routes fire tracking via `next/server`'s `after()` (a cross-review
// fix, round 2) rather than inline-awaiting it. This is deliberately NOT a test of "is the key
// unset" specifically — a cross-review catch: CI now always seeds+exports a real
// SELF_PROJECT_API_KEY (see below), so the unset-key branch in lib/self-track.ts's guard is no
// longer independently exercised by any automated run; it stays covered by code inspection (a
// one-line `if (!apiKey) return`) rather than a dedicated red/green test — a stated, accepted gap,
// not a silent one. The deeper isolation check (events land in the self tenant and NEVER the demo)
// runs for real in CI — ci.yml seeds the self project (a fresh CI Supabase never already has it, so
// seed-self-project.mjs always mints+prints a real key) and exports it as SELF_PROJECT_API_KEY —
// and only SKIPS (not fails) in an environment that genuinely lacks that (e.g. a bare local run
// without `npm run seed:self` first).

const SELF_SLUG = process.env.SELF_PROJECT_SLUG?.trim() || 'golden-beans'
const DEMO_SLUG = process.env.DEMO_PROJECT_SLUG?.trim() || 'golden-beans-demo'
const SELF_KEY = process.env.SELF_PROJECT_API_KEY?.trim()

// Each waitlist test uses its own random x-forwarded-for so it doesn't contend for one rate-limit
// bucket — same rationale as waitlist.spec.ts (a fixed literal IP collides with itself on reruns
// against the persistent local Postgres volume).
function randomIp(): string {
  return Array.from({ length: 4 }, () => Math.floor(Math.random() * 256)).join('.')
}

function dbClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

function setCookieHeaders(res: { headersArray(): { name: string; value: string }[] }): string[] {
  return res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => h.value)
}

// Both funnel routes fire trackSelfEvent via `after()` (deliberately, so it never blocks the
// response — self-track.ts) — the insert can still be in flight the instant the HTTP response
// lands. Poll for `expectedCount` rows instead of racing a single immediate read.
async function pollForEvents(
  db: ReturnType<typeof dbClient>,
  userId: string,
  expectedCount: number,
  timeoutMs = 5000,
): Promise<{ event: string; projects: { slug: string } | null }[]> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const { data, error } = await db.from('events').select('event, projects(slug)').eq('user_id', userId)
    if (error) throw new Error(`pollForEvents: ${error.message}`)
    // @ts-expect-error -- supabase-js types the joined relation loosely; runtime shape is correct
    if ((data ?? []).length >= expectedCount) return data ?? []
    if (Date.now() > deadline) {
      throw new Error(
        `pollForEvents: only ${data?.length ?? 0}/${expectedCount} event(s) for ${userId} after ${timeoutMs}ms`,
      )
    }
    await new Promise((r) => setTimeout(r, 200))
  }
}

// --- CI-safe: the beacon and the no-op safety of the tracking helper (no config required) ---

test('self-visit beacon → 200 and mints a gb_vid visitor cookie on first visit', async ({ request }) => {
  const res = await request.post('/api/v1/public/self-visit')
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.ok).toBe(true)

  // The per-visitor identity is minted here (a Server Component couldn't set it) so the later join
  // can share it. httpOnly + a year-long lifetime.
  const cookies = setCookieHeaders(res)
  const vidCookie = cookies.find((c) => c.startsWith('gb_vid='))
  expect(vidCookie, 'first visit must Set-Cookie gb_vid').toBeTruthy()
  expect(vidCookie!.toLowerCase()).toContain('httponly')
})

test('self-visit beacon → reuses an existing gb_vid (no new identity minted)', async ({ request }) => {
  const vid = randomUUID()
  const res = await request.post('/api/v1/public/self-visit', {
    headers: { Cookie: `gb_vid=${vid}` },
  })
  expect(res.status()).toBe(200)
  // When the visitor already has an id, the route must NOT overwrite it — a stable identity is what
  // ties visit→join into one funnel user. So either no Set-Cookie at all, or the very same value.
  const reset = setCookieHeaders(res).find((c) => c.startsWith('gb_vid='))
  if (reset) expect(reset).toContain(`gb_vid=${vid}`)
})

test('waitlist join → still 200 (tracking is fire-and-forget, never blocks the join)', async ({
  request,
}) => {
  // With SELF_PROJECT_API_KEY unset (CI), the conversion fire is a clean no-op; even when it IS
  // set, the SDK call is total (swallow+log) — so a real join must succeed either way. This is the
  // invariant the mutation check above would break.
  const email = `spec-selftrack-${Date.now()}@example.com`
  const res = await request.post('/api/v1/public/waitlist', {
    headers: { 'x-forwarded-for': randomIp(), Cookie: `gb_vid=${randomUUID()}` },
    data: { email },
  })
  expect(res.status()).toBe(200)
  expect((await res.json()).ok).toBe(true)
})

// --- Deeper: real isolation — only when a self key is provided AND the project is seeded ---

test('funnel events land in the self tenant and NEVER the demo project', async ({ request }) => {
  test.skip(!SELF_KEY, 'SELF_PROJECT_API_KEY not set — self tenant not seeded in this environment')
  test.skip(SELF_SLUG === DEMO_SLUG, 'self and demo slugs must differ for this isolation check')

  const db = dbClient()
  // Guard against an env that has a key but no seeded project — skip rather than false-fail.
  const { data: selfProject } = await db
    .from('projects')
    .select('id')
    .eq('slug', SELF_SLUG)
    .maybeSingle()
  test.skip(!selfProject, `self project '${SELF_SLUG}' not seeded — run npm run seed:self first`)

  // One synthetic visitor progressing through the whole funnel under a SHARED identity.
  const vid = randomUUID()
  const cookie = `gb_vid=${vid}`

  const visit = await request.post('/api/v1/public/self-visit', { headers: { Cookie: cookie } })
  expect(visit.status()).toBe(200)

  const email = `spec-funnel-${Date.now()}@example.com`
  const join = await request.post('/api/v1/public/waitlist', {
    headers: { 'x-forwarded-for': randomIp(), Cookie: cookie },
    data: { email },
  })
  expect(join.status()).toBe(200)

  // Both events, under the one visitor id, must resolve to the self project — and NONE to the demo.
  // The tenant is chosen by the Bearer key server-side (lib/auth.ts), so this is structurally true;
  // the assertion guards against an accidental cross-wire (e.g. the helper grabbing the demo key).
  //
  // A cross-review catch (Sprint 3 PR, round 2): both routes fire trackSelfEvent via `after()` now
  // (a deliberate fix so it never blocks the response — see self-track.ts), which means the events
  // insert can genuinely still be in flight the instant this test receives the 200. A bare
  // immediate read raced that write and would be flaky. Poll with a bounded timeout instead of
  // asserting on the first read.
  const events = await pollForEvents(db, vid, 2)
  const slugs = new Set(events.map((r) => r.projects?.slug))
  expect(slugs.has(DEMO_SLUG), 'a landing event must NEVER land against the demo project').toBe(false)
  expect([...slugs]).toEqual([SELF_SLUG]) // every event for this visitor is the self tenant, nothing else
  expect(events.map((r) => r.event).sort()).toEqual(['landing_visited', 'waitlist_joined'])
})
