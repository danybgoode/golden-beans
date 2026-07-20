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
  PROSE_MODEL,
  PROSE_FALLBACK_MODEL,
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

test('buildPrompt: style → task → sources, in that order', () => {
  const out = buildPrompt({ style: 'STYLE', kind: 'poster', sources: 'SOURCES' });
  assert.ok(out.indexOf('STYLE') < out.indexOf('## Task'));
  assert.ok(out.indexOf('## Task') < out.indexOf('SOURCES'));
});

test('loadStylePrompt: strips the HTML-comment header above the first ---', () => {
  const raw = '<!-- header -->\n\n---\n\nREAL PROMPT';
  assert.equal(loadStylePrompt(() => raw).trim(), 'REAL PROMPT');
});

test('model pair: cheap-fast primary, separate-quota fallback, env-overridable shape', () => {
  assert.notEqual(PROSE_MODEL, '');
  assert.notEqual(PROSE_FALLBACK_MODEL, '');
  assert.notEqual(PROSE_MODEL, PROSE_FALLBACK_MODEL);
});
