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

// landing-frijoles-rebrand · Sprint 1, Story 1.5 (epic D4) — the enclosed-numeral glyphs the
// section dividers used to be built from. They are NOT Extended_Pictographic, so the rule above
// never saw them; they rendered at 12px inside a kraft band and were illegible at the only size a
// text run tolerates. The divider now takes an integer and draws a stamped disc, so any surviving
// glyph is a leftover rather than a choice. Ⓐ-style letters are included because the same
// temptation ("just paste a nicer character") reaches for them next.
const ENCLOSED_ALPHANUMERIC = /[①-⓿㉑-㊿]/u;

// landing-frijoles-rebrand · Sprint 1, Story 1.7 (epic D7) — headings are titles, not sentences.
//
// Scoped to HEADINGS ONLY, and deliberately not to `.takeaway`/`.note`/`.micro`: those are closing
// lines of prose and stripping their stop would leave a fragment. The match is on a heading element
// or a heading class carrying a text child that ends in `.` — so `<h2 className="section-title">Not
// to win it.</h2>` fails and `<p className="takeaway">Now your decisions have receipts.</p>` does
// not.
//
// `!` and `?` are allowed: the infomercial band's "Fix your org in three easy steps!" and §4's
// question headings are titles that legitimately carry terminal punctuation which is not a full
// stop. Only the period reads as "this heading is a sentence".
//
// An ellipsis is allowed too (`…` and `...`): it is a trailing-off, not a sentence end.
//
// Matching is done over the WHOLE source rather than line by line, because both shapes that matter
// here straddle newlines: a heading whose text prettier has wrapped, and a heading whose text comes
// from a `title:` entry in a data array several dozen lines above the JSX that renders it. A
// line-scoped rule would silently pass both — the failure CODE-QUALITY rule 5 calls worse than no
// test.
const HEADING_BLOCK = /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/g;

// ── `title:` in a landing component MEANS "renders as a heading" ──────────────────────────────
// This rule cannot see where a data literal ends up, so it asserts a convention rather than a fact,
// and the convention has to be one the code actually follows or the rule will one day reject a
// legitimate punctuated string. Raised in cross-family review of PR #95, and the answer was to make
// it true: `ProductContextSection`'s release lines — the one place `title:` held body copy — are
// now `headline:`. So in `components/landing`, a `title:` literal is heading text and is held to
// D7; any other key is not looked at. Body content that needs a terminal period uses a different
// key name, and the comment on that array says so.
const TITLE_LITERAL = /\btitle\s*[:=]\s*(?:\{\s*)?(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;

/** True when a heading's visible text ends in a full stop (and not an ellipsis). */
function endsInPeriod(text) {
  const trimmed = text
    // JSX expression containers hold interpolated titles; their literal text is checked where it
    // is declared, not where it is rendered.
    .replace(/\{[\s\S]*?\}/g, '')
    // Entities prettier and this codebase actually use in headings.
    .replace(/&apos;|&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;|&quot;/g, '"')
    .replace(/<[^>]*>/g, ' ')
    .trim();
  if (!trimmed) return false;
  if (trimmed.endsWith('...') || trimmed.endsWith('…')) return false;
  return trimmed.endsWith('.');
}

/** Line number of a character offset, 1-indexed, for a readable violation. */
function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

/**
 * Heading rules (epic D7 + D4). Applied only where `enforceHeadingVoice` is on — i.e. the landing,
 * which is the surface the product owner set this voice for. `/app`'s headings are UI labels
 * written under a different brief and are not swept.
 */
export function inspectHeadings(source) {
  const liveSource = withoutComments(source);
  const violations = [];

  for (const match of liveSource.matchAll(HEADING_BLOCK)) {
    if (endsInPeriod(match[2])) {
      violations.push({
        line: lineOf(liveSource, match.index),
        rule: 'heading-period',
        content: match[0].replace(/\s+/g, ' ').trim().slice(0, 120),
      });
    }
  }

  for (const match of liveSource.matchAll(TITLE_LITERAL)) {
    if (endsInPeriod(match[2])) {
      violations.push({
        line: lineOf(liveSource, match.index),
        rule: 'heading-period',
        content: match[0].replace(/\s+/g, ' ').trim().slice(0, 120),
      });
    }
  }

  return violations;
}

function sourceFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return extname(path) === '.tsx' ? [path] : [];
  });
}

