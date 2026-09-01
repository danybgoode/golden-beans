import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { specificity } from './system-cascade.test.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = join(HERE, '..')

/**
 * ⚠️ **The environment dot says which environment you are operating in. Three copies of it existed
 * and one disagreed with the other two.**
 *
 * - `reference.css` (GENERATED from the approved prototype) — production gold, preview blue,
 *   development grey, 8px.
 * - `console.css`'s `.env-dot`, rendered on the feature page — the same.
 * - `system.css`'s `.ds-env-dot`, the design system primitive — production GREEN, preview GOLD,
 *   development BLUE, 6px.
 *
 * Sprint 3 put the primitive into the rail's environment control, so **gold meant production on one
 * page and preview on the next**, one click apart (fresh reviewer, Blocking, found by rendering both
 * pages rather than by reading either).
 *
 * Nothing could have caught it. `extract-css --check` only regenerates `reference.css` and
 * `tokens.css`; `system.css` is hand-written and has no comparison against the approved design at
 * all. `console-gate-spec.ts` has no row for the control. The Sprint 3 e2e test asserts the
 * control's STRUCTURE — one control, opens, three links, URL — and never its paint, which is this
 * epic's own thesis defect reproduced inside the sprint written to end it.
 *
 * This is the narrow, durable fix: the one primitive whose colours ARE its meaning is compared,
 * value by value, against the generated file. It is deliberately not a general "system.css matches
 * the prototype" checker — the design system legitimately restyles things — but where a colour
 * encodes a fact about production, the three copies must agree.
 */

/**
 * Every top-level rule in a stylesheet, as `[selector, body]` pairs in source order.
 *
 * ⚠️ **The previous version used `/([^{}]+)\{([^{}]*)\}/g`, which CANNOT match a nested block — so
 * it skipped every `@media` wrapper and registered the rules inside as UNCONDITIONAL.** This commit
 * is what made that dangerous: it added the first `@media` to `console.css` (the `.cmdk` mobile
 * rule) and pointed this parser at `console.css` for the first time, in the same change.
 *
 * The failure it allowed: set the base dot to green — the shipped Blocking, on screen — then add
 * `@media print { .env-dot.production { background: var(--gold) } }`. The guard reads the print
 * colour as if it applied, and goes green on a defect nobody can see except every user (fresh
 * reviewer, round 3, Blocking, mutation-verified).
 *
 * At-rules are REFUSED, not parsed. A conditional environment-dot colour is not a thing this guard
 * should quietly reason about — the dot's meaning must not depend on the viewport or the medium —
 * so a matching selector inside an at-rule throws and says so. Non-matching at-rules (the `.cmdk`
 * media block, `@keyframes`) are skipped wholesale, which is why the throw is scoped to the
 * selectors this test actually reads.
 */
