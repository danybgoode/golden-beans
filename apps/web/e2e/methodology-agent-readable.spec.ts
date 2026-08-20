import { test, expect } from '@playwright/test'
import { METHODOLOGY_CHAPTERS, METHODOLOGY_CHAPTER_IDS } from '@/lib/methodology-chapters'
import { publicRoutes } from '@/lib/public-routes'

// methodology-experience · Sprint 4, Story 4.6 (amendment A6) — any agent can read the methodology.
//
// The product owner asked for this by name. Most of it was implied by D5, D7 and Stories 4.2/4.3 —
// but scattered across three stories as a side effect, and NOTHING tested it. This file is the
// outcome, asserted as what an agent RECEIVES rather than as which tags exist.
//
// Every number below was measured against live production before the work (recorded in the epic
// README as A6): all seven methodology URLs served the LANDING's title and description, the signal
// ratio was 5.8–8.1%, `/llms.txt` did not mention the methodology, and `/sitemap.xml` was a 404.

/** Visible text an agent extracts after discarding scripts and markup. */
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tagContent(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern)
  return match ? match[1].trim() : null
}

const titleOf = (html: string) => tagContent(html, /<title[^>]*>([\s\S]*?)<\/title>/)
const descriptionOf = (html: string) => tagContent(html, /<meta name="description" content="([^"]*)"/)

test('every methodology route serves its OWN title and description', async ({ request }) => {
  const landing = await (await request.get('/')).text()
  const landingTitle = titleOf(landing)
  expect(landingTitle, 'the landing must have a title for this comparison to mean anything').toBeTruthy()

  const seen = new Map<string, string>()

  const index = await (await request.get('/methodology')).text()
  const indexTitle = titleOf(index)
  expect(indexTitle, 'the index must have its own title').toBeTruthy()
  expect(indexTitle, 'the index must not serve the landing’s title').not.toBe(landingTitle)
  expect(descriptionOf(index), 'the index must have its own description').toBeTruthy()
  expect(descriptionOf(index)).not.toBe(descriptionOf(landing))
  seen.set('/methodology', indexTitle!)

  for (const chapter of METHODOLOGY_CHAPTERS) {
    const html = await (await request.get(`/methodology/${chapter.id}`)).text()
    const title = titleOf(html)
    expect(title, `${chapter.id} must have a title`).toBeTruthy()
    expect(title, `${chapter.id} must not serve the landing’s title`).not.toBe(landingTitle)
    expect(title, `${chapter.id}'s title must name the chapter`).toContain(chapter.title)

    const description = descriptionOf(html)
    expect(description, `${chapter.id} must have its own description`).toBeTruthy()
    expect(description).toBe(chapter.summary)

    // The property that actually matters: a page list must be able to tell them apart. Comparing
    // each against the landing would pass even if all six shared one title.
    for (const [route, other] of seen) {
      expect(title, `${chapter.id} and ${route} are indistinguishable in a page list`).not.toBe(other)
    }
    seen.set(`/methodology/${chapter.id}`, title!)
  }
})

test('the whole method is readable with no JavaScript executed', async ({ request }) => {
  // The `api` project runs no browser at all, so this is the honest test of "no JS required": every
  // assertion below is against raw bytes the server sent.
  for (const chapter of METHODOLOGY_CHAPTERS) {
    const res = await request.get(`/methodology/${chapter.id}`)
    expect(res.status()).toBe(200)
    const text = visibleText(await res.text())

    expect(text, `${chapter.id}'s lede must be in the HTML`).toContain(chapter.lede)
    expect(text.length, `${chapter.id} must carry real prose, not a shell`).toBeGreaterThan(800)

    // The agent prompt is the one piece a reader is meant to hand to their own agent. If it needed
    // JavaScript, the page would be useless for exactly the audience this story is about.
    const prompt = chapter.blocks.find((b) => b.kind === 'work' && b.variant === 'agent')
    if (prompt && prompt.kind === 'work' && prompt.variant === 'agent') {
      const firstLine = prompt.prompt.split('\n')[0]
      expect(text, `${chapter.id}'s agent prompt must be server-rendered`).toContain(firstLine)
    }
  }
})

