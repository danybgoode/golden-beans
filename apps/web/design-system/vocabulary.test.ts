// The vocabulary, enforced against the real stylesheet and the real routes.
//
// A Do-not list nothing executes is a preference. These are the two the contract states — uppercase
// in exactly two places and never in mono (#3), and no page copy about storage (#7) — checked
// against the files that would violate them.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CONTROL_PLANE_WINS,
  STORAGE_WORDS,
  UPPERCASE_ALLOWED,
  bannedWords,
  isConsoleSurface,
} from './vocabulary.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = join(HERE, '..')

/** Rule bodies of a stylesheet, comments stripped. */
function rules(path: string): { selector: string; body: string }[] {
  const css = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1].trim().replace(/\s+/g, ' '),
    body: match[2],
  }))
}

test('uppercase appears only where the vocabulary allows, and never in mono', () => {
  // ⚠️ The contract says "exactly two places". The live stylesheet has EIGHT, and none is mono —
  // so the mono half of Do-not #3 was fixed in a previous epic and the count half was not. The six
  // extras are recorded in `UPPERCASE_ALLOWED` with `keep: false` and the sprint that removes them.
  //
  // What this test enforces is the thing that matters between now and then: **the set cannot grow.**
  // A seventh unapproved uppercase rule is a new violation of a contract nobody re-read, and it
  // fails here rather than in a review three sprints later.
  // ⚠️ FOUR stylesheets, not two. It scanned `console.css` and `system.css` and called the result
  // "none of them is mono" — a claim about the PRODUCT made from half its stylesheets.
  // `globals.css` holds 27 uppercase rules, two of them uppercase AND MONO
  // (`.product-shell__signal` is `font: 600 10px var(--mono)`), and `hub.module.css` holds ten more.
  // A new uppercase-mono rule in either left the suite green (fresh reviewer, mutation-verified).
  const stylesheets = [
    join(WEB, 'app/globals.css'),
    join(WEB, 'app/console.css'),
    join(WEB, 'app/hub/hub.module.css'),
    join(HERE, 'system.css'),
  ]
  const found: string[] = []
  const monoFound: string[] = []

  /**
   * Does `selector` mention `allowedSelector` as a WHOLE name?
   *
   * ⚠️ Not `includes` — that admitted `.grp-new` through `.grp` and `.listhead-alt` through
   * `.listhead`, so "the set may not grow" grew by anything containing an approved name (fresh
   * reviewer, mutation-verified). Written as an index walk rather than a regex because the allowed
   * list contains attribute selectors (`[data-surface-status='gated']`) whose brackets and quotes
   * are painful to escape correctly, and a mis-escaped guard is a guard that stops matching.
   */
  const mentionsWholeClass = (selector: string, allowedSelector: string) => {
    let from = 0
    for (;;) {
      const at = selector.indexOf(allowedSelector, from)
      if (at === -1) return false
      const next = selector[at + allowedSelector.length] ?? ''
      // A word character or a hyphen means this is a LONGER name that merely starts the same way.
      if (!/[\w-]/.test(next)) return true
      from = at + 1
    }
  }

  for (const path of stylesheets) {
    for (const rule of rules(path)) {
      if (!/text-transform:\s*uppercase/.test(rule.body)) continue
      // ⚠️ Do-not #3 is a CONSOLE contract. The landing, the methodology chapters and the hub carry
      // 20 uppercase-mono rules that are a deliberate, shipped brand pattern (`.kicker`,
      // `.gapStamp`, `.methodology-phase-label`…), and holding them to a rule written about the
      // signed-in console would fire on correct work — which is how a rule gets switched off rather
      // than obeyed. The scan is wide; the JUDGEMENT is scoped, and the scope is stated.
      if (!isConsoleSurface(rule.selector)) continue
      found.push(rule.selector)

      // ⚠️ Mono is DEBT, not an absolute — because it turned out not to be one. `vocabulary.ts`
      // claimed "none of them is mono"; widening the scan to `globals.css` found twelve console
      // rules that are uppercase AND mono, the pair Do-not #3 forbids outright (fresh reviewer).
      // `.product-shell__signal` is the clearest: the LIT console resets it, and the legacy branch —
      // what a rollback serves — renders it.
      //
      // So a mono rule is permitted only where an entry DECLARES it, with the sprint that removes
      // it. A new one fails, which is the property that matters between now and Sprint 6.
      if (/var\(--mono|Plex Mono/.test(rule.body)) {
        monoFound.push(rule.selector)
        const entry = UPPERCASE_ALLOWED.find((candidate) =>
          mentionsWholeClass(rule.selector, candidate.selector)
        )
        assert.ok(
          entry?.mono,
          `${rule.selector} is uppercase AND mono — Do-not #3 forbids the pair, and this is not ` +
            'recorded debt. Fix it, or record it with the sprint that will.'
        )
      }
    }
  }

  // ⚠️ A WHOLE-CLASS match, not `includes`. `selector.includes('.grp')` admitted `.grp-new`, and
  // `.listhead-alt` walked past `.listhead` — so "the set may not grow" grew by anything that
  // happened to contain an approved name (fresh reviewer, mutation-verified: appending
  // `.grp-new { text-transform: uppercase }` left the suite 4/4 green).
  const allowed = UPPERCASE_ALLOWED.map((entry) => entry.selector)
  for (const selector of found) {
    assert.ok(
      allowed.some((entry) => mentionsWholeClass(selector, entry)),
      `${selector} applies uppercase and is not in UPPERCASE_ALLOWED — the set may not grow`
    )
  }

  // ...and the list may not carry an entry that no longer exists, or it stops describing the code.
  for (const entry of UPPERCASE_ALLOWED) {
    assert.ok(
      found.some((selector) => mentionsWholeClass(selector, entry.selector)),
      `UPPERCASE_ALLOWED lists ${entry.selector}, which no stylesheet applies uppercase to any more`
    )
  }

  // ⚠️ TWO ENTRIES NAMED `.data-table thead th`, and the lookup below is a `.find` — so the FIRST
  // one authorised the mono rule the SECOND one described, and either could have been wrong without
  // the suite noticing (cross-family review, agy). A registry whose keys repeat is a registry that
  // answers a different question depending on which copy you read.
  const selectors = UPPERCASE_ALLOWED.map((entry) => entry.selector)
  assert.deepEqual(
    selectors.filter((selector, index) => selectors.indexOf(selector) !== index),
    [],
    'UPPERCASE_ALLOWED lists the same selector twice — the mono lookup below resolves to whichever copy comes first'
  )

  // ...and `mono: true` was decoration until now: nothing checked that a mono entry described a rule
  // that IS mono. It did not hold — the entry above claimed mono for a selector `console.css` sets
  // in `var(--sans)`, and the claim survived because only the other direction was ever asserted.
  for (const entry of UPPERCASE_ALLOWED.filter((candidate) => candidate.mono)) {
    assert.ok(
      monoFound.some((selector) => mentionsWholeClass(selector, entry.selector)),
      `UPPERCASE_ALLOWED records ${entry.selector} as uppercase-AND-mono debt, but no stylesheet ` +
        'applies both to it. Either the rule was fixed and the entry should lose `mono`, or the ' +
        'entry never described the code.'
    )
  }

  // The two the contract approves are the two that stay.
  // ⚠️ FOUR selectors, TWO PLACES IN THE PRODUCT. `.ds-table-head` is the design system's column header row and
  // `.listhead` is the one it replaces; both are live until Sprint 6 deletes the old world. Counting
  // selectors instead of places would either force a premature deletion or make this assertion a
  // number nobody can justify — so it names them, and Sprint 6's deletion is what shrinks the list.
  assert.deepEqual(
    UPPERCASE_ALLOWED.filter((entry) => entry.keep)
      .map((entry) => entry.selector)
      .sort(),
    ['.ds-specimen-type--label', '.ds-table-head', '.grp', '.listhead'],
    'the approved uppercase places changed'
  )
})

test('no user-facing copy in the design system talks about storage, singular or plural', () => {
  // Scoped to `design-system/` — the surface this epic OWNS. The product's older routes carry
  // storage copy that later sprints replace as they rebuild each page (the flags page's
  // "Definitions, immutable versions and their audit…" is the loudest, and Sprint 4 owns it); a
  // repo-wide ban today would fail on code no story has reached yet, which is how a rule gets
  // switched off rather than obeyed.
  const banned = bannedWords()
  // The design system AND the surface Daniel actually reads. It scanned `readdirSync(HERE)` only —
  // in practice `primitives.tsx` alone — so the specimen route and its dialog were outside a rule
  // whose whole subject is what a person reads (fresh reviewer).
  const files = [
    ...readdirSync(HERE)
      .filter((name) => extname(name) === '.tsx')
      .map((name) => join(HERE, name)),
    join(WEB, 'app/app/design-system/page.tsx'),
    join(WEB, 'app/app/design-system/specimen-dialog.tsx'),
  ]
  // ⚠️ A "found some files" pin, for the same reason `scales.test.ts` carries one: moving
  // `primitives.tsx` aside left this test 4/4 green having read nothing at all.
  assert.ok(files.length >= 3, 'the storage-word scan found no files — it asserted nothing')

  for (const path of files) {
    const source = readFileSync(path, 'utf8')
      // Comments explain the storage model constantly and correctly — the ban is on what a person
      // READS, exactly as the drift guard strips comments before looking for a retired colour.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    for (const word of banned) {
      // Only inside a rendered string or JSX text — a prop name or an identifier is not copy.
      // ⚠️ `s?` — the scanner missed every PLURAL, and the one shipped violation this sprint names
      // as its target is plural: "Definitions, immutable versions and their audit remain visible…"
      // matched NONE of the seven banned words, because `immutable version` is not
      // `immutable versions` and `\b` after `version` blocks the s. The rule written to catch that
      // sentence could not see it (fresh reviewer, verified against the literal string).
      const inCopy = new RegExp(`[>"'\`][^<>"'\`]*\\b${word}s?\\b`, 'i')
      assert.equal(
        inCopy.test(source),
        false,
        `${path.slice(WEB.length + 1)} shows the reader the word "${word}" — ` +
          `say "${STORAGE_WORDS.find((entry) => entry.word.toLowerCase() === word)?.insteadSay}" instead`
      )
    }
  }
})