function rules(relative: string): { selector: string; body: string; conditional: boolean }[] {
  const css = readFileSync(join(WEB, relative), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ')
  const found: { selector: string; body: string; conditional: boolean }[] = []

  let index = 0
  let depth = 0
  let start = 0
  let prelude = ''
  while (index < css.length) {
    const char = css[index]
    if (char === '{') {
      const text = css.slice(start, index).trim()
      if (text.startsWith('@')) {
        // An at-rule with a block: everything inside it is CONDITIONAL.
        depth += 1
        prelude = text
      } else {
        const close = css.indexOf('}', index)
        const body = css.slice(index + 1, close === -1 ? css.length : close)
        for (const selector of splitSelectors(text)) {
          found.push({ selector, body, conditional: depth > 0 && prelude !== '' })
        }
        index = close === -1 ? css.length : close
        start = index + 1
        index += 1
        continue
      }
    } else if (char === '}' && depth > 0) {
      depth -= 1
      if (depth === 0) prelude = ''
    }
    if (char === '{' || char === '}' || char === ';') start = index + 1
    index += 1
  }
  return found
}

/** Split a selector list on top-level commas — attribute values may contain them. */
function splitSelectors(list: string): string[] {
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

/**
 * The background colour a declaration block ends up setting, or null.
 *
 * ⚠️ **LAST match, not first.** This used a non-global `exec`, so
 * `background: var(--gold); background-color: var(--green)` answered `var(--gold)` while the element
 * rendered GREEN. Worse: the previous commit's docstring said this had been fixed and
 * "mutation-verified" — it was byte-identical, untouched. Prose asserting a property the code lacks,
 * in the fix commit, naming the defect it did not fix (fresh reviewer, round 3, Blocking).
 */
function background(body: string | undefined): string | null {
  if (!body) return null
  let answer: string | null = null
  for (const match of body.matchAll(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/g)) {
    answer = match[1].trim().replace(/\s*!important$/, '')
  }
  return answer
}

const ENVIRONMENTS = ['production', 'preview', 'development'] as const

/**
 * The colour these selectors actually produce, resolved the way a browser resolves it.
 *
 * ⚠️ **"Last in source order" was the wrong model and it failed in BOTH directions.**
 * `.env-dot.production` is (0,2,0) and `.env-dot` is (0,1,0), so the variant wins REGARDLESS of
 * order. Taking whichever came later meant:
 *
 *  - a cosmetic REORDER of the four `env-dot` rules — byte-identical rendering — turned the guard
 *    red, which is CI failing a correct branch; and
 *  - a legitimate later override could win here while losing in the browser.
 *
 * (fresh reviewer, round 3, Blocking, both mutation-verified.)
 *
 * Specificity first, source order only as the tiebreak — which is the actual cascade for two rules
 * of equal weight in one stylesheet. `specificity()` is imported from `system-cascade.test.ts`
 * rather than written again: this file needing a second copy of that arithmetic is exactly how the
 * two would drift apart, and that parser is already pinned against the cases it used to get wrong.
 */
function resolved(
  sheet: { selector: string; body: string; conditional: boolean }[],
  selectors: string[],
  where: string
): string | null {
  const matching = sheet
    .map((rule, order) => ({ ...rule, order }))
    .filter((rule) => selectors.includes(rule.selector) && background(rule.body) !== null)

  // ⚠️ A conditional rule is REFUSED, not ranked. If the dot's colour depends on a media query, the
  // question this test asks ("what does this dot mean?") has more than one answer, and silently
  // picking one is how the flattening defect above shipped.
  const conditional = matching.filter((rule) => rule.conditional)
  assert.equal(
    conditional.length,
    0,
    `${where}: ${conditional.map((rule) => rule.selector).join(', ')} sets the environment dot's ` +
      'colour inside an at-rule. This dot encodes WHICH ENVIRONMENT you are operating in; that ' +
      'cannot depend on the viewport or the medium, and this guard will not pretend to resolve it.'
  )

  let winner: { colour: string; weight: [number, number, number]; order: number } | null = null
  for (const rule of matching) {
    const weight = specificity(rule.selector)
    const colour = background(rule.body)
    if (colour === null) continue
    if (
      winner === null ||
      compareSpecificity(weight, winner.weight) > 0 ||
      (compareSpecificity(weight, winner.weight) === 0 && rule.order >= winner.order)
    ) {
      winner = { colour, weight, order: rule.order }
    }
  }
  return winner?.colour ?? null
}

function compareSpecificity(a: [number, number, number], b: [number, number, number]): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

test('the design system’s environment dot means the same thing as the approved design’s', () => {
  const approved = rules('design-system/reference.css')
  const system = rules('design-system/system.css')
  // ⚠️ **THE THIRD COPY.** This test's own docstring named `console.css`'s `.env-dot` — the rule the
  // FEATURE PAGE renders — and the commit message said the guard "fails if the three copies ever
  // disagree". It opened two files. Setting `.is-console .env-dot.production` to green left it
  // green: the shipped Blocking, mirrored, with the guard written to prevent it passing (fresh
  // reviewer, round 2, mutation-verified). A completeness claim needs the file open, not the name
  // written down.
  const console_ = rules('app/console.css')

  // The generated file is the authority. If these selectors ever stop existing there, the prototype
  // changed shape and this test must be re-derived rather than quietly passing on an empty read.
  /** The body of a single, unconditional rule — used for the size comparison below. */
  const bodyOf = (sheet: { selector: string; body: string; conditional: boolean }[], selector: string) =>
    sheet.find((rule) => rule.selector === selector && !rule.conditional)?.body

  const base = bodyOf(approved, '.env-dot')
  assert.ok(base, 'reference.css has no `.env-dot` — the approved design changed shape')

  for (const environment of ENVIRONMENTS) {
    // Every place each copy could set this colour, base rule and variant together, last one winning.
    const approvedColour = resolved(approved, ['.env-dot', `.env-dot.${environment}`], 'reference.css')
    const systemColour = resolved(
      system,
      ['.ds .ds-env-dot', `.ds .ds-env-dot[data-env='${environment}']`],
      'system.css'
    )
    const consoleColour = resolved(
      console_,
      ['.is-console .env-dot', `.is-console .env-dot.${environment}`],
      'console.css'
    )

    assert.ok(approvedColour, `reference.css sets no colour for the ${environment} dot`)
    assert.ok(systemColour, `system.css sets no colour for the ${environment} dot`)
    assert.ok(consoleColour, `console.css sets no colour for the ${environment} dot`)

    assert.equal(
      systemColour,
      approvedColour,
      `the ${environment} dot is ${systemColour} in the design system and ${approvedColour} in the ` +
        'approved design. A colour that encodes WHICH ENVIRONMENT you are operating in cannot mean ' +
        'two things on two adjacent screens.'
    )
    assert.equal(
      consoleColour,
      approvedColour,
      `the ${environment} dot is ${consoleColour} in console.css (the feature page) and ` +
        `${approvedColour} in the approved design — the same disagreement, mirrored.`
    )
  }

  // ...and the size, which was 6px against the approved 8px. A 6px dot is not the approved dot.
  const size = (body: string, property: string): string | undefined =>
    new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`).exec(body)?.[1].trim()

  for (const property of ['width', 'height']) {
    const approvedSize = size(base, property)
    const systemSize = size(bodyOf(system, '.ds .ds-env-dot') ?? '', property)
    assert.equal(
      systemSize,
      approvedSize,
      `the environment dot's ${property} is ${systemSize}, approved is ${approvedSize}`
    )
  }
})
