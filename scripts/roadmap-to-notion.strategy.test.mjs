// roadmap-to-notion.strategy.test.mjs — this repo's own extractor ignores Roadmap/00-strategy/ (think-skills S2.2, D8).
//
// `skills/template/scripts/strategy-folder.test.mjs` pins the property for the extractor strangers get. This repo runs
// a different one: `scripts/roadmap-extract.mjs` delegates to `roadmap-to-notion.mjs --extract`, which pins its root to
// its own directory and ignores GF_PROJECT_ROOT. So it is copied into a fixture project and run there, with and
// without the strategy folder. As in the template's pin, the failing run is the D8 violation (a strategy SUBFOLDER
// carrying a README.md), because a flat file is skipped twice over by the walker and no one-line mutation of it
// changes that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'roadmap-to-notion.mjs'), 'utf8');

const EPIC = `---
status: in-progress
slug: demo-epic
title: "Demo epic"
area: 09-platform-infra
risk: low
type: feature
build_order: 1
---

# Epic: Demo epic
`;

function rows(strategy) {
  // realpath: on macOS tmpdir() is a symlink, and the script's isMain check compares its own real path with argv[1].
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'notion-strategy-')));
  const epic = join(root, 'Roadmap', '09-platform-infra', 'demo-epic');
  mkdirSync(epic, { recursive: true });
  mkdirSync(join(root, 'Roadmap', '00-ideas', 'seeds'), { recursive: true });
  mkdirSync(join(root, 'scripts'));
  writeFileSync(join(epic, 'README.md'), EPIC);
  writeFileSync(join(root, 'scripts', 'roadmap-to-notion.mjs'), SOURCE);
  if (strategy) {
    const dir = join(root, 'Roadmap', '00-strategy');
    mkdirSync(dir);
    for (const kind of ['pmf-narrative', 'north-star', 'risk-validation']) {
      writeFileSync(
        join(dir, `${kind}.md`),
        `---\nkind: ${kind}\nstatus: draft\nupdated: 2026-09-30\n---\n\n# ${kind}\n`
      );
    }
    if (strategy === 'subfolder') {
      mkdirSync(join(dir, 'north-star'));
      writeFileSync(join(dir, 'north-star', 'README.md'), EPIC.replace(/demo-epic/g, 'north-star'));
    }
  }
  const result = spawnSync(process.execPath, [join(root, 'scripts', 'roadmap-to-notion.mjs'), '--extract'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).map((row) => `${row.grain}:${row.slug ?? row.name}`);
}

test('roadmap-to-notion --extract: a flat Roadmap/00-strategy/ adds no row', () => {
  const without = rows(null);
  assert.ok(without.includes('Epic:demo-epic'), 'the fixture epic is seen at all');
  assert.deepEqual(rows('flat'), without);
});

test('roadmap-to-notion --extract: the pin can fail — a strategy subfolder with a README becomes a row', () => {
  assert.notDeepEqual(rows('subfolder'), rows(null));
});
