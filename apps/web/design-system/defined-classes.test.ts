import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, relative } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = join(HERE, '..')

/**
 * **Every `ds-` class the product renders must have a rule somewhere.**
 *
 * ── The defect this exists for, which shipped and survived three sprints ──────────────────────
 * `app/app/onboarding/[projectSlug]/page.tsx` renders `<pre className="ds-code">`. There has never
 * been a `.ds-code` rule. So the one code block on the screen that shows a new tenant its API key —
 * a ~110-character line — has been rendering at browser defaults, with no `overflow-x`, since
 * Sprint 5. Found by a reviewer reading the diff, in round 7 of the last sprint.
 *
 * ── Why nothing else could see it ─────────────────────────────────────────────────────────────
 * Every guard in this directory checks the opposite direction or a different property:
 *
 *   · `check-design-drift.mjs` asserts a class IS `ds-`-prefixed. `ds-code` is.
 *   · `system-cascade.test.ts` reads `system.css` and asserts every SELECTOR is `.ds`-scoped. A
 *     class that appears in no selector at all is invisible to it.
 *   · `tokens-defined.test.ts` is this test's exact shape one level down — it catches a `var(--x)`
 *     nobody defines — and its docblock explains why that matters: CSS does not error, so the
 *     declaration silently falls back. An undefined CLASS is the same failure one level up, and the
 *     symmetry is why this file's absence was the gap.
 *   · The visual gate counts `ds-` classes inside `<main>` to decide whether a route "renders from
 *     the design system". **An undefined class counts.** So a route can satisfy the coverage boolean
 *     with markup nothing paints — which makes the epic's headline number a claim rather than a
 *     measurement, on exactly the routes it is measuring.
 *
 * That last one is why this is not a tidiness test.
 */

/** The stylesheets a `ds-` class may legitimately be defined in. */
const STYLESHEETS = [
  'design-system/system.css',
  'design-system/tokens.css',
  'app/globals.css',
  'app/console.css',
]

/** Every `.ts`/`.tsx` under `apps/web`, excluding build output. */
function sourceFiles(root: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(root)) {
    if (entry === 'node_modules' || entry === '.next' || entry === '.auth') continue
    const full = join(root, entry)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (extname(full) === '.tsx' || extname(full) === '.ts') out.push(full)
  }
  return out
}

/** Class names any stylesheet defines a rule for. */
function definedClasses(): Set<string> {
  const defined = new Set<string>()
  for (const relativePath of STYLESHEETS) {
    // Comments first: a `.ds-something` inside a comment defines nothing, and this directory's
    // comments are full of class names being discussed rather than declared.
    const css = readFileSync(join(WEB, relativePath), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ')
    // Selectors only — the text before each `{`. A class named inside a `content:` string is not a
    // definition either.
    for (const rule of css.matchAll(/([^{}]+)\{/g)) {
      for (const name of rule[1].matchAll(/\.(ds-[\w-]+)/g)) defined.add(name[1])
    }
  }
  return defined
}

test('every ds- class the product renders has a rule in a shipped stylesheet', () => {
  const defined = definedClasses()
  // A pin, for the reason `scales.test.ts` carries one: a broken read that returns an empty set
  // would make every assertion below pass while checking nothing.
  assert.ok(defined.size > 100, `only ${defined.size} ds- classes found in the stylesheets`)

  const files = sourceFiles(WEB)
  assert.ok(files.length > 200, `the source walk found only ${files.length} files`)

  const undefinedUses: string[] = []
  for (const file of files) {
    if (file === fileURLToPath(import.meta.url)) continue
    const source = readFileSync(file, 'utf8')
    // Every string literal inside a `className`, which covers the four JSX shapes and the composed
    // forms — the same scan `old-world.test.ts` arrived at after a reviewer found it blind to three
    // of them.
    for (const attribute of source.matchAll(
      /className=(?:("[^"]*"|'[^']*')|\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\})/g
    )) {
      const value = attribute[1] ?? attribute[2] ?? ''
      for (const literal of value.matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)) {
        const text = literal[1] ?? literal[2] ?? literal[3] ?? ''
        // ⚠️ Tokens are split on whitespace AND stripped of the punctuation a template expression
        // leaves behind. `` `ds-public${x ? ' ds-public--hub' : ''}` `` yields the fragment
        // `ds-public--hub'` with a trailing quote, which is a real class with a typo attached — and
        // the first version of this test reported three of those as undefined. A guard that fires on
        // correct work is one this epic has already shipped four times.
        for (const raw of text.split(/\s+/)) {
          const token = raw.replace(/[^\w-]+$/, '')
          // ⚠️ A template hole (`ds-btn--${variant}`) is skipped rather than guessed. Its possible
          // values are a closed union the compiler already checks, and inventing the expansions here
          // would be a second, weaker copy of that check — one that goes stale when the union grows.
          if (!token.startsWith('ds-') || token.includes('$')) continue
          if (!defined.has(token)) undefinedUses.push(`${relative(WEB, file)}: ${token}`)
        }
      }
    }
  }

  assert.deepEqual(
    [...new Set(undefinedUses)].sort(),
    [],
    'a component renders a `ds-` class no stylesheet defines. CSS does not error on this — the ' +
      'element simply renders unstyled, and the VISUAL GATE COUNTS IT as evidence that the route ' +
      'renders from the design system. That makes the coverage number a claim rather than a ' +
      'measurement. Add the rule, or fix the class name.'
  )
})
