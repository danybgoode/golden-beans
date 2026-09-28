// session-journal.test.mjs — pure-logic coverage for the journal line builder/parser (no I/O — see
// scripts/session-note.test.mjs and scripts/session-resume.test.mjs for the wiring that uses this).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VALID_KINDS,
  isValidKind,
  defaultSessionLabel,
  parseRefs,
  buildJournalEntry,
  serializeEntry,
  parseJournal,
  lastNEntries,
  formatEntry,
} from './session-journal.mjs';

// ---- isValidKind / VALID_KINDS ----

test('VALID_KINDS is exactly the D2 kind vocabulary', () => {
  assert.deepEqual(VALID_KINDS, ['decision', 'doing', 'next', 'blocked', 'declined']);
});

test('isValidKind rejects a kind outside the vocabulary (no "done"/status kind — D2)', () => {
  assert.equal(isValidKind('decision'), true);
  assert.equal(isValidKind('done'), false);
  assert.equal(isValidKind('status'), false);
});

// ---- defaultSessionLabel ----

test('defaultSessionLabel is a stable per-day (UTC) label', () => {
  assert.equal(defaultSessionLabel(new Date('2026-07-26T23:59:00Z')), '2026-07-26');
  assert.equal(defaultSessionLabel(new Date('2026-07-26T00:00:01Z')), '2026-07-26');
});

// ---- parseRefs ----

test('parseRefs splits a comma-separated string and trims each ref', () => {
  assert.deepEqual(parseRefs('PR#312, D4 ,  '), ['PR#312', 'D4']);
});

test('parseRefs passes an array through trimmed', () => {
  assert.deepEqual(parseRefs([' PR#1 ', 'D2']), ['PR#1', 'D2']);
});

test('parseRefs: undefined/empty → []', () => {
  assert.deepEqual(parseRefs(undefined), []);
  assert.deepEqual(parseRefs(''), []);
});

// ---- buildJournalEntry (the pure line-builder — D1's unit under test) ----

test('buildJournalEntry: a valid decision entry gets ts/session defaulted and refs parsed', () => {
  const entry = buildJournalEntry({
    kind: 'decision',
    text: '  D6: resume checks apps/web only for migrations  ',
    refs: 'PR#312,D5',
    now: new Date('2026-07-26T12:00:00Z'),
  });
  assert.deepEqual(entry, {
    ts: '2026-07-26T12:00:00.000Z',
    session: '2026-07-26',
    kind: 'decision',
    text: 'D6: resume checks apps/web only for migrations',
    refs: ['PR#312', 'D5'],
  });
});

test('buildJournalEntry: an explicit session label overrides the per-day default', () => {
  const entry = buildJournalEntry({ kind: 'next', text: 'wire S1.3', session: 'sprint1-build' });
  assert.equal(entry.session, 'sprint1-build');
});

test('buildJournalEntry: no refs → []', () => {
  const entry = buildJournalEntry({ kind: 'doing', text: 'building session-resume.mjs' });
  assert.deepEqual(entry.refs, []);
});

test('buildJournalEntry: an invalid kind throws (a usage error, not a soft-fail)', () => {
  assert.throws(() => buildJournalEntry({ kind: 'done', text: 'x' }), /invalid --kind/);
});

test('buildJournalEntry: empty/whitespace-only text throws', () => {
  assert.throws(() => buildJournalEntry({ kind: 'decision', text: '   ' }), /must not be empty/);
  assert.throws(() => buildJournalEntry({ kind: 'decision', text: undefined }), /must not be empty/);
});

// ---- serializeEntry / parseJournal round-trip ----

test('serializeEntry + parseJournal round-trips a single entry', () => {
  const entry = buildJournalEntry({ kind: 'blocked', text: 'waiting on the product owner', now: new Date('2026-07-26T00:00:00Z') });
  const content = serializeEntry(entry);
  assert.equal(content.endsWith('\n'), true);
  assert.deepEqual(parseJournal(content), [entry]);
});

test('parseJournal: multiple appended lines parse in file order', () => {
  const a = buildJournalEntry({ kind: 'decision', text: 'a', now: new Date('2026-07-26T00:00:00Z') });
  const b = buildJournalEntry({ kind: 'next', text: 'b', now: new Date('2026-07-26T01:00:00Z') });
  const content = serializeEntry(a) + serializeEntry(b);
  assert.deepEqual(parseJournal(content), [a, b]);
});

test('parseJournal: null/empty content → [] (the "no journal yet" case)', () => {
  assert.deepEqual(parseJournal(null), []);
  assert.deepEqual(parseJournal(''), []);
});

test('parseJournal: a corrupt line is dropped, the rest of the journal still reads', () => {
  const a = buildJournalEntry({ kind: 'decision', text: 'a', now: new Date('2026-07-26T00:00:00Z') });
  const content = serializeEntry(a) + 'not-json-garbage\n' + serializeEntry(a);
  assert.deepEqual(parseJournal(content), [a, a]);
});

// ---- lastNEntries ----

test('lastNEntries: returns the tail, still oldest→newest', () => {
  const entries = [{ text: '1' }, { text: '2' }, { text: '3' }, { text: '4' }];
  assert.deepEqual(lastNEntries(entries, 2), [{ text: '3' }, { text: '4' }]);
});

test('lastNEntries: n larger than the list returns the whole list', () => {
  const entries = [{ text: '1' }];
  assert.deepEqual(lastNEntries(entries, 10), entries);
});

test('lastNEntries: n=0 or a non-array degrades to []', () => {
  assert.deepEqual(lastNEntries([{ text: '1' }], 0), []);
  assert.deepEqual(lastNEntries(null, 3), []);
});

// ---- formatEntry ----

test('formatEntry: includes kind, ts, session, text, and bracketed refs', () => {
  const entry = { ts: '2026-07-26T00:00:00.000Z', session: '2026-07-26', kind: 'decision', text: 'do X', refs: ['PR#1', 'D4'] };
  assert.equal(formatEntry(entry), '[decision] 2026-07-26T00:00:00.000Z (2026-07-26) — do X [PR#1, D4]');
});

test('formatEntry: no refs → no trailing bracket', () => {
  const entry = { ts: 't', session: 's', kind: 'next', text: 'do Y', refs: [] };
  assert.equal(formatEntry(entry), '[next] t (s) — do Y');
});

// ---- cross-review finding on PR #109 ----

test('buildJournalEntry: embedded newlines are normalised, so one note cannot render as two entries', () => {
  // The file stayed valid JSONL (stringify escapes them), but the rendered report prints `text`
  // verbatim — so a crafted note displayed a second line that never happened.
  const e = buildJournalEntry({ kind: 'decision', text: 'real decision\nfake entry [decision]' });
  assert.ok(!e.text.includes('\n'));
  assert.equal(e.text, 'real decision fake entry [decision]');
});

test('buildJournalEntry: a text of only newlines is still rejected as empty', () => {
  assert.throws(() => buildJournalEntry({ kind: 'decision', text: '\n\n  \r\n' }), /must not be empty/);
});
