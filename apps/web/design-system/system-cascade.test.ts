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

/** A stylesheet with its comments removed. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, ' ')
}

/**
 * `system.css` with `@keyframes` blocks removed.
 *
 * Their steps (`from`, `to`, `0%`) sit inside the at-rule's braces, so a selector scan sees them as
 * top-level type selectors — `to` reads as (0,0,1) and is neither `.ds`-scoped nor can be.
 *
 * ⚠️ **This runs on COMMENT-STRIPPED source, and that is the whole correctness argument.** It used
 * to run on the raw file: it found the literal `@keyframes`, jumped to the next `{`, and
 * brace-matched — so the words "see @keyframes ds-spin" in a COMMENT ate the next real rule instead.
 * Two lines defeated the guard, and defeated the exact mutation this file's commit message cites as
 * proof it works:
 *
 *     /* see @keyframes ds-spin for the animation *␘/
 *     .ds-smuggled { color: var(--crema); }   ← unscoped, and invisible to every check
 *
 * (fresh reviewer, round 3, Blocking, verified by mutation). The predecessor defect was a guard that
 * did not exist; this was a guard that could not fail. Comments come out FIRST now.
 */
function withoutKeyframes(css: string): string {
  let out = ''
  let index = 0
  for (;;) {
    const at = css.indexOf('@keyframes', index)
    if (at === -1) return out + css.slice(index)
    out += css.slice(index, at)
    const open = css.indexOf('{', at)
    // ⚠️ Not `return out`. Swallowing the rest of the stylesheet on a malformed at-rule is a silent
    // skip, which is the shape of both this file's predecessors (fresh reviewer, round 3, Minor).
    if (open === -1)
      throw new Error('system.css has an @keyframes with no block — the scan cannot be trusted')
    let depth = 0
    let cursor = open
    for (; cursor < css.length; cursor += 1) {
      if (css[cursor] === '{') depth += 1
      else if (css[cursor] === '}') {
        depth -= 1
        if (depth === 0) break
      }
    }
    if (depth !== 0) throw new Error('system.css has an unclosed @keyframes block')
    index = cursor + 1
  }
}

const SYSTEM_CSS = withoutKeyframes(withoutComments(RAW_SYSTEM_CSS))

/** The functional pseudo-classes whose specificity is their ARGUMENT's, not their own. */
const ARGUMENT_SPECIFICITY = new Set(['is', 'not', 'has'])

/**
 * Specificity of one compound selector, as (ids, classes, elements).
 *
 * ⚠️ **The previous version counted by regex and got five of `system.css`'s 125 selectors wrong,
 * every error an OVER-count — the permissive direction for a "must be at least (0,2,0)" floor.**
 * `:where(*)` scored (0,2,0) when it is (0,1,0) by definition, and `:not([data-state='unbuilt'])`
 * scored the `:not` AND its attribute. So the file already contained a rule below the floor the
 * test's own title promises, passing on bad arithmetic (fresh reviewer, round 3, Blocking).
 *
 * Written as a parser rather than a pile of regexes because the three rules that matter are
 * structural: `:where()` contributes ZERO, `:is()`/`:not()`/`:has()` contribute their argument's
 * specificity and nothing of their own, and everything else is a flat count.
 */
export function specificity(selector: string): [number, number, number] {
  const total: [number, number, number] = [0, 0, 0]
  let index = 0

  const readBalanced = (from: number): [string, number] => {
    let depth = 0
    for (let cursor = from; cursor < selector.length; cursor += 1) {
      if (selector[cursor] === '(') depth += 1
      else if (selector[cursor] === ')') {
        depth -= 1
        if (depth === 0) return [selector.slice(from + 1, cursor), cursor + 1]
      }
    }
    throw new Error(`unbalanced parentheses in selector: ${selector}`)
  }

  while (index < selector.length) {
    const char = selector[index]

    if (char === '#' || char === '.') {
      const name = /^[\w-]+/.exec(selector.slice(index + 1))?.[0] ?? ''
      total[char === '#' ? 0 : 1] += 1
      index += 1 + name.length
      continue
    }

    if (char === '[') {
      const close = selector.indexOf(']', index)
      if (close === -1) throw new Error(`unterminated attribute selector: ${selector}`)
      total[1] += 1
      index = close + 1
      continue
    }

    if (char === ':') {
      const doubled = selector[index + 1] === ':'
      const start = index + (doubled ? 2 : 1)
      const name = /^[\w-]+/.exec(selector.slice(start))?.[0] ?? ''
      let after = start + name.length
      let argument: string | null = null
      if (selector[after] === '(') {
        const [inner, next] = readBalanced(after)
        argument = inner
        after = next
      }

      if (doubled) {
        // A pseudo-ELEMENT.
        total[2] += 1
      } else if (name === 'where') {
        // Zero, by definition. That is the entire reason `:where()` exists, and `system.css:77`
        // uses it deliberately so the reduced-motion override adds no specificity.
      } else if (ARGUMENT_SPECIFICITY.has(name) && argument !== null) {
        // The most specific argument wins; the pseudo-class itself contributes nothing.
        const best = argument
          .split(',')
          .map((part) => specificity(part.trim()))
          .reduce((a, b) => (compare(b, a) > 0 ? b : a), [0, 0, 0] as [number, number, number])
        total[0] += best[0]
        total[1] += best[1]
        total[2] += best[2]
      } else {
        total[1] += 1
      }
      index = after
      continue
    }

    const type = /^[a-zA-Z][\w-]*/.exec(selector.slice(index))?.[0]
    if (type) {
      total[2] += 1
      index += type.length
      continue
    }

    // Combinators, `*`, whitespace: no contribution.
    index += 1
  }
  return total
}

