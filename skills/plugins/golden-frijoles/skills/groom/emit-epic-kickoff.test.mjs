// emit-epic-kickoff.test.mjs — pins the pure helpers of the epic-mode kickoff generator.
// Same stance as emit-kickoff.test.mjs: the filesystem walk is thin and exercised by real runs; the
// parsing and ordering are where a silent, plausible-looking wrong output comes from.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sprintNumFromFilename,
  listSprintFiles,
  buildSprintFileList,
  buildSprintBreakdown,
  buildEpicKickoff,
  parseEpicRisk,
} from './emit-epic-kickoff.mjs';

test('sprintNumFromFilename accepts only real sprint files', () => {
  assert.equal(sprintNumFromFilename('sprint-1.md'), 1);
  assert.equal(sprintNumFromFilename('sprint-12.md'), 12);
  assert.equal(sprintNumFromFilename('README.md'), null);
  assert.equal(sprintNumFromFilename('RETROSPECTIVE.md'), null);
  assert.equal(sprintNumFromFilename('sprint-1.md.bak'), null);
  assert.equal(sprintNumFromFilename('sprint-notes.md'), null);
});

test('sprint files sort NUMERICALLY, not lexicographically', () => {
  // The regression this guards: a 10+ sprint epic sorted as strings puts sprint-10 second, which in epic
  // mode means the stacked-branch order in the prompt is wrong — actively harmful, not cosmetic.
  const names = ['sprint-10.md', 'sprint-2.md', 'README.md', 'sprint-1.md', 'RETROSPECTIVE.md'];
  assert.deepEqual(listSprintFiles(names).map((s) => s.num), [1, 2, 10]);
});

test('listSprintFiles drops non-sprint files from the epic dir', () => {
  const names = ['README.md', 'RETROSPECTIVE.md', 'NOTES.md', 'diagram.png', 'sprint-1.md'];
  assert.deepEqual(listSprintFiles(names).map((s) => s.name), ['sprint-1.md']);
});

test('buildSprintFileList names every boundary file in order', () => {
  const sprints = listSprintFiles(['sprint-2.md', 'sprint-1.md', 'sprint-3.md']);
  assert.equal(buildSprintFileList(sprints), 'sprint-1.md, sprint-2.md, sprint-3.md');
  assert.match(buildSprintFileList([]), /no sprint-N\.md files found/);
});

test('buildSprintBreakdown renders each sprint with its stories', () => {
  const out = buildSprintBreakdown([
    { name: 'sprint-1.md', num: 1, title: 'Durable payment state', stories: ['Story 1.1 — Persist intent', 'Story 1.2 — Reconcile'] },
    { name: 'sprint-2.md', num: 2, title: 'Block ship before paid', stories: [] },
  ]);
  assert.match(out, /### Sprint 1: Durable payment state/);
  assert.match(out, /- Story 1\.1 — Persist intent/);
  assert.match(out, /_\(boundary: sprint-1\.md\)_/);
  // A sprint with no parsed stories must SAY so — an empty list that looks complete is the failure shape
  // emit-kickoff's em-dash bug produced (a plausible prompt with no stories at all).
  assert.match(out, /no `### Story N\.M — <title>` headings found/);
});

test('parseEpicRisk reads the header line and defaults to high when absent', () => {
  assert.equal(parseEpicRisk('> **Area:** 02-x · **Risk:** low · **Class:** Chore'), 'low');
  assert.equal(parseEpicRisk('> **Area:** 02-x · **Risk:** HIGH · **Class:** Feature'), 'high');
  // "When unsure, treat it as high" — an under-declared risk is what skips the mandatory fresh reviewer.
  assert.equal(parseEpicRisk('# Epic: no header line here'), 'high');
});

test('buildEpicKickoff substitutes every placeholder the template uses', () => {
  const templateText = [
    'Epic {{SLUG}} under {{MACRO}} — "{{EPIC_TITLE}}", risk {{RISK}}.',
    '{{SPRINT_COUNT}} sprints: {{SPRINT_FILE_LIST}}',
    '{{SPRINT_BREAKDOWN}}',
  ].join('\n');
  const out = buildEpicKickoff({
    macro: '02-checkout',
    slug: 'checkout-hardening',
    epicTitle: 'Checkout hardening',
    risk: 'HIGH',
    sprints: [{ name: 'sprint-1.md', num: 1, title: 'S1', stories: ['Story 1.1 — A'] }],
    templateText,
  });
  assert.match(out, /Epic checkout-hardening under 02-checkout — "Checkout hardening", risk HIGH\./);
  assert.match(out, /1 sprints: sprint-1\.md/);
  assert.match(out, /### Sprint 1: S1/);
  // An unresolved placeholder must be VISIBLE in the output rather than silently blanked — same rule the
  // sibling generator's `sub()` follows.
  assert.doesNotMatch(out, /\{\{(MACRO|SLUG|EPIC_TITLE|RISK|SPRINT_COUNT)\}\}/);
});

test('the real template renders with no leftover placeholders', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));
  const templateText = readFileSync(join(here, 'templates', 'epic-kickoff.md'), 'utf8');

  const out = buildEpicKickoff({
    macro: '09-platform-infra',
    slug: 'demo',
    epicTitle: 'Demo',
    risk: 'LOW',
    sprints: [
      { name: 'sprint-1.md', num: 1, title: 'One', stories: ['Story 1.1 — A'] },
      { name: 'sprint-2.md', num: 2, title: 'Two', stories: ['Story 2.1 — B'] },
    ],
    templateText,
  });
  assert.doesNotMatch(out, /\{\{\w+\}\}/, 'template has a placeholder the generator does not supply');
  // The contract lines that must survive any future template edit — these are the whole reason the
  // generator exists instead of a hand-composed prompt.
  assert.match(out, /EPIC MODE/);
  assert.match(out, /review-route\.mjs/);
  assert.match(out, /security lens/);
  assert.match(out, /pre-authorized to merge on a green gate/);
  assert.match(out, /Done means shipped/);
});
