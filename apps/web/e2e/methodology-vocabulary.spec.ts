import { test, expect } from '@playwright/test'

// methodology-experience · Sprint 1 QA — the blocking-gate spec for Stories 1.1, 1.2 and 1.3.
//
// ── Why this is an `api` spec over raw HTML rather than a browser spec ────────────────────────
// All three properties are properties of what the SERVER sends: the loop's three moves, the absence
// of a word, and two lists not being the same list. The `browser` project is not in this repo's
// blocking gate (WAYS-OF-WORKING, "Automated QA"), and landing-maker-ops shipped a guard that had
// silently stopped guarding for exactly that reason — nothing ran it. A vocabulary rename is the
// kind of change that regresses one word at a time, months later, in a component nobody associates
// with this epic, so the check has to sit where every PR runs it.
//
// The parsing below is deliberately paranoid about ITS OWN reach. A regex over HTML that stops
// matching returns an empty array, and an empty array satisfies almost any "does not contain"
// assertion — the tautology CODE-QUALITY #5 names. So every extractor asserts it found something
// before anything is concluded from what it found.

/** Visible page text: scripts and styles removed FIRST, then tags, then the entities we emit. */
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Every move in §loop, read out of its OWN list item — title and copy together, in document order.
 *
 * Both halves come from the same `<li>` on purpose. An earlier version asserted the titles here and
 * the copy against the whole page's text, which would have stayed green if a move's sentence moved
 * to another section while §loop regressed (Codex, round 2 of PR #104). The copy is only evidence
 * about the loop if it is read from inside the loop.
 */
function loopMoves(html: string): { title: string; copy: string }[] {
  return [
    ...html.matchAll(/<li class="maker-flow__item"[\s\S]*?<h3>([\s\S]*?)<\/h3>[\s\S]*?<p>([\s\S]*?)<\/p>/g),
  ].map((match) => ({ title: visibleText(match[1]), copy: visibleText(match[2]) }))
}

/** The text of every chapter in §methodology's field-guide contents, in document order. */
function fieldGuideChapters(html: string): string[] {
  return [...html.matchAll(/<ol class="field-guide__chapters">([\s\S]*?)<\/ol>/g)].flatMap((group) =>
    [...group[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((item) =>
      // The chapter number lives in its own span and is presentation, not the title.
      visibleText(item[1].replace(/<span class="field-guide__n">[\s\S]*?<\/span>/g, ' '))
    )
  )
}

async function landingHtml(request: import('@playwright/test').APIRequestContext): Promise<string> {
  const res = await request.get('/')
  expect(res.status(), 'the landing must render before anything here means anything').toBe(200)
  return res.text()
}

// ── Story 1.1 ────────────────────────────────────────────────────────────────────────────────
// The copy is the product owner's and is asserted VERBATIM (epic README, D4). If a future edit
// improves one of these sentences, that edit is a product-owner decision and this spec is where it
// gets recorded — which is the point of pinning prose nobody else may quietly reword.
const MOVES = [
  { title: 'Consider', copy: 'Consider whether it deserves investment.' },
  { title: 'Operate', copy: 'Operate by deploying that investment through humans and agents.' },
  { title: 'Exit', copy: 'Exit by deciding what the Evidence justifies.' },
]

test('§loop renders exactly three portfolio moves, in order, with the product owner’s copy', async ({
  request,
}) => {
  const html = await landingHtml(request)

  // One assertion over the whole list: three items, in order, each carrying its own title AND its
  // own copy. Order, count, wording and pairing all fail here rather than in four separate checks
  // that could each pass against a different broken page.
  expect(
    loopMoves(html),
    'the maker loop is three moves, each with the product owner’s copy, not five steps'
  ).toEqual(MOVES)
})

// ── Story 1.2 ────────────────────────────────────────────────────────────────────────────────
// The product uses ONE word for the second move. This asserts on every word built from "shap-",
// rather than on the three phrases the story fixed, because those three are the ones already
// fixed — a spec that only names them can never fail again. Pinning the survivors instead means a
// new "Shape" anywhere on this page turns it red.
//
// TWO lowercase survivors are expected and correct, and both are the ordinary English noun for the
// form of a thing rather than the method's move: §finops' "the shape of the capability" and
// §pricing's "the shape of it". D3 renames the MOVE; it does not ban an English word. They are
// pinned by their sentences so that nobody reading a bare count wonders whether one was missed —
// and the first run of this spec found the §finops one, which the story's own list of "occurrences
// to clear" did not name.
test('the landing never names the second move "Shape" — the two surviving "shape"s are ordinary English', async ({
  request,
}) => {
  const text = await landingHtml(request).then(visibleText)

  expect(
    text.length,
    'an empty page would satisfy every "does not contain" assertion below'
  ).toBeGreaterThan(2000)

  // The move, in every casing and inflection the source actually had ("Shape", "shape a Bet",
  // "shaped", "shaping"). Checked separately from the count below so a regression reports which
  // rule it broke rather than an off-by-one in an array.
  expect(text, 'the method\'s second move is called Design').not.toMatch(/\bshaping\b|\bshaped\b/i)
  expect(text, 'the method\'s second move is called Design').not.toMatch(/\bShape\b/)

  // Each hit is reported with the words around it. A bare list of matched words tells the next
  // reader that something regressed but not WHERE, on a page assembled from a dozen components.
  const occurrences = [...text.matchAll(/\b\w*shap\w*\b/gi)].map(
    (match) => `"${match[0]}" in: …${text.slice(Math.max(0, match.index - 60), match.index + 60)}…`
  )
  expect(
    occurrences.map((occurrence) => occurrence.slice(1, occurrence.indexOf('"', 1))),
    `exactly two ordinary-English "shape"s survive on the landing.\n${occurrences.join('\n')}`
  ).toEqual(['shape', 'shape'])

  expect(text).toContain('It is the shape of the capability')
  expect(text).toContain('No price until we both know the shape of it.')
})

// ── Story 1.3 ────────────────────────────────────────────────────────────────────────────────
test('§methodology previews the six chapters instead of repeating §loop’s three phases', async ({
  request,
}) => {
  const html = await landingHtml(request)

  const chapters = fieldGuideChapters(html)
  expect(chapters, 'the field guide is a contents page for six chapters').toEqual([
    'Bring an idea',
    'Design it',
    'Place the Bet',
    'Build it',
    'Prove it',
    'Decide what happens next',
  ])

  // The property epic D4 actually asks for: the page must not print the same list twice. Asserting
  // inequality rather than "the field guide is not ['Consider','Operate','Exit']" keeps the check
  // true if either list is ever rewritten — it is the RELATIONSHIP that must hold.
  const moveTitles = loopMoves(html).map((move) => move.title)
  expect(
    moveTitles.length,
    'both lists must be non-empty for their inequality to mean anything'
  ).toBe(3)
  expect(chapters).not.toEqual(moveTitles)
})