test('every recorded disagreement says which side won and why', () => {
  // The rule is "the control plane wins AND the disagreement is recorded". A record with no reason
  // is not a record — the next builder cannot tell a decision from a typo.
  assert.ok(CONTROL_PLANE_WINS.length > 0, 'no disagreements recorded at all')
  for (const entry of CONTROL_PLANE_WINS) {
    assert.ok(entry.design.length > 0, 'a disagreement with no design wording')
    assert.ok(entry.product.length > 0, 'a disagreement with no product wording')
    assert.notEqual(entry.design, entry.product, 'a "disagreement" where both sides say the same thing')
    assert.ok(
      entry.why.length > 60,
      `the disagreement about "${entry.design}" is recorded without a reason anyone can act on`
    )
  }
})

test('every banned word carries a replacement, not just a prohibition', () => {
  // "Do not say X" with no Y is how a ban gets ignored: the writer still has a sentence to finish.
  for (const entry of STORAGE_WORDS) {
    assert.ok(entry.insteadSay.length > 0, `"${entry.word}" is banned with nothing to say instead`)
    assert.ok(entry.why.length > 20, `"${entry.word}" is banned without saying what is wrong with it`)
    assert.notEqual(
      entry.insteadSay.toLowerCase().includes(entry.word.toLowerCase()),
      true,
      `the replacement for "${entry.word}" contains the word it replaces`
    )
  }
})

test('the sentence Do-not #7 cites is caught by the rule written to catch it', () => {
  // ⚠️ THE REGRESSION TEST FOR FINDING 7. The scanner missed every plural, so the one shipped
  // violation this sprint names as its target — the flags page's legacy branch — was invisible to
  // it. A rule that cannot see its own worked example is not a rule.
  const shipped =
    '<p>Definitions, immutable versions and their audit remain visible while flag serving is dark. ' +
    'Activating or deactivating a flag changes one environment snapshot with optimistic revision ' +
    'protection.</p>'

  const caught = bannedWords().filter((word) =>
    new RegExp(`[>"'\`][^<>"'\`]*\\b${word}s?\\b`, 'i').test(shipped)
  )
  assert.ok(
    caught.length >= 2,
    `the cited sentence tripped ${caught.length} banned words — it should trip at least the plural ` +
      '"immutable versions" and "snapshot"'
  )
  assert.ok(caught.includes('immutable version'), 'the plural "immutable versions" is not caught')
  assert.ok(caught.includes('snapshot'), '"snapshot" is not caught')
})
