#!/usr/bin/env node
// Enforces the approved UI rails where drift previously accumulated fastest.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');

const PICTOGRAPH = /\p{Extended_Pictographic}|[✓★↗↘⚙]/u;
const RAW_HEX = /#[\da-f]{3,8}\b/i;
const INLINE_STYLE = /\bstyle\s*=\s*\{/;
const URL_WITH_HEX_FRAGMENT = /\b(?:href|src)=["'][^"']*#[\da-f]{3,8}["']/gi;

function sourceFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return extname(path) === '.tsx' ? [path] : [];
  });
}

export function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

export function inspectDesignSource(source, { disallowInlineStyle = false } = {}) {
  const liveSource = withoutComments(source);
  const violations = [];

  liveSource.split('\n').forEach((line, index) => {
    const lineWithoutUrlFragments = line.replace(URL_WITH_HEX_FRAGMENT, '');
    if (PICTOGRAPH.test(line)) {
      violations.push({ line: index + 1, rule: 'ui-pictograph', content: line.trim() });
    }
    if (RAW_HEX.test(lineWithoutUrlFragments)) {
      violations.push({ line: index + 1, rule: 'raw-hex', content: line.trim() });
    }
    if (disallowInlineStyle && INLINE_STYLE.test(line)) {
      violations.push({ line: index + 1, rule: 'landing-inline-style', content: line.trim() });
    }
  });

  return violations;
}

export function inspectRepository(root = repoRoot) {
  const landing = join(root, 'apps/web/components/landing');
  const app = join(root, 'apps/web/app');
  const files = [...sourceFiles(landing), ...sourceFiles(app)];
  const violations = files.flatMap((path) =>
    inspectDesignSource(readFileSync(path, 'utf8'), {
      disallowInlineStyle: path.startsWith(`${landing}/`),
    }).map((violation) => ({
      ...violation,
      path: relative(root, path),
    }))
  );

  const globalsPath = join(root, 'apps/web/app/globals.css');
  const globals = readFileSync(globalsPath, 'utf8');
  if (!globals.startsWith("@import '../../../references/design/assets/tokens.css';")) {
    violations.push({
      path: relative(root, globalsPath),
      line: 1,
      rule: 'token-source',
      content: 'globals.css must import the canonical reference token file first',
    });
  }

  const handoffMirrors = [
    [
      'references/golden-beans-design-system-proposal/golden-beans-polish-pass-proposal.html',
      'references/design/polish-pass-proposal.html',
    ],
    ['references/golden-beans-design-system-proposal/ux-guidelines.md', 'references/ux-guidelines.md'],
  ];

  handoffMirrors.forEach(([source, mirror]) => {
    const sourcePath = join(root, source);
    const mirrorPath = join(root, mirror);
    if (!existsSync(sourcePath) || !existsSync(mirrorPath)) {
      violations.push({
        path: mirror,
        line: 1,
        rule: 'handoff-mirror',
        content: `both this file and ${source} must exist`,
      });
    } else if (readFileSync(sourcePath, 'utf8') !== readFileSync(mirrorPath, 'utf8')) {
      violations.push({
        path: mirror,
        line: 1,
        rule: 'handoff-mirror',
        content: `must remain byte-identical to ${source}`,
      });
    }
  });

  return { files: files.length, violations };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = inspectRepository();
  if (result.violations.length === 0) {
    console.log(`✓ design-drift: ${result.files} component files use tokens, primitives, and SVG icons`);
    process.exit(0);
  }

  console.error('✗ design-drift: approved design rails have drifted:\n');
  result.violations.forEach((violation) => {
    console.error(`  ${violation.path}:${violation.line} [${violation.rule}] ${violation.content}`);
  });
  process.exit(1);
}
