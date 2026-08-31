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

// ── design-system-rails · Sprint 1, Story 1.3 (epic D3) — the `font:` SHORTHAND ───────────────
//
// ⚠️ This story was REWRITTEN at the architecture lock, and the reason belongs here because the
// next person will read the audit before they read this file. As scaffolded it said "extend the
// guard to `components/ui` and `components/product`, the two directories the audit named (§10.5)
// as its blind spot". `SWEPT_ROOTS` has contained both since `app-shell-and-agent-rail` S1.4 —
// the audit's gap was closed before this epic was written. Building the story as scaffolded would
// have produced a no-op diff and a green tick on work nobody did (epic README, D11-1).
//
// What the guard genuinely did not have is these three rules, all of them about the ONE directory
// this epic creates.
//
// The `font:` shorthand resets family, weight, style, size, line-height AND variant. So an override
// that restates only `font-size` silently leaves the other five at the shorthand's values — which
// is a real defect this repo has already paid for (LEARNINGS: "A `font:` SHORTHAND resets family,
// weight and style"). Scoped to `design-system/*.css`, where a longhand is always available and the
// whole point of the directory is that a value is a choice from a scale.
//
// The global keywords are allowed: `font: inherit` on a form control is the idiomatic reset and
// resets nothing to a surprise.
const FONT_SHORTHAND_GLOBAL = /(?:^|[;{}])\s*font\s*:\s*(?!\s*(?:inherit|initial|unset|revert)\b)/gm;

// A class selector inside `design-system/*.css` that is neither `.ds` nor `ds-`-prefixed (epic D3).
// Landing rules reached the console through shared class names — `.tag`, `.note` — three times in
// ONE epic, and `.row` is declared by two stylesheets in this repo right now. Namespacing is what
// makes that unrepresentable rather than merely unlikely.
//
// State goes on an attribute (`[data-state]`, `aria-current`) or on a `ds-`-prefixed class. A bare
// `.is-active` is exactly the kind of word two stylesheets both want.
const CLASS_IN_SELECTOR = /\.(-?[A-Za-z_][\w-]*)/g;

// `url(#…)` in a stylesheet is an SVG reference — a gradient, a filter, a clip path — and never a
// colour. The `.tsx` sweep has stripped href/src hex fragments since the landing epic; this is the
// stylesheet's equivalent.
// A whole CSS declaration — `property: value;` — however many lines it spans.
const DECLARATION = /(?:^|[;{}])\s*([-\w]+)\s*:\s*([^;{}]*)/gm;
const QUOTED_STRING = /(['"])(?:\\.|(?!\1)[^\\])*\1/g;

const URL_FRAGMENT_IN_CSS = /url\(\s*['"]?#[^)'"]*['"]?\s*\)/gi;

// A literal colour that is not a hex. `raw-hex` was the only colour rule, so `rgb(232 185 60)`,
// `hsl(43 80% 57%)` and a bare `red` all passed in a hand-written design-system stylesheet — in a
// directory whose stated premise is that "a value is a choice from a scale" (fresh reviewer).
//
// `color-mix()` and `rgb(from var(--gold) …)` are DERIVATIONS of a token, not hand-picked values,
// and `globals.css` already uses the first to build its kraft surfaces — so a function whose
// arguments reach a `var()` is allowed. What is refused is a number nobody can trace to the scale.
// `color()` was missing, which let `color(display-p3 0.9 0.2 0.1)` through a rule whose test is
// titled "whatever notation it is written in" (fresh reviewer, round 2).
const LITERAL_COLOR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(([^)]*)\)/gi;

// A colour function whose arguments reach a token is a DERIVATION of the scale — that is what
// `color-mix()` and relative colour syntax are for, and `globals.css` builds its two kraft surfaces
// with `color-mix(in srgb, var(--kraft) 55%, white)` for exactly that reason. The `white` in there
// is an ingredient of a derivation, not a hand-picked value, so the whole call is removed before
// the literal checks run. Without this the rule fired on the one idiom the repo already uses to
// stay on the scale — which is how a guard gets switched off instead of fixed.
const DERIVED_COLOR_CALL =
  /\b(?:color-mix|rgba?|hsla?|hwb|lab|lch|oklab|oklch|light-dark)\([^)]*var\([^)]*\)[^)]*\)/gi;
