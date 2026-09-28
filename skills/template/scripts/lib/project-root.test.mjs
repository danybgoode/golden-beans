import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KIT_PACKAGE_NAME,
  findProjectRoot,
  isInstalled,
  kitRoot,
  ProjectAssetError,
  projectAsset,
  projectRoot,
} from './project-root.mjs';

const tmp = () => realpathSync(mkdtempSync(join(tmpdir(), 'project-root-')));

/** A fake installed kit: <pkg>/package.json names the kit, <pkg>/dist is the script set. */
function fakeKit() {
  const pkg = tmp();
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: KIT_PACKAGE_NAME }));
  mkdirSync(join(pkg, 'dist', 'lib'), { recursive: true });
  return join(pkg, 'dist');
}

test('kitRoot is the directory holding lib/ — the script set itself', () => {
  assert.equal(kitRoot(), join(dirname(fileURLToPath(import.meta.url)), '..'));
});

test('isInstalled: only when the package.json above the set names the kit', () => {
  assert.equal(isInstalled({ root: fakeKit() }), true);
  const other = tmp();
  writeFileSync(join(other, 'package.json'), JSON.stringify({ name: 'some-app' }));
  mkdirSync(join(other, 'scripts'));
  assert.equal(isInstalled({ root: join(other, 'scripts') }), false, 'a project package.json is not the kit');
  const bare = tmp();
  mkdirSync(join(bare, 'scripts'));
  assert.equal(isInstalled({ root: join(bare, 'scripts') }), false, 'no package.json at all');
  const broken = tmp();
  writeFileSync(join(broken, 'package.json'), '{not json');
  mkdirSync(join(broken, 'scripts'));
  assert.equal(
    isInstalled({ root: join(broken, 'scripts') }),
    false,
    'an unparseable package.json is not the kit'
  );
});

test('copied mode: projectRoot is exactly scripts/.. — it never walks from cwd', () => {
  const project = tmp();
  mkdirSync(join(project, 'scripts'));
  const elsewhere = tmp();
  mkdirSync(join(elsewhere, 'Roadmap'));
  assert.equal(
    projectRoot({ env: {}, cwd: elsewhere, root: join(project, 'scripts'), installed: false }),
    project,
    'a Roadmap/ at cwd must not retarget a copied script'
  );
});

test('installed mode: walks up from cwd to the nearest Roadmap/ or .git', () => {
  const repo = tmp();
  mkdirSync(join(repo, 'Roadmap'));
  mkdirSync(join(repo, 'apps', 'web', 'src'), { recursive: true });
  assert.equal(
    projectRoot({ env: {}, cwd: join(repo, 'apps', 'web', 'src'), root: fakeKit(), installed: true }),
    repo
  );

  const gitOnly = tmp();
  mkdirSync(join(gitOnly, '.git'));
  mkdirSync(join(gitOnly, 'sub'));
  assert.equal(
    projectRoot({ env: {}, cwd: join(gitOnly, 'sub'), root: fakeKit(), installed: true }),
    gitOnly
  );
});

test('installed mode: the nearest marker wins over an outer one', () => {
  const outer = tmp();
  mkdirSync(join(outer, '.git'));
  mkdirSync(join(outer, 'inner', 'Roadmap'), { recursive: true });
  assert.equal(findProjectRoot(join(outer, 'inner')), join(outer, 'inner'));
});

test('installed mode: no marker anywhere falls back to cwd', () => {
  const noMarkers = { exists: () => false };
  assert.equal(findProjectRoot('/a/b/c', noMarkers), null);
  assert.equal(
    projectRoot({ env: {}, cwd: '/a/b/c', root: '/x/dist', installed: true, ...noMarkers }),
    '/a/b/c'
  );
});

test('GF_PROJECT_ROOT wins in both modes, resolved against cwd', () => {
  const project = tmp();
  for (const installed of [true, false]) {
    assert.equal(
      projectRoot({ env: { GF_PROJECT_ROOT: project }, cwd: '/', root: '/x/scripts', installed }),
      project
    );
  }
  assert.equal(
    projectRoot({ env: { GF_PROJECT_ROOT: 'rel' }, cwd: '/base', root: '/x/dist', installed: true }),
    '/base/rel'
  );
});

test("projectAsset: the project's own scripts/<rel> overrides the kit default", () => {
  const project = tmp();
  const kit = fakeKit();
  mkdirSync(join(project, 'scripts', 'prose'), { recursive: true });
  writeFileSync(join(project, 'scripts', 'prose', 'cpo-persona.md'), 'ours');
  assert.equal(
    projectAsset('prose/cpo-persona.md', { project, root: kit }),
    join(project, 'scripts', 'prose', 'cpo-persona.md')
  );
  assert.equal(
    projectAsset('prose-lessons.md', { project, root: kit }),
    join(kit, 'prose-lessons.md'),
    'absent → kit default'
  );
});

test('projectAsset in copied mode: both candidates are the same file', () => {
  const project = tmp();
  mkdirSync(join(project, 'scripts'));
  writeFileSync(join(project, 'scripts', 'prose-lessons.md'), 'x');
  const root = join(project, 'scripts');
  assert.equal(projectAsset('prose-lessons.md', { project, root }), join(root, 'prose-lessons.md'));
});

test('projectAsset refuses a project file that is a symlink leaving the project (X20)', () => {
  const project = tmp();
  const outside = tmp();
  writeFileSync(join(outside, 'secret.env'), 'TOKEN=shh');
  mkdirSync(join(project, 'scripts', 'prose'), { recursive: true });
  symlinkSync(join(outside, 'secret.env'), join(project, 'scripts', 'prose', 'cpo-persona.md'));
  assert.throws(() => projectAsset('prose/cpo-persona.md', { project, root: fakeKit() }), ProjectAssetError);
});

test('projectAsset allows a symlink that stays inside the project', () => {
  const project = tmp();
  mkdirSync(join(project, 'scripts', 'prose'), { recursive: true });
  mkdirSync(join(project, 'docs'));
  writeFileSync(join(project, 'docs', 'persona.md'), 'ours');
  symlinkSync(join(project, 'docs', 'persona.md'), join(project, 'scripts', 'prose', 'cpo-persona.md'));
  assert.equal(projectAsset('prose/cpo-persona.md', { project, root: fakeKit() }), join(project, 'docs', 'persona.md'), 'the REAL path is returned (#9: nothing to swap between check and read)');
});
