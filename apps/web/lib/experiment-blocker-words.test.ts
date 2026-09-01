import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BLOCKER_WORDS, blockerWords, type ExperimentBlocker } from './experiment-blocker-words.ts'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * Every blocker code `experiment-analysis.ts` can emit, read out of the SOURCE.
 *
 * ⚠️ Parsed rather than re-typed. A hand-copied list here would be a second definition of the union
 * — and it would go stale in exactly the direction that matters: a code added to the analysis and
 * not to this list would leave the totality check passing over a set that no longer describes the
 * code. The type system already makes `BLOCKER_WORDS` total; this is what makes the TEST's idea of
 * "every code" total too.
 */
function blockerCodesInSource(): string[] {
  const source = readFileSync(join(HERE, 'experiment-analysis.ts'), 'utf8')
  const integrity = /export type ExperimentIntegrityDiagnostic =([\s\S]*?)\n\n/.exec(source)?.[1] ?? ''
  const blockers = /blockers: Array<\s*([\s\S]*?)>\n/.exec(source)?.[1] ?? ''
  const codes = new Set<string>()
  for (const block of [integrity, blockers]) {
    for (const match of block.matchAll(/'([a-z_]+)'/g)) codes.add(match[1])
  }
  return [...codes].sort()
}

test('every blocker the analysis can emit has plain words — read from the source, not retyped', () => {
  const codes = blockerCodesInSource()
  // A parser that finds nothing turns this into a vacuous pass, which is the guard-that-cannot-fail
  // shape one layer down.
  assert.ok(codes.length >= 10, `only found ${codes.length} blocker codes in experiment-analysis.ts`)
  assert.deepEqual(
    Object.keys(BLOCKER_WORDS).sort(),
    codes,
    'BLOCKER_WORDS and the analysis disagree about which blockers exist'
  )
})

test('no sentence leaks the storage model at a reader — sprint contract #9', () => {
  // The literal defect: the shipped page rendered `blockers.join(', ')`, so a person read
  // `srm_not_evaluable, duplicate_exposure`. No entry may contain its own code, an underscore, or
  // the initialism that means nothing outside a statistics text.
  for (const [code, words] of Object.entries(BLOCKER_WORDS)) {
    const text = `${words.what} ${words.why}`
    assert.ok(!text.includes(code), `${code}'s words contain the code itself`)
    assert.ok(!/[a-z]_[a-z]/.test(text), `${code}'s words contain a snake_case identifier`)
    assert.ok(!/\bSRM\b/i.test(text), `${code}'s words say "SRM", which is the storage model's name for it`)
  }
})

test('the one the sprint names by hand reads exactly as the contract asks', () => {
  assert.equal(blockerWords('srm_not_evaluable').what, 'The split cannot be checked yet.')
})

test('every blocker says what is in the way AND what would clear it', () => {
  // A blocker a reader cannot act on is a blocker they will ask about. Both halves, on all of them.
  for (const [code, words] of Object.entries(BLOCKER_WORDS)) {
    assert.ok(words.what.length > 20, `${code} has no readable "what"`)
    assert.ok(words.why.length > 60, `${code} has no explanation of what would clear it`)
    assert.ok(words.what.endsWith('.'), `${code}'s "what" is not a sentence`)
  }
})

test('the lookup is total, with no fallback to fall through to', () => {
  // A fallback is how the raw enums reached a page the first time. The parameter is the closed
  // union, so this cannot be called with anything else — asserted over the real set for the reader.
  for (const code of Object.keys(BLOCKER_WORDS) as ExperimentBlocker[]) {
    assert.ok(blockerWords(code).what, `${code} resolved to nothing`)
  }
})