// ⚠️ The FULL CSS named-colour set, plus the system colours.
//
// This listed 22 names, under a test titled "whatever notation it is written in" — so `crimson`,
// `tomato`, `indigo`, `firebrick` and about 125 others walked straight through, as did
// `ButtonText` and `Canvas` (fresh reviewer, round 2). A rule that catches `red` and not `crimson`
// is a rule that teaches people which hand-picked colours are allowed.
const CSS_NAMED_COLORS = [
  'aliceblue',
  'antiquewhite',
  'aqua',
  'aquamarine',
  'azure',
  'beige',
  'bisque',
  'black',
  'blanchedalmond',
  'blue',
  'blueviolet',
  'brown',
  'burlywood',
  'cadetblue',
  'chartreuse',
  'chocolate',
  'coral',
  'cornflowerblue',
  'cornsilk',
  'crimson',
  'cyan',
  'darkblue',
  'darkcyan',
  'darkgoldenrod',
  'darkgray',
  'darkgreen',
  'darkgrey',
  'darkkhaki',
  'darkmagenta',
  'darkolivegreen',
  'darkorange',
  'darkorchid',
  'darkred',
  'darksalmon',
  'darkseagreen',
  'darkslateblue',
  'darkslategray',
  'darkslategrey',
  'darkturquoise',
  'darkviolet',
  'deeppink',
  'deepskyblue',
  'dimgray',
  'dimgrey',
  'dodgerblue',
  'firebrick',
  'floralwhite',
  'forestgreen',
  'fuchsia',
  'gainsboro',
  'ghostwhite',
  'gold',
  'goldenrod',
  'gray',
  'green',
  'greenyellow',
  'grey',
  'honeydew',
  'hotpink',
  'indianred',
  'indigo',
  'ivory',
  'khaki',
  'lavender',
  'lavenderblush',
  'lawngreen',
  'lemonchiffon',
  'lightblue',
  'lightcoral',
  'lightcyan',
  'lightgoldenrodyellow',
  'lightgray',
  'lightgreen',
  'lightgrey',
  'lightpink',
  'lightsalmon',
  'lightseagreen',
  'lightskyblue',
  'lightslategray',
  'lightslategrey',
  'lightsteelblue',
  'lightyellow',
  'lime',
  'limegreen',
  'linen',
  'magenta',
  'maroon',
  'mediumaquamarine',
  'mediumblue',
  'mediumorchid',
  'mediumpurple',
  'mediumseagreen',
  'mediumslateblue',
  'mediumspringgreen',
  'mediumturquoise',
  'mediumvioletred',
  'midnightblue',
  'mintcream',
  'mistyrose',
  'moccasin',
  'navajowhite',
  'navy',
  'oldlace',
  'olive',
  'olivedrab',
  'orange',
  'orangered',
  'orchid',
  'palegoldenrod',
  'palegreen',
  'paleturquoise',
  'palevioletred',
  'papayawhip',
  'peachpuff',
  'peru',
  'pink',
  'plum',
  'powderblue',
  'purple',
  'rebeccapurple',
  'red',
  'rosybrown',
  'royalblue',
  'saddlebrown',
  'salmon',
  'sandybrown',
  'seagreen',
  'seashell',
  'sienna',
  'silver',
  'skyblue',
  'slateblue',
  'slategray',
  'slategrey',
  'snow',
  'springgreen',
  'steelblue',
  'tan',
  'teal',
  'thistle',
  'tomato',
  'turquoise',
  'violet',
  'wheat',
  'white',
  'whitesmoke',
  'yellow',
  'yellowgreen',
  // System colours resolve to a UA palette, which is no more part of the scale than a hex is.
  'ButtonText',
  'ButtonFace',
  'ButtonBorder',
  'Canvas',
  'CanvasText',
  'Field',
  'FieldText',
  'Highlight',
  'HighlightText',
  'LinkText',
  'VisitedText',
  'ActiveText',
  'GrayText',
  'Mark',
  'MarkText',
  'AccentColor',
  'AccentColorText',
  'SelectedItem',
  'SelectedItemText',
];
const NAMED_COLORS = new RegExp(`(?:^|[\\s:,(])(?:${CSS_NAMED_COLORS.join('|')})(?=[\\s;,)]|$)`, 'i');
const NAMESPACE = 'ds';

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

/**
 * The selector lists of a stylesheet — the text before each `{` that is not an at-rule prelude.
 *
 * Not a CSS parser and does not need to be: it needs to know which words in this file are class
 * names. At-rule preludes are skipped because `@media (min-width: 900px)` and `@keyframes ds-blink`
 * contain no class selectors, and treating a keyframe NAME as a class would reject
 * `@keyframes ds-blink` for not being prefixed — which it is, and which would be a confusing thing
 * to be told.
 */
export function selectorLists(source) {
  const lists = [];
  const live = withoutComments(source);
  let start = 0;
  for (let index = 0; index < live.length; index += 1) {
    const char = live[index];
    if (char === '{' || char === '}' || char === ';') {
      const chunk = live.slice(start, index);
      if (char === '{' && !chunk.trim().startsWith('@')) {
        lists.push({ text: chunk, index: start });
      }
      start = index + 1;
    }
  }
  return lists;
}

