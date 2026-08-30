import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { selectorLists } from '../../../scripts/check-design-drift.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * ⚠️ **THIS FILE WAS CITED BY NAME BEFORE IT EXISTED.**
 *
 * `system.css` said "…and `system-cascade.test.ts` now pins both"; `layout.tsx` said it "asserts the
 * scoping rather than describing it". Neither was true — `grep -rn system-cascade` returned exactly
 * those two comments (fresh reviewer, round 2, Blocking).
 *
 * That is worse than the defect it claimed to close. The round-1 Major was that 123 rules began
 * `.ds-` with only two under `.ds`, so `console.css`'s `.is-console main p` at (0,1,2) out-specified
 * every primitive. The fix rewrote all 126 selectors correctly — and then advertised a guard that
 * was never written, which is how a corrected file drifts back with the whole gate green.
 *
 * What the drift guard checks is the PREFIX (`.ds-…`); its own test asserts that a bare
 * `.ds-rail { }` is legal. So nothing enforced the scope. This does.
 */

const RAW_SYSTEM_CSS = readFileSync(join(HERE, 'system.css'), 'utf8')

/**
 * `system.css` with `@keyframes` blocks removed.
 *
 * Their steps (`from`, `to`, `0%`) sit inside the at-rule's braces, so a selector scan sees them as
 * top-level type selectors — `to` reads as (0,0,1) and is neither `.ds`-scoped nor can be. They are
 * not part of the cascade this file is about, so they are removed by brace matching rather than
 * exempted by name: a `@keyframes` named `ds-to` must not be able to smuggle a rule past the scan.
 */
function withoutKeyframes(css: string): string {
  let out = ''
  let index = 0
  for (;;) {
    const at = css.indexOf('@keyframes', index)
    if (at === -1) return out + css.slice(index)
    out += css.slice(index, at)
    const open = css.indexOf('{', at)
    if (open === -1) return out
    let depth = 0
    let cursor = open
    for (; cursor < css.length; cursor += 1) {
      if (css[cursor] === '{') depth += 1
      else if (css[cursor] === '}') {
        depth -= 1
        if (depth === 0) break
      }
    }
    index = cursor + 1
  }
}

const SYSTEM_CSS = withoutKeyframes(RAW_SYSTEM_CSS)

/** Specificity of a single compound selector, as (ids, classes, elements). */
function specificity(selector: string): [number, number, number] {
  let rest = selector
  // Pseudo-elements (::before) count as ELEMENTS; pseudo-classes (:hover) count as classes. Strip
  // the two-colon form first so the one-colon pass cannot mistake it for a pseudo-class.
  const pseudoElements = rest.match(/::[\w-]+/g) ?? []
  rest = rest.replace(/::[\w-]+/g, ' ')
  // `:not(...)`/`:is(...)` take the specificity of their argument, not of the pseudo-class itself.
  // The design system uses neither inside `system.css` beyond `:not(:disabled)`, whose argument is
  // a pseudo-class and therefore counts the same either way — so they are counted as written.
  const ids = rest.match(/#[\w-]+/g) ?? []
  const classes = rest.match(/\.[\w-]+/g) ?? []
  const attributes = rest.match(/\[[^\]]*\]/g) ?? []
  rest = rest.replace(/\[[^\]]*\]/g, ' ')
  const pseudoClasses = rest.match(/:[\w-]+(\([^)]*\))?/g) ?? []
  const elements = rest.match(/(^|[\s>+~])([a-zA-Z][\w-]*)/g) ?? []
  return [
    ids.length,
    classes.length + attributes.length + pseudoClasses.length,
    elements.length + pseudoElements.length,
  ]
}

function selectors(): string[] {
  return selectorLists(SYSTEM_CSS)
    .flatMap((list: { text: string }) => list.text.split(','))
    .map((selector: string) => selector.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
}

test('every selector in system.css is scoped to .ds — the claim layout.tsx makes about it', () => {
  const unscoped = selectors().filter((selector) => selector !== '.ds' && !selector.startsWith('.ds '))
  assert.deepEqual(
    unscoped,
    [],
    'system.css carries selectors that are not under `.ds`. A bare `.ds-foo` rule passes the drift ' +
      'guard (which checks the PREFIX) and reintroduces the round-1 defect: `console.css`’s ' +
      '`.is-console main p` at (0,1,2) beats an unscoped primitive at (0,1,0), and the answer line ' +
      'loses its colour on a page nobody re-opened.'
  )
})

test('the .ds scope actually buys specificity — every primitive rule is at least (0,2,0)', () => {
  // Scoping is only worth anything if it RAISES the number. `.ds .ds-answer` is (0,2,0), which
  // outranks `.is-console main p` at (0,1,2) — that inequality is the whole reason the rewrite
  // fixed the rendered defect, and it is what this pins.
  const weak = selectors()
    .filter((selector) => selector !== '.ds')
    .map((selector) => ({ selector, spec: specificity(selector) }))
    .filter(({ spec }) => spec[0] === 0 && spec[1] < 2)
  assert.deepEqual(
    weak.map(({ selector, spec }) => `${selector} is (${spec.join(',')})`),
    [],
    'a rule in system.css sits below (0,2,0) and can be out-specified by a plain console selector'
  )
})

test('the specificity arithmetic in this file reproduces on the cases it was written for', () => {
  // ⚠️ `system.css`’s own comment said the focus rule’s `border-radius` won "at (0,1,1)".
  // `.ds :focus-visible` is a class plus a PSEUDO-CLASS — (0,2,0), not (0,1,1) — so it did
  // not merely outrank `.ds .ds-pill`, it TIED with it and won on source order (fresh reviewer,
  // round 2, Minor). The conclusion held; the arithmetic did not, in the file about specificity.
  assert.deepEqual(specificity('.ds :focus-visible'), [0, 2, 0])
  assert.deepEqual(specificity('.ds .ds-pill'), [0, 2, 0])
  assert.deepEqual(specificity('.is-console main p'), [0, 1, 2])
  assert.deepEqual(specificity('.ds .ds-btn--primary:hover:not(:disabled)'), [0, 4, 0])
  assert.deepEqual(specificity('.ds .ds-dialog::backdrop'), [0, 2, 1])
})
