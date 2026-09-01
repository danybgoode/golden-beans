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
  SPECIMEN_WORDS,
  STORAGE_WORDS,
  UPPERCASE_ALLOWED,
  bannedWords,
  controlPlaneWord,
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

  // ⚠️ **EACH SELECTOR, not each RULE.** `rule.selector` is the whole comma-separated list, so one
  // approved name anywhere in it authorised every other selector beside it. Adding
  // `.data-table__brand-new` — uppercase AND mono, on a console surface, the pair Do-not #3 forbids
  // outright — as its OWN rule went red correctly, and adding it to the existing
  // `.data-table__filter-label, .data-table__count` rule instead was admitted with no entry and a
  // green suite (fresh reviewer, round 2, Major, verified both directions).
  //
  // "The set may not grow" has to mean the set of SELECTORS. Splitting here is also what makes the
  // mono lookup below unambiguous, which was the same defect one level along.
  const eachSelector = (list: string) =>
    list
      .split(',')
      .map((selector) => selector.trim().replace(/\s+/g, ' '))
      .filter(Boolean)

  for (const path of stylesheets) {
    for (const wholeRule of rules(path)) {
      if (!/text-transform:\s*uppercase/.test(wholeRule.body)) continue
      for (const selector of eachSelector(wholeRule.selector)) {
        const rule = { selector, body: wholeRule.body }
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
          // ⚠️ `.filter`, not `.find`. The lookup took the FIRST matching entry, so a rule matching
          // two entries was answered by whichever came first in the array — round 2 banned duplicate
          // KEYS and left the ambiguous LOOKUP, which is the instance and not the class. Two real
          // rules already match more than one entry; both currently agree on `mono`, so it passed by
          // luck (fresh reviewer, round 2, Major). Now every matching entry must agree.
          const entries = UPPERCASE_ALLOWED.filter((candidate) =>
            mentionsWholeClass(rule.selector, candidate.selector)
          )
          assert.ok(
            entries.length > 0 && entries.every((candidate) => candidate.mono),
            `${rule.selector} is uppercase AND mono — Do-not #3 forbids the pair, and this is not ` +
              'recorded debt. Fix it, or record it with the sprint that will.'
          )
        }
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

  // The places the contract approves are the ones that stay.
  //
  // ⚠️ SELECTORS, not PLACES, and the two counts differ ON PURPOSE. `.ds-table-head` is the design
  // system's column header row and `.listhead` is the one it replaces; `.ds-grp` replaces `.grp`;
  // `.ds-label` replaces `.field > .lab`; `.ds-envtable` replaces `.envtable th`. Both halves of
  // each pair are live until Sprint 6 deletes the old world, so a count of selectors would either
  // force a premature deletion or be a number nobody can justify. This NAMES them, and Sprint 6's
  // deletion is what shrinks the list.
  //
  // ⚠️ The replaced selectors are the `keep: false` rows, and they are listed there rather than
  // deleted here: `.field > .lab` and `.envtable th` are uppercase in the APPROVED design too, so
  // "keep: false" on those rows means *this selector* leaves, never *uppercase leaves this place*.
  assert.deepEqual(
    UPPERCASE_ALLOWED.filter((entry) => entry.keep)
      .map((entry) => entry.selector)
      .sort(),
    [
      '.ds-envtable',
      '.ds-grp',
      '.ds-here',
      '.ds-label',
      '.ds-listhead',
      '.ds-matrix',
      '.ds-specimen-type--label',
      '.ds-table-head',
      '.grp',
      '.listhead',
    ],
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

test('the specimen says the control plane’s word, not the design’s', () => {
  // ⚠️ Story 2.5's criterion is that "every user-facing word in `design-system/` goes through" this
  // module. Before this, `vocabulary.ts` was imported by exactly ONE file — this test — while
  // `page.tsx` hard-coded the same strings. "Never turned on here" existed as a literal in
  // `CONTROL_PLANE_WINS` and, separately, as a literal on the specimen, welded by nothing: fixing
  // the registry would have left the rendered page saying the old thing (fresh reviewer, round 2).
  assert.equal(SPECIMEN_WORDS.neverActivated, 'Never turned on here')

  // ...and the specimen may not hard-code a word the registry settles. This is the weld: the page
  // renders `SPECIMEN_WORDS`, so a literal here means someone typed around the module.
  //
  // ⚠️ **The grip was `>word<` and TWO real violations walked past it.** `label="Never turned on
  // here"` sat in an ATTRIBUTE, and `<Stat label="Never turned on" />` used the DESIGN's phrase —
  // the one `CONTROL_PLANE_WINS` exists to say the control plane overrules — rendered four rows from
  // a pill saying the corrected version. A weld that checks one of the three places a string can
  // appear is a weld that holds one of them (fresh reviewer, round 3, Major).
  //
  // Both SIDES are checked: the product's word must come from the module, and the design's word must
  // not appear at all — a specimen that shows the overruled phrasing is teaching the wrong word.
  // ⚠️ Whitespace-normalised, because all three grips were DELIMITER-ADJACENT: they needed the word
  // flush against `>`/`<`/a quote. JSX children wrapped across lines — `>⏎  Never turned on here⏎<`
  // — walked straight past, and `page.tsx` already contains many hand-wrapped children. Prettier
  // happens to collapse short ones back onto one line, but prettier is NOT in CI (`lint` uses
  // eslint-config-prettier, which DISABLES formatting rules), so the weld cannot lean on it
  // (fresh reviewer, round 5, Minor). Template-literal children are covered too.
  const specimen = readFileSync(join(WEB, 'app/app/design-system/page.tsx'), 'utf8').replace(/\s+/g, ' ')
  const rendered = (word: string) =>
    specimen.includes(`> ${word} <`) ||
    specimen.includes(`>${word}<`) ||
    specimen.includes(`"${word}"`) ||
    specimen.includes(`'${word}'`) ||
    specimen.includes(`\`${word}\``)

  for (const entry of CONTROL_PLANE_WINS) {
    assert.ok(
      !rendered(entry.product),
      `the specimen hard-codes "${entry.product}" instead of reading it from CONTROL_PLANE_WINS`
    )
    assert.ok(
      !rendered(entry.design),
      `the specimen renders "${entry.design}" — the phrasing the control plane OVERRULES. ` +
        `It should say "${entry.product}", via SPECIMEN_WORDS.`
    )
  }
})

test('a word the vocabulary has not settled cannot be rendered', () => {
  // `controlPlaneWord` throws rather than falling back to the design's phrasing. A fallback would
  // mean a typo in the key silently renders the word the control plane overrules — the exact
  // disagreement `CONTROL_PLANE_WINS` exists to record.
  assert.throws(
    () => controlPlaneWord('a phrase nobody settled'),
    /no CONTROL_PLANE_WINS entry/,
    'an unknown design phrase must not resolve to anything'
  )
})

test('every word the vocabulary exports for the specimen is one the specimen uses', () => {
  // ⚠️ `SPECIMEN_WORDS.off` was exported and never referenced while `page.tsx` hard-coded the same
  // string beside it — an unused export in the module whose entire purpose is that the page stops
  // hard-coding (fresh reviewer, round 3, Minor). A registry with entries nobody reads is the shape
  // of module this project has already lost a constant to.
  const specimen = readFileSync(join(WEB, 'app/app/design-system/page.tsx'), 'utf8')
  for (const key of Object.keys(SPECIMEN_WORDS)) {
    assert.ok(
      specimen.includes(`SPECIMEN_WORDS.${key}`),
      `SPECIMEN_WORDS.${key} is exported and the specimen never reads it`
    )
  }
})
