// build-kit.test.mjs — the kit is the skills' declared closure, and nothing declared may be missing from it.
// Run: node --test scripts/build-kit.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildKit, kitManifest, LEGAL_FILES } from './build-kit.mjs';

function skillsFixture(declarations) {
  const dir = mkdtempSync(join(tmpdir(), 'build-kit-skills-'));
  for (const [skill, files] of Object.entries(declarations)) {
    mkdirSync(join(dir, skill));
    const list = files.map((f) => `  - ${f}`).join('\n');
    writeFileSync(join(dir, skill, 'SKILL.md'), `---\nname: ${skill}\nrequires_scripts:\n${list}\n---\n# ${skill}\n`);
  }
  return dir;
}

function sourceFixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'build-kit-src-'));
  for (const f of files) {
    mkdirSync(join(dir, f, '..'), { recursive: true });
    writeFileSync(join(dir, f), `// ${f}\n`);
  }
  for (const f of LEGAL_FILES) writeFileSync(join(dir, f), `${f}\n`);
  return dir;
}

test('the manifest is the sorted union of every skill’s requires_scripts', () => {
  const skillsDir = skillsFixture({ a: ['x.mjs', 'lib/shared.mjs'], b: ['lib/shared.mjs', 'y.mjs', 'pmo/t.md'] });
  assert.deepEqual(kitManifest({ skillsDir }), ['lib/shared.mjs', 'pmo/t.md', 'x.mjs', 'y.mjs']);
});

test('build copies the closure with its layout intact, plus the license files', () => {
  const manifest = ['x.mjs', 'lib/shared.mjs', 'pmo/templates/t.md'];
  const src = sourceFixture(manifest);
  const kitDir = mkdtempSync(join(tmpdir(), 'build-kit-out-'));
  const { dist } = buildKit({ manifest, sourceDir: src, kitDir, legalDir: src });
  for (const f of [...manifest, ...LEGAL_FILES]) assert.ok(existsSync(join(dist, f)), `missing ${f}`);
  assert.equal(readFileSync(join(dist, 'lib/shared.mjs'), 'utf8'), '// lib/shared.mjs\n');
});

test('a declared file that is absent fails the build, names it, and writes nothing', () => {
  const src = sourceFixture(['x.mjs']);
  const kitDir = mkdtempSync(join(tmpdir(), 'build-kit-out-'));
  assert.throws(
    () => buildKit({ manifest: ['x.mjs', 'lib/gone.mjs'], sourceDir: src, kitDir, legalDir: src }),
    /template\/scripts\/lib\/gone\.mjs/
  );
  assert.equal(existsSync(join(kitDir, 'dist')), false, 'nothing may be written when the closure has a hole');
});

test('a rebuild removes a file that is no longer declared (dist/ is wiped, never merged into)', () => {
  const src = sourceFixture(['x.mjs', 'old.mjs']);
  const kitDir = mkdtempSync(join(tmpdir(), 'build-kit-out-'));
  buildKit({ manifest: ['x.mjs', 'old.mjs'], sourceDir: src, kitDir, legalDir: src });
  buildKit({ manifest: ['x.mjs'], sourceDir: src, kitDir, legalDir: src });
  assert.equal(existsSync(join(kitDir, 'dist', 'old.mjs')), false);
});

test('the real manifest carries the path module every converted script imports', () => {
  assert.ok(kitManifest().includes('lib/project-root.mjs'));
});

test('the S3.2 skeleton is copied into dist/skeleton/, preserving its Roadmap/ layout', () => {
  const manifest = ['x.mjs'];
  const src = sourceFixture(manifest);
  const templateDir = mkdtempSync(join(tmpdir(), 'build-kit-template-'));
  const skeleton = ['Roadmap/README.md', 'Roadmap/00-ideas/seeds/.gitkeep'];
  for (const rel of skeleton) {
    mkdirSync(join(templateDir, rel, '..'), { recursive: true });
    writeFileSync(join(templateDir, rel), `skeleton: ${rel}\n`);
  }
  const kitDir = mkdtempSync(join(tmpdir(), 'build-kit-out-'));
  const { dist } = buildKit({ manifest, sourceDir: src, templateDir, skeleton, kitDir, legalDir: src });
  for (const rel of skeleton) {
    assert.equal(readFileSync(join(dist, 'skeleton', rel), 'utf8'), `skeleton: ${rel}\n`);
  }
});

test('a skeleton file declared but absent from template/ fails the build, names it, writes nothing', () => {
  const manifest = ['x.mjs'];
  const src = sourceFixture(manifest);
  const templateDir = mkdtempSync(join(tmpdir(), 'build-kit-template-'));
  const kitDir = mkdtempSync(join(tmpdir(), 'build-kit-out-'));
  assert.throws(
    () => buildKit({ manifest, sourceDir: src, templateDir, skeleton: ['Roadmap/GONE.md'], kitDir, legalDir: src }),
    /template\/Roadmap\/GONE\.md/
  );
  assert.equal(existsSync(join(kitDir, 'dist')), false, 'nothing may be written when the skeleton has a hole');
});
