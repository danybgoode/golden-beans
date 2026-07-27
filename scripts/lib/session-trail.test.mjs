// Unit layer for the session trail.
//
// The property worth pinning here is NOT "a checkpoint renders nicely". It is that a stale trail
// ANNOUNCES ITSELF. The whole rail is a response to Roadmap/LEARNINGS.md's finding that a
// good-faith handover summary can be wrong and the next reader has no way to tell — so a drift
// detector that quietly returned "no drift" after the branch moved would reintroduce exactly the
// bug it exists to prevent, while looking like it worked.
//
// Every drift case below is therefore asserted in both directions: it fires when it should, and it
// does NOT fire when nothing changed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCheckpoint,
  detectDrift,
  renderCheckpoint,
  renderResume,
  parseCheckpoints,
  highestSeverity,
  epicSlugCandidates,
  parsePorcelain,
} from './session-trail.mjs';

const NOW = new Date('2026-07-26T12:00:00.000Z');

function state(overrides = {}) {
  return {
    branch: 'feat/signals-loop',
    head: 'a'.repeat(40),
    headSubject: 'docs: amendments',
    dirty: ['apps/web/lib/flags.ts'],
    untracked: ['apps/web/lib/signal-scrub.ts'],
    verified: [],
    ...overrides,
  };
}

test('a checkpoint captures derived state, not just the note', () => {
  const cp = buildCheckpoint({ note: 'did a thing', state: state(), now: NOW });
  assert.equal(cp.branch, 'feat/signals-loop');
  assert.equal(cp.head, 'a'.repeat(40));
  assert.equal(cp.at, NOW.toISOString());
  assert.deepEqual(cp.dirty, ['apps/web/lib/flags.ts']);
});

test('file lists are sorted, so an unchanged tree produces an identical checkpoint', () => {
  // A diff that reports spurious changes because a directory walk returned a different order is a
  // diff nobody reads twice — which makes the real drift invisible in the noise.
  const a = buildCheckpoint({ note: '', state: state({ dirty: ['b.ts', 'a.ts', 'c.ts'] }), now: NOW });
  const b = buildCheckpoint({ note: '', state: state({ dirty: ['c.ts', 'a.ts', 'b.ts'] }), now: NOW });
  assert.deepEqual(a.dirty, b.dirty);
  assert.deepEqual(detectDrift(a, b).reasons, []);
});

test('no drift when nothing moved', () => {
  const cp = buildCheckpoint({ note: 'x', state: state(), now: NOW });
  const drift = detectDrift(cp, state());
  assert.equal(drift.hasDrift, false);
  assert.equal(drift.severity, 'none');
});

test('a moved BRANCH is high-severity drift', () => {
  const cp = buildCheckpoint({ note: 'x', state: state(), now: NOW });
  const drift = detectDrift(cp, state({ branch: 'main' }));
  assert.equal(drift.hasDrift, true);
  assert.equal(drift.severity, 'high');
  assert.ok(drift.reasons.some((r) => r.kind === 'branch-moved'));
});

test('an advanced HEAD is high-severity drift — the note describes an older tree', () => {
  // The single most dangerous case: work landed after the trail was written, so every claim in the
  // note is about a tree that no longer exists, and none of it is obviously wrong on its face.
  const cp = buildCheckpoint({ note: 'x', state: state(), now: NOW });
  const drift = detectDrift(cp, state({ head: 'b'.repeat(40) }));
  assert.equal(drift.severity, 'high');
  const reason = drift.reasons.find((r) => r.kind === 'head-advanced');
  assert.ok(reason);
  assert.match(reason.detail, /older tree/);
});

test('in-flight files that vanished are reported without being judged', () => {
  // "Committed" and "reverted or lost" look identical from here, and only the reader can tell which
  // by checking whether HEAD also advanced. Claiming either would be the tool inventing a fact.
  const cp = buildCheckpoint({ note: 'x', state: state(), now: NOW });
  const drift = detectDrift(cp, state({ dirty: [], untracked: [] }));
  const reason = drift.reasons.find((r) => r.kind === 'in-flight-files-gone');
  assert.ok(reason);
  assert.match(reason.detail, /committed, reverted, or lost/);
  assert.match(reason.detail, /apps\/web\/lib\/flags\.ts/);
});

test('newly changed files since the checkpoint are reported', () => {
  const cp = buildCheckpoint({ note: 'x', state: state(), now: NOW });
  const drift = detectDrift(cp, state({ dirty: ['apps/web/lib/flags.ts', 'apps/web/lib/auth.ts'] }));
  const reason = drift.reasons.find((r) => r.kind === 'new-in-flight-files');
  assert.ok(reason);
  assert.match(reason.detail, /auth\.ts/);
});

