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
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

/**
 * The surfaces this epic BUILT. Every one is reachable only when `FLAG_CONSOLE_ENABLED` is on, so
 * every one is bound by D7.
 */
const CONSOLE_SURFACES = [
  '../app/app/flags/[projectSlug]/flag-console.tsx',
  '../app/app/flags/[projectSlug]/flag-vocabulary.ts',
  '../app/app/flags/[projectSlug]/[flagKey]/page.tsx',
  '../app/app/flags/[projectSlug]/[flagKey]/flag-switch.tsx',
  '../app/app/flags/[projectSlug]/[flagKey]/flag-version-serve.tsx',
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
] as const

/** Strip `//` line comments and block comments, then JSX `{/* … *\/}` blocks. */
function renderedTextOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/^\s*\/\/.*$/, ''))
    .join('\n')
}

for (const surface of CONSOLE_SURFACES) {
  test(`${surface.split('/').pop()} renders no retired storage vocabulary`, () => {
    const text = renderedTextOnly(read(surface))
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
  const owner = read('../app/app/flags/[projectSlug]/flag-vocabulary.ts')
  for (const label of ['Never turned on here', 'Turned off', 'Kill switch']) {
    assert.ok(owner.includes(label), `flag-vocabulary.ts should own "${label}"`)
  }
  const others = CONSOLE_SURFACES.filter((path) => !path.endsWith('flag-vocabulary.ts'))
  for (const surface of others) {
    const text = renderedTextOnly(read(surface))
    assert.ok(
      !text.includes('Never turned on here'),
      `${surface} retypes a state label instead of importing it from flag-vocabulary.ts`
    )
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
