import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

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

function rules(relative: string): Map<string, string> {
  const css = readFileSync(join(WEB, relative), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ')
  const found = new Map<string, string>()
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const selector of match[1].split(',')) {
      found.set(selector.trim().replace(/\s+/g, ' '), match[2])
    }
  }
  return found
}

/** The `background` a rule sets, or null. */
function background(body: string | undefined): string | null {
  if (!body) return null
  const match = /(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/.exec(body)
  return match ? match[1].trim() : null
}

const ENVIRONMENTS = ['production', 'preview', 'development'] as const

test('the design system’s environment dot means the same thing as the approved design’s', () => {
  const approved = rules('design-system/reference.css')
  const system = rules('design-system/system.css')

  // The generated file is the authority. If these selectors ever stop existing there, the prototype
  // changed shape and this test must be re-derived rather than quietly passing on an empty read.
  const base = approved.get('.env-dot')
  assert.ok(base, 'reference.css has no `.env-dot` — the approved design changed shape')

  for (const environment of ENVIRONMENTS) {
    const approvedRule =
      environment === 'production'
        ? approved.get('.env-dot.production')
        : approved.get(`.env-dot.${environment}`)
    assert.ok(approvedRule, `reference.css has no rule for .env-dot.${environment}`)

    const systemRule =
      environment === 'production'
        ? system.get('.ds .ds-env-dot')
        : system.get(`.ds .ds-env-dot[data-env='${environment}']`)
    assert.ok(systemRule, `system.css has no rule for the ${environment} dot`)

    assert.equal(
      background(systemRule),
      background(approvedRule),
      `the ${environment} dot is ${background(systemRule)} in the design system and ` +
        `${background(approvedRule)} in the approved design. A colour that encodes WHICH ENVIRONMENT ` +
        'you are operating in cannot mean two things on two adjacent screens.'
    )
  }

  // ...and the size, which was 6px against the approved 8px. A 6px dot is not the approved dot.
  const size = (body: string, property: string): string | undefined =>
    new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`).exec(body)?.[1].trim()

  for (const property of ['width', 'height']) {
    const approvedSize = size(base, property)
    const systemSize = size(system.get('.ds .ds-env-dot') ?? '', property)
    assert.equal(
      systemSize,
      approvedSize,
      `the environment dot's ${property} is ${systemSize}, approved is ${approvedSize}`
    )
  }
})
