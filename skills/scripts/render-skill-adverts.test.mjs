// Tests for render-skill-adverts.mjs — the advertised skill list is generated, never hand-kept.
// Run: node --test scripts/render-skill-adverts.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { chmodSync } from 'node:fs';
import {
  END,
  KIT_END,
  renderKitBlock,
  spliceKitBlock,
  loadSkills,
  parseSkillHeader,
  renderAll,
  renderReadmeBlock,
  spliceReadme,
} from './render-skill-adverts.mjs';

const skill = (name, summary) => `---\nname: ${name}\nsummary: "${summary}"\ndescription: >\n  long\n---\n\n# ${name}\n`;
const MARKETPLACE = JSON.stringify({ name: 'm', plugins: [{ name: 'golden-frijoles', source: './x', description: 'hand-kept' }] }, null, 2);
const PLUGIN = JSON.stringify({ name: 'golden-frijoles', description: 'hand-kept' }, null, 2);
const README = `# r\n\n<!-- skills:start -->\nold list\n${END}\n\ntail\n`;

function skillsDir(entries) {
  const dir = mkdtempSync(join(tmpdir(), 'adverts-'));
  for (const [name, summary] of entries) {
    mkdirSync(join(dir, name));
    writeFileSync(join(dir, name, 'SKILL.md'), skill(name, summary));
  }
  mkdirSync(join(dir, 'not-a-skill')); // a directory with no SKILL.md is not advertised
  return dir;
}

test('parseSkillHeader reads name + quoted summary, and refuses a skill with no summary', () => {
  assert.deepEqual(parseSkillHeader(skill('a', 'Does: a thing')), { name: 'a', summary: 'Does: a thing' });
  assert.throws(() => parseSkillHeader('---\nname: a\n---\n', 'a/SKILL.md'), /a\/SKILL\.md: no summary/);
  // YAML single quotes are unquoted too ('' is the escaped quote) — cross-review finding on PR #20.
  assert.equal(parseSkillHeader("---\nname: a\nsummary: 'It''s: fine'\n---\n").summary, "It's: fine");
  assert.deepEqual(parseSkillHeader('---\r\nname: a\r\nsummary: "x"\r\n---\r\n'), { name: 'a', summary: 'x' });
});

test('smoke step 9 — a NEW skill directory appears in every advert without touching the advert files', () => {
  const before = renderAll({ skills: loadSkills(skillsDir([['alpha', 'A.']])), marketplaceText: MARKETPLACE, pluginText: PLUGIN, readmeText: README });
  const after = renderAll({
    skills: loadSkills(skillsDir([['alpha', 'A.'], ['beta', 'B.']])),
    marketplaceText: MARKETPLACE,
    pluginText: PLUGIN,
    readmeText: README,
  });
  for (const text of Object.values(before)) assert.doesNotMatch(text, /beta/);
  for (const text of Object.values(after)) assert.match(text, /beta/);
});

test('a hand-kept description is replaced wholesale, and the README outside the markers is untouched', () => {
  const out = Object.values(renderAll({ skills: [{ name: 'alpha', summary: 'A.' }], marketplaceText: MARKETPLACE, pluginText: PLUGIN, readmeText: README }));
  for (const text of out) assert.doesNotMatch(text, /hand-kept|old list/);
  const readme = out.find((t) => t.startsWith('# r'));
  assert.ok(readme.startsWith('# r\n\n<!-- skills:start'));
  assert.ok(readme.endsWith(`${END}\n\ntail\n`));
});

test('a skill whose name does not match its directory fails loudly', () => {
  const dir = mkdtempSync(join(tmpdir(), 'adverts-'));
  mkdirSync(join(dir, 'alpha'));
  writeFileSync(join(dir, 'alpha', 'SKILL.md'), skill('alfa', 'typo'));
  assert.throws(() => loadSkills(dir), /does not match its directory/);
});

test('missing README markers throw instead of silently passing --check', () => {
  assert.throws(() => spliceReadme('# no markers\n', renderReadmeBlock([])), /markers are missing/);
});