/**
 * The three rules that apply to a HAND-WRITTEN design-system stylesheet.
 *
 * `generated` exempts `tokens.css` and `reference.css`, and the exemption is narrow on purpose:
 * those two files exist to carry the approved prototype's LITERAL values — a token file whose job
 * is to define `--gold: #e8b93c` cannot be told to use a token for it, and `reference.css` is the
 * prototype's stylesheet verbatim so that a port can be diffed against its source. Every other
 * stylesheet in that directory consumes them.
 */
export function inspectDesignSystemStylesheet(source, { generated = false } = {}) {
  const violations = [];
  if (generated) return violations;

  const live = withoutComments(source);

  // ⚠️ The `font:` rule is matched over the WHOLE source, not line by line (fresh reviewer). A
  // declaration wrapped by a formatter — `font\n  : 14px/1.2 Archivo;` — slipped a line-scoped
  // regex entirely, and this repo's own prettier config wraps long declarations. Same reasoning as
  // `HEADING_BLOCK` above, which is matched over the whole file for exactly this class of miss.
  // ⚠️ Declarations are scanned over the WHOLE source, for the same reason the `font:` rule is —
  // and this rule was written line-scoped in the SAME round that fixed `font:` for exactly this
  // (fresh reviewer, round 2: "fixed the instance, not the class"). Prettier wraps long
  // declarations, and `box-shadow:\n  0 1px 2px rgb(0 0 0 / .2),\n  0 2px 4px red;` walked through
  // a line-scoped check — in a directory where every hand-written stylesheet is prettier-formatted.
  //
  // Quoted strings are blanked first: `content: "in the red "` is prose, not a colour, the same way
  // an attribute selector's contents are not class names.
  for (const declaration of live.replace(QUOTED_STRING, '""').matchAll(DECLARATION)) {
    const value = declaration[2]
      .replace(URL_FRAGMENT_IN_CSS, 'url()')
      // Derivations are removed BEFORE the literal checks, so their ingredients are not read as
      // hand-picked values — `color-mix(in srgb, var(--kraft) 55%, white)` is how globals.css
      // already stays on the scale.
      .replace(DERIVED_COLOR_CALL, 'derived()');
    let literalColor = NAMED_COLORS.test(value);
    for (const call of value.matchAll(LITERAL_COLOR_FUNCTION)) {
      if (!call[1].includes('var(')) literalColor = true;
    }
    if (literalColor) {
      violations.push({
        line: lineOf(live, declaration.index),
        rule: 'literal-color',
        content: declaration[0].split('\n').join(' ').trim().slice(0, 100),
      });
    }
  }

  for (const match of live.matchAll(FONT_SHORTHAND_GLOBAL)) {
    violations.push({
      line: lineOf(live, match.index),
      rule: 'font-shorthand',
      content: live
        .slice(match.index, match.index + 60)
        .split('\n')
        .join(' ')
        .trim(),
    });
  }

  live.split('\n').forEach((line, index) => {
    // ⚠️ `url(#…)` is an SVG REFERENCE, not a colour — `fill: url(#ds-bar-gradient)`. The `.tsx`
    // sweep has stripped href/src hex fragments since the landing epic; the stylesheet sweep was
    // written without that and flagged `url(#abcdef)` as a raw hex. This is not hypothetical
    // housekeeping: Sprint 5's charts are hand-rolled SVG on the token set (epic D7) and will
    // reference gradients and clip paths exactly this way. Found by stress-testing this rule
    // against inputs the unit tests did not cover, before a builder hit it.
    //
    // Only the FRAGMENT is removed, so `background: url(#ds-grad) #ff0000` still reports the hex.
    const withoutSvgRefs = line.replace(URL_FRAGMENT_IN_CSS, 'url()');
    if (RAW_HEX.test(withoutSvgRefs)) {
      violations.push({ line: index + 1, rule: 'raw-hex', content: line.trim() });
    }

    // Only a declaration VALUE can hold a colour; a selector cannot, and `.ds-gold` should not be
    // read as the named colour `gold`.
  });

  for (const list of selectorLists(source)) {
    // ⚠️ An ATTRIBUTE VALUE can contain a dot — `[data-x="a.b"]`, `[href=".."]` — and the class
    // pattern read it as a class name, so a correctly-namespaced selector was reported as a
    // namespace violation. Attribute selectors are how this design system expresses STATE
    // (`[aria-current="page"]`, `[data-state]`), which is the rule's own recommendation, so the
    // rule would have fired most often on exactly the markup it asks for.
    //
    // Blanked rather than deleted so the offsets — and therefore the reported line numbers — are
    // unchanged. Nothing inside `[…]` is ever a class selector, so nothing is hidden.
    const selectors = list.text.replace(/\[[^\]]*\]/g, (attribute) => ' '.repeat(attribute.length));
    for (const match of selectors.matchAll(CLASS_IN_SELECTOR)) {
      const name = match[1];
      if (name === NAMESPACE || name.startsWith(`${NAMESPACE}-`)) continue;
      violations.push({
        line: lineOf(live, list.index + match.index),
        rule: 'namespace',
        content: `.${name} — design-system classes are \`.${NAMESPACE}\` or \`${NAMESPACE}-\`-prefixed (epic D3)`,
      });
    }
  }

  return violations;
}

