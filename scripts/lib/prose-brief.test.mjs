// prose-brief.test.mjs — the evidence pack's shape is a CONTRACT with the routine that writes from it,
// so it is pinned here rather than left to whatever the last edit produced. All pure: no git, no gh,
// no network, no database.

import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildEvidencePack,
  buildQuietBrief,
  buildBrief,
  deriveEvidenceFlags,
  loadOwedLedger,
  statusLineFrom,
  loadPersonaAndTask,
} from './prose-brief.mjs';

const SCRIPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---- ordering: roadmap deltas LEAD (README D4) ----

test('buildEvidencePack: roadmap deltas come before repo signals — the whole altitude decision', () => {
  const pack = buildEvidencePack({
    windowLabel: 'w',
    roadmapDeltas: ['Epic "x" moved to shipped.'],
    repoSignals: ['merged: #1'],
  });
  assert.ok(pack.indexOf('What moved on the roadmap') < pack.indexOf('Repository signals'));
  assert.ok(pack.indexOf('Epic "x" moved to shipped.') < pack.indexOf('merged: #1'));
});

test('buildEvidencePack: repo signals are labelled corroboration, not material to enumerate', () => {
  const pack = buildEvidencePack({ windowLabel: 'w', repoSignals: ['merged: #1'] });
  assert.match(pack, /do NOT enumerate these/);
});

// ---- the owed ledger degrades cleanly (neither epic may hard-depend on the other) ----

test('buildEvidencePack: a missing owed ledger says so and forbids guessing', () => {
  const pack = buildEvidencePack({ windowLabel: 'w' });
  assert.match(pack, /owed ledger is not available/);
  assert.match(pack, /do not guess a number/);
});

test('buildEvidencePack: a present owed ledger reports its real total', () => {
  const pack = buildEvidencePack({ windowLabel: 'w', owed: { total: 76, byCategory: '20 money-path' } });
  assert.match(pack, /76 check\(s\) owed/);
  assert.match(pack, /20 money-path/);
});

test('loadOwedLedger: absent file → null; malformed JSON → null, never a throw', () => {
  assert.equal(loadOwedLedger('/nope', { exists: () => false, read: () => '' }), null);
  assert.equal(loadOwedLedger('/bad', { exists: () => true, read: () => 'not json' }), null);
});

test('loadOwedLedger: a valid ledger yields the total and a readable category breakdown', () => {
  const out = loadOwedLedger('/ok', {
    exists: () => true,
    read: () => JSON.stringify({ total: 76, byCategory: { 'money-path': 20, 'auth-path': 11 } }),
  });
  assert.equal(out.total, 76);
  assert.match(out.byCategory, /20 money-path/);
  assert.match(out.byCategory, /11 auth-path/);
});

// ---- flag state: UNKNOWN and NONE are different facts ----
//
// Collapsing them would let the brief tell the writer nothing is live when the truth is unknown — a
// confident falsehood produced by the very module meant to prevent them.

test('buildEvidencePack: unreadable flag state reads as UNKNOWN, not as "nothing is live"', () => {
  const pack = buildEvidencePack({ windowLabel: 'w', liveFlags: { available: false, flags: [] } });
  assert.match(pack, /UNKNOWN/);
  assert.match(pack, /do not state that anything is off either/);
});

test('buildEvidencePack: a known-empty flag set says none are on', () => {
  const pack = buildEvidencePack({ windowLabel: 'w', liveFlags: { available: true, flags: [] } });
  assert.match(pack, /none are on/);
  assert.doesNotMatch(pack, /UNKNOWN/);
});

test('buildEvidencePack: known-on flags are listed by key', () => {
  const pack = buildEvidencePack({
    windowLabel: 'w',
    liveFlags: { available: true, flags: ['promoter.activation_crm_enabled'] },
  });
  assert.match(pack, /promoter\.activation_crm_enabled/);
});

test('buildEvidencePack: a bare array is still accepted as "known" (back-compat with the pure callers)', () => {
  const pack = buildEvidencePack({ windowLabel: 'w', liveFlags: ['a.b'] });
  assert.match(pack, /a\.b/);
  assert.doesNotMatch(pack, /UNKNOWN/);
});

