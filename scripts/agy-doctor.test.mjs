// agy-doctor — pure node:test for the drift-decision core + the pin-bump string transform.
//
// The doctor's I/O (spawning agy) is deliberately untested here (no agy in CI); what CI gates is the
// judgment — which observation pattern maps to which action, most severe first — and that --fix's file
// rewrite is anchored (throws rather than half-writes when the lib shape changed). The decision table
// mirrors the real incidents: the 1.0.10 silent-empty contract break ('contract-broken'), a model
// rename/retirement ('model-drift'), a clean self-update ('bump'), and the 2026-07-06 transient
// Gemini-quota blank the fallback absorbed ('quota-warn').
//
// Run: node --test 'scripts/agy-doctor.test.mjs'   (scripts-guard runs the full glob in CI).

import test from 'node:test';
import assert from 'node:assert/strict';
import { decideDoctorAction, bumpPinnedSource } from './agy-doctor.mjs';

const base = {
  installed: '1.0.16',
  pinned: '1.0.16',
  helpOk: true,
  primaryListed: true,
  fallbackListed: true,
  probes: { primary: 'ok', fallback: 'ok' },
};

test('ok: version matches, contract green, probes green', () => {
  assert.equal(decideDoctorAction(base).action, 'ok');
});

test('bump: version drift with a fully green contract probe', () => {
  const d = decideDoctorAction({ ...base, installed: '1.0.19' });
  assert.equal(d.action, 'bump');
  assert.equal(d.notes.length, 0);
});

test('bump: still blessed when only the primary is quota-empty (fallback carried it), with a note', () => {
  const d = decideDoctorAction({ ...base, installed: '1.0.19', probes: { primary: 'empty', fallback: 'ok' } });
  assert.equal(d.action, 'bump');
  assert.equal(d.notes.length, 1);
});

test('quota-warn: pinned version, primary empty, fallback ok — informational, not drift', () => {
  const d = decideDoctorAction({ ...base, probes: { primary: 'empty', fallback: 'ok' } });
  assert.equal(d.action, 'quota-warn');
});

test('contract-broken beats everything: help contract gone', () => {
  const d = decideDoctorAction({ ...base, installed: '1.0.19', helpOk: false, primaryListed: false });
  assert.equal(d.action, 'contract-broken');
});

test('contract-broken: a probe ERROR is an interface break, never blessed and never treated as quota', () => {
  for (const probes of [{ primary: 'error', fallback: 'ok' }, { primary: 'ok', fallback: 'error' }]) {
    assert.equal(decideDoctorAction({ ...base, installed: '1.0.19', probes }).action, 'contract-broken');
  }
});

test('contract-broken: BOTH models empty — a version this blind cannot be bumped', () => {
  const d = decideDoctorAction({ ...base, installed: '1.0.19', probes: { primary: 'empty', fallback: 'empty' } });
  assert.equal(d.action, 'contract-broken');
});

test('model-drift: a missing pinned model is reported, outranked only by a broken contract', () => {
  assert.equal(decideDoctorAction({ ...base, primaryListed: false }).action, 'model-drift');
  assert.equal(decideDoctorAction({ ...base, installed: '1.0.19', fallbackListed: false }).action, 'model-drift');
  // …and a version bump must NOT be blessed while a model is missing:
  const d = decideDoctorAction({ ...base, installed: '1.0.19', primaryListed: false });
  assert.notEqual(d.action, 'bump');
});

// ── bumpPinnedSource: anchored rewrite of the real lib shape ──────────────────────────────────────
const LIB_SHAPE = `// prose above
// agy-doctor: last verified 2026-07-03 against 1.0.16.
//   ^ machine-managed marker
export const AGY_PINNED = '1.0.16';
// prose below
`;

test('bumpPinnedSource rewrites BOTH the constant and the marker, nothing else', () => {
  const out = bumpPinnedSource(LIB_SHAPE, '1.0.19', '2026-07-10');
  assert.match(out, /export const AGY_PINNED = '1\.0\.19';/);
  assert.match(out, /\/\/ agy-doctor: last verified 2026-07-10 against 1\.0\.19\./);
  assert.ok(!out.includes('1.0.16'), 'no stale version string left behind');
  assert.ok(out.includes('// prose above') && out.includes('// prose below'), 'surrounding prose untouched');
});

test('bumpPinnedSource THROWS (never half-writes) when an anchor is missing', () => {
  assert.throws(() => bumpPinnedSource("export const AGY_PINNED = '1.0.16';\n", '1.0.19', '2026-07-10'),
    /marker line not found/);
  assert.throws(() => bumpPinnedSource('// agy-doctor: last verified 2026-07-03 against 1.0.16.\n', '1.0.19', '2026-07-10'),
    /constant line not found/);
});

test('bumpPinnedSource round-trips against the REAL lib source (anchors exist exactly once)', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const lib = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'lib', 'cross-agent-cli.mjs'), 'utf8');
  const out = bumpPinnedSource(lib, '9.9.9', '2099-01-01');
  assert.match(out, /export const AGY_PINNED = '9\.9\.9';/);
  assert.match(out, /agy-doctor: last verified 2099-01-01 against 9\.9\.9\./);
});
