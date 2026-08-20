import { test, expect } from '@playwright/test'
import { METHODOLOGY_CHAPTERS, METHODOLOGY_PHASES } from '@/lib/methodology-chapters'

// methodology-experience · Sprint 2 QA (sprint-2.md) — the blocking gate for the `/methodology`
// skateboard (epic D7: real routes, deep-linkable, and a registry that fails loudly).
//
// Every assertion below is DERIVED from `METHODOLOGY_CHAPTERS`/`METHODOLOGY_PHASES` rather than a
// hand-typed list of six ids/titles. A spec that hardcodes the six chapters is a second list next
// to the content module — exactly the drift class D5/D7 exist to prevent — and it would keep
// passing after a seventh chapter shipped with a broken route.

const PHASE_TITLE_BY_ID = new Map(METHODOLOGY_PHASES.map((phase) => [phase.id, phase.title]))

/**
 * Every `href="…"` on an `<a>` tag whose `class` attribute contains `needleClass`.
 *
 * Attribute-order independent (matches `class` before OR after `href`) — React/Next does not
 * guarantee attribute order, and a regex that assumes one order silently stops matching if it
 * ever changes, which is the exact "empty array satisfies almost any assertion" trap the sprint
 * contract calls out.
 */
function hrefsForClass(html: string, needleClass: string): string[] {
  const hrefs: string[] = []
  for (const match of html.matchAll(/<a\b([^>]*)>/g)) {
    const attrs = match[1]
    const classMatch = attrs.match(/class="([^"]*)"/)
    if (!classMatch || !classMatch[1].split(/\s+/).includes(needleClass)) continue
    const hrefMatch = attrs.match(/href="([^"]*)"/)
    if (hrefMatch) hrefs.push(hrefMatch[1])
  }
  return hrefs
}

test('the index and all six chapter URLs answer 200', async ({ request }) => {
  const index = await request.get('/methodology')
  expect(index.status()).toBe(200)

  for (const chapter of METHODOLOGY_CHAPTERS) {
    const res = await request.get(`/methodology/${chapter.id}`)
    expect(res.status(), `/methodology/${chapter.id} should answer 200`).toBe(200)
  }
})

test('each chapter renders exactly one <h1> with its own title, and its phase label', async ({ request }) => {
  for (const chapter of METHODOLOGY_CHAPTERS) {
    const res = await request.get(`/methodology/${chapter.id}`)
    const html = await res.text()

    const h1Matches = [...html.matchAll(/<h1\b/g)]
    expect(h1Matches.length, `${chapter.id} should render exactly one <h1>`).toBe(1)

    const h1Content = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)
    expect(h1Content, `${chapter.id} should render its <h1> content`).not.toBeNull()
    expect(h1Content![1].trim(), `${chapter.id}'s <h1> should be its OWN title`).toBe(chapter.title)

    const phaseLabel = html.match(/<p class="methodology-phase-label[^"]*">([\s\S]*?)<\/p>/)
    expect(phaseLabel, `${chapter.id} should render a phase label`).not.toBeNull()
    const phaseTitle = PHASE_TITLE_BY_ID.get(chapter.phase)
    expect(phaseTitle, `${chapter.phase} should be a declared phase`).toBeDefined()
    expect(phaseLabel![1]).toContain(phaseTitle)
    expect(phaseLabel![1]).toContain(`Chapter ${chapter.number}`)
  }
})

// Mockup defect 1, and the epic README's own words: "the unit test asserts no lede contains `{`,
// because this can only ever regress silently." All six `<p class="lede">` blocks in the mockup
// rendered the raw `{1:"…",2:"…",…}[n]` object literal as visible body text — a templating step
// that never ran, and one that would still render SUCCESSFULLY (200, a real paragraph, just the
// wrong one) if it ever came back. Every other mockup defect fails loudly by comparison.
test('no rendered lede contains a stray object-literal brace', async ({ request }) => {
  let ledeCount = 0
  for (const chapter of METHODOLOGY_CHAPTERS) {
    const res = await request.get(`/methodology/${chapter.id}`)
    const html = await res.text()
    const lede = html.match(/<p class="methodology-lede">([\s\S]*?)<\/p>/)
    expect(lede, `${chapter.id} should render a .methodology-lede paragraph`).not.toBeNull()
    ledeCount += 1
    expect(lede![1], `${chapter.id}'s lede must not contain a stray brace`).not.toContain('{')
  }
  // Guards against the extractor above silently matching nothing on every chapter and every
  // `not.toContain` passing vacuously — the trap CODE-QUALITY #5 and the sprint contract both name.
  expect(ledeCount).toBe(METHODOLOGY_CHAPTERS.length)
})

test('every prev/next target on every chapter page resolves', async ({ request }) => {
  let linksChecked = 0
  for (const chapter of METHODOLOGY_CHAPTERS) {
    const res = await request.get(`/methodology/${chapter.id}`)
    const html = await res.text()

    // Both halves of ChapterNav render through the Button component, which is an <a> when given
    // an href — so every methodology link on the page (the "prev" text link and the "continue"/
    // "back to methodology" button) is captured by its href, regardless of which CSS class it
    // carries.
    const hrefs = [...html.matchAll(/href="(\/methodology(?:\/[a-z0-9-]+)?)"/g)].map((match) => match[1])
    expect(hrefs.length, `${chapter.id} should render at least one prev/next link`).toBeGreaterThan(0)

    for (const href of new Set(hrefs)) {
      const target = await request.get(href)
      expect(target.status(), `${chapter.id}'s link to ${href} should resolve`).toBe(200)
      linksChecked += 1
    }
  }
  expect(linksChecked).toBeGreaterThan(0)
})

// Chapter 6 is the one chapter with no `next` — `chapterNeighbours` returns `null` rather than
// wrapping back to chapter 1 (lib/methodology-chapters.ts's own comment on why). The sprint
// contract requires the route to SAY so, not just link somewhere reasonable.
test("chapter 6's next points at the index and says the loop is complete", async ({ request }) => {
  const lastChapter = METHODOLOGY_CHAPTERS[METHODOLOGY_CHAPTERS.length - 1]!
  const res = await request.get(`/methodology/${lastChapter.id}`)
  const html = await res.text()

  expect(html).toContain('You completed the loop')
  expect(html).toContain('href="/methodology"')
})

test('an unknown chapter segment 404s rather than throwing into a 500', async ({ request }) => {
  const res = await request.get('/methodology/not-a-real-chapter')
  expect(res.status()).toBe(404)
})

// The D7 round trip, stated as the epic README puts it: "A registry entry with no chapter, and a
// TOC link with no target, are the same failure." Both sides are derived from
// `METHODOLOGY_CHAPTERS` — never a hardcoded set of six ids — so a seventh chapter added to the
// module without an index card (or vice versa) fails this test rather than shipping silently.
test('every chapter id renders as exactly one reachable index card, and every card resolves', async ({
  request,
}) => {
  const index = await request.get('/methodology')
  const html = await index.text()

  const cardHrefs = hrefsForClass(html, 'methodology-card')
  expect(cardHrefs.length, 'the index should render one card per chapter').toBe(METHODOLOGY_CHAPTERS.length)

  const renderedTargets = new Set(cardHrefs)
  const expectedTargets = new Set(METHODOLOGY_CHAPTERS.map((chapter) => `/methodology/${chapter.id}`))
  expect(renderedTargets).toEqual(expectedTargets)

  for (const href of renderedTargets) {
    const res = await request.get(href)
    expect(res.status(), `index card target ${href} should resolve`).toBe(200)
  }
})
