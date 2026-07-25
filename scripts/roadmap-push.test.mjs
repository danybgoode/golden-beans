// roadmap-push — pure envelope/extract tests.
//
// The envelope is what the server validates, so it is what is worth pinning here. Two specific
// hazards get their own cases:
//
//   1. `undefined` vs `null` in `source`. JSON.stringify silently DROPS undefined keys, so a
//      "commit: undefined" becomes an absent field rather than an explicit null — harder to
//      diagnose from the server side, and a different shape than the schema documents.
//   2. Empty extract output. Roadmap/LEARNINGS.md: treat empty output from a young CLI as FAILURE,
//      never as success. Pushing an empty roadmap would store a permanently-wrong immutable
//      artifact, and the migration rejects it anyway — better to fail here with a readable message.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEnvelope, readExtract, ROADMAP_SCHEMA_VERSION } from './roadmap-push.mjs';

const rows = [
  { name: 'An epic', slug: 'an-epic', grain: 'Epic', status: 'Shipped', area: '01 Growth Engine' },
];

test('buildEnvelope carries the schema version, provenance and the rows', () => {
  const env = buildEnvelope(rows, {
    commit: 'abc1234',
    ref: 'main',
    generatedAt: '2026-07-25T00:00:00.000Z',
  });
  assert.equal(env.schemaVersion, ROADMAP_SCHEMA_VERSION);
  assert.equal(env.generatedAt, '2026-07-25T00:00:00.000Z');
  assert.deepEqual(env.source, { commit: 'abc1234', ref: 'main' });
  assert.deepEqual(env.items, rows);
});

test('buildEnvelope emits explicit nulls, never undefined, so JSON.stringify cannot drop them', () => {
  const env = buildEnvelope(rows);
  assert.equal(env.source.commit, null);
  assert.equal(env.source.ref, null);
  const round = JSON.parse(JSON.stringify(env));
  assert.ok('commit' in round.source, 'commit must survive serialisation as an explicit null');
  assert.ok('ref' in round.source, 'ref must survive serialisation as an explicit null');
});

test('buildEnvelope defaults generatedAt to a valid ISO instant', () => {
  const env = buildEnvelope(rows);
  assert.ok(!Number.isNaN(Date.parse(env.generatedAt)), `not a parseable instant: ${env.generatedAt}`);
});

test('readExtract treats EMPTY generator output as failure, not as an empty roadmap', () => {
  assert.throws(() => readExtract(() => ({ status: 0, stdout: '   ', stderr: '' })), /empty as failure/i);
});

test('readExtract refuses an empty array — an immutable empty artifact is unfixable', () => {
  assert.throws(
    () => readExtract(() => ({ status: 0, stdout: '[]', stderr: '' })),
    /refusing to push an empty/i
  );
});

test('readExtract surfaces a generator crash with its own last line', () => {
  assert.throws(
    () => readExtract(() => ({ status: 1, stdout: '', stderr: 'boom\nsomething specific broke' })),
    /something specific broke/
  );
});

test('readExtract parses real extract output', () => {
  const out = JSON.stringify(rows);
  assert.deepEqual(
    readExtract(() => ({ status: 0, stdout: out, stderr: '' })),
    rows
  );
});

test('the script and the server agree on ROADMAP_SCHEMA_VERSION', () => {
  // The constant is duplicated because this zero-dependency .mjs cannot import the TypeScript module
  // behind Next's `@/` alias. Duplication is acceptable ONLY while something proves the two agree —
  // otherwise the client happily pushes a version the server will 400 on, and the failure appears at
  // deploy time rather than here.
  const ts = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'lib', 'roadmap-artifact-schema.ts'),
    'utf8'
  );
  const m = ts.match(/export const ROADMAP_SCHEMA_VERSION = (\d+)/);
  assert.ok(m, 'could not find ROADMAP_SCHEMA_VERSION in the schema module — did it move?');
  assert.equal(
    Number(m[1]),
    ROADMAP_SCHEMA_VERSION,
    'scripts/roadmap-push.mjs and lib/roadmap-artifact-schema.ts disagree on the schema version'
  );
});
