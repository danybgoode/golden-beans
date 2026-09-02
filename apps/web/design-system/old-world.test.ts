import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, relative } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { selectorLists } from '../../../scripts/check-design-drift.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = join(HERE, '..')

/**
 * design-system-rails · Sprint 6, Story 6.4 — **the old path, proved unreachable.**
 *
 * ── Why "unused" was not the bar ──────────────────────────────────────────────────────────────
 * The story's acceptance is deliberately three clauses: *no route renders it, no selector matches
 * it, and a guard fails if it returns.* The first two are facts about today and rot the moment
 * somebody types a familiar class name from memory; the third is what makes them stay true. A
 * Sweeper whose only evidence is "I looked and it was gone" is a Sweeper that has to be re-run by
 * hand every time anybody touches the shell.
 *
 * ── What "the old world" is, precisely ────────────────────────────────────────────────────────
 * Three families of class name, all deleted by Story 6.4:
 *
 *   `.product-shell*` — the PRE-EPIC signed-in shell. `globals.css` held 27 rules for it and
 *     `console.css` held 16 more whose entire content was undoing them. Two stylesheets painting
 *     one set of markup, one of them purely to cancel the other, is what the epic's Definition of
 *     Done means by *"the redesign is a layer on top of the thing it replaced"*. The console's half
 *     moved to `system.css` as `.ds-shell-*`; the pre-epic half is gone.
 *   `.auth-shell*` — the card `/login` and `/signup` rendered inside. Two routes, one private
 *     stylesheet: the first screens a customer ever saw were the one surface in the product with
 *     their own design. Story 6.2 put them on `Frame`'s `door` variant.
 *   `.auth-form*` — the same two routes' form. Replaced by the design system's `Field` + `Button`,
 *     which is what carries the label/error/`aria-describedby` wiring the old markup did by hand.
 *
 * ── Mutation-verified, in both directions ─────────────────────────────────────────────────────
 * Recorded in the PR body: re-adding a single `.product-shell__tab { color: red }` rule to
 * `globals.css` turns the stylesheet test red; re-adding `className="auth-shell"` to any page turns
 * the markup test red. Neither is hypothetical — both were run before this file was committed. A
 * guard that has never been seen red is not a guard.
 */

const STYLESHEETS = [
  'app/globals.css',
  'app/console.css',
  'app/hub/hub.module.css',
  'design-system/system.css',
]

/**
 * The names that must no longer appear in a selector.
 *
 * ⚠️ Matched as a PREFIX with a boundary, not as a substring: `.product-shell__tab` and
 * `.product-shell` must both fail, and a hypothetical future `.product-shelling` must not be
 * reported as one of them. A substring test would also fire on this file's own name if it ever
 * moved into a stylesheet's comment, which is how a guard gets a reputation for lying.
 */
const RETIRED_CLASSES = ['product-shell', 'auth-shell', 'auth-form']

/**
 * Does `text` contain one of the retired class names, as a WHOLE name?
 *
 * ⚠️ **The boundary is BEM, not "any word characters"** (cross-family review, agy, Should-fix —
 * verified by mutation in both directions). The first version ended the name with `[\w-]*`, which
 * swallows any suffix at all: `.product-shelling` was reported as `.product-shell`, and this file's
 * own comment promised the opposite in as many words. A guard that blocks correct work with a wrong
 * diagnosis is how a guard gets switched off, and a comment claiming a property the regex does not
 * have is the defect class this whole epic is named after — written by me, in the guard against it.
 *
 * A retired name's real children are BEM: `__element` and `--modifier`. Those must fail, because
 * they were deleted with their parent. Anything else that merely STARTS the same way is a different
 * name and must not.
 */
function retiredNameIn(text: string): string | null {
  for (const name of RETIRED_CLASSES) {
    if (new RegExp(`\\.${name}(?:__[\\w-]+|--[\\w-]+)?(?![\\w-])`).test(text)) return name
  }
  return null
}

