import assert from 'node:assert/strict';
import test from 'node:test';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { inspectDesignSource, inspectRepository, withoutComments } from './check-design-drift.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * A throwaway repo with the same shape as this one, so the SWEEP (which roots are walked) can be
 * asserted rather than assumed. Testing `inspectDesignSource` alone would only prove the rules
 * work on a string someone remembered to hand it — the failure this guards against is a directory
 * nobody is looking at, which is invisible from that layer (CODE-QUALITY rule 5: test through the
 * caller).
 */
function scaffoldFixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), 'design-drift-'));
  for (const dir of [
    'apps/web/components/landing',
    'apps/web/components/ui',
    'apps/web/components/product',
    'apps/web/components/brand',
    'apps/web/app',
    'references/design',
    'references/golden-beans-design-system-proposal',
  ]) {
    mkdirSync(join(root, dir), { recursive: true });
  }

  // The two non-sweep assertions inspectRepository also makes. Copied from the real repo so the
  // fixture starts CLEAN — a fixture that was already failing could not prove a new violation.
  cpSync(join(repoRoot, 'apps/web/app/globals.css'), join(root, 'apps/web/app/globals.css'));
  for (const path of [
    'references/golden-beans-design-system-proposal/golden-beans-polish-pass-proposal.html',
    'references/design/polish-pass-proposal.html',
    'references/golden-beans-design-system-proposal/ux-guidelines.md',
    'references/ux-guidelines.md',
  ]) {
    cpSync(join(repoRoot, path), join(root, path));
  }

  return root;
}

test('comments may explain retired pictographs without making them UI', () => {
  const source = `// replaced ✅ with Badge\n{/* ⚙ was the old tool marker */}\n<Badge status="live">LIVE</Badge>`;
  assert.equal(withoutComments(source).includes('✅'), false);
  assert.deepEqual(inspectDesignSource(source), []);
});

test('rendered pictographs, raw hex and landing inline styles are rejected', () => {
  const source = `<span style={{ color: '#fff' }}>✅ live</span>`;
  assert.deepEqual(
    inspectDesignSource(source, { disallowInlineStyle: true }).map((finding) => finding.rule),
    ['ui-pictograph', 'raw-hex', 'landing-inline-style']
  );
});

test('multi-line and computed style props cannot bypass the landing rail', () => {
  const source = `<div\n  style={\n    dynamicStyle\n  }\n/>`;
  assert.deepEqual(
    inspectDesignSource(source, { disallowInlineStyle: true }).map((finding) => finding.rule),
    ['landing-inline-style']
  );
});

test('URL fragments that happen to look hexadecimal are not colors', () => {
  const source = `<><a href="#dead">Jump</a><a href="/proof#c001">Proof</a></>`;
  assert.deepEqual(inspectDesignSource(source), []);
});

test('token classes and accessible icon components are accepted', () => {
  const source = `<Badge status="live"><Icon name="check" />LIVE</Badge>`;
  assert.deepEqual(inspectDesignSource(source, { disallowInlineStyle: true }), []);
});

test('the sweep covers the shared component directories, not only landing and app', (t) => {
  const root = scaffoldFixtureRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  assert.deepEqual(inspectRepository(root).violations, [], 'the fixture must start clean');

  // Story 1.4's acceptance, literally: a deliberate raw hex in components/ui fails the guard.
  writeFileSync(join(root, 'apps/web/components/ui/Drifted.tsx'), `<b className="x">#ff0000</b>\n`);
  // ...and the sibling directory the shell itself lives in.
  writeFileSync(join(root, 'apps/web/components/product/Drifted.tsx'), `<b>⚙ settings</b>\n`);

  const found = inspectRepository(root).violations;
  assert.deepEqual(found.map((violation) => `${violation.path} ${violation.rule}`).sort(), [
    'apps/web/components/product/Drifted.tsx ui-pictograph',
    'apps/web/components/ui/Drifted.tsx raw-hex',
  ]);
});

test('the inline-style ban stays landing-only, so /app can compute a bar width', (t) => {
  const root = scaffoldFixtureRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const dynamicWidth = `<div style={{ width: \`\${pct}%\` }} />\n`;
  writeFileSync(join(root, 'apps/web/components/ui/Bar.tsx'), dynamicWidth);
  writeFileSync(join(root, 'apps/web/components/landing/Bar.tsx'), dynamicWidth);

  assert.deepEqual(
    inspectRepository(root).violations.map((violation) => violation.path),
    ['apps/web/components/landing/Bar.tsx']
  );
});
