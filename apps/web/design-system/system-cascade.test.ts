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

/**
 * Split a selector list on its TOP-LEVEL commas.
 *
 * ⚠️ `String.split(',')` cut inside `:not(:is(.a, .b))` and inside `[data-x="a,b"]`, producing
 * fragments that are not selectors — and the loudest consequence was a FALSE accusation: a legal,
 * correctly-`.ds`-scoped rule failed three tests, one of them reporting "system.css carries
 * selectors that are not under `.ds`" about a selector that is (fresh reviewer, round 5, Major).
 * A guard that blocks correct work with a wrong diagnosis is how a guard gets switched off.
 */
function splitSelectorList(list: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote: string | null = null
  let current = ''
  for (let index = 0; index < list.length; index += 1) {
    const char = list[index]
    if (quote) {
      current += char
      if (char === quote && list[index - 1] !== '\\') quote = null
      continue
    }
    if (char === '"' || char === "'") quote = char
    else if (char === '(' || char === '[') depth += 1
    else if (char === ')' || char === ']') depth -= 1
    else if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += char
  }
  parts.push(current)
  return parts.map((part) => part.trim().replace(/\s+/g, ' ')).filter(Boolean)
}

/** The four pseudo-ELEMENTS that are still legal with a single colon. */
const LEGACY_PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter'])

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
      // Lower-cased: pseudo-class names are ASCII case-insensitive in CSS, so `:WHERE(*)` is the
      // same zero-specificity selector as `:where(*)`. Matching case-sensitively scored it (0,1,0)
      // — upward again (fresh reviewer, round 5).
      const name = (/^[\w-]+/.exec(selector.slice(start))?.[0] ?? '').toLowerCase()
      let after = start + name.length
      let argument: string | null = null
      if (selector[after] === '(') {
        const [inner, next] = readBalanced(after)
        argument = inner
        after = next
      }

      if (doubled || LEGACY_PSEUDO_ELEMENTS.has(name)) {
        // A pseudo-ELEMENT. ⚠️ `:before` / `:after` / `:first-line` / `:first-letter` are the four
        // that predate the `::` notation and are still valid with one colon — they belong in the
        // ELEMENT column, and counting them as classes over-counted in the PERMISSIVE direction:
        // `.ds :before` is truly (0,1,1), below the floor, and scored (0,2,0). The floor's verdict
        // depended on a purely cosmetic notation choice, and the wrong choice was the one that
        // passed — which is the exact Blocking this parser was written to fix (fresh reviewer,
        // round 5, Major, mutation-verified in both notations).
        total[2] += 1
      } else if (name === 'where') {
        // Zero, by definition. That is the entire reason `:where()` exists, and `system.css:77`
        // uses it deliberately so the reduced-motion override adds no specificity.
      } else if (ARGUMENT_SPECIFICITY.has(name) && argument !== null) {
        // The most specific argument wins; the pseudo-class itself contributes nothing.
        const best = splitSelectorList(argument)
          .map((part) => specificity(part))
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
  return ruleList().flatMap(({ selector }) => splitSelectorList(selector))
}

/**
 * Is this selector inside the `.ds` scope, whichever form it is written in?
 *
 * `.ds`, `.ds …` — and `:where(.ds …) …`, which is the same containment written at ZERO
 * specificity. The third form arrived in Sprint 6 for the shell's form-control reset (see the
 * exemption in the next test for why that rule must be out-specifiable), and a scope test that read
 * only the literal prefix would have called a correctly-scoped rule unscoped.
 *
 * ⚠️ **EVERY comma-part of the `:where()` head must be scoped, and checking the PREFIX alone made
 * this guard weaker than the one it replaced** (fresh reviewer, round 2, Major — mutation-verified).
 *
 * `splitSelectorList` only splits TOP-LEVEL commas, so a comma *inside* `:where(…)` is invisible to
 * it. `:where(.ds .ds-shell, .totally-unscoped) .a .b` therefore arrived here as one string starting
 * `:where(.ds `, was declared scoped, and cleared the (0,2,0) floor too (`:where()` contributes 0,
 * `.a .b` contributes 2) — an entirely unscoped rule passing BOTH guards. Written the plain way,
 * `.ds .ds-shell, .totally-unscoped` would have been split at the top-level comma and the naked part
 * flagged; the `:where()` form is what hid the comma.
 *
 * So the head is parsed and every part of it is checked. A pattern was the loosening; this is not.
 */