test('the committed adverts are current — the same assertion CI makes with --check', () => {
  const root = new URL('..', import.meta.url).pathname;
  const files = {
    marketplace: join(root, '.claude-plugin', 'marketplace.json'),
    plugin: join(root, 'plugins', 'golden-frijoles', '.claude-plugin', 'plugin.json'),
    readme: join(root, 'README.md'),
  };
  const out = renderAll({
    skills: loadSkills(join(root, 'plugins', 'golden-frijoles', 'skills')),
    marketplaceText: readFileSync(files.marketplace, 'utf8'),
    pluginText: readFileSync(files.plugin, 'utf8'),
    readmeText: readFileSync(files.readme, 'utf8'),
  });
  for (const [path, text] of Object.entries(out)) assert.equal(text, readFileSync(path, 'utf8'), `${path} is stale`);
  // …and it lists exactly the skill directories that exist.
  const dirs = readdirSync(join(root, 'plugins', 'golden-frijoles', 'skills'))
    .filter((d) => existsSync(join(root, 'plugins', 'golden-frijoles', 'skills', d, 'SKILL.md')));
  const plugin = JSON.parse(readFileSync(files.plugin, 'utf8'));
  for (const d of dirs) assert.match(plugin.description, new RegExp(`\\b${d}\\b`));
});

// ── The kit run rule (golden-frijoles-plugin D3 / S2.4) ─────────────────────────────────────────────

const wrapping = (name, markers = true) =>
  `---\nname: ${name}\nsummary: "s"\nrequires_scripts:\n  - ${name}.mjs\n---\n\n# ${name}\n\n` +
  (markers ? `<!-- kit:start -->\n${KIT_END}\n\n` : '') +
  `Run \`node scripts/${name}.mjs --dry-run\`.\n`;

test('the kit block is stamped with plugin.json\'s version, into every skill that wraps scripts', () => {
  const plugin = JSON.stringify({ name: 'golden-frijoles', version: '9.8.7' });
  const out = renderAll({
    skills: [{ name: 'a', summary: 's' }],
    marketplaceText: MARKETPLACE,
    pluginText: plugin,
    readmeText: `x\n<!-- skills:start -->\n${END}\n`,
    skillTexts: { '/a/SKILL.md': wrapping('a'), '/b/SKILL.md': skill('b', 'no scripts') },
  });
  assert.match(out['/a/SKILL.md'], /npx -y @golden-frijoles\/kit@9\.8\.7 <name> <args>/);
  assert.equal(out['/b/SKILL.md'], undefined, 'a skill with no requires_scripts gets no run rule');
});

test('a script-wrapping skill with no kit markers is refused, never silently skipped', () => {
  assert.throws(() => spliceKitBlock(wrapping('a', false), renderKitBlock('1.0.0'), 'a/SKILL.md'), /kit:start/);
});

test('re-rendering the block is a no-op (idempotent)', () => {
  const once = spliceKitBlock(wrapping('a'), renderKitBlock('1.0.0'));
  assert.equal(spliceKitBlock(once, renderKitBlock('1.0.0')), once);
});

/** Pull the literal shell line out of the rendered block and bind <name>/<args>, exactly as an agent would. */
function ruleFor(version, name, args) {
  const line = renderKitBlock(version).split('\n').find((l) => l.includes('if [ -f scripts/'));
  return line.replace(/^> `/, '').replace(/`$/, '').replaceAll('<name>', name).replaceAll('<args>', args);
}

function project({ local }) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-rule-'));
  const bin = join(dir, 'fakebin');
  mkdirSync(bin);
  // A fake npx records its argv, so the test sees exactly what the rule would ask the registry for.
  writeFileSync(join(bin, 'npx'), '#!/bin/sh\necho "KIT $*"\n');
  chmodSync(join(bin, 'npx'), 0o755);
  if (local) {
    mkdirSync(join(dir, 'scripts'));
    writeFileSync(join(dir, 'scripts', 'build-order.mjs'), 'console.log("LOCAL " + process.argv.slice(2).join(" "));\n');
  }
  return { dir, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } };
}

test('the rule runs the project\'s own copy when it has one — and never the kit', () => {
  const { dir, env } = project({ local: true });
  const r = spawnSync('sh', ['-c', ruleFor('0.2.0', 'build-order', '--check')], { cwd: dir, env, encoding: 'utf8' });
  assert.equal(r.stdout.trim(), 'LOCAL --check');
});

test('without a local copy the rule asks npx for exactly the pinned kit, the script and its args', () => {
  const { dir, env } = project({ local: false });
  const r = spawnSync('sh', ['-c', ruleFor('0.2.0', 'build-order', '--check')], { cwd: dir, env, encoding: 'utf8' });
  assert.equal(r.stdout.trim(), 'KIT -y @golden-frijoles/kit@0.2.0 build-order --check');
});
