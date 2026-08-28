// flags-console-parity · Sprint 3, Story 3.3 — one vocabulary, pinned across every surface.
//
// ── Why a spec and not a convention ───────────────────────────────────────────────────────────
// D7's precedent is `lib/positioning.ts`, and the half of that pattern that actually works is not
// the module — it is `e2e/positioning-surfaces.spec.ts`, which asserts the string renders
// identically everywhere that claims it. A vocabulary module with no such spec is a convention, and
// conventions drift: the sixth surface retypes the word and nobody notices for a month.
//
// So this file greps the console's SOURCE for the storage words the epic exists to retire, and
// fails when one reappears. It reads files rather than importing them because the terms live in
// JSX text, which no import can reach.
//
// ── What it deliberately does NOT do ──────────────────────────────────────────────────────────
// It does not sweep `flag-manager.tsx`. That component is the legacy surface D6 keeps byte-for-byte
// identical while the gate is dark — it still says "Create an immutable definition version" and
// "Mint a scoped snapshot key", and it MUST, because changing it would break the dark-launch
// guarantee to fix wording on a screen being retired. Its exclusion is the point, not an oversight,
// and it is asserted below so nobody "tidies" the list.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

/**
 * The surfaces this epic BUILT. Every one is reachable only when `FLAG_CONSOLE_ENABLED` is on, so
 * every one is bound by D7.
 */
const CONSOLE_SURFACES = [
  '../app/app/flags/[projectSlug]/flag-console.tsx',
  '../app/app/flags/[projectSlug]/environment-picker.tsx',
  '../app/app/flags/[projectSlug]/page.tsx',
  '../app/app/flags/[projectSlug]/flag-vocabulary.ts',
  '../app/app/flags/[projectSlug]/flag-preview.tsx',
  '../app/app/flags/[projectSlug]/flag-insight.tsx',
  '../app/app/flags/[projectSlug]/rule-builder.tsx',
  '../app/app/flags/[projectSlug]/actions.ts',
  '../app/app/flags/[projectSlug]/[flagKey]/page.tsx',
  '../app/app/flags/[projectSlug]/[flagKey]/flag-switch.tsx',
  '../app/app/flags/[projectSlug]/[flagKey]/flag-version-serve.tsx',
  '../app/app/flags/[projectSlug]/[flagKey]/flag-authoring.tsx',
  '../app/app/flag-credentials/[projectSlug]/page.tsx',
  '../app/app/flag-credentials/[projectSlug]/flag-credential-manager.tsx',
  '../app/app/flag-audit/[projectSlug]/page.tsx',
  '../app/app/flag-audit/[projectSlug]/flag-audit-table.tsx',
  './flag-console-copy.ts',
] as const

/**
 * The words the audit named: they describe storage, not work.
 *
 * Matched against RENDERED text only — comments are stripped first. That distinction is essential
 * rather than convenient: these files EXPLAIN the retirement at length, and a naive grep would flag
 * the explanation as the offence and make the spec unpassable except by deleting the reasoning.
 */
const RETIRED = [
  'immutable definition version',
  'snapshot revision',
  'scoped snapshot key',
  'Deactivate',
  'Activate v',
  // Added after cross-review (Vibe, PR #121) found "Creating a version" in an empty state this
  // epic wrote. The list was phrases the AUDIT named, so it caught the nouns and missed the verb
  // family around them — a sweep is only as good as its list, and the honest fix when something
  // slips through is to widen the list rather than to fix the one instance.
  'Creating a version',
  'Create a version',
  // Story 3.3 names FOUR terms: "immutable definition version, mint, snapshot revision and
  // activation". The list carried a paraphrase of one ('scoped snapshot key' for `mint`) and
  // omitted `activation` entirely — drawn, in effect, around the offences it would have flagged
  // (fresh reviewer, PR #121). Both are now swept as the story wrote them.
  //
  // `mint` is deliberately matched as ' mint' / 'Mint ' rather than bare: it is a substring of
  // ordinary words, and the goal is the VERB in rendered copy. The credentials surface is exempted
  // below for the reason 3.1 pins — its revoke sentences are required verbatim and one contains
  // "mint a replacement", so retiring the word there would break a criterion this epic also holds.
  'activation',
  'Activation',
] as const

