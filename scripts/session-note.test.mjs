// session-note.test.mjs — CLI-level coverage for session-note.mjs with an INJECTED append() so no real
// git/network I/O runs. Real appendLineToBranch behavior is scripts/lib/log-branch.mjs's own concern
// (untouched); this proves session-note wires args → a journal line → that call correctly, and — the one
// behavior specific to D1 — fails soft on an append failure.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, main } from './session-note.mjs';
import { JOURNAL_BRANCH, JOURNAL_PATH, parseJournal } from './lib/session-journal.mjs';

// ---- parseArgs ----

test('parseArgs: --kind + positional text + --refs + --session', () => {
  const args = parseArgs(['--kind', 'decision', 'ship it', '--refs', 'PR#1,D4', '--session', 's1']);
  assert.deepEqual(args, { kind: 'decision', text: 'ship it', refs: 'PR#1,D4', session: 's1', help: false });
});

test('parseArgs: --help sets the help flag', () => {
  assert.equal(parseArgs(['--help']).help, true);
});

test('parseArgs: an unknown flag throws', () => {
  assert.throws(() => parseArgs(['--bogus']), /unknown argument/);
});

// ---- main() — happy path ----

test('main(): a valid note calls append() with the JOURNAL_BRANCH/PATH and a serialized entry, returns 0', async () => {
  let captured = null;
  const code = await main(['--kind', 'decision', 'use log-branch unchanged', '--refs', 'D1'], {
    append: (opts) => {
      captured = opts;
      return true;
    },
    log: () => {},
    warn: () => {},
    now: new Date('2026-07-26T00:00:00Z'),
  });
  assert.equal(code, 0);
  assert.equal(captured.branch, JOURNAL_BRANCH);
  assert.equal(captured.path, JOURNAL_PATH);
  const [entry] = parseJournal(captured.line);
  assert.equal(entry.kind, 'decision');
  assert.equal(entry.text, 'use log-branch unchanged');
  assert.deepEqual(entry.refs, ['D1']);
});

// ---- main() — D1 fails SOFT on an append failure ----

test('main(): append() returning false is a SOFT failure — warns, still returns 0 (D1)', async () => {
  let warned = '';
  const code = await main(['--kind', 'blocked', 'daniel needs to flip the flag'], {
    append: () => false,
    log: () => {},
    warn: (m) => {
      warned += m;
    },
  });
  assert.equal(code, 0); // NOT 1 — a lost journal line must never look like a hard failure
  assert.match(warned, /failed to append/);
  assert.match(warned, /NOT journalled/);
});

// ---- main() — usage errors are LOUD (exit 1), distinct from the soft I/O failure above ----

test('main(): an invalid --kind is a usage error → returns 1, append() never called', async () => {
  let appendCalled = false;
  const code = await main(['--kind', 'done', 'x'], {
    append: () => {
      appendCalled = true;
      return true;
    },
    log: () => {},
    warn: () => {},
  });
  assert.equal(code, 1);
  assert.equal(appendCalled, false);
});

test('main(): missing text is a usage error → returns 1', async () => {
  const code = await main(['--kind', 'decision'], { append: () => true, log: () => {}, warn: () => {} });
  assert.equal(code, 1);
});

test('main(): --help prints and returns 0 without appending', async () => {
  let appendCalled = false;
  let logged = '';
  const code = await main(['--help'], {
    append: () => {
      appendCalled = true;
      return true;
    },
    log: (m) => {
      logged += m;
    },
    warn: () => {},
  });
  assert.equal(code, 0);
  assert.equal(appendCalled, false);
  assert.match(logged, /Usage: node scripts\/session-note\.mjs/);
});
