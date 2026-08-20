import { test, expect } from '@playwright/test'
import { Client } from 'pg'
import { randomUUID } from 'node:crypto'
import {
  METHODOLOGY_VISITED_EVENT,
  METHODOLOGY_CHAPTER_OPENED_EVENT,
  METHODOLOGY_SIGNAL_KEY,
  LANDING_VISITED_EVENT,
} from '@/lib/self-track-events'
import { METHODOLOGY_CHAPTER_IDS } from '@/lib/methodology-chapters'

// methodology-experience · Sprint 4, Story 4.1 — the reader becomes evidence.
//
// ── This reads the DATABASE, and that is the entire point ─────────────────────────────────────
// The story's acceptance is "the events carry a `feature_id` — assert it in the spec; do not assume
// it from the code". `commercial-shell` S3 shipped a landing beacon that wrote `feature_id = NULL`
// for its whole life: the events ingested perfectly, nothing errored, nothing alerted, and the
// funnel rendered a permanent zero because `lib/tars-query.ts` filters on that column. An HTTP-level
// spec asserting "the beacon returned 200" would have passed every day of that bug.
//
// The constants come from `lib/self-track-events.ts` rather than `lib/self-track.ts`: the latter
// starts with `import 'server-only'` and cannot be loaded by this runner at all. Comparing against
// a re-typed literal would be two lists that must agree, in the one spec whose subject is a mapping
// that was silently wrong in production for months.
//
// So this fires the real beacon and then reads the row back. A zero and a broken read are
// indistinguishable to a reader; a NULL `feature_id` and a working funnel are indistinguishable to
// every check except this one.

const dbUrl = process.env.SUPABASE_DB_URL
const selfKey = process.env.SELF_PROJECT_API_KEY

// Skips loudly rather than passing quietly when the tenant is not wired — an unconfigured
// environment must not look like a green assertion about telemetry that never fired.
test.skip(
  !dbUrl || !selfKey,
  'needs SUPABASE_DB_URL and SELF_PROJECT_API_KEY — the self tenant must be seeded'
)

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: dbUrl })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

/** The most recent event of `name` for one visitor, or null. */
async function latestEvent(name: string, visitorId: string) {
  return withDb(async (client) => {
    const { rows } = await client.query(
      // The column is `event`, not `event_name` — checked against the live schema rather than
      // guessed. A wrong column name at least fails loudly; a wrong VALUE would not have.
      `select event, feature_id, user_id, tags
         from events
        where event = $1 and user_id = $2
        order by created_at desc
        limit 1`,
      [name, visitorId]
    )
    return rows[0] ?? null
  })
}

/** Fire the beacon exactly as the browser does, with a visitor id we control so we can find it. */
async function beacon(
  request: import('@playwright/test').APIRequestContext,
  body: Record<string, string>,
  visitorId: string
) {
  // The route is rate-limited by IP (20/min) — correctly: it is an unauthenticated public write.
  // Every spec in this suite shares one IP, so under a full run this legitimately returns 429 and
  // the assertion below would fail for a reason that has nothing to do with telemetry. Observed
  // passing in isolation and failing in the full suite, which is the signature of a shared limiter
  // rather than of a defect.
  //
  // Retried rather than exempted: a spec that turned the limiter off would stop testing the real
  // route, and the limiter is a property worth keeping (it is what stops anyone inflating the
  // numbers the product owner reads as status).
  let res = await request.post('/api/v1/public/self-visit', {
    data: body,
    headers: { Cookie: `gb_vid=${visitorId}` },
  })
  for (let attempt = 0; attempt < 4 && res.status() === 429; attempt += 1) {
    await new Promise((r) => setTimeout(r, 2000))
    res = await request.post('/api/v1/public/self-visit', {
      data: body,
      headers: { Cookie: `gb_vid=${visitorId}` },
    })
  }
  expect(res.status(), 'the beacon must answer 200 once the rate-limit window clears').toBe(200)
  // `after()` runs the send once the response is out, so the row is not there synchronously.
  await new Promise((r) => setTimeout(r, 1500))
}

test('methodology_visited lands with a NON-NULL feature_id', async ({ request }) => {
  const visitorId = randomUUID()
  await beacon(request, { surface: 'methodology' }, visitorId)

  const row = await latestEvent(METHODOLOGY_VISITED_EVENT, visitorId)
  expect(row, 'the index beacon must have written an event').not.toBeNull()
  expect(row.feature_id, 'a NULL feature_id makes this event invisible to every funnel, forever').toBe(
    METHODOLOGY_SIGNAL_KEY
  )
})

test('methodology_chapter_opened lands with its feature_id AND the chapter as a tag', async ({ request }) => {
  const visitorId = randomUUID()
  const chapter = METHODOLOGY_CHAPTER_IDS[1]
  await beacon(request, { surface: 'methodology-chapter', chapter }, visitorId)

  const row = await latestEvent(METHODOLOGY_CHAPTER_OPENED_EVENT, visitorId)
  expect(row, 'the chapter beacon must have written an event').not.toBeNull()
  expect(row.feature_id).toBe(METHODOLOGY_SIGNAL_KEY)
  expect(row.tags?.chapter, 'which chapter must survive as a queryable dimension').toBe(chapter)
})

// The security property of making one unauthenticated route serve several events. The body is
// attacker-controlled: if it could name the EVENT, anyone could write `waitlist_joined` without a
// waitlist join, or `first_event_ingested` without an ingest, straight into the numbers the product
// owner reads as status.
test('the body cannot choose which event is written', async ({ request }) => {
  const visitorId = randomUUID()
  await beacon(
    request,
    // Every shape an attacker would try: a raw event name, a surface that is not in the set, and a
    // surface naming a different funnel's event.
    { surface: 'waitlist_joined', event: 'waitlist_joined', chapter: 'anything' },
    visitorId
  )

  const forged = await latestEvent('waitlist_joined', visitorId)
  expect(forged, 'an unrecognised surface must never write another funnel’s event').toBeNull()

  // ...and it falls back to the landing rather than erroring or writing nothing, which is the
  // documented behaviour for a malformed body.
  const fallback = await latestEvent(LANDING_VISITED_EVENT, visitorId)
  expect(fallback, 'an unrecognised surface falls back to the landing beacon').not.toBeNull()
})

test('an unknown chapter id never becomes a tag value', async ({ request }) => {
  const visitorId = randomUUID()
  await beacon(request, { surface: 'methodology-chapter', chapter: 'not-a-real-chapter' }, visitorId)

  const chapterEvent = await latestEvent(METHODOLOGY_CHAPTER_OPENED_EVENT, visitorId)
  expect(chapterEvent, 'an unknown id must not be recorded as a chapter that was opened').toBeNull()

  // It degrades to the index event — the reader WAS on the methodology, so recording nothing would
  // lose a real visit; recording a chapter that does not exist would invent a dimension.
  const indexEvent = await latestEvent(METHODOLOGY_VISITED_EVENT, visitorId)
  expect(indexEvent, 'an unknown chapter degrades to the index event').not.toBeNull()
  expect(indexEvent.feature_id).toBe(METHODOLOGY_SIGNAL_KEY)
})