test('a file moving from untracked to dirty is NOT reported as drift', () => {
  // `git add` on a new file flips its porcelain code. The file is the same file and the work is the
  // same work; reporting that as drift would train the reader to ignore the drift section.
  const cp = buildCheckpoint({ note: 'x', state: state({ dirty: [], untracked: ['new.ts'] }), now: NOW });
  const drift = detectDrift(cp, state({ dirty: ['new.ts'], untracked: [] }));
  assert.equal(drift.hasDrift, false, JSON.stringify(drift.reasons));
});

test('detectDrift on a missing checkpoint is a clean no-op, not a crash', () => {
  const drift = detectDrift(null, state());
  assert.equal(drift.hasDrift, false);
  assert.deepEqual(drift.reasons, []);
});

test('highestSeverity picks the worst, not the last', () => {
  assert.equal(highestSeverity([{ severity: 'low' }, { severity: 'high' }, { severity: 'medium' }]), 'high');
  assert.equal(highestSeverity([]), 'none');
});

// ── Rendering: the separation of claim from evidence ─────────────────────────────────────────

test('verified facts render under a heading that distinguishes them from the note', () => {
  // A session's prose about what it did is a CLAIM; a line naming the command whose output was
  // observed is evidence. Rendering them in one paragraph is how the two become indistinguishable
  // to the next reader — the exact failure this rail exists to prevent.
  const cp = buildCheckpoint({
    note: 'built the shared surface',
    state: state({ verified: ['npm run test:unit → 560 pass / 0 fail'] }),
    now: NOW,
  });
  const md = renderCheckpoint(cp);
  assert.match(md, /Verified by running \(observed output, not believed\)/);
  assert.match(md, /560 pass/);
  // And the claim is not inside that block.
  assert.ok(md.indexOf('built the shared surface') < md.indexOf('Verified by running'));
});

test('a clean tree renders an explicit "nothing in flight" rather than an empty section', () => {
  const cp = buildCheckpoint({ note: 'x', state: state({ dirty: [], untracked: [] }), now: NOW });
  assert.match(renderCheckpoint(cp), /\*\*In flight:\*\* nothing/);
});

test('the resume briefing leads with drift, before the note', () => {
  // Ordering is the assertion. A reader who meets the note first has already started trusting it by
  // the time they learn the tree moved.
  const cp = buildCheckpoint({ note: 'THE-NOTE-TEXT', state: state(), now: NOW });
  const out = renderResume({
    trail: 'Roadmap/x/IN-FLIGHT.md',
    checkpoint: cp,
    drift: detectDrift(cp, state({ head: 'b'.repeat(40) })),
    epicPath: 'Roadmap/x',
  });
  assert.ok(out.indexOf('REPOSITORY HAS MOVED') < out.indexOf('THE-NOTE-TEXT'));
});

test('a no-drift briefing still refuses to call the note correct', () => {
  // The distinction that keeps this honest: "the tree did not move" and "the note is true" are
  // different facts, and conflating them is how a confidently wrong handover survives.
  const cp = buildCheckpoint({ note: 'x', state: state(), now: NOW });
  const out = renderResume({
    trail: 't',
    checkpoint: cp,
    drift: detectDrift(cp, state()),
    epicPath: null,
  });
  assert.match(out, /No drift/);
  assert.match(out, /does not mean the note is/);
});

test('resume with no checkpoint tells you how to start one instead of erroring', () => {
  const out = renderResume({
    trail: 't',
    checkpoint: null,
    drift: detectDrift(null, state()),
    epicPath: null,
  });
  assert.match(out, /No checkpoint recorded yet/);
  assert.match(out, /--checkpoint/);
});

test('parseCheckpoints counts blocks and survives an empty trail', () => {
  assert.equal(parseCheckpoints('').length, 0);
  assert.equal(parseCheckpoints(undefined).length, 0);
  const two = `# header\n\n## 2026-01-01 — a\n\nbody\n\n## 2026-01-02 — b\n\nbody\n`;
  assert.equal(parseCheckpoints(two).length, 2);
});

// ── parsePorcelain — the leading space is DATA ────────────────────────────────────────────────
// These pin the bug that corrupted the first filename of every checkpoint this rail wrote before
// 2026-07-26. The first case is the whole story: a modified-unstaged entry begins with a space, and
// any caller that trims the blob before splitting loses it from line one only.

test('a modified-unstaged path survives intact — the leading space is not whitespace to clean up', () => {
  const { dirty, untracked } = parsePorcelain(' M scripts/lib/session-trail.mjs\n');
  assert.deepEqual(dirty, ['scripts/lib/session-trail.mjs']);
  assert.deepEqual(untracked, []);
});

