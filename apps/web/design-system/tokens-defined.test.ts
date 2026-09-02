import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = join(HERE, '..')

/**
 * ⚠️ **Every `var(--x)` the product's stylesheets read must be DEFINED somewhere.**
 *
 * Written because I used `var(--line-2)` while building Story 3.3's raised rail card. There is no
 * `--line-2`; the tokens are `--line` and `--line-soft`. Nothing would have caught it:
 *
 *  - `check-design-drift` bans raw hex and *requires* `var()`, so a wrong token name passes it —
 *    the guard that exists to enforce tokens is satisfied by a token that does not exist.
 *  - `extract-css --check` compares the GENERATED files to the prototype; `console.css` is
 *    hand-written and outside its scope.
 *  - CSS does not error. An unresolvable `var()` with no fallback makes the declaration
 *    "invalid at computed-value time", so `border-color` falls back to its initial value —
 *    `currentColor`. The border still paints, in the TEXT colour, on the one element whose whole
 *    job is to look different from its neighbours.
 *
 * So the failure mode is a rule that looks right in the diff, passes every guard, and renders
 * something subtly wrong on a page nobody re-opens. That is this epic's defining defect, and it very
 * nearly shipped from my own hands rather than a reviewer's.
 */

const STYLESHEETS = [
  'app/globals.css',
  'app/console.css',
  'app/hub/hub.module.css',
  'design-system/system.css',
  'design-system/tokens.css',
  'design-system/reference.css',
]

/** Custom properties DEFINED anywhere in the product's own stylesheets. */
function definedTokens(): Set<string> {
  const defined = new Set<string>()
  for (const relative of STYLESHEETS) {
    const css = readFileSync(join(WEB, relative), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ')
    for (const match of css.matchAll(/(--[\w-]+)\s*:/g)) defined.add(match[1])
  }
  return defined
}

/** Custom properties READ, with the file and the token. A `var(--x, fallback)` still counts. */
function readTokens(): { token: string; file: string }[] {
  const used: { token: string; file: string }[] = []
  for (const relative of STYLESHEETS) {
    const css = readFileSync(join(WEB, relative), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ')
    for (const match of css.matchAll(/var\(\s*(--[\w-]+)/g)) used.push({ token: match[1], file: relative })
  }
  return used
}

/**
 * Reads of tokens the `roast and foil` rebrand (`c26588c`) deleted without deleting their readers.
 *
 * ⚠️ **These are LIVE defects, not theory.** Every one is `border-color`, `background`, `color` or
 * `fill` resolving to nothing, so the property takes its INITIAL value — `currentColor` for the
 * borders, which paints them in the text colour instead of the intended hairline. The Roadmap Hub
 * carries fifteen of them.
 *
 * ⚠️ They are RECORDED rather than fixed because Sprint 3 owns the console and none of these are on
 * it — `hub.module.css` and the landing's `globals.css` are **Sprint 6's** surfaces (D6's seam B).
 * Fixing them here would mean choosing replacement colours for two live pages in the sprint that
 * rebuilds neither, which is how a redesign breaks a page nobody was looking at. Same reasoning, and
 * the same shape, as `UPPERCASE_ALLOWED`.
 *
 * What matters between now and then is that the set cannot GROW, which is what the test enforces.
 */
const DEAD_TOKEN_READS: readonly { token: string; file: string; what: string }[] = [
  { token: '--kraft', file: 'app/globals.css', what: 'two derived card/panel tokens — Sprint 6' },
  { token: '--kraft-fibers', file: 'app/globals.css', what: 'the paper texture — Sprint 6' },
  { token: '--stamp', file: 'app/globals.css', what: "the divider's ::selection colour — Sprint 6" },
  { token: '--stamp-dim', file: 'app/globals.css', what: 'a dimmed stamp — Sprint 6' },
  { token: '--mark-gold', file: 'app/globals.css', what: 'an SVG mark fill — Sprint 6' },
  { token: '--bar', file: 'app/globals.css', what: 'a bar fill — Sprint 6' },
  { token: '--espresso', file: 'app/globals.css', what: 'a dark ground — Sprint 6' },
  { token: '--green-line', file: 'app/globals.css', what: 'a shipped-state border — Sprint 6' },
  { token: '--next-line', file: 'app/globals.css', what: 'a next-state border — Sprint 6' },
  // ⚠️ `--espresso` in `app/hub/hub.module.css` LEFT this register in Sprint 6 round 5, with the
  // 103 dead rules the hub port orphaned. The register's own both-directions assertion is what said
  // so — an entry describing a read that no longer happens is the same defect as a missing one.
  { token: '--next-line', file: 'app/hub/hub.module.css', what: 'next-state borders — Sprint 6' },
  { token: '--kraft', file: 'app/hub/hub.module.css', what: 'the kraft accents — Sprint 6' },
  { token: '--kraft-deep', file: 'app/hub/hub.module.css', what: 'the kraft border — Sprint 6' },
]

test('every custom property the stylesheets read is one they define', () => {
  const defined = definedTokens()
  // A scan that found nothing would pass silently.
  assert.ok(defined.size > 20, `expected the token set to be substantial, found ${defined.size}`)

  const used = readTokens()
  assert.ok(used.length > 100, `expected many var() reads, found ${used.length}`)

  const recorded = new Set(DEAD_TOKEN_READS.map(({ token, file }) => `${token} in ${file}`))
  const undefinedReads = used
    .filter(({ token }) => !defined.has(token))
    // Next.js injects these for `next/font`, so they are defined by the framework, not by us.
    .filter(({ token }) => !token.startsWith('--font-'))
    .filter(({ token, file }) => !recorded.has(`${token} in ${file}`))

  assert.deepEqual(
    [...new Set(undefinedReads.map(({ token, file }) => `${token} in ${file}`))],
    [],
    'a stylesheet reads a custom property nothing defines. CSS does not error on this — the ' +
      'declaration becomes invalid at computed-value time and the property falls back to its ' +
      'INITIAL value, so the rule silently paints something else. `check-design-drift` cannot ' +
      'catch it: it requires a `var()`, and a misspelled token is still a `var()`.'
  )
})

test('the dead-token register still describes the code', () => {
  // A debt register that outlives its debt is worse than none: it teaches the next reader that a
  // fixed problem is still broken, and it hides a NEW read behind a stale entry.
  const defined = definedTokens()
  const used = new Set(readTokens().map(({ token, file }) => `${token} in ${file}`))

  for (const entry of DEAD_TOKEN_READS) {
    const key = `${entry.token} in ${entry.file}`
    assert.ok(used.has(key), `DEAD_TOKEN_READS lists ${key}, which nothing reads any more — delete it`)
    assert.ok(
      !defined.has(entry.token),
      `DEAD_TOKEN_READS lists ${entry.token} as undefined, but something now defines it — the debt ` +
        'is paid and the entry should go, or the guard is asserting a lie'
    )
  }
})