export function sourceFiles(root) {
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
 * Every `.css` file under a root, recursively. The `.tsx` sweep's twin — including its loudness.
 *
 * A missing root throws for the same reason `sourceFiles` does: returning `[]` makes a renamed or
 * mistyped directory read as "nothing to report", which is this guard reporting success about a
 * surface it never opened (CODE-QUALITY #5b).
 *
 * ⚠️ **Through `inspectRepository` this throw is currently UNREACHABLE, and that is worth saying
 * rather than leaving for the next reader to discover.** `DESIGN_SYSTEM_ROOT` is in `SWEPT_ROOTS`
 * too, and the `.tsx` walk runs first — so a missing directory throws from `sourceFiles`, with
 * `sourceFiles`' message. A reviewer proposed asserting this function's message through the
 * repository walker and it cannot be observed there (fresh reviewer, round 2, and the round before
 * it proved the version WITHOUT this throw was equally green for the same reason).
 *
 * It is kept, and exported so its behaviour can be pinned directly, because the two root lists are
 * separate by design: the moment a stylesheet root exists that is not also a `.tsx` root, this is
 * the only thing standing between a typo and a silently-unswept directory.
 */
export function stylesheetFiles(root) {
  if (!existsSync(root)) {
    throw new Error(
      `check-design-drift: stylesheet root ${root} does not exist. ` +
        'A missing root silently sweeps nothing — add the directory or remove it from the sweep.'
    );
  }
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return stylesheetFiles(path);
    return extname(path) === '.css' ? [path] : [];
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
/** Where the design system lives. One string, because four places name it. */
export const DESIGN_SYSTEM_ROOT = 'apps/web/design-system';

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
  // design-system-rails · Sprint 1, Story 1.3 — the one directory this epic creates, and the only
  // swept-root gap that was actually open (epic README, D11-1). Its `.tsx` primitives are held to
  // the same pictograph/raw-hex rules as everything else; its `.css` files get the three rules
  // above, swept separately because this list walks `.tsx` only.
  DESIGN_SYSTEM_ROOT,
];

/**
 * The two files in `design-system/` that are GENERATED from the approved prototype and therefore
 * exempt from the raw-hex rule.
 *
 * Exempt by NAME, not by a "looks generated" heuristic: a header comment is something anyone can
 * write, and an exemption anyone can claim is not an exemption. `tokens.css` is the file whose
 * whole job is to define `--gold: #e8b93c` — it cannot be told to use a token for it — and
 * `reference.css` is the prototype's stylesheet verbatim, so that a port can be diffed against its
 * source forever. Every other stylesheet in that directory consumes them.
 */
export const GENERATED_STYLESHEETS = ['tokens.css', 'reference.css'];

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

  // design-system-rails · Story 1.3. The stylesheet sweep used to be `globals.css` alone, for raw
  // hex alone. `apps/web/design-system/` is where every product style now lives, so it is swept for
  // all three of the rules above — and, unlike the `.tsx` sweep, it walks `.css`.
  //
  // The two GENERATED files are exempt by name rather than by pattern: an exemption keyed on
  // "looks generated" is an exemption anyone can claim by writing the right header comment.
  // ⚠️ NO `existsSync` guard, and that is deliberate — it had one, and it was the exact inverse of
  // `sourceFiles()` 190 lines above, which THROWS with a written rationale ("A swept root that does
  // not exist must be LOUD, not empty"). The guard made a missing directory sweep nothing quietly.
  // It was masked only because `DESIGN_SYSTEM_ROOT` is also in `SWEPT_ROOTS` and the `.tsx` sweep
  // throws first — so the loudness depended on statement order inside this function (fresh
  // reviewer). `stylesheetFiles` now throws for itself, with the same message shape.
  const designSystemRoot = join(root, DESIGN_SYSTEM_ROOT);
  for (const path of stylesheetFiles(designSystemRoot)) {
    const name = relative(designSystemRoot, path);
    violations.push(
      ...inspectDesignSystemStylesheet(readFileSync(path, 'utf8'), {
        generated: GENERATED_STYLESHEETS.includes(name),
      }).map((violation) => ({ ...violation, path: relative(root, path) }))
    );
  }

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
