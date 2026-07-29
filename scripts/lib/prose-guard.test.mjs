// prose-guard — the mechanical check that stands between a machine draft and a human reader.
//
// Both directions matter and they fail in opposite ways:
//   too LOOSE  → the measured hallucinations (invented beneficiary, unsupported fix claim) sail
//                through, which is the whole reason this file exists;
//   too STRICT → a legitimate report about a real fix for real customers gets rejected, the retry
//                produces something worse, and whoever maintains this learns to bypass the guard.
//
// So every "must flag" case below is paired with a "must NOT flag" case.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkProse, findingsToRevisionNote, countWords, countSentences } from './prose-guard.mjs';

const codes = (r) => r.findings.map((f) => f.code);

// A clean internal report: names the real beneficiary, claims no fix, no tool names.
const CLEAN_INTERNAL =
  'Whoever ships next gets faster feedback. A whole class of mistake is now caught in seconds ' +
  'rather than after a deploy, and the checks run on every change without anyone remembering to.';

test('a clean internal report passes', () => {
  const r = checkProse(CLEAN_INTERNAL, { allowsFixClaim: false, allowsBeneficiary: false });
  assert.equal(r.ok, true, `unexpected findings: ${JSON.stringify(r.findings)}`);
});

// ── The two measured hallucinations ─────────────────────────────────────────────────────────

test('MEASURED FAILURE 1: an invented beneficiary is flagged on an internal change', () => {
  // Verbatim shape of the real run: internal test tooling described as benefiting tenants.
  const draft = 'Tenants now benefit from a faster test suite that validates core functions in milliseconds.';
  const r = checkProse(draft, { allowsBeneficiary: false });
  assert.ok(codes(r).includes('invented-beneficiary'));
  assert.equal(r.ok, false);
});

test('…but a REAL customer-facing change may name customers', () => {
  const draft = 'Customers can now push their roadmap and see it rendered as a live page.';
  const r = checkProse(draft, { allowsBeneficiary: true });
  assert.ok(!codes(r).includes('invented-beneficiary'));
});

test('an explicit no-impact disclosure is allowed for internal work', () => {
  const draft =
    'The roadmap now records the agreed operating boundary. There was no customer-visible effect.';
  const r = checkProse(draft, { allowsBeneficiary: false });
  assert.ok(!codes(r).includes('invented-beneficiary'), JSON.stringify(r.findings));
});

test('a no-impact sentence does not launder a separate positive beneficiary claim', () => {
  const draft =
    'There was no customer-visible effect. Users now benefit from faster and safer publishing.';
  const r = checkProse(draft, { allowsBeneficiary: false });
  assert.ok(codes(r).includes('invented-beneficiary'));
});

test('MEASURED FAILURE 2: an unsupported fix claim is flagged', () => {
  // Verbatim shape of the real run: a commit that only ADDED TESTS claiming it closed the bug.
  const draft =
    'The previous backslash bypass is blocked, eliminating a potential open-redirect attack for everyone.';
  const r = checkProse(draft, { allowsFixClaim: false, allowsBeneficiary: true });
  assert.ok(codes(r).includes('unsupported-fix-claim'));
});

test('…but a genuine fix may be reported as a fix', () => {
  const draft = 'A sign-in that failed for some people is fixed; they can reach their account again.';
  const r = checkProse(draft, { allowsFixClaim: true, allowsBeneficiary: true });
  assert.ok(!codes(r).includes('unsupported-fix-claim'), JSON.stringify(r.findings));
});

test('every fix-claim phrasing is caught, not just the word "fixed"', () => {
  for (const draft of [
    'This resolves the crash people were hitting.',
    'The leak is now closed.',
    'Sign-in no longer breaks on a slow connection.',
    'The vulnerability was removed.',
    'The flow is now secure.',
    'This prevents the duplicate charge.',
  ]) {
    const r = checkProse(draft, { allowsFixClaim: false, allowsBeneficiary: true, minWords: 1 });
    assert.ok(codes(r).includes('unsupported-fix-claim'), `missed a fix claim: ${draft}`);
  }
});

// ── Register and length ─────────────────────────────────────────────────────────────────────

test('marketing vocabulary is flagged', () => {
  const r = checkProse('This seamlessly leverages a robust pipeline to empower the whole org.', {
    allowsBeneficiary: true,
  });
  assert.ok(codes(r).includes('marketing-language'));
});

test('tool, framework and model names are flagged', () => {
  const r = checkProse('The Playwright suite now runs against Supabase, drafted by Gemini.', {
    allowsBeneficiary: true,
  });
  assert.ok(codes(r).includes('names-implementation'));
});

