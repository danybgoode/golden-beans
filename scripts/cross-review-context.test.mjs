// Which files a reviewer is shown, and under which name.
//
// ── Why this matters more than it looks ──────────────────────────────────────────────────────
// `cross-review.mjs` attaches whole-file context alongside the diff, because a reviewer reasoning
// about code it cannot see invents findings — that is stated in the attachment block's own header
// ("three wrong findings in two days"). The corollary is sharper: showing it the WRONG file is
// worse than showing none, because the reviewer is then confidently wrong rather than visibly
// blind, and a false Blocking costs a round trip to disprove.
//
// Two ways that happened, both fixed and both pinned here:
//   1. Content was read from the WORKING TREE, so reviewing a PR while checked out on its stacked
//      child handed the reviewer one branch's diff and another branch's files. Mistral Vibe duly
//      reported a compile error that did not exist (PR #118).
//   2. The path was taken from the diff's `a/` (pre-image) side, which is the wrong side once the
//      content comes from the PR head — on a rename it is the OLD name (Codex, PR #119).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headSidePaths } from './lib/cross-agent-cli.mjs';

const RENAME = [
  'diff --git a/old-name.ts b/new-name.ts',
  'similarity index 92%',
  'rename from old-name.ts',
  'rename to new-name.ts',
  '--- a/old-name.ts',
  '+++ b/new-name.ts',
  '@@ -1 +1 @@',
  '-before',
  '+after',
].join('\n');

const DELETION = [
  'diff --git a/removed.ts b/removed.ts',
  'deleted file mode 100644',
  'index 1234567..0000000',
  '--- a/removed.ts',
  '+++ /dev/null',
  '@@ -1 +0,0 @@',
  '-gone',
].join('\n');

const ADDITION = [
  'diff --git a/added.ts b/added.ts',
  'new file mode 100644',
  'index 0000000..1234567',
  '--- /dev/null',
  '+++ b/added.ts',
  '@@ -0,0 +1 @@',
  '+fresh',
].join('\n');

const MODIFICATION = [
  'diff --git a/kept.ts b/kept.ts',
  'index aaaaaaa..bbbbbbb 100644',
  '--- a/kept.ts',
  '+++ b/kept.ts',
  '@@ -1 +1 @@',
  '-a',
  '+b',
].join('\n');

test('a rename yields the NEW name — the one that exists at the PR head', () => {
  // The regression: taking `a/` gave "old-name.ts", which `git show <head>:old-name.ts` cannot
  // resolve, so the file was silently dropped from the reviewer's context.
  assert.deepEqual(headSidePaths(RENAME), ['new-name.ts']);
});

test('a deleted file is skipped entirely', () => {
  // It has no head-side content, so asking for it can only miss — and a miss trips the
  // "fell back to the working tree" warning for a file that is correctly absent.
  assert.deepEqual(headSidePaths(DELETION), []);
});

test('an added file is included — `--- /dev/null` must not be read as a deletion', () => {
  // The narrow-miss this guards: matching /dev/null anywhere in the chunk would drop every NEW
  // file, which is most of a feature PR. Only the `+++` side marks a deletion.
  assert.deepEqual(headSidePaths(ADDITION), ['added.ts']);
});

test('an ordinary modification is included', () => {
  assert.deepEqual(headSidePaths(MODIFICATION), ['kept.ts']);
});

test('a mixed diff keeps exactly the files that exist at head, under their head names', () => {
  const diff = [MODIFICATION, RENAME, DELETION, ADDITION].join('\n');
  assert.deepEqual(headSidePaths(diff), ['kept.ts', 'new-name.ts', 'added.ts']);
});

test("one file's deletion does not suppress its neighbours", () => {
  // `+++ /dev/null` is matched per file chunk. Scanned across the whole diff it would drop
  // everything after the first deletion — a silent, total loss of context on any PR that removes
  // a file, which is the failure mode most likely to go unnoticed.
  assert.deepEqual(headSidePaths([DELETION, MODIFICATION].join('\n')), ['kept.ts']);
  assert.deepEqual(headSidePaths([MODIFICATION, DELETION].join('\n')), ['kept.ts']);
});

test('an empty or absent diff yields nothing rather than throwing', () => {
  for (const input of ['', null, undefined]) {
    assert.deepEqual(headSidePaths(input), []);
  }
});

test('a path with no parseable header is dropped, not emitted as undefined', () => {
  // Defensive: `\S+` cannot match a path containing spaces (git quotes those). Dropping it loses
  // context; emitting `undefined` would make the reader throw on a filename.
  const quoted =
    'diff --git "a/with space.ts" "b/with space.ts"\n--- "a/with space.ts"\n+++ "b/with space.ts"\n@@ -1 +1 @@\n-a\n+b';
  assert.deepEqual(headSidePaths(quoted), []);
});
