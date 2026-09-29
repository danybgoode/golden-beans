// routine-bootstrap.test.mjs — the bootstrap must either render a fully configured prompt or print nothing.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ROUTINE_TOKENS, runRoutineBootstrap } from './routine-bootstrap.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'routine-bootstrap-'));
  const routines = join(root, 'routines');
  const prompt = join(routines, 'weekly-recap.prompt.md');
  // The loader is injected below; the name/path still exercises the CLI's routine lookup.
  return {
    root,
    routines,
    prompt,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function invoke({
  values = {},
  body = 'Root: <root-repo>; later: <date>; file: <your-file>.',
  argv = ['weekly-recap'],
} = {}) {
  const f = fixture();
  const stdout = [];
  const stderr = [];
  try {
    const code = runRoutineBootstrap(argv, {
      root: f.root,
      routinesDir: f.routines,
      names: ['weekly-recap'],
      loadBody: (path) => {
        assert.equal(path, f.prompt);
        return body;
      },
      readSectionFor: (section, { root }) => {
        assert.equal(section, 'routines');
        assert.equal(root, f.root);
        return { raw: values };
      },
      out: (text) => stdout.push(text),
      err: (text) => stderr.push(text),
    });
    return { code, out: stdout.join(''), err: stderr.join('') };
  } finally {
    f.cleanup();
  }
}

test('fills project values, strips the prompt header through the loader seam, and leaves runtime tokens alone', () => {
  const result = invoke({ values: { 'root-repo': 'acme/root' } });
  assert.equal(result.code, 0);
  assert.equal(result.err, '');
  assert.match(result.out, /Root: acme\/root/);
  assert.match(result.out, /<date>/);
  assert.match(result.out, /<your-file>/);
});

test('refuses every missing value and writes no prompt to stdout', () => {
  const result = invoke({ body: '<root-repo> <app-repo> <PROD_URL>', values: { 'app-repo': '' } });
  assert.equal(result.code, 1);
  assert.equal(result.out, '');
  for (const key of ['root-repo', 'app-repo', 'PROD_URL']) assert.match(result.err, new RegExp(key));
});

test('the declared TEMPLATE FILL-IN markers are fill-ins, not runtime substitutions', () => {
  const entry = ROUTINE_TOKENS.find((token) => token.key === 'deploy-path');
  const result = invoke({
    body: `Wait for ${entry.token}.`,
    values: { 'deploy-path': 'Vercel build then deploy' },
  });
  assert.equal(result.code, 0);
  assert.doesNotMatch(result.out, /TEMPLATE FILL-IN:/);
  assert.match(result.out, /Vercel build then deploy/);
});

test('an unknown routine names every valid routine and exits 2', () => {
  const result = invoke({ argv: ['nope'] });
  assert.equal(result.code, 2);
  assert.equal(result.out, '');
  assert.match(result.err, /Unknown routine "nope"/);
  assert.match(result.err, /weekly-recap/);
});

test('--list prints routine names', () => {
  const result = invoke({ argv: ['--list'] });
  assert.equal(result.code, 0);
  assert.equal(result.err, '');
  assert.equal(result.out, 'weekly-recap\n');
});

test('grep-to-zero: an unclassified <token> or TEMPLATE FILL-IN marker refuses, naming it', async () => {
  const { unclassifiedTokens } = await import('./routine-bootstrap.mjs');
  assert.deepEqual(unclassifiedTokens('run on <date> for <brand-new-token>'), ['<brand-new-token>']);
  assert.deepEqual(unclassifiedTokens('TEMPLATE FILL-IN: something new'), ['TEMPLATE FILL-IN']);
  assert.deepEqual(unclassifiedTokens('run on <date> in <repo>'), []);
});

test('every real prompt is fully classified today (a new token fails here first)', async () => {
  const { unclassifiedTokens, routineNames, ROUTINES_DIR } = await import('./routine-bootstrap.mjs');
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  for (const name of routineNames()) {
    const text = readFileSync(join(ROUTINES_DIR, `${name}.prompt.md`), 'utf8');
    const html = /<!--[\s\S]*?-->/g;
    assert.deepEqual(unclassifiedTokens(text.replace(html, '')), [], name);
  }
});