test('ordinary words that merely LOOK like tool names are not flagged', () => {
  // The guard must not fire on "next" the adverb or "react" the verb — a false positive here
  // rejects a perfectly good sentence and teaches people to distrust the check.
  const r = checkProse(
    'Whoever ships next sees the change immediately, and the page does not react to a stale value.',
    { allowsBeneficiary: false }
  );
  assert.ok(!codes(r).includes('names-implementation'), JSON.stringify(r.findings));
});

test('an unfinished last sentence is flagged', () => {
  const r = checkProse('The checks now run on every change and future work adds', {
    allowsBeneficiary: false,
  });
  assert.ok(codes(r).includes('unfinished'));
});

test('a complete sentence ending in a quote or bracket is NOT flagged as unfinished', () => {
  const r = checkProse('The empty state now explains itself (and says how to fix it).', {
    allowsBeneficiary: false,
  });
  assert.ok(!codes(r).includes('unfinished'));
});

test('length is bounded in both directions', () => {
  const long = 'word '.repeat(80).trim() + '.';
  assert.ok(codes(checkProse(long, { allowsBeneficiary: false })).includes('too-long'));
  assert.ok(codes(checkProse('Done.', { allowsBeneficiary: false })).includes('too-short'));
});

test('an empty draft is a finding, not a pass', () => {
  for (const empty of ['', '   ', null, undefined]) {
    const r = checkProse(empty, {});
    assert.equal(r.ok, false);
    assert.deepEqual(codes(r), ['empty']);
  }
});

// ── The retry note ──────────────────────────────────────────────────────────────────────────

test('findings become a concrete, numbered revision instruction', () => {
  // A guard that only says "rejected" produces another guess; one that says what is wrong produces
  // a correction. So the note must carry every finding's text.
  const r = checkProse('Tenants are delighted that the bug is fixed.', {
    allowsFixClaim: false,
    allowsBeneficiary: false,
  });
  const note = findingsToRevisionNote(r.findings);
  for (const f of r.findings) assert.ok(note.includes(f.note), `note omitted: ${f.code}`);
  assert.match(note, /^\d+\./m, 'findings must be numbered');
  assert.match(note, /Output only the corrected report/);
});

test('counters are honest about words and sentences', () => {
  assert.equal(countWords('one two three'), 3);
  assert.equal(countWords('  '), 0);
  assert.equal(countSentences('One. Two! Three?'), 3);
  assert.equal(countSentences('no terminator'), 0);
});

// ── MEASURED FAILURE 3: invented commitments (2026-07-25, standup rail's first live run) ─────

test('MEASURED FAILURE 3: a fabricated deadline is flagged, with no way to unlock it', () => {
  // Verbatim from the real draft. Git history contains no deadlines, so this is invented by
  // construction — and it is the most corrosive of the three, because it makes people chase work
  // nobody agreed to and it reads as perfectly ordinary standup language.
  const draft =
    'Nothing is currently blocked, though design sign-off on the Sprint 2 layout is owed before tomorrow.';
  const r = checkProse(draft, { allowsFixClaim: true, allowsBeneficiary: true, minWords: 1 });
  assert.ok(codes(r).includes('invented-commitment'));
  // Unconditional: no evidence flag may legitimately permit a fabricated date.
  const permissive = checkProse(draft, {
    allowsFixClaim: true,
    allowsBeneficiary: true,
    minWords: 1,
    maxWords: 500,
  });
  assert.ok(codes(permissive).includes('invented-commitment'), 'no flag may unlock a fabricated deadline');
});

test('every fabricated-deadline phrasing is caught', () => {
  for (const draft of [
    'The review is due by Friday.',
    'This will ship next week.',
    'Approval is pending and needed by end of week.',
    'The migration is scheduled for tomorrow.',
    'It will be ready by Monday.',
  ]) {
    const r = checkProse(draft, { allowsFixClaim: true, allowsBeneficiary: true, minWords: 1 });
    assert.ok(codes(r).includes('invented-commitment'), `missed a fabricated commitment: ${draft}`);
  }
});

test('an honest owed-item WITHOUT a date is not flagged', () => {
  // The correct way to report an obligation: name it, name who holds it, attach no invented date.
  const draft =
    'Daniel still needs to add a repository secret before the automatic push turns on, and to read the three views himself.';
  const r = checkProse(draft, { allowsFixClaim: false, allowsBeneficiary: false });
  assert.ok(!codes(r).includes('invented-commitment'), JSON.stringify(r.findings));
});
