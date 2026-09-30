// check-script-parity.test.mjs — the parity core, over temp trees.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { checkParity, listFiles } from './check-script-parity.mjs';

function trees(files) {
  const root = mkdtempSync(join(tmpdir(), 'script-parity-'));
  const projectDir = join(root, 'project');
  const templateDir = join(root, 'template');
  for (const [side, dir] of [
    ['project', projectDir],
    ['template', templateDir],
  ]) {
    mkdirSync(dir, { recursive: true });
    for (const [rel, sides] of Object.entries(files)) {
      if (sides[side] === undefined) continue;
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), sides[side]);
    }
  }
  return { root, projectDir, templateDir };
}

function run(files, allowed) {
  const t = trees(files);
  try {
    return checkParity({ projectDir: t.projectDir, templateDir: t.templateDir, allowed });
  } finally {
    rmSync(t.root, { recursive: true, force: true });
  }
}

test('identical files pass, including nested ones; one-sided files are ignored', () => {
  const r = run(
    {
      'a.mjs': { project: 'x', template: 'x' },
      'lib/b.mjs': { project: 'y', template: 'y' },
      'only-template.mjs': { template: 'z' },
    },
    {}
  );
  assert.equal(r.state, 'ok');
  assert.equal(r.identical, 2);
});

test('a one-byte unlisted difference fails and names the file', () => {
  const r = run({ 'a.mjs': { project: 'x', template: 'X' } }, {});
  assert.equal(r.state, 'drift');
  assert.match(r.problems[0], /^a\.mjs: differs/);
});

test('a difference listed with a reason passes', () => {
  const r = run({ 'a.mjs': { project: 'x', template: 'X' } }, { 'a.mjs': 'project-owned' });
  assert.equal(r.state, 'ok');
  assert.equal(r.allowed, 1);
});

test('listed without a reason fails', () => {
  for (const reason of ['', '   ', null]) {
    const r = run({ 'a.mjs': { project: 'x', template: 'X' } }, { 'a.mjs': reason });
    assert.equal(r.state, 'drift');
    assert.match(r.problems[0], /without a reason/);
  }
});

test('a stale entry (now identical) fails', () => {
  const r = run({ 'a.mjs': { project: 'x', template: 'x' } }, { 'a.mjs': 'was different' });
  assert.equal(r.state, 'drift');
  assert.match(r.problems[0], /STALE.*identical/);
});

test('a stale entry (file gone from one tree) fails', () => {
  const r = run({ 'a.mjs': { project: 'x' } }, { 'a.mjs': 'was shared' });
  assert.equal(r.state, 'drift');
  assert.match(r.problems[0], /STALE.*no longer present/);
  const r2 = run({ 'a.mjs': { project: 'x', template: 'x' } }, { 'gone.mjs': 'never existed' });
  assert.equal(r2.state, 'drift');
});

test('a missing tree is could-not-look, not drift', () => {
  const t = trees({ 'a.mjs': { project: 'x', template: 'x' } });
  try {
    const r = checkParity({ projectDir: t.projectDir, templateDir: join(t.root, 'nope'), allowed: {} });
    assert.equal(r.state, 'could-not-look');
  } finally {
    rmSync(t.root, { recursive: true, force: true });
  }
});

test('listFiles skips node_modules', () => {
  const t = trees({ 'a.mjs': { project: 'x' }, 'node_modules/p/i.js': { project: 'x' } });
  try {
    assert.deepEqual(listFiles(t.projectDir), ['a.mjs']);
  } finally {
    rmSync(t.root, { recursive: true, force: true });
  }
});