test('no stylesheet declares a rule for the design this epic replaced', () => {
  const offenders: string[] = []
  for (const relative of STYLESHEETS) {
    const source = readFileSync(join(WEB, relative), 'utf8')
    // ⚠️ SELECTORS only, via the drift guard's own parser. A stylesheet may still EXPLAIN what it
    // deleted — `console.css`'s header records that its rules were "translated into
    // `.product-shell__*`", and that sentence is history worth keeping. A guard that fires on an
    // honest description of the thing it forbids is the defect `setup-route-guards.test.ts` records
    // twice; the distinction between code and writing about code is the whole point.
    for (const list of selectorLists(source)) {
      const hit = retiredNameIn(list.text)
      if (hit !== null) offenders.push(`${relative}: ${list.text.trim().slice(0, 80)}`)
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'a stylesheet still paints the design this epic replaced — Story 6.4 deleted these rules, and ' +
      'a rule that comes back silently makes the redesign a layer on top of it again'
  )
})

test('the 48px page heading Do-not #1 names is gone from every stylesheet', () => {
  // `CONSOLE-CONTRACT.md`'s Do-not #1, by its NUMBERS rather than by its selector — because the
  // selector is what changed. `globals.css` set `.product-shell main > h1 { font-size: clamp(30px,
  // 7vw, 48px) }`, and on a real tenant a feature key wrapped to four lines and spent ~200px before
  // any content. The consequence is what matters, so the guard is keyed on the value that produced
  // it: nothing in the product may size a heading from that clamp again, under any selector.
  for (const relative of STYLESHEETS) {
    const source = readFileSync(join(WEB, relative), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ')
    assert.doesNotMatch(
      source,
      /clamp\(\s*30px\s*,\s*7vw\s*,\s*48px\s*\)/,
      `${relative} still carries Do-not #1's 48px page heading`
    )
  }
})

/** Every `.ts`/`.tsx` under `apps/web`, excluding build output and node_modules. */
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

test('no component renders the markup that design is attached to', () => {
  const files = sourceFiles(WEB)
  // A "found some files" pin, for the same reason `scales.test.ts` carries one: a broken walk that
  // returns nothing passes every assertion below while checking exactly nothing.
  assert.ok(files.length > 200, `the source walk found only ${files.length} files — it asserted nothing`)

  const offenders: string[] = []
  for (const file of files) {
    if (file === fileURLToPath(import.meta.url)) continue
    const source = readFileSync(file, 'utf8')
    // ⚠️ **EVERY string literal in a `className`, not just the two shapes I happened to write**
    // (cross-family review, agy, **Blocking** — verified by mutation: `className={'auth-shell'}`
    // left this test GREEN).
    //
    // The first version matched `className="…"` and ``className={`…`}`` only, so the two other
    // shapes JSX allows — `className={'x'}` and `className={"x"}` — walked straight past a guard
    // whose entire job is to prove the old path unreachable. Prettier happens to rewrite those to
    // the bare-attribute form in this repo, which is a CONVENTION; a guard that holds only while a
    // formatter is run is a guard that reports success for the wrong reason.
    //
    // So: capture the whole `className=` value (a quoted string, or a braced expression up to its
    // matching brace), then look for a retired name inside ANY quoted string within it. That also
    // covers the composed forms — `classes('ds-btn', 'auth-form')`, a ternary, a template with
    // interpolations — which the previous version could not see at all.
    for (const match of source.matchAll(
      /className=(?:("[^"]*"|'[^']*')|\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\})/g
    )) {
      const value = match[1] ?? match[2] ?? ''
      for (const literal of value.matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)) {
        const text = literal[1] ?? literal[2] ?? literal[3] ?? ''
        for (const name of RETIRED_CLASSES) {
          // Whole class TOKEN inside the attribute — space-delimited, with the same BEM boundary
          // `retiredNameIn` uses on selectors. `${name}-ish` is a different class and must pass.
          if (new RegExp(`(?:^|\\s)${name}(?:__[\\w-]+|--[\\w-]+)?(?=\\s|$)`).test(text)) {
            offenders.push(`${relative(WEB, file)}: ${text.slice(0, 60)}`)
          }
        }
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'a component still renders a class from the design this epic replaced. Nothing paints it any ' +
      'more, so the element would be unstyled — which is worse than the old design, not better'
  )
})