// ---- the quiet window must not be writable (README D7) ----

test('buildQuietBrief: instructs the routine NOT to write prose', () => {
  const brief = buildQuietBrief('today');
  assert.match(brief, /Do NOT write prose/);
  assert.match(brief, /quiet period is a fact/);
  // It must not look like an evidence pack, or a model will treat it as material.
  assert.doesNotMatch(brief, /### What moved on the roadmap/);
});

// ---- evidence flags are DERIVED, never assumed ----

test('deriveEvidenceFlags: both permissions default CLOSED on an ordinary window', () => {
  const ev = deriveEvidenceFlags({
    subjects: ['feat: add a thing'],
    areas: ['internal tooling'],
    maxWords: 90,
  });
  assert.equal(ev.allowsFixClaim, false);
  assert.equal(ev.allowsBeneficiary, false);
});

test('deriveEvidenceFlags: a real fix: subject unlocks fix language', () => {
  assert.equal(
    deriveEvidenceFlags({ subjects: ['fix(checkout): stop double charge'], maxWords: 90 }).allowsFixClaim,
    true
  );
});

test('deriveEvidenceFlags: a customer-observable area unlocks naming customers', () => {
  assert.equal(deriveEvidenceFlags({ areas: ['storefront pages'], maxWords: 90 }).allowsBeneficiary, true);
});

test('deriveEvidenceFlags: the scheduled surfaces forbid structural markdown', () => {
  assert.equal(deriveEvidenceFlags({ maxWords: 90 }).allowsMarkdown, false);
});

// ---- the shared persona actually reaches the brief ----
//
// A composition regression here would leave the LOCAL rail passing while the two scheduled surfaces
// silently lost the house voice — precisely the half-wiring this epic exists to prevent.

test('loadPersonaAndTask: composes the shared CPO persona with the per-surface task', () => {
  const s = loadPersonaAndTask(SCRIPTS_DIR, 'standup');
  assert.match(s, /Chief Product Officer/);
  assert.match(s, /DAILY STANDUP/);
  assert.doesNotMatch(s, /Everything above the first/); // notes-to-humans header stripped
});

test('buildBrief: persona → lessons → evidence, and the lessons block is present', () => {
  const brief = buildBrief({
    scriptsDir: SCRIPTS_DIR,
    surface: 'standup',
    pack: '## Evidence — EVIDENCE-MARKER',
    lessons: 'LESSON-MARKER',
  });
  assert.ok(brief.indexOf('Chief Product Officer') < brief.indexOf('LESSON-MARKER'));
  assert.ok(brief.indexOf('LESSON-MARKER') < brief.indexOf('EVIDENCE-MARKER'));
});

test('buildBrief: the weekly surface loads its own task file, not the standup one', () => {
  const brief = buildBrief({ scriptsDir: SCRIPTS_DIR, surface: 'weekly', pack: 'P', lessons: '' });
  assert.match(brief, /WEEKLY RECAP/);
  assert.doesNotMatch(brief, /DAILY STANDUP/);
});

// ---- misc ----

test('statusLineFrom: reads a sprint Status line, or null when absent', () => {
  assert.equal(statusLineFrom('# T\n\n**Status:** 🟦 In review\n'), '🟦 In review');
  assert.equal(statusLineFrom('# T\n\nno status here\n'), null);
});

test('loadPersonaAndTask honours an explicit scriptsDir: a fixture project gets ITS persona (X20)', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, realpathSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const fixture = realpathSync(mkdtempSync(join(tmpdir(), 'persona-')));
  mkdirSync(join(fixture, 'scripts', 'prose'), { recursive: true });
  writeFileSync(join(fixture, 'scripts', 'prose', 'cpo-persona.md'), '<!-- h -->\n---\nFIXTURE PERSONA\n');
  writeFileSync(join(fixture, 'scripts', 'prose', 'standup.task.md'), '<!-- h -->\n---\nFIXTURE TASK\n');
  const s = loadPersonaAndTask(join(fixture, 'scripts'), 'standup');
  assert.match(s, /FIXTURE PERSONA/);
});
