#!/usr/bin/env node
// extract-css.mjs — lift the APPROVED prototype's stylesheet into files the product imports.
//
// ── Why the prototype is the source and not the destination ───────────────────────────────────
// `APPROVED.md` records the approval as `console-prototype.html`'s content hash. Editing that file
// to make it import a stylesheet would change the hash, and a changed hash with no new approval
// line means **the design is unapproved** — that file exists to prevent exactly that move. So the
// flow runs the other way: the prototype stays byte-for-byte as Daniel approved it, and everything
// the product consumes is GENERATED from it. "One definition" then holds by construction instead
// of by discipline (epic README, D2, amended 2026-08-29).
//
// Two outputs:
//   reference.css — the whole <style> block, verbatim. A builder ports from real CSS, never from a
//                   prose description of it.
//   tokens.css    — the `:root` custom properties, re-scoped onto `.ds` (epic README, D3).
//   tokens.ts     — the same names as a closed union, so a DELETED token breaks `tsc` at every
//                   TypeScript consumer rather than rendering as nothing at paint time.
//
//   node apps/web/design-system/extract-css.mjs            # regenerate
//   node apps/web/design-system/extract-css.mjs --check    # CI: regenerate and fail on any diff
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));
const PROTOTYPE = 'console-prototype.html';

// The scope roots the token block is declared on. `.ds` is the design system's own; `.is-console`
// is the transitional alias ProductShell already sets — see the comment emitted into tokens.css.
export const SCOPE_SELECTORS = ['.ds', '.is-console'];

// ── The ONE transformation applied on the way out, and why it is not a silent edit ─────────────
//
// Two reasons these two declarations genuinely cannot be copied through, and both matter.
//
// 1. `next/font` generates a hashed family name at build time and exposes it as `--font-sans` /
//    `--font-mono` on `<html>`. A static prototype opened from `file://` has no such variable and
//    must name the family literally.
// 2. **The values below are what the console resolves TODAY** — they are
//    `references/design/assets/tokens.css`'s, which `.is-console` inherited because it never
//    declared these two. Sprint 1's contract is that no product pixel moves, so the generated file
//    must reproduce the resolved stack exactly rather than adopt the prototype's slightly longer
//    fallback tail (`-apple-system`, `'Segoe UI'`). Both stacks begin with the same next/font
//    family, so the difference is unreachable in practice — which is precisely why it would have
//    been an invisible change smuggled in by a refactor. Unifying the tails is a Sprint 2 decision
//    with a visible diff, not a side effect of moving a token file.
//
// It is a TABLE rather than a `.replace()` in the middle of the pipeline so that `tokens.test.ts`
// can assert the exact set: the only permitted differences between the prototype's `:root` and the
// generated `tokens.css` are the keys of this object. A transformation nothing can enumerate is
// indistinguishable from a bug.
export const FONT_STACK_OVERRIDES = {
  '--sans': 'var(--font-sans),Archivo,system-ui,sans-serif',
  '--mono': "var(--font-mono),'IBM Plex Mono',ui-monospace,Menlo,monospace",
};

const HEADER = (what) => `/* ${what}
 *
 * ⚠️ GENERATED — DO NOT HAND-EDIT. Regenerate with:
 *     node apps/web/design-system/extract-css.mjs
 * CI runs \`--check\` and fails on any diff, so a hand-edit is reverted rather than argued about.
 *
 * Source: apps/web/design-system/${PROTOTYPE} — the 32 states approved 2026-08-29 (APPROVED.md).
 */
`;

/** The prototype's single `<style>` block. Throws loudly rather than emitting an empty file. */
export function readPrototypeStyle(root = HERE) {
  const source = readFileSync(join(root, PROTOTYPE), 'utf8');
  const blocks = [...source.matchAll(/<style>([\s\S]*?)<\/style>/g)];
  // An empty result and a multi-block result are both "I do not know what the stylesheet is", and
  // the dangerous one is the first: it would write a valid, empty file that every consumer accepts.
  if (blocks.length !== 1) {
    throw new Error(
      `extract-css: expected exactly one <style> block in ${PROTOTYPE}, found ${blocks.length}`
    );
  }
  return blocks[0][1].trim();
}

