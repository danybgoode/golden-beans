// roadmap-to-notion.strategy.test.mjs — this repo's own extractor ignores Roadmap/00-strategy/ (think-skills S2.2, D8).
//
// `skills/template/scripts/strategy-folder.test.mjs` pins the property for the extractor strangers get. This repo's
// `roadmap-to-notion.mjs --extract` now runs that same extractor (board-sinks-and-scrumban D15); it is still pinned
// here through the Notion entry point, copied into a fixture project with its imports and run there, with and
// without the strategy folder. As in the template's pin, the failing run is the D8 violation (a strategy SUBFOLDER
// carrying a README.md), because a flat file is skipped twice over by the walker and no one-line mutation of it
// changes that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync, readdirSync } from 'node:fs';
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
  // The Notion sync imports the ONE extractor and its libs (board-sinks-and-scrumban D15).
  const here = dirname(fileURLToPath(import.meta.url));
  mkdirSync(join(root, 'scripts', 'lib'));
  writeFileSync(
    join(root, 'scripts', 'roadmap-extract.mjs'),
    readFileSync(join(here, 'roadmap-extract.mjs'))
  );
  // The extractor's whole import closure — every lib module, and the push it imports. A hand-kept list of libs broke
  // this fixture twice as the extractor grew (board-sinks-and-scrumban S1, S3), so the closure is copied, not listed.
  for (const name of readdirSync(join(here, 'lib')).filter(
    (n) => n.endsWith('.mjs') && !n.endsWith('.test.mjs')
  ))
    writeFileSync(join(root, 'scripts', 'lib', name), readFileSync(join(here, 'lib', name)));
  writeFileSync(join(root, 'scripts', 'roadmap-push.mjs'), readFileSync(join(here, 'roadmap-push.mjs')));
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
