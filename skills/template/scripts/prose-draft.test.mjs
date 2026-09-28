// prose-draft.test.mjs — pure-logic coverage for the prose drafter. No agy, no fs writes,
// no network: gatherers take injected readers, prompt assembly is string-in/string-out.
// (The script guards main() with an isMain check — importing it here must be side-effect-free.)

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KINDS,
  taskBlock,
  gatherEpicSources,
  gatherSprintSources,
  buildPrompt,
  loadStylePrompt,
} from './prose-draft.mjs';

test('taskBlock: every kind has a task block that names its artifact', () => {
  assert.match(taskBlock('retro'), /RETROSPECTIVE\.md/);
  assert.match(taskBlock('poster'), /product-poster/);
  assert.match(taskBlock('sprint-wrap'), /THIN POINTER/);
  assert.equal(KINDS.length, 3);
});

test('retro task demands the owed ledger and dedupe-aware learnings', () => {
  const t = taskBlock('retro');
  assert.match(t, /Gaps \/ follow-ups/);
  assert.match(t, /dedupe-aware/);
});

test('gatherEpicSources: includes every md file, README required, git log appended', () => {
  const files = { 'README.md': '# Epic', 'sprint-1.md': 'S1 body', 'RETROSPECTIVE.md': 'retro' };
  const out = gatherEpicSources('Roadmap/x/epic', {
    readFile: (p) => files[p.split('/').pop()],
    listDir: () => Object.keys(files),
    log: () => 'abc1234 some commit',
  });
  for (const f of Object.keys(files)) assert.match(out, new RegExp(`### FILE: ${f}`));
  assert.match(out, /GIT LOG/);
  assert.match(out, /abc1234/);
});

test('gatherSprintSources: sprint doc + README context + log', () => {
  const out = gatherSprintSources('/repo/Roadmap/x/epic/sprint-2.md', {
    readFile: (p) => (p.endsWith('sprint-2.md') ? 'sprint body' : 'readme body'),
    log: () => '(log)',
    exists: () => true,
  });
  assert.match(out, /sprint body/);
  assert.match(out, /readme body/);
  assert.match(out, /GIT LOG/);
});

test('gatherSprintSources: a missing epic README is skipped, not read', () => {
  const out = gatherSprintSources('/repo/Roadmap/x/epic/sprint-2.md', {
    readFile: (p) => {
      if (p.endsWith('README.md')) throw new Error('must not read a missing README');
      return 'sprint body';
    },
    log: () => '(log)',
    exists: () => false,
  });
  assert.match(out, /sprint body/);
  assert.ok(!/FILE \(context\)/.test(out));
});

test('buildPrompt: style → lessons → task → sources, in that order', () => {
  const out = buildPrompt({ style: 'STYLE', kind: 'poster', sources: 'SOURCES', lessons: 'LESSON-X' });
  assert.ok(out.indexOf('STYLE') < out.indexOf('LESSON-X'));
  assert.ok(out.indexOf('LESSON-X') < out.indexOf('## Task'));
  assert.ok(out.indexOf('## Task') < out.indexOf('SOURCES'));
});

// The lessons file is the mechanism that makes this rail improve. It is shared with the two scheduled
// report surfaces, so a regression that dropped it HERE would leave the other backend still passing —
// which is precisely the silent half-wiring this test exists to prevent.
test('buildPrompt: the lessons block actually reaches the composed prompt', () => {
  const out = buildPrompt({
    style: 'S',
    kind: 'retro',
    sources: 'SRC',
    lessons: 'NEVER-INVENT-A-BENEFICIARY',
  });
  assert.ok(out.includes('NEVER-INVENT-A-BENEFICIARY'));
});

test('buildPrompt: an empty lessons file composes without an orphan heading', () => {
  const out = buildPrompt({ style: 'S', kind: 'retro', sources: 'SRC', lessons: '' });
  assert.ok(out.includes('S'));
  assert.ok(out.includes('SRC'));
  assert.ok(!/Lessons from previous drafts/.test(out));
});

// The register now comes from the SHARED persona + internal task file, not a local prompt file — so
// this asserts composition of the real files rather than a stubbed reader. A regression that pointed
// this surface back at a private prompt would fork the house voice, which is the exact drift
// LEARNINGS calls "a paraphrased contract drifts permissive".
test('loadStylePrompt: composes the shared CPO persona with the internal-artifact task', () => {
  const style = loadStylePrompt();
  assert.ok(style.includes('Chief Product Officer'), 'expected the shared persona');
  assert.ok(style.includes('INTERNAL engineering artifact'), 'expected the internal task block');
  // Both files' notes-to-humans headers must be stripped by loadPromptBody.
  assert.ok(!style.includes('Everything above the first'), 'header leaked into the prompt');
});
