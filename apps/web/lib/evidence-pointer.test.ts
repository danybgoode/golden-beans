// Unit layer for evidence-pointer classification.
//
// The property worth pinning here is NOT "it recognises a SHA". It is that a resolution WITHOUT
// checkable evidence is never reported as evidenced — Amendment 4.2, which is pod-report's honesty
// rule one layer in. Story 3.3 feeds this distinction into the AI-adoption ladder, so a
// misclassification does not stay local: it becomes an inflated maturity claim on the landing page.
//
// This module is import-free precisely so these can be asserted directly. The write tools sit behind
// two credentials and two flags, so an HTTP-level spec cannot cheaply reach every branch — and
// multi-tenant-activation S1 shipped four specs that passed identically against a deliberately
// re-broken build for exactly that reason.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyEvidencePointer,
  describeEvidence,
  MAX_EVIDENCE_POINTER_LENGTH,
} from './evidence-pointer.ts'

// ── The distinction the whole module exists for ────────────────────────────────────────────────

test('a commit SHA is EVIDENCE', () => {
  const c = classifyEvidencePointer('3b76d488d81252e8061a91bab53471aa3b12e2f7')
  assert.equal(c.kind, 'commit')
  assert.equal(c.resolvable, true)
})

test('a short (7-char) SHA is evidence — git’s own conventional form', () => {
  assert.equal(classifyEvidencePointer('3b76d48').kind, 'commit')
  assert.equal(classifyEvidencePointer('3b76d48').resolvable, true)
})

test('a URL is EVIDENCE', () => {
  const c = classifyEvidencePointer('https://github.com/acme/repo/pull/37')
  assert.equal(c.kind, 'url')
  assert.equal(c.resolvable, true)
})

test('free text is a NOTE and is explicitly NOT evidence', () => {
  // The case that matters. An agent resolving fifty tasks with "done" has produced fifty
  // unfalsifiable assertions, and the system must be able to say so.
  for (const note of ['done', 'fixed it', 'no longer reproducible after the refactor', 'see slack']) {
    const c = classifyEvidencePointer(note)
    assert.equal(c.kind, 'note', `expected a note for ${JSON.stringify(note)}`)
    assert.equal(c.resolvable, false)
    // ...and the note is still STORED. Refusing it would push an agent toward fabricating a
    // plausible-looking SHA to satisfy the API, which is strictly worse.
    assert.equal(c.value, note)
  }
})

test('nothing supplied is `none`, not an empty note', () => {
  for (const empty of [undefined, null, '', '   ', '\n\t ']) {
    const c = classifyEvidencePointer(empty)
    assert.equal(c.kind, 'none', `expected none for ${JSON.stringify(empty)}`)
    assert.equal(c.value, null)
    assert.equal(c.resolvable, false)
  }
})

test('a non-string is `none` rather than a crash — this is public tool input', () => {
  for (const junk of [42, {}, [], true, Symbol('x')]) {
    assert.equal(classifyEvidencePointer(junk).kind, 'none')
  }
})

// ── Near-misses: the cases that decide whether "resolvable" means anything ─────────────────────

test('a SHA embedded in a sentence is a NOTE, not a commit — the pattern is anchored', () => {
  // Unanchored matching here would let "probably deadbeef, not sure" count as evidence.
  const c = classifyEvidencePointer('probably deadbeef but I did not check')
  assert.equal(c.kind, 'note')
  assert.equal(c.resolvable, false)
})

test('a hex string that is too short or too long is a NOTE', () => {
  assert.equal(classifyEvidencePointer('abc123').kind, 'note') // 6 — below git's short form
  // 64 chars: a SHA-256 object id. Classified as a note deliberately — a considered under-claim
  // beats widening the pattern to admit hashes this repo cannot resolve.
  assert.equal(classifyEvidencePointer('a'.repeat(64)).kind, 'note')
})

test('a non-hex word of SHA-ish length is a NOTE', () => {
  assert.equal(classifyEvidencePointer('resolved').kind, 'note')
  assert.equal(classifyEvidencePointer('wontfix!').kind, 'note')
})

test('a non-http scheme is NEVER a url — javascript:/data:/file: are not evidence', () => {
  // A pointer plausibly becomes an href in the dashboard drawer. Refusing these here means no
  // downstream renderer has to remember to.
  for (const hostile of [
    'javascript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'file:///etc/passwd',
    'ftp://example.com/x',
  ]) {
    const c = classifyEvidencePointer(hostile)
    assert.equal(c.kind, 'note', `expected a note for ${hostile}`)
    assert.equal(c.resolvable, false)
  }
})

test('a malformed URL-ish string is a note, not a crash', () => {
  assert.equal(classifyEvidencePointer('https://').kind, 'note')
  assert.equal(classifyEvidencePointer('http://').kind, 'note')
  assert.equal(classifyEvidencePointer('://nope').kind, 'note')
})

// ── Bounds ─────────────────────────────────────────────────────────────────────────────────────

test('a pointer is truncated to the stored bound, and truncation cannot manufacture evidence', () => {
  const long = 'x'.repeat(MAX_EVIDENCE_POINTER_LENGTH + 500)
  const c = classifyEvidencePointer(long)
  assert.equal(c.value?.length, MAX_EVIDENCE_POINTER_LENGTH)
  assert.equal(c.kind, 'note')

  // The sharper case: a long hex run must not become a "commit" by being cut down to 40 chars.
  // Classification happens on the already-truncated value, so this pins that ordering.
  const longHex = 'a'.repeat(MAX_EVIDENCE_POINTER_LENGTH + 500)
  assert.equal(classifyEvidencePointer(longHex).kind, 'note')
})

test('surrounding whitespace is trimmed before classifying', () => {
  assert.equal(classifyEvidencePointer('  3b76d48  ').kind, 'commit')
  assert.equal(classifyEvidencePointer('\n https://example.com/pr/1 \t').kind, 'url')
})

// ── The sentence a caller actually reads ───────────────────────────────────────────────────────

test('describeEvidence SAYS "without evidence" in words, for both unevidenced kinds', () => {
  // A caller reading `resolvable: false` is being handed a field to ignore; one reading "recorded
  // WITHOUT evidence" is being told something.
  assert.match(describeEvidence(classifyEvidencePointer('done')), /WITHOUT evidence/)
  assert.match(describeEvidence(classifyEvidencePointer('')), /WITHOUT evidence/)
})

test('describeEvidence does NOT say "without evidence" when there is evidence', () => {
  // The other direction. Without this, a function that returned the same warning string for
  // everything would pass the test above.
  assert.doesNotMatch(describeEvidence(classifyEvidencePointer('3b76d48')), /WITHOUT/)
  assert.doesNotMatch(describeEvidence(classifyEvidencePointer('https://example.com/x')), /WITHOUT/)
})

test('every kind has a distinct, non-empty description', () => {
  const seen = new Set(
    ['3b76d48', 'https://example.com/x', 'done', ''].map((p) =>
      describeEvidence(classifyEvidencePointer(p))
    )
  )
  assert.equal(seen.size, 4)
  for (const s of seen) assert.ok(s.length > 0)
})