/**
 * `mint` survives on ONE surface, and only because two acceptance criteria collide there.
 *
 * Story 3.3 retires the word; Story 3.1 requires the revoke consequence sentences VERBATIM, and the
 * snapshot-key sentence ends "mint a replacement first if this key is in production." One of the two
 * has to give on that surface, and it is 3.3: the sentence is cross-review-hardened copy that tells
 * an operator how not to break production, and rewording it to satisfy a vocabulary sweep would
 * trade a real safety property for a stylistic one.
 *
 * Written down as an exemption with its reason rather than resolved by omitting `mint` from the
 * list — which is what hid it before.
 */
const MINT_EXEMPT = [
  '../app/app/flag-credentials/[projectSlug]/flag-credential-manager.tsx',
  './flag-console-copy.ts',
]

/**
 * Rendered text only: line comments out, block comments out, whitespace normalised.
 *
 * ── Why the whitespace normalisation is load-bearing (fresh reviewer, PR #121) ────────────────
 * Without it the sweep was defeated by a LINE BREAK, which is how new copy actually arrives:
 * Prettier wraps JSX text at print width, so a retired phrase that happened to straddle a wrap was
 * invisible to `includes()` while rendering identically in the browser. A guard that catches a term
 * in a heading but not in a paragraph is worse than none, because the green suite is the reason
 * nobody looks.
 *
 * ── Line comments are stripped BEFORE block comments ─────────────────────────────────────────
 * The original did the reverse, so a `//` comment containing `/*` swallowed source up to the next
 * `*\/` — every false PASS, never a false failure, which is the direction that hides things.
 */
function renderedTextOnly(source: string): string {
  return (
    source
      .split('\n')
      .map((line) => line.replace(/^\s*\/\/.*$/, ''))
      .join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      // ── Identifiers are not rendered copy ────────────────────────────────────────────────────
      // `FlagActivationState`, `setFlagActivation`, `flag.activations` and `describeActivationSurprise`
      // all contain a retired WORD without ever reaching a screen. Sweeping them would force renaming
      // a type to satisfy a copy rule, so the first version of this hardening reported five failures
      // of which only two were real. Import lines go entirely; elsewhere a dotted access, a camelCase
      // identifier and a PascalCase type are removed, which leaves prose and JSX text.
      .split('\n')
      .filter((line) => !/^\s*import\b/.test(line) && !/^\s*}\s*from\s/.test(line))
      .join(' ')
      .replace(/\.\w+/g, ' ')
      // An object-literal KEY is an identifier too — `{ ...flag, activations: [] }` is code, not copy.
      .replace(/\b\w+\s*:/g, ' ')
      .replace(/\b[a-z]+[A-Z]\w*/g, ' ')
      .replace(/\b[A-Z][a-z]+[A-Z]\w*/g, ' ')
      .replace(/\s+/g, ' ')
  )
}

for (const surface of CONSOLE_SURFACES) {
  test(`${surface.split('/').pop()} renders no retired storage vocabulary`, () => {
    const text = renderedTextOnly(read(surface))
    if (!MINT_EXEMPT.includes(surface)) {
      for (const term of [' mint ', 'Mint ', ' minting ']) {
        assert.ok(
          !text.includes(term),
          `${surface} renders "${term.trim()}" — Story 3.3 retires it (the credentials surface is the one exemption, and it is listed)`
        )
      }
    }
    for (const term of RETIRED) {
      assert.ok(
        !text.includes(term),
        `${surface} still renders "${term}" — that is the vocabulary this epic replaces (D7)`
      )
    }
  })
}

