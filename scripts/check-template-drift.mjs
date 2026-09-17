#!/usr/bin/env node
// check-template-drift.mjs — the grep-to-zero guard for load-bearing spawn placeholders.
//
// Golden Frijoles was spawned from the dobby-foundation template, which seeds `TEMPLATE FILL-IN`
// placeholders into its load-bearing docs (AGENTS.md, the poster, WAYS-OF-WORKING, the root README).
// Those must all be filled with this project's real shape and STAY filled — an unfilled rules file is
// exactly what lets a high-risk schema/auth epic make decisions against a placeholder
// (see Roadmap/00-ideas/seeds/project-rules-and-poster-hardening.md).
//
// This guard fails (exit 1) if any load-bearing doc still contains a real placeholder. It matches the
// placeholder *syntax* only — `<TEMPLATE FILL-IN…` or `TEMPLATE FILL-IN:` — so an ordinary prose
// mention of the phrase (e.g. the sentence in README.md that explains this very guard, or this
// script's own header) is deliberately NOT a violation. That is the "keep instructional mentions only
// where the guard is explained" carve-out from the seed.
//
// Zero deps — Node 18+. Run: `node scripts/check-template-drift.mjs` (wired as `npm run check:template-drift`).

import { readFileSync } from 'node:fs';
import { parseFillIns, render } from './render-ways-of-working.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

// The load-bearing set: docs an agent treats as source-of-truth at session start. Example/opt-in
// templates (scripts/routines/*, scripts/cross-panel.prompt.md) are meant to be copied-and-filled
// per use, so they are intentionally NOT in this set.
const LOAD_BEARING = [
  'AGENTS.md',
  'README.md',
  'Roadmap/README.md',
  'Roadmap/WAYS-OF-WORKING.md',
  'Roadmap/LEARNINGS.md',
];

// A real, unfilled placeholder always appears in one of these two syntaxes. A bare prose mention of
// the phrase "TEMPLATE FILL-IN" (no colon, no angle bracket) is allowed.
const PLACEHOLDER = /<TEMPLATE FILL-IN|TEMPLATE FILL-IN:/;

const violations = [];
for (const rel of LOAD_BEARING) {
  let text;
  try {
    text = readFileSync(join(repoRoot, rel), 'utf8');
  } catch {
    violations.push({ rel, line: 0, content: '(file missing — expected a load-bearing doc here)' });
    continue;
  }
  text.split('\n').forEach((content, i) => {
    if (PLACEHOLDER.test(content)) violations.push({ rel, line: i + 1, content: content.trim() });
  });
}

// ── Rendered-file drift (ways-of-work-lean-pass S3.5) ─────────────────────────────────────────────
// A filled placeholder is not enough: Roadmap/WAYS-OF-WORKING.md is GENERATED from the vendored template
// plus Roadmap/fill-ins.yml, and a hand edit to the generated file is exactly how the fork this repo had
// for months comes back. So the committed file must equal what the renderer would produce, byte for byte.
{
  const rel = 'Roadmap/WAYS-OF-WORKING.md';
  try {
    const expected = render(
      readFileSync(join(repoRoot, 'Roadmap', 'WAYS-OF-WORKING.template.md'), 'utf8'),
      parseFillIns(readFileSync(join(repoRoot, 'Roadmap', 'fill-ins.yml'), 'utf8'))
    );
    const actual = readFileSync(join(repoRoot, rel), 'utf8');
    if (actual !== expected) {
      const a = actual.split('\n');
      const e = expected.split('\n');
      const at = a.findIndex((line, i) => line !== e[i]);
      violations.push({
        rel,
        line: at + 1,
        content: `DRIFTED from its source (first difference at line ${at + 1}) — edit Roadmap/fill-ins.yml or the template, then run: node scripts/render-ways-of-working.mjs`,
      });
    }
  } catch (err) {
    violations.push({ rel, line: 0, content: `could not render from its source: ${err.message}` });
  }
}

if (violations.length === 0) {
  console.log(`✓ template-drift: ${LOAD_BEARING.length} load-bearing docs clean (no unfilled placeholders).`);
  process.exit(0);
}

console.error(
  '✗ template-drift: load-bearing docs have an unfilled placeholder or have drifted from their source:\n'
);
for (const v of violations) {
  console.error(`  ${v.rel}:${v.line}: ${v.content}`);
}
console.error("\nFill each placeholder with this project's real shape (see the poster-hardening seed).");
process.exit(1);
