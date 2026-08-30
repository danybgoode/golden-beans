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
import { CONTROL_PLANE_WINS, STORAGE_WORDS, UPPERCASE_ALLOWED, bannedWords } from './vocabulary.ts'

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
  const stylesheets = [join(WEB, 'app/console.css'), join(HERE, 'system.css')]
  const found: string[] = []
  for (const path of stylesheets) {
    for (const rule of rules(path)) {
      if (!/text-transform:\s*uppercase/.test(rule.body)) continue
      found.push(rule.selector)
      assert.equal(
        /var\(--mono|Plex Mono/.test(rule.body),
        false,
        `${rule.selector} is uppercase AND mono — Do-not #3 forbids the pair outright`
      )
    }
  }

  const allowed = UPPERCASE_ALLOWED.map((entry) => entry.selector)
  for (const selector of found) {
    assert.ok(
      allowed.some((entry) => selector.includes(entry)),
      `${selector} applies uppercase and is not in UPPERCASE_ALLOWED — the set may not grow`
    )
  }

  // ...and the list may not carry an entry that no longer exists, or it stops describing the code.
  for (const entry of UPPERCASE_ALLOWED) {
    assert.ok(
      found.some((selector) => selector.includes(entry.selector)),
      `UPPERCASE_ALLOWED lists ${entry.selector}, which no stylesheet applies uppercase to any more`
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

test('no user-facing copy in the design system talks about storage', () => {
  // Scoped to `design-system/` — the surface this epic OWNS. The product's older routes carry
  // storage copy that later sprints replace as they rebuild each page (the flags page's
  // "Definitions, immutable versions and their audit…" is the loudest, and Sprint 4 owns it); a
  // repo-wide ban today would fail on code no story has reached yet, which is how a rule gets
  // switched off rather than obeyed.
  const banned = bannedWords()
  const files = readdirSync(HERE)
    .filter((name) => extname(name) === '.tsx')
    .map((name) => join(HERE, name))

  for (const path of files) {
    const source = readFileSync(path, 'utf8')
      // Comments explain the storage model constantly and correctly — the ban is on what a person
      // READS, exactly as the drift guard strips comments before looking for a retired colour.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    for (const word of banned) {
      // Only inside a rendered string or JSX text — a prop name or an identifier is not copy.
      const inCopy = new RegExp(`[>"'\`][^<>"'\`]*\\b${word}\\b`, 'i')
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