/** The `:root` declarations, in source order, as `[name, value]`. */
export function readTokens(style) {
  const root = /:root\s*\{([\s\S]*?)\}/.exec(style)?.[1];
  if (!root) throw new Error('extract-css: no :root block in the prototype stylesheet');
  return [...root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]);
}

export function buildTokensCss(tokens) {
  const lines = tokens.map(([name, value]) => {
    const override = FONT_STACK_OVERRIDES[name];
    if (override === undefined) return `  ${name}: ${value};`;
    return `  /* Not the prototype's literal stack \u2014 next/font's build-time family, and the value the\n     console already resolves. See FONT_STACK_OVERRIDES. */\n  ${name}: ${override};`;
  });
  return `${HEADER('tokens.css \u2014 the product design system\u2019s token set')}
/* Scoped to a CLASS, not \`:root\`, and that is the whole point of D3.
 *
 * \`references/design/assets/tokens.css\` owns \`:root\` for the landing and is imported first by
 * globals.css. Several of these names collide with it, and ONE collides with a different VALUE:
 * \`--roast-2\` is #221b13 on the landing and #1c1710 here, and both are on screen today. Declaring
 * the product set on a class means the console gets its value without the landing losing its own \u2014
 * landing rules reached the console through shared names three times in one epic, and this is the
 * mechanism that stops it.
 *
 * \u2500\u2500 Why TWO selectors \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
 * \`.ds\` is the design system's scope root. \`.is-console\` is a TRANSITIONAL ALIAS: it is what
 * \`ProductShell\` already sets, and \`console.css\` declared this same token block against it.
 * Listing both here is what lets Sprint 1 delete that duplicate block while changing **no product
 * pixel** \u2014 the console keeps resolving exactly the values it resolves today, from one declaration
 * instead of two. The alias is retired in Sprint 6 with the rest of the old world. Until then, one
 * definition under two names beats two definitions that currently happen to agree. */
${SCOPE_SELECTORS.join(',\n')} {
${lines.join('\n')}
}
`;
}

export function buildTokensTs(tokens) {
  const names = tokens.map(([name]) => name);
  return `${HEADER('tokens.ts — the token names, as a closed union')}
/* The compile-time half of D2. A CSS custom property cannot fail a build — an undefined \`var()\`
 * renders as nothing at paint time — so this module is what makes DELETING a token break its
 * TypeScript consumers, and \`tokens.test.ts\` is what makes it break its CSS consumers. Stated
 * plainly: a raw \`var(--typo)\` typed into a stylesheet is still not compile-checked. The test is
 * the honest half of that criterion. */

export const DESIGN_TOKENS = [
${names.map((name) => `  '${name}',`).join('\n')}
] as const

export type DesignToken = (typeof DESIGN_TOKENS)[number]

/** \`token('--gold')\` — a \`var()\` reference the compiler checks. */
export function token(name: DesignToken): string {
  return \`var(\${name})\`
}
`;
}

export function buildReferenceCss(style) {
  return `${HEADER('reference.css — the approved prototype’s stylesheet, VERBATIM')}
/* Class names here are the PROTOTYPE's. Port from this file, never from a prose description of it;
 * where this and the measured spec disagree, MEASURED-SPEC.md wins. */

${style}
`;
}

export function generate(root = HERE) {
  const style = readPrototypeStyle(root);
  const tokens = readTokens(style);
  return {
    'reference.css': buildReferenceCss(style),
    'tokens.css': buildTokensCss(tokens),
    'tokens.ts': buildTokensTs(tokens),
  };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes('--check');
  const files = generate();
  let drifted = 0;
  for (const [name, content] of Object.entries(files)) {
    const path = join(HERE, name);
    if (check) {
      let onDisk = null;
      try {
        onDisk = readFileSync(path, 'utf8');
      } catch {
        onDisk = null;
      }
      if (onDisk !== content) {
        console.error(
          `✗ ${relative(process.cwd(), path)} is ${onDisk === null ? 'missing' : 'out of date'} — run: node apps/web/design-system/extract-css.mjs`
        );
        drifted += 1;
      }
      continue;
    }
    writeFileSync(path, content);
    console.log(`  + ${relative(process.cwd(), path)} (${content.split('\n').length} lines)`);
  }
  if (check && drifted > 0) process.exit(1);
  console.log(check ? '✓ extract-css: generated files match the approved prototype' : '');
}