function compare(a: [number, number, number], b: [number, number, number]): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

/** Every selector list in `system.css` with its declaration block. */
function ruleList(): { selector: string; body: string }[] {
  const lists = selectorLists(SYSTEM_CSS)
  return lists.map((list: { text: string; index: number }) => {
    const open = SYSTEM_CSS.indexOf('{', list.index)
    const close = SYSTEM_CSS.indexOf('}', open)
    return { selector: list.text.trim().replace(/\s+/g, ' '), body: SYSTEM_CSS.slice(open + 1, close) }
  })
}

function selectors(): string[] {
  return ruleList()
    .flatMap(({ selector }) => selector.split(','))
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
  // outranks `.is-console main p` at (0,1,2) — that inequality is the whole reason the rewrite fixed
  // the rendered defect, and it is what this pins.
  //
  // ⚠️ ONE deliberate exception, and it is narrow. `system.css`'s reduced-motion block is written
  // `.ds :where(*)` precisely SO THAT it adds no specificity — that is what `:where()` is for — and
  // it wins by `!important` instead. Exempting it is correct; exempting it silently is not, which is
  // how the old arithmetic hid it: it scored the rule (0,2,0) and the floor never saw it (fresh
  // reviewer, round 3, Blocking). The exemption therefore checks BOTH halves of the reason.
  const exempt = (selector: string, body: string) => /:where\(/.test(selector) && /!important/.test(body)

  const weak = ruleList()
    .flatMap(({ selector, body }) =>
      selector
        .split(',')
        .map((part) => part.trim().replace(/\s+/g, ' '))
        .filter((part) => part && part !== '.ds')
        .map((part) => ({ selector: part, body, spec: specificity(part) }))
    )
    .filter(({ spec }) => spec[0] === 0 && spec[1] < 2)
    .filter(({ selector, body }) => !exempt(selector, body))

  assert.deepEqual(
    weak.map(({ selector, spec }) => `${selector} is (${spec.join(',')})`),
    [],
    'a rule in system.css sits below (0,2,0) and can be out-specified by a plain console selector'
  )

  // ...and the exemption may not quietly become the rule. Exactly one block uses it today.
  const exempted = ruleList().filter(({ selector, body }) => exempt(selector, body))
  assert.equal(
    exempted.length,
    1,
    'more than one rule opts out of the specificity floor with `:where()` + `!important` — that is ' +
      'a pattern now, not an exception, and the floor stops meaning anything'
  )
})

test('the specificity arithmetic reproduces — including every case the old version got WRONG', () => {
  // ⚠️ The previous version of this test pinned five selectors the implementation already computed
  // correctly, and one of those five was not even a selector in `system.css`. The four real rules it
  // got wrong were pinned by nothing — a test written to stop wrong arithmetic asserting only
  // arithmetic that was already right (fresh reviewer, round 3, Major).
  //
  // These five are the ones that were WRONG, taken from the file verbatim.
  assert.deepEqual(specificity('.ds :where(*)'), [0, 1, 0], ':where() contributes zero, by definition')
  assert.deepEqual(
    specificity(".ds .ds-btn--primary:not([data-state='unbuilt']):hover:not(:disabled)"),
    [0, 5, 0],
    ':not() contributes its ARGUMENT, not itself as well'
  )
  assert.deepEqual(
    specificity(".ds .ds-btn--secondary:not([data-state='unbuilt']):hover:not(:disabled)"),
    [0, 5, 0]
  )
  assert.deepEqual(specificity(".ds .ds-btn:not([data-state='unbuilt']):active:not(:disabled)"), [0, 5, 0])
  assert.deepEqual(
    specificity(".ds .ds-btn--primary:not([data-state='unbuilt']):active:not(:disabled)"),
    [0, 5, 0]
  )

  // ...and the cases the round-3 comments cite, so the prose and the arithmetic cannot part company.
  assert.deepEqual(specificity('.ds :focus-visible'), [0, 2, 0])
  assert.deepEqual(specificity('.ds .ds-pill'), [0, 2, 0])
  assert.deepEqual(specificity('.is-console main p'), [0, 1, 2])
  assert.deepEqual(specificity(".ds .ds-btn[data-state='unbuilt']"), [0, 3, 0])
  assert.deepEqual(specificity('.ds .ds-dialog::backdrop'), [0, 2, 1])
  assert.deepEqual(specificity('#id .c e'), [1, 1, 1])
  assert.deepEqual(specificity('.ds :is(.a, #b)'), [1, 1, 0], ':is() takes its MOST specific argument')
})

test('every selector in system.css computes a specificity without throwing', () => {
  // The parser throws on malformed input rather than guessing. Running it over the whole file is how
  // a selector shape it cannot handle shows up here instead of as a silently wrong number.
  for (const selector of selectors()) specificity(selector)
})