function isDsScoped(selector: string): boolean {
  if (selector === '.ds' || selector.startsWith('.ds ')) return true
  if (!selector.startsWith(':where(')) return false

  // The balanced contents of the leading `:where(…)`. Balanced rather than "up to the first `)`",
  // because `:where(.ds :not(.x))` is legal and a naive scan would truncate it into nonsense.
  let depth = 0
  let end = -1
  for (let index = ':where('.length - 1; index < selector.length; index += 1) {
    if (selector[index] === '(') depth += 1
    else if (selector[index] === ')') {
      depth -= 1
      if (depth === 0) {
        end = index
        break
      }
    }
  }
  if (end === -1) return false
  const head = selector.slice(':where('.length, end)
  // Recursive, so `:where(:where(.ds x), .naked)` cannot smuggle a part through either.
  return splitSelectorList(head).every((part) => isDsScoped(part))
}

test('every selector in system.css is scoped to .ds — the claim layout.tsx makes about it', () => {
  const unscoped = selectors().filter((selector) => !isDsScoped(selector))
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
      splitSelectorList(selector)
        .filter((part) => part !== '.ds')
        .map((part) => ({ selector: part, body, spec: specificity(part) }))
    )
    .filter(({ spec }) => spec[0] === 0 && spec[1] < 2)
    .filter(({ selector, body }) => !exempt(selector, body))
    .filter(({ selector }) => selector !== ZERO_SPECIFICITY_BASE)

  assert.deepEqual(
    weak.map(({ selector, spec }) => `${selector} is (${spec.join(',')})`),
    [],
    'a rule in system.css sits below (0,2,0) and can be out-specified by a plain console selector'
  )

  // ...and the exemption may not quietly become the rule. ⚠️ Counted per SELECTOR, not per block:
  // counting blocks let a second weak `:where()` selector be added as a comma-part of the block that
  // already holds the exemption, and the count stayed at 1 (fresh reviewer, round 5, Minor).
  const exempted = ruleList().flatMap(({ selector, body }) =>
    splitSelectorList(selector).filter((part) => exempt(part, body))
  )
  assert.equal(
    exempted.length,
    1,
    'more than one rule opts out of the specificity floor with `:where()` + `!important` — that is ' +
      'a pattern now, not an exception, and the floor stops meaning anything'
  )
})

/**
 * ⚠️ **A SECOND deliberate exception, and it is narrower still: the shell's form-control reset.**
 *
 * `:where(.ds .ds-shell) :where(input, textarea, select)` is (0,0,0) ON PURPOSE. It is a BASE — it
 * supplies a width, a min-height and a ground to any control that has no rule of its own — and its
 * entire job is to be beaten by every primitive and every console rule. The version that shipped
 * before this epic, `:where(.product-shell, .auth-shell) :where(input, …)`, was (0,0,0) for the
 * same reason.
 *
 * Writing it `.ds .ds-shell :where(input, …)` instead scores (0,2,0) — `:where()` zeroes only its
 * OWN argument — and in the last-loaded stylesheet that silently beat `.ds .ds-input`,
 * `.is-console .text-input` and `.is-console .command-palette__input` on ties. That is what the
 * floor below is for, pointing the other way: a base reset that CANNOT be out-specified is the
 * defect, not the fix.
 *
 * Pinned by exact selector rather than by a pattern, so a second zero-specificity rule cannot join
 * it without somebody deciding to add it here.
 */
const ZERO_SPECIFICITY_BASE = ':where(.ds .ds-shell) :where(input, textarea, select)'