test('the FIRST entry is not truncated when it is the one carrying the leading space', () => {
  // The exact shape that produced `cripts/…`, `oadmap/…`, `pps/web/…` in the live trail: the bug
  // hit line one only, so a fixture with a single leading-space line first is what has teeth.
  const raw = ' M Roadmap/01-growth-engine/signals-loop/sprint-2.md\n?? apps/web/lib/signals.ts\n';
  const { dirty, untracked } = parsePorcelain(raw);
  assert.deepEqual(dirty, ['Roadmap/01-growth-engine/signals-loop/sprint-2.md']);
  assert.deepEqual(untracked, ['apps/web/lib/signals.ts']);
});

test('staged, unstaged and untracked codes are classified, not just sliced', () => {
  const { dirty, untracked } = parsePorcelain('M  a.ts\n M b.ts\nMM c.ts\n?? d.ts\nA  e.ts\n');
  assert.deepEqual(dirty, ['a.ts', 'b.ts', 'c.ts', 'e.ts']);
  assert.deepEqual(untracked, ['d.ts']);
});

test('a rename records the DESTINATION — the path that exists in the tree now', () => {
  const { dirty } = parsePorcelain('R  old/name.ts -> new/name.ts\n');
  assert.deepEqual(dirty, ['new/name.ts']);
});

test('empty and short lines are skipped rather than recorded as empty paths', () => {
  assert.deepEqual(parsePorcelain(''), { dirty: [], untracked: [] });
  assert.deepEqual(parsePorcelain('\n\n'), { dirty: [], untracked: [] });
  assert.deepEqual(parsePorcelain(null), { dirty: [], untracked: [] });
});

// ── epicSlugCandidates — finding the trail from the branch ────────────────────────────────────
// The rail's two blind spots, both hit live: a sprint-suffixed branch, and `main` (which the
// squash-merge rule makes the NORMAL place to start a sprint).

test('a plain feat branch yields its slug', () => {
  assert.deepEqual(epicSlugCandidates('feat/signals-loop'), ['signals-loop']);
});

test('a sprint-suffixed branch falls back to the unsuffixed epic slug, most specific first', () => {
  assert.deepEqual(epicSlugCandidates('feat/signals-loop-s3'), ['signals-loop-s3', 'signals-loop']);
  assert.deepEqual(epicSlugCandidates('feat/pod-report-sprint-2'), ['pod-report-sprint-2', 'pod-report']);
  assert.deepEqual(epicSlugCandidates('feat/pod-report-sprint3'), ['pod-report-sprint3', 'pod-report']);
});

test('a branch that names no epic yields NO candidates — the caller must fall back, not guess', () => {
  // `main` returning [] is what makes the recency search a deliberate, labelled fallback rather
  // than a slug match that happens to miss.
  assert.deepEqual(epicSlugCandidates('main'), []);
  assert.deepEqual(epicSlugCandidates('(detached)'), []);
  assert.deepEqual(epicSlugCandidates(''), []);
});

test('the suffix strip requires digits, so a real slug ending in -s or a word is untouched', () => {
  assert.deepEqual(epicSlugCandidates('feat/metrics'), ['metrics']);
  assert.deepEqual(epicSlugCandidates('feat/analytics'), ['analytics']);
  assert.deepEqual(epicSlugCandidates('feat/growth-engine-v1'), ['growth-engine-v1']);
});

test('a recency-found trail announces itself as a guess, above the note', () => {
  const cp = buildCheckpoint({ note: 'mid-story', state: state(), now: NOW });
  const out = renderResume({
    trail: 'Roadmap/01-growth-engine/signals-loop/IN-FLIGHT.md',
    checkpoint: cp,
    drift: detectDrift(cp, state()),
    epicPath: null,
    inferred: 'recency',
  });
  assert.match(out, /found by RECENCY, not by a branch match/);
  // Above the note, for the same reason the drift section is: a reader who meets the note first
  // has already started trusting it.
  assert.ok(out.indexOf('RECENCY') < out.indexOf('mid-story'));
});

test('a branch-matched trail carries no recency warning', () => {
  const cp = buildCheckpoint({ note: 'mid-story', state: state(), now: NOW });
  const out = renderResume({
    trail: 'x/IN-FLIGHT.md',
    checkpoint: cp,
    drift: detectDrift(cp, state()),
    epicPath: 'x',
    inferred: 'branch',
  });
  assert.doesNotMatch(out, /RECENCY/);
});

test('an empty briefing says WHERE it looked — "nothing here" and "looked in the wrong place" must be distinguishable', () => {
  const out = renderResume({
    trail: 'Roadmap/IN-FLIGHT.md',
    checkpoint: null,
    drift: { hasDrift: false, reasons: [] },
  });
  assert.match(out, /No checkpoint recorded yet/);
  assert.match(out, /Looked in: Roadmap\/IN-FLIGHT\.md/);
});
