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
// glyph is a leftover rather than a choice.
//
// The ranges are written as escapes rather than as literal characters, so this line is legible in a
// terminal and greppable. They cover Enclosed Alphanumerics (U+2460–24FF — the circled digits and
// Ⓐ-style letters, because "just paste a nicer character" reaches for those next), the Dingbat
// circled digits (U+2776–2793) and Enclosed CJK (U+3251–32BF). The Dingbat block was missing and is
// the most likely substitute for a banned glyph — ❶ and ➀ render almost identically to ①.
//
// The reviewer who found the gap gave the range as U+278A–2793 / U+2780–2789. That is the sans-serif
// pair and it omits the ORIGINAL negative circled digits at U+2776–277F — which is where ❶ actually
// lives. The gap was real and the codepoints were not, so the range here is the union, and the unit
// test asserts each GLYPH rather than the range it is supposed to be in. A test written against a
// claimed range would have passed while ❶ still got through. (PR #95.)
const ENCLOSED_ALPHANUMERIC = /[\u2460-\u24FF\u2776-\u2793\u3251-\u32BF]/u;

// landing-frijoles-rebrand · Sprint 1, Story 1.7 (epic D7) — headings are titles, not sentences.
//
// Scoped to HEADINGS ONLY, and deliberately not to `.takeaway`/`.note`/`.micro`: those are closing
// lines of prose and stripping their stop would leave a fragment.
//
// Two things are matched, and NEITHER is a class: an `<h1>`–`<h6>` ELEMENT, and a `title` literal
// (see below). An earlier version of this comment said "a heading element or a heading class",
// which `HEADING_BLOCK` has never done — a comment describing behaviour the regex does not have
// (CODE-QUALITY.md #3), caught by the second-family reviewer on PR #95. In practice every
// `.section-title`/`.card-title` in this codebase sits ON an `h2`/`h3`, so the element match
// reaches them; a `<div className="section-title">` would not be checked, and if one is ever
// written the right fix is to make it a heading, not to widen this regex.
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
//
// `title:` (an object key) always counts. `title=` counts only on a COMPONENT — a tag whose name
// starts uppercase, like `<SectionDivider title="Pricing" />`, where the prop genuinely renders as
// a heading. On a lowercase HTML tag, `title=` is the tooltip attribute — `<abbr title="For
// example.">` is microcopy, not a heading, and holding it to the no-terminal-period rule would be a
// false positive on correct markup. The two cases are told apart by what precedes the attribute in
// the same tag, which is why this is applied per opening tag rather than over the whole file.
// Raised by the second-family reviewer on PR #95.
//
// The key may be quoted — `'title':` and `"title":` are the same declaration as `title:`, and a
// regex that only accepts the bare form lets a data array opt out of the rule by adding quotes.
const TITLE_KEY = /(?:\btitle|['"]title['"])\s*:\s*(?:\{\s*)?(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
const TITLE_PROP = /\btitle\s*=\s*(?:\{\s*)?(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
const COMPONENT_TAG_OPEN = /<([A-Z][\w.]*)\b/g;

/**
 * The attribute text of each component opening tag, with its offset.
 *
 * Scanned rather than regex-matched. The regex form used `[^>'"]` for the attribute run, which
 * stops dead at the first `>` inside a prop expression — an arrow function, a `size > 0`, a nested
 * `icon={<Icon />}` — and silently truncates every prop after it, including a `title=` that should
 * have been checked. A guard that stops looking halfway through a tag is worse than one that does
 * not look at all, because it reports success. Caught by the second-family reviewer on PR #95.
 *
 * So it tracks the two things that make a `>` something other than a tag terminator: string quotes
 * and JSX expression braces. It is not a JSX parser and does not need to be — it needs to know where one
 * opening tag ends.
 */
function componentTags(source) {
  const tags = [];
  for (const open of source.matchAll(COMPONENT_TAG_OPEN)) {
    let depth = 0;
    let quote = null;
    let index = open.index + open[0].length;
    for (; index < source.length; index += 1) {
      const char = source[index];
      if (quote) {
        if (char === '\\') index += 1;
        else if (char === quote) quote = null;
        continue;
      }
      if (char === "'" || char === '"' || char === '`') quote = char;
      else if (char === '{') depth += 1;
      else if (char === '}') depth -= 1;
      else if (char === '>' && depth === 0) break;
    }
    tags.push({
      name: open[1],
      index: open.index,
      attributes: source.slice(open.index + open[0].length, index),
    });
  }
  return tags;
}

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
  // A heading may be wrapped in quotes — this codebase writes them as `&ldquo;`/`&rdquo;` entities,
  // normalised to `"` above. Without peeling them the final character is the quote, not the stop,
  // so `“Not to win it.”` sailed through the rule that exists to catch exactly that sentence.
  // Peeled from the END only: a stray opening quote is not what decides whether a heading is a
  // sentence. Caught by the second-family reviewer on PR #95.
  const unquoted = trimmed.replace(/["'”’»›]+$/u, '').trim();
  if (!unquoted) return false;
  if (unquoted.endsWith('...') || unquoted.endsWith('…')) return false;
  return unquoted.endsWith('.');
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

  for (const match of liveSource.matchAll(TITLE_KEY)) {
    if (endsInPeriod(match[2])) {
      violations.push({
        line: lineOf(liveSource, match.index),
        rule: 'heading-period',
        content: match[0].replace(/\s+/g, ' ').trim().slice(0, 120),
      });
    }
  }

  // `title=` only where the tag is a component. The reported line is the TAG's, which is where a
  // reader has to go to fix it.
  for (const tag of componentTags(liveSource)) {
    for (const prop of tag.attributes.matchAll(TITLE_PROP)) {
      if (endsInPeriod(prop[2])) {
        violations.push({
          line: lineOf(liveSource, tag.index),
          rule: 'heading-period',
          content: `<${tag.name} … ${prop[0]}`.replace(/\s+/g, ' ').trim().slice(0, 120),
        });
      }
    }
  }

  return violations;
}

function sourceFiles(root) {
  // A swept root that does not exist must be LOUD, not empty. Returning `[]` would make a typo in
  // `SWEPT_ROOTS` — or a directory someone renamed — read as "nothing to report", which is this
  // guard reporting success about a surface it never opened (CODE-QUALITY #5b). The raw ENOENT
  // stack trace technically failed too; it just did not say which root or why it mattered.
  if (!existsSync(root)) {
    throw new Error(
      `check-design-drift: swept root ${root} does not exist. ` +
        'Add the directory or remove it from SWEPT_ROOTS — a missing root silently sweeps nothing.'
    );
  }
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
  return (
    source
      .replace(/\/\*[\s\S]*?\*\//g, (comment) => '\n'.repeat((comment.match(/\n/g) ?? []).length))
      .replace(/^[^\S\n]*\/\/.*$/gm, '')
      // ── Trailing comments too, but never a URL ─────────────────────────────────────────────
      // `const c = token; // replacing #000` used to keep its hex and false-positive. Stripping
      // from the slashes to end-of-line fixes that, and does a worse thing if done naively: every
      // `https://` in this codebase — the GitHub link, the prompt routes, the connector docs —
      // would lose everything after the protocol, hiding any real violation later on that line. A
      // false NEGATIVE in a drift guard is far worse than a false positive, because it fails
      // quietly.
      //
      // The lookbehind is what separates the two: a protocol is preceded by `:`, a comment is
      // preceded by whitespace or the end of a statement. Raised twice by the second-family
      // reviewer on PR #95 — the first time it was triaged on the URL risk, which was the right
      // concern and the wrong conclusion, since the risk is avoidable rather than inherent.
      .replace(/(?<![:\w])\/\/.*$/gm, '')
  );
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

  // `liveSource`, not `source`: `inspectHeadings` strips comments itself, so passing the raw text
  // did the same regex work twice. Harmless, but two call sites deriving the same value is how they
  // stop agreeing — and `withoutComments` is idempotent, so `inspectHeadings` stays safe for a
  // direct caller (the unit tests are one). Raised by the second-family reviewer on PR #95.
  if (enforceHeadingVoice) violations.push(...inspectHeadings(liveSource));

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
export const SWEPT_ROOTS = [
  'apps/web/components/landing',
  'apps/web/components/ui',
  'apps/web/components/product',
  'apps/web/components/brand',
  // methodology-experience · Sprint 2 — the methodology's rendering primitives live in
  // `components/methodology`, not inline in the route files, and this is one of the two reasons
  // why (the other is that Sprint 3's work-block family needs a home). `apps/web/app` below is
  // already swept for raw hex and pictographs, but the HEADING-VOICE and INLINE-STYLE rules were
  // landing-only — so the largest new public reading surface in the product would have been
  // exempt from both while the epic's own docs cited `heading-period` as the reason its chapter
  // titles carry no full stop. A guard cited by a decision it does not actually cover is the
  // "guard that cannot fail" class (CODE-QUALITY #5b).
  'apps/web/components/methodology',
  'apps/web/app',
];

/**
 * Roots held to the LANDING's stricter two rules — headings are titles rather than sentences, and
 * no inline `style=` where a token belongs.
 *
 * Not all of `apps/web/app`: the product routes need computed geometry (the funnel's bar widths),
 * which is why the inline-style rule was landing-only to begin with. `/methodology` needs none —
 * epic D1 puts every value in `globals.css` resolving from tokens — and it is public brand surface
 * in the same voice as `/`.
 */
export const VOICE_AND_STYLE_ROOTS = [
  'apps/web/components/landing',
  'apps/web/components/methodology',
  'apps/web/app/methodology',
];

export function inspectRepository(root = repoRoot) {
  const strictRoots = VOICE_AND_STYLE_ROOTS.map((relativeRoot) => `${join(root, relativeRoot)}/`);
  const isStrict = (path) => strictRoots.some((prefix) => path.startsWith(prefix));
  const files = SWEPT_ROOTS.flatMap((relativeRoot) => sourceFiles(join(root, relativeRoot)));
  const violations = files.flatMap((path) =>
    inspectDesignSource(readFileSync(path, 'utf8'), {
      disallowInlineStyle: isStrict(path),
      enforceHeadingVoice: isStrict(path),
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
  // Stripped through the SHARED helper, not a local copy of its regex. The first version inlined
  // `globals.replace(/\/\*[\s\S]*?\*\//g, '')` here — a second implementation of a job
  // `withoutComments` already does (CODE-QUALITY.md #1), and it carried the exact newline-eating
  // bug that was being fixed in the shared one at the same time, so `globals.css` violations
  // reported a line number offset by every block comment above them. Two things that must agree get
  // one implementation, not two that currently match (#2). Caught by the second-family reviewer on
  // PR #95, in the same pass that found the original.
  const globalsWithoutComments = withoutComments(globals);
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