test('the shell base reset is still written at ZERO specificity', () => {
  // ⚠️ **The floor has no CEILING, so nothing pinned the one rule that must stay BELOW it** (fresh
  // reviewer, round 2, Minor — mutation-verified: appending `.ds .ds-shell :where(input) {…}`, the
  // exact broken form, left all five tests green).
  //
  // `ZERO_SPECIFICITY_BASE` exempts that selector from the floor. It does not require it to EXIST,
  // so rewriting it back to `.ds .ds-shell :where(input, …)` — (0,2,0), because `:where()` zeroes
  // only its own argument — silently re-beats `.ds .ds-input` and the ⌘K palette's input on every
  // console route, with CI green. That is the defect the exemption was created for, walking back in
  // through the exemption's own door.
  //
  // The literal string, because the whole point is the exact form. A regex permissive enough to
  // accept "some rule about shell inputs" would accept the broken one.
  // ⚠️ Compared on WHITESPACE-NORMALISED source, not on the raw bytes. `:where(.ds  .ds-shell)` with
  // two spaces is the same selector to CSS and a different string to `includes()`, so the byte-exact
  // form went red on code that was correct — a guard blocking correct work with a wrong diagnosis,
  // which is how a guard gets switched off rather than obeyed (found by mutation, round 3).
  const normalise = (text: string) => text.replace(/\s+/g, ' ')
  const css = normalise(withoutKeyframes(withoutComments(RAW_SYSTEM_CSS)))
  assert.ok(
    css.includes(normalise(ZERO_SPECIFICITY_BASE)),
    `system.css no longer contains \`${ZERO_SPECIFICITY_BASE}\`. If the shell's form-control reset ` +
      'was rewritten, check its specificity: at (0,2,0) in the last-loaded stylesheet it beats ' +
      '`.ds .ds-input`, `.is-console .text-input` and `.is-console .command-palette__input` on ties.'
  )

  // ⚠️ **PRESENCE IS NOT EFFECTIVENESS, and the first version of this test only checked presence**
  // (fresh reviewer, round 4, Major — mutation-verified). `includes()` proves the correct selector
  // is in the file. It proves nothing about a COMPETING rule sitting beside it: appending
  // `.ds .ds-shell :where(input, textarea, select) { … }` — the exact broken form this test's own
  // comment names — is `.ds`-scoped, clears the (0,2,0) floor, and leaves the pin above satisfied.
  // All six tests stayed green. That is the round-2 finding ("the floor has no CEILING") repeating
  // one layer up: I pinned the presence of the right rule and not the absence of a wrong one.
  //
  // So the (0,2,0) form is BANNED outright. There is exactly one legitimate way to write this reset
  // and this is the assertion that says so.
  const bannedForm = /\.ds\s+\.ds-shell\s+:where\(\s*input/
  assert.ok(
    !bannedForm.test(css),
    'system.css contains `.ds .ds-shell :where(input…)`, which is (0,2,0) — `:where()` zeroes only ' +
      'its OWN argument, so the two leading classes still count. In the last-loaded stylesheet that ' +
      'beats `.ds .ds-input`, `.is-console .text-input` and `.is-console .command-palette__input` ' +
      'on ties, which silently redesigns the ⌘K palette on every console route. Write it ' +
      `\`${ZERO_SPECIFICITY_BASE}\` — the whole selector inside \`:where()\`.`
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

  // ⚠️ `(0,4,0)` is here because `system.css:123` CLAIMS it is pinned — and the commit that wrote
  // that claim is the same one that deleted the only line covering it. A comment asserting a guard
  // that the same hunk removed is the "prose asserting a property the code lacks" class, third
  // round running, inside the comment rewritten to fix a wrong-number claim (fresh reviewer,
  // round 5, Major).
  assert.deepEqual(specificity('.ds .ds-btn--primary:hover:not(:disabled)'), [0, 4, 0])

  // Both notations for the same pseudo-element must agree, or the floor can be passed by choosing
  // one colon over two.
  assert.deepEqual(specificity('.ds :before'), [0, 1, 1])
  assert.deepEqual(specificity('.ds ::before'), [0, 1, 1])
  assert.deepEqual(specificity('.ds :WHERE(*)'), [0, 1, 0], 'pseudo-class names are case-insensitive')

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

test('a selector list is split on its top-level commas only', () => {
  // The shapes that were being cut mid-selector, each of which produced a false accusation.
  assert.deepEqual(splitSelectorList('.ds .ds-btn:not(:is(.a, .b))'), ['.ds .ds-btn:not(:is(.a, .b))'])
  assert.deepEqual(splitSelectorList('.ds [data-x="a,b"]'), ['.ds [data-x="a,b"]'])
  assert.deepEqual(splitSelectorList('.ds .a, .ds .b'), ['.ds .a', '.ds .b'])
  assert.deepEqual(splitSelectorList('.ds :is(.a, .b), .ds .c'), ['.ds :is(.a, .b)', '.ds .c'])

  // ...and the parser handles the nesting it used to throw `unbalanced parentheses` on.
  assert.deepEqual(specificity('.ds .ds-btn:not(:is(.a, .b))'), [0, 3, 0])
})