/**
 * Strips comments so a comment ABOUT a retired colour or glyph is not itself a violation — the
 * reason this function exists at all.
 *
 * ── Newlines are preserved, and that is not cosmetic ──────────────────────────────────────────
 * It used to collapse a block comment to the empty string, which shifted every line below it.
 * Since this repo's convention is a long block comment above almost everything, the line number on
 * a violation could be dozens of lines out — and a guard that names the wrong line sends the next
 * person to the wrong code, which is worse than naming no line. Every rule here reports a position
 * derived from this output, so the fix is one place.
 *
 * The line-comment pattern uses `[^\S\n]` where it used to use `\s`. The difference is the
 * newline: `\s` matches it, so a leading-whitespace-then-slash-slash pattern under the `m` flag
 * begins matching at the BLANK LINE above a comment, swallows its newline, and collapses two lines
 * into one — every position below then reports one line early. That was the residue left after the
 * block-comment fix above, and it is the older half of the same bug.
 *
 * (Written without the literal pattern inline, because a JSDoc block cannot contain the two
 * characters that close it — which is how the first attempt at this comment broke the module.)
 *
 * Caught by the second-family reviewer on PR #95, after nine rounds from the first family missed
 * it — which is the argument for routing two families rather than running one twice. Verified by
 * reintroducing a violation and checking the reported line against the file.
 */
export function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => '\n'.repeat((comment.match(/\n/g) ?? []).length))
    .replace(/^[^\S\n]*\/\/.*$/gm, '');
}

export function inspectDesignSource(
  source,
  { disallowInlineStyle = false, enforceHeadingVoice = false } = {}
) {
  const liveSource = withoutComments(source);
  const violations = [];

  liveSource.split('\n').forEach((line, index) => {
    const lineWithoutUrlFragments = line.replace(URL_WITH_HEX_FRAGMENT, '');
    if (PICTOGRAPH.test(line)) {
      violations.push({ line: index + 1, rule: 'ui-pictograph', content: line.trim() });
    }
    if (ENCLOSED_ALPHANUMERIC.test(line)) {
      violations.push({ line: index + 1, rule: 'enclosed-numeral', content: line.trim() });
    }
    if (RAW_HEX.test(lineWithoutUrlFragments)) {
      violations.push({ line: index + 1, rule: 'raw-hex', content: line.trim() });
    }
    if (disallowInlineStyle && INLINE_STYLE.test(line)) {
      violations.push({ line: index + 1, rule: 'landing-inline-style', content: line.trim() });
    }
  });

  if (enforceHeadingVoice) violations.push(...inspectHeadings(source));

  return violations;
}

// app-shell-and-agent-rail · Sprint 1, Story 1.4 — the roots this guard sweeps.
//
// `components/ui` and `components/product` were added because that is where the shell, the rail and
// the stat/funnel primitives land. Until now the guard watched the two directories where drift had
// already happened (the landing page and the app routes) and not the one the app routes were about
// to start importing FROM — so a raw hex or a pictograph could enter the product simply by being
// written one directory over. `components/brand` is deliberately included too: it is imported by
// both roots and has the same exposure.
//
// The INLINE-STYLE rule stays landing-only (see the `disallowInlineStyle` argument below). /app
// needs dynamic bar widths for the funnel, which is a computed geometry, not a colour drifting away
// from the tokens.
const SWEPT_ROOTS = [
  'apps/web/components/landing',
  'apps/web/components/ui',
  'apps/web/components/product',
  'apps/web/components/brand',
  'apps/web/app',
];

export function inspectRepository(root = repoRoot) {
  const landing = join(root, 'apps/web/components/landing');
  const files = SWEPT_ROOTS.flatMap((relativeRoot) => sourceFiles(join(root, relativeRoot)));
  const violations = files.flatMap((path) =>
    inspectDesignSource(readFileSync(path, 'utf8'), {
      disallowInlineStyle: path.startsWith(`${landing}/`),
      enforceHeadingVoice: path.startsWith(`${landing}/`),
    }).map((violation) => ({
      ...violation,
      path: relative(root, path),
    }))
  );

  const globalsPath = join(root, 'apps/web/app/globals.css');
  const globals = readFileSync(globalsPath, 'utf8');

  // landing-frijoles-rebrand · Sprint 3 — the raw-hex rule reaches the STYLESHEET too.
  //
  // It swept .tsx only, so `globals.css` — the one file whose entire job is colour — was the single
  // place in this repo where a hand-picked hex could land unchallenged. One did (`#000` in a
  // pressed-state mix), and it took a human-tier reviewer to catch what a one-line regex catches
  // for free (PR #95). The tokens themselves live in `tokens.css`, which is the byte-mirrored
  // handoff and legitimately full of hex; this file is supposed to consume them.
  //
  // Comments are stripped first for the same reason they are in the .tsx sweep: a comment
  // explaining a retired colour must not itself become a violation.
  const globalsWithoutComments = globals.replace(/\/\*[\s\S]*?\*\//g, '');
  globalsWithoutComments.split('\n').forEach((line, index) => {
    if (RAW_HEX.test(line)) {
      violations.push({
        path: relative(root, globalsPath),
        line: index + 1,
        rule: 'raw-hex',
        content: line.trim(),
      });
    }
  });

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