test('the vocabulary module is the single owner of the state words', () => {
  // Every surface that names a state must import it, not retype it. The check is that the literal
  // strings appear in exactly ONE file — which is what stops the sixth surface drifting.
  // EVERY label the module owns, not a sample. A partial list is how "Kill switch" came to be
  // retyped in the type filter while this test was green (fresh reviewer N2), and the same argument
  // applies to the labels that were still unlisted afterwards (cross-review, Vibe, PR #121).
  const OWNED_LABELS = [
    // state
    'Never turned on here',
    'Turned off',
    // type
    'Kill switch',
    'Enablement',
    'Unclassified',
    // criticality
    'High',
    'Medium',
    'Low',
  ]
  const owner = read('../app/app/flags/[projectSlug]/flag-vocabulary.ts')
  for (const label of OWNED_LABELS) {
    assert.ok(owner.includes(label), `flag-vocabulary.ts should own "${label}"`)
  }
  // Absence is asserted for EVERY owned label, not just the first. The earlier version checked only
  // 'Never turned on here', so a surface retyping 'Turned off' or 'Kill switch' passed — the exact
  // drift this test exists to stop, one label over (fresh reviewer, PR #121, N2).
  const others = CONSOLE_SURFACES.filter((path) => !path.endsWith('flag-vocabulary.ts'))
  for (const surface of others) {
    const text = renderedTextOnly(read(surface))
    // Absence is asserted only for the MULTI-WORD labels. 'High', 'Medium', 'Low' and 'Enablement'
    // are ordinary English that legitimately appears in prose and in comments-turned-text, so
    // sweeping them for absence would fire on sentences rather than on retyped labels — a guard
    // that cries wolf gets suppressed, which is worse than one with a stated limit. Their OWNERSHIP
    // is still asserted above; what is pinned here is that no surface re-declares a distinctive
    // label of its own.
    for (const label of ['Never turned on here', 'Kill switch', 'Turned off']) {
      assert.ok(
        !text.includes(label),
        `${surface} retypes the label "${label}" instead of importing it from flag-vocabulary.ts`
      )
    }
  }
})

test('the LEGACY surface is deliberately excluded, and stays excluded', () => {
  // `flag-manager.tsx` is exempt because D6 keeps it byte-for-byte identical while the gate is dark.
  // Asserted so the exclusion reads as a decision rather than as a gap somebody should close: if a
  // future reader adds it to CONSOLE_SURFACES, this test explains why the suite then goes red.
  const legacy = read('../app/app/flags/[projectSlug]/flag-manager.tsx')
  assert.ok(
    legacy.includes('Create an immutable definition version'),
    'the legacy surface should still carry its original wording — D6 requires it'
  )
  assert.ok(
    !CONSOLE_SURFACES.some((path) => path.includes('flag-manager')),
    'flag-manager.tsx must NOT be swept: D6 pins its wording until the surface is removed'
  )
})

test('every file rendering under the console is swept — the list cannot silently fall behind', () => {
  // N5 in spirit (fresh reviewer, PR #121): CONSOLE_SURFACES was hand-maintained, and a file added
  // to a console directory but not to the list is invisible to every test above — which is exactly
  // how flag-preview.tsx kept rendering "the version activated in {env}" while the suite was green.
  // Derived from the DIRECTORY, the way project-route-inventory.test.ts derives its route list.
  // ⚠️ `app/app/flags/[projectSlug]/` — the console's LANDING page — was missing from this list,
  // so the sweep's own promise ("the list cannot silently fall behind") was false for the directory
  // holding `flag-console.tsx`, `environment-picker.tsx` and the page's h1 and subtitle. The
  // console-ia-overhaul redesign rewrote every user-facing word in that directory while this test
  // stayed green (fresh reviewer, PR #124). Adding it caught a retyped label immediately.
  const directories = [
    '../app/app/flags/[projectSlug]/',
    '../app/app/flags/[projectSlug]/[flagKey]/',
    '../app/app/flag-credentials/[projectSlug]/',
    '../app/app/flag-audit/[projectSlug]/',
  ]
  const onDisk = directories.flatMap((directory) =>
    readdirSync(fileURLToPath(new URL(directory, import.meta.url)))
      .filter((name) => name.endsWith('.tsx') || name.endsWith('.ts'))
      .map((name) => `${directory}${name}`)
  )
  // The ONE deliberate exemption, named here rather than left as an unexplained gap: D6 keeps the
  // legacy surface byte-for-byte identical while the gate is dark, so it must NOT adopt the console
  // vocabulary. The test below this one asserts that exclusion holds from the other direction.
  const EXEMPT = ['flag-manager.tsx']
  for (const file of onDisk) {
    if (EXEMPT.some((name) => file.endsWith(name))) continue
    assert.ok(
      CONSOLE_SURFACES.includes(file as (typeof CONSOLE_SURFACES)[number]),
      `${file} renders under the console but is not in CONSOLE_SURFACES — add it, or the vocabulary sweep does not see it`
    )
  }
})