test('the generated edition round-trips the same six chapters as the module', async ({ request }) => {
  const res = await request.get('/methodology/edition.md')
  expect(res.status(), '/methodology/edition.md must resolve').toBe(200)
  expect(res.headers()['content-type'], 'an agent must be told this is markdown, not HTML').toContain(
    'text/markdown'
  )

  const markdown = await res.text()
  expect(markdown.length, 'the edition must carry the method, not a stub').toBeGreaterThan(4000)

  for (const chapter of METHODOLOGY_CHAPTERS) {
    expect(markdown, `${chapter.id} is missing from the edition`).toContain(chapter.title)
    expect(markdown, `${chapter.id}'s lede is missing from the edition`).toContain(chapter.lede)
  }

  // The reason the edition exists at all (A6): it is dramatically cheaper to read than the pages.
  const chapterHtml = await (await request.get(`/methodology/${METHODOLOGY_CHAPTERS[0]!.id}`)).text()
  const htmlRatio = visibleText(chapterHtml).length / chapterHtml.length
  const editionRatio = 1 // markdown IS the text
  expect(
    editionRatio,
    `one chapter's HTML is ${(htmlRatio * 100).toFixed(1)}% signal; the edition must beat that`
  ).toBeGreaterThan(htmlRatio * 3)
})

test('llms.txt names the methodology, and every URL it names resolves', async ({ request }) => {
  const res = await request.get('/llms.txt')
  expect(res.status()).toBe(200)
  const body = await res.text()

  expect(body, 'the agent manifest must mention the methodology at all').toContain('/methodology')
  expect(body, 'and the one-document edition, which is the cheap way in').toContain('/methodology/edition.md')

  // Every URL it names must answer — the same discipline as `landing-prompts.spec.ts`, for the same
  // reason: a URL inside a text manifest is the least visible dependency this app has. Nothing
  // imports it, no type-checker sees it, and it breaks silently inside somebody else's model.
  const urls = [...new Set(body.match(/https?:\/\/\S+/g) ?? [])]
  expect(urls.length, 'a manifest naming no URLs would satisfy this vacuously').toBeGreaterThan(3)

  for (const url of urls) {
    const cleaned = url.replace(/[.,)\]]+$/, '')
    // The connector endpoint is a POST carrying a PLACEHOLDER token in its path — not fetchable
    // here, and named as a placeholder in the manifest's own prose.
    //
    // Tested on the RAW string, not on the parsed pathname: `new URL()` percent-encodes the braces
    // to `%7Btoken%7D`, so a check against `pathname` silently never matches and the placeholder
    // gets fetched anyway (it answers 405 — a POST-only route). Caught on this spec's first run.
    if (cleaned.includes('{token}')) continue
    const path = new URL(cleaned).pathname
    const answer = await request.get(path)
    expect(answer.status(), `${path} is named in /llms.txt but does not resolve`).toBeLessThan(400)
  }
})

test('the sitemap lists exactly the routes that exist, and robots points at it', async ({ request }) => {
  const res = await request.get('/sitemap.xml')
  expect(res.status(), '/sitemap.xml was a 404 in production before this story').toBe(200)
  const xml = await res.text()

  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname)
  expect(locs.length, 'an empty sitemap would satisfy every assertion below').toBeGreaterThan(5)

  // The D7 round trip, one surface further out: every chapter is listed, and nothing is listed that
  // is not a chapter. Both directions, derived from the module on both sides.
  for (const id of METHODOLOGY_CHAPTER_IDS) {
    expect(locs, `${id} is a real chapter but is not in the sitemap`).toContain(`/methodology/${id}`)
  }
  for (const loc of locs) {
    const match = /^\/methodology\/([^/]+)$/.exec(loc)
    if (!match || match[1] === 'edition.md') continue
    expect(METHODOLOGY_CHAPTER_IDS, `${loc} is in the sitemap but is not a chapter in the module`).toContain(
      match[1]
    )
  }

  // The registry and the served sitemap must not drift apart.
  expect(locs.sort()).toEqual(
    publicRoutes(METHODOLOGY_CHAPTER_IDS)
      .map((r) => r.path)
      .sort()
  )

  // Every listed route must actually answer. A sitemap naming a 404 teaches a crawler the site is
  // broken, and nobody would notice.
  for (const loc of locs) {
    const answer = await request.get(loc)
    expect(answer.status(), `${loc} is in the sitemap but does not resolve`).toBeLessThan(400)
  }

  const robots = await request.get('/robots.txt')
  expect(robots.status()).toBe(200)
  const robotsBody = await robots.text()
  expect(
    robotsBody,
    'production served platform boilerplate with no Sitemap: line — a sitemap nothing points at is a file nobody fetches'
  ).toContain('Sitemap:')
  expect(robotsBody).toContain('/sitemap.xml')
  // The bearer-token surface must never be invited in.
  expect(robotsBody, 'share links must not be crawlable').toContain('/s/')
})
