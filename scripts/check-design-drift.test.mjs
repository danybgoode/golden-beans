import assert from 'node:assert/strict';
import test from 'node:test';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  DESIGN_SYSTEM_ROOT,
  GENERATED_STYLESHEETS,
  SWEPT_ROOTS,
  VOICE_AND_STYLE_ROOTS,
  inspectDesignSource,
  inspectDesignSystemStylesheet,
  inspectRepository,
  selectorLists,
  withoutComments,
} from './check-design-drift.mjs';

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
  // DERIVED from the guard's own roots, not a second list beside them. It was a hand-copied
  // duplicate, and the moment a root was added the fixture stopped having the same shape as the
  // repo — which is the one property this whole fixture exists to provide (CODE-QUALITY #2).
  for (const dir of [
    ...SWEPT_ROOTS,
    ...VOICE_AND_STYLE_ROOTS,
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

// methodology-experience · Sprint 2 — this used to read "stays landing-only". The strict pair
// (inline style, heading voice) now also covers the methodology's public reading surface, and the
// product routes still keep their computed geometry. The policy moved deliberately; the test moved
// with it rather than being deleted.
test('the inline-style ban covers the brand surfaces, so /app can still compute a bar width', (t) => {
  const root = scaffoldFixtureRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const dynamicWidth = `<div style={{ width: \`\${pct}%\` }} />\n`;
  writeFileSync(join(root, 'apps/web/components/ui/Bar.tsx'), dynamicWidth);
  writeFileSync(join(root, 'apps/web/components/landing/Bar.tsx'), dynamicWidth);
  writeFileSync(join(root, 'apps/web/components/methodology/Bar.tsx'), dynamicWidth);
  writeFileSync(join(root, 'apps/web/app/methodology/Bar.tsx'), dynamicWidth);
  // The reason the ban is not simply repo-wide: the funnel's bars are computed geometry.
  writeFileSync(join(root, 'apps/web/app/Bar.tsx'), dynamicWidth);

  assert.deepEqual(
    inspectRepository(root)
      .violations.map((violation) => violation.path)
      .sort(),
    [
      'apps/web/app/methodology/Bar.tsx',
      'apps/web/components/landing/Bar.tsx',
      'apps/web/components/methodology/Bar.tsx',
    ]
  );
});

// ── landing-frijoles-rebrand · Sprint 1, Stories 1.5 and 1.7 ────────────────────────────────────

test('enclosed numerals are rejected wherever the sweep reaches', () => {
  // Not Extended_Pictographic, so the original PICTOGRAPH rule never saw them — which is how ten
  // of them lived in the section dividers through a whole epic.
  const source = `<SectionDivider number="①" title="Everyone has a good reason" />`;
  assert.deepEqual(
    inspectDesignSource(source).map((finding) => finding.rule),
    ['enclosed-numeral']
  );
});

test('a landing heading may not end in a full stop, and a sentence still may', () => {
  const heading = `<h2 className="section-title">Not to win it.</h2>`;
  assert.deepEqual(
    inspectDesignSource(heading, { enforceHeadingVoice: true }).map((finding) => finding.rule),
    ['heading-period']
  );

  // `.takeaway` / `.note` / `.micro` are closing lines of prose (epic D7). Stripping their stop
  // would leave a fragment, so the rule must not reach them.
  const prose = `<p className="takeaway">Now your decisions have receipts.</p>`;
  assert.deepEqual(inspectDesignSource(prose, { enforceHeadingVoice: true }), []);
});

test('the heading rule survives the two shapes that straddle newlines', () => {
  // 1. A heading prettier has wrapped. A line-scoped rule sees "enough opinions.</em>" on its own
  //    line with no heading tag in sight, and passes.
  const wrapped = `<h1 className="display">\n  Your roadmap has\n  <br />\n  <em className="foil">enough opinions.</em>\n</h1>`;
  assert.deepEqual(
    inspectDesignSource(wrapped, { enforceHeadingVoice: true }).map((finding) => finding.rule),
    ['heading-period']
  );

  // 2. A title declared in a data array dozens of lines above the <h3> that renders it.
  const dataTitle = `const steps = [\n  { title: 'Give it a North Star.', copy: 'x' },\n]`;
  assert.deepEqual(
    inspectDesignSource(dataTitle, { enforceHeadingVoice: true }).map((finding) => finding.rule),
    ['heading-period']
  );
});

test('a heading may end in ? ! or an ellipsis — only the full stop reads as a sentence', () => {
  const allowed = [
    `<h2 className="section-title">Fix your org in three easy steps!</h2>`,
    `<h3 className="card-title">What if Black Friday actually works?</h3>`,
    `<h3 className="card-title">Percolating…</h3>`,
    `<h3 className="card-title">Still deciding...</h3>`,
  ];
  for (const source of allowed) {
    assert.deepEqual(inspectDesignSource(source, { enforceHeadingVoice: true }), [], source);
  }
});

// methodology-experience · Sprint 2 — renamed from "…on the landing and nowhere else", which
// stopped being true when the methodology's public reading surface joined the strict pair. A test
// whose NAME states the old policy is the CODE-QUALITY #3 defect wearing a green tick: it passed
// against the new behaviour purely because it never wrote a file where the policy had changed.
test('the heading voice is enforced on the brand surfaces, not on product UI labels', (t) => {
  const root = scaffoldFixtureRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const heading = `<h2 className="section-title">Your agent finally has product context.</h2>\n`;
  writeFileSync(join(root, 'apps/web/components/landing/Titled.tsx'), heading);
  writeFileSync(join(root, 'apps/web/components/methodology/Titled.tsx'), heading);
  writeFileSync(join(root, 'apps/web/app/methodology/Titled.tsx'), heading);
  // /app's headings are UI labels written under a different brief, and stay exempt.
  writeFileSync(join(root, 'apps/web/components/ui/Titled.tsx'), heading);
  writeFileSync(join(root, 'apps/web/app/Titled.tsx'), heading);

  assert.deepEqual(
    inspectRepository(root)
      .violations.map((violation) => `${violation.path} ${violation.rule}`)
      .sort(),
    [
      'apps/web/app/methodology/Titled.tsx heading-period',
      'apps/web/components/landing/Titled.tsx heading-period',
      'apps/web/components/methodology/Titled.tsx heading-period',
    ]
  );
});

test('a raw hex in globals.css is a violation, and a comment about one is not', (t) => {
  const root = scaffoldFixtureRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const globalsPath = join(root, 'apps/web/app/globals.css');
  const clean = readFileSync(globalsPath, 'utf8');
  assert.deepEqual(inspectRepository(root).violations, [], 'the fixture must start clean');

  // The real defect this closes: globals.css was the ONE file whose job is colour and the one
  // place the raw-hex rule did not reach.
  writeFileSync(globalsPath, `${clean}\n.pressed {\n  background: #000;\n}\n`);
  assert.deepEqual(
    inspectRepository(root).violations.map((violation) => `${violation.path} ${violation.rule}`),
    ['apps/web/app/globals.css raw-hex']
  );

  // ...but a comment explaining a colour that was REMOVED must not itself fail, or the rule
  // punishes writing down why.
  writeFileSync(globalsPath, `${clean}\n/* was #000, now a token */\n.pressed {\n  background: black;\n}\n`);
  assert.deepEqual(inspectRepository(root).violations, []);
});

test('a violation is reported at the line it actually occupies', () => {
  // A guard that names the wrong line sends the next person to the wrong code, which is worse than
  // naming no line — and this repo's convention is a long block comment above almost everything, so
  // the drift was dozens of lines on a real file.
  //
  // TWO bugs, one symptom. `withoutComments` collapsed a block comment to the empty string
  // (dropping every one of its newlines), and its line-comment pattern led with `\s*`, which
  // matches a newline and so swallowed the blank line ABOVE each comment. Both are fixed; this
  // pins the outcome rather than either mechanism.
  const source = [
    '/**', // 1
    ' * A block comment', // 2
    ' * spanning several lines,', // 3
    ' * as almost everything here does.', // 4
    ' */', // 5
    '', // 6  ← the blank line the `\s*` pattern used to eat
    '// a line comment', // 7
    '<h2 className="section-title">Ends in a period.</h2>', // 8
  ].join('\n');

  const [violation] = inspectDesignSource(source, { enforceHeadingVoice: true });
  assert.equal(violation.rule, 'heading-period');
  assert.equal(violation.line, 8, 'the heading is on line 8 of the source as written');
});

test('a globals.css violation is reported at the line it actually occupies', () => {
  // Same property as the .tsx case above, asserted separately because `globals.css` is checked by
  // its own code path in `inspectRepository` — and that path had its own copy of the
  // comment-stripping regex, carrying the same newline bug. It calls the shared helper now; this is
  // what proves the two agree rather than merely currently matching.
  const root = scaffoldFixtureRepo();
  try {
    const globalsPath = join(root, 'apps/web/app/globals.css');
    const clean = readFileSync(globalsPath, 'utf8');
    const cleanLines = clean.split('\n').length;

    writeFileSync(
      globalsPath,
      `${clean}\n/* a block comment\n   spanning\n   four\n   lines */\n.pressed {\n  background: #000;\n}\n`
    );

    const [violation] = inspectRepository(root).violations.filter((v) => v.rule === 'raw-hex');
    // clean ends with a newline, so its last line is empty: the appended block starts there.
    const expected = cleanLines + 6;
    assert.equal(violation.line, expected, `raw hex sits on line ${expected} of the file as written`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a quoted heading cannot hide its full stop behind the closing quote', () => {
  // `endsWith('.')` looked at the LAST character, which for a quoted heading is the quote. So the
  // rule silently passed the exact sentence it exists to catch. Second-family reviewer, PR #95.
  for (const source of [
    `<h2 className="section-title">&ldquo;Not to win it.&rdquo;</h2>`,
    `<h2 className="section-title">"Not to win it."</h2>`,
    `const s = [{ title: '“Give it a North Star.”' }]`,
  ]) {
    assert.deepEqual(
      inspectDesignSource(source, { enforceHeadingVoice: true }).map((f) => f.rule),
      ['heading-period'],
      source
    );
  }

  // ...and a quoted heading WITHOUT a stop is still fine.
  assert.deepEqual(
    inspectDesignSource(`<h2 className="section-title">&ldquo;Not to win it&rdquo;</h2>`, {
      enforceHeadingVoice: true,
    }),
    []
  );
});

test('title= is a heading on a component and a tooltip on an HTML tag', () => {
  // `<SectionDivider title="…" />` renders a heading; `<abbr title="…">` is microcopy. Holding the
  // second to the no-terminal-period rule is a false positive on correct markup.
  assert.deepEqual(
    inspectDesignSource(`<SectionDivider number={5} title="Less coordination. More of it." />`, {
      enforceHeadingVoice: true,
    }).map((f) => f.rule),
    ['heading-period']
  );

  for (const source of [
    `<abbr title="For example.">e.g.</abbr>`,
    `<button title="Click for details.">Go</button>`,
  ]) {
    assert.deepEqual(inspectDesignSource(source, { enforceHeadingVoice: true }), [], source);
  }
});

test('dingbat circled digits are refused like their Enclosed Alphanumeric twins', () => {
  // ❶ and ➀ render almost identically to ① and are the obvious substitute for a banned glyph.
  for (const glyph of ['①', '❶', '➀', 'Ⓐ']) {
    assert.deepEqual(
      inspectDesignSource(`<span className="num">${glyph}</span>`).map((f) => f.rule),
      ['enclosed-numeral'],
      glyph
    );
  }
});

test('a title= after a prop containing > is still checked', () => {
  // The regex form used `[^>'"]` for the attribute run, so it stopped at the first `>` inside a
  // prop expression and silently dropped every prop after it. A guard that stops looking halfway
  // through a tag reports success, which is the worst failure mode it has. Second-family reviewer,
  // PR #95.
  const sources = [
    `<SectionDivider render={(x) => x} title="Ends in a period." />`,
    `<SectionDivider icon={<Icon name="star" />} title="Ends in a period." />`,
    `<Panel show={count > 0} title="Ends in a period." />`,
  ];
  for (const source of sources) {
    assert.deepEqual(
      inspectDesignSource(source, { enforceHeadingVoice: true }).map((f) => f.rule),
      ['heading-period'],
      source
    );
  }
});

test('a quoted object key is the same declaration as a bare one', () => {
  assert.deepEqual(
    inspectDesignSource(`const s = [{ 'title': 'Give it a North Star.' }]`, {
      enforceHeadingVoice: true,
    }).map((f) => f.rule),
    ['heading-period']
  );
});

test('a trailing comment is stripped, and a URL is not', () => {
  // Stripping to end-of-line from `//` fixes the false positive on an explanatory comment, and
  // introduces a false NEGATIVE on every line containing a protocol if done without the lookbehind
  // — which is much worse, because it fails quietly.
  assert.deepEqual(inspectDesignSource(`const c = token; // replacing #000`), []);

  // The URL survives, so a real violation later on the same line is still seen.
  assert.deepEqual(
    inspectDesignSource(`<a href="https://github.com/x">#ff0000</a>`).map((f) => f.rule),
    ['raw-hex']
  );
});

// ── design-system-rails · Sprint 1, Story 1.3 — the three rules the design system needed ───────
//
// Written through `inspectRepository` wherever the property is about WHICH FILES are looked at,
// and through `inspectDesignSystemStylesheet` where it is about the rule itself. The distinction
// matters: the defect this story exists to prevent is a directory nobody sweeps, and that is
// invisible from the rule layer (CODE-QUALITY rule 5 — test through the caller).

test('the design system directory is swept, and its two generated files are exempt', (t) => {
  const root = scaffoldFixtureRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(inspectRepository(root).violations, [], 'the fixture must start clean');

  const dir = join(root, DESIGN_SYSTEM_ROOT);

  // A hand-written stylesheet must consume tokens.
  writeFileSync(join(dir, 'panel.css'), '.ds-panel {\n  background: #241d14;\n}\n');
  assert.deepEqual(
    inspectRepository(root).violations.map((violation) => `${violation.path} ${violation.rule}`),
    [`${DESIGN_SYSTEM_ROOT}/panel.css raw-hex`]
  );
  writeFileSync(join(dir, 'panel.css'), '.ds-panel {\n  background: var(--card);\n}\n');
  assert.deepEqual(inspectRepository(root).violations, []);

  // ...and the GENERATED files, whose entire job is to carry the prototype's literal values, are
  // not. An exemption that did not exist would make the token file itself unlandable.
  for (const name of GENERATED_STYLESHEETS) {
    writeFileSync(join(dir, name), '.ds {\n  --gold: #e8b93c;\n}\n');
  }
  assert.deepEqual(
    inspectRepository(root).violations,
    [],
    'the generated token and reference stylesheets carry literal colours by design'
  );
});

test('a `font:` shorthand is refused, and the global keywords are not', () => {
  // The shorthand resets family, weight, style, line-height and variant as well as size, so an
  // override that restates only `font-size` leaves the other five at the shorthand's values. This
  // repo has already paid for that once (LEARNINGS).
  const shorthand = inspectDesignSystemStylesheet('.ds-x {\n  font: 600 13px/1.4 var(--sans);\n}\n');
  assert.deepEqual(
    shorthand.map((violation) => violation.rule),
    ['font-shorthand']
  );

  // `font: inherit` on a form control is the idiomatic reset and resets nothing to a surprise.
  for (const keyword of ['inherit', 'initial', 'unset', 'revert']) {
    assert.deepEqual(
      inspectDesignSystemStylesheet(`.ds-x {\n  font: ${keyword};\n}\n`),
      [],
      `font: ${keyword} is a reset, not a shorthand that silently sets five other properties`
    );
  }

  // The longhand it is supposed to be replaced by must obviously still pass.
  assert.deepEqual(
    inspectDesignSystemStylesheet('.ds-x {\n  font-size: 13px;\n  font-weight: 600;\n}\n'),
    []
  );
});

test('a design-system class must be namespaced, and an at-rule prelude is not a selector', () => {
  assert.deepEqual(
    inspectDesignSystemStylesheet('.ds-rail {\n  color: var(--dim);\n}\n'),
    [],
    'a prefixed class is the whole point'
  );
  assert.deepEqual(inspectDesignSystemStylesheet('.ds {\n  color: var(--dim);\n}\n'), []);

  // The exact accident this rule exists to stop: `.tag`, `.note` and `.row` are each declared by
  // more than one stylesheet in this repo's history, and landing rules reached the console through
  // them three times in one epic.
  assert.deepEqual(
    inspectDesignSystemStylesheet('.tag {\n  color: var(--dim);\n}\n').map((v) => v.rule),
    ['namespace']
  );

  // A bare state class is exactly the kind of word two stylesheets both want.
  assert.deepEqual(
    inspectDesignSystemStylesheet('.ds-rail.is-active {\n  color: var(--gold);\n}\n').map((v) => v.rule),
    ['namespace']
  );

  // ...but an attribute is how state is expressed here, and carries no class to collide.
  assert.deepEqual(
    inspectDesignSystemStylesheet('.ds-rail[aria-current="page"] {\n  color: var(--gold);\n}\n'),
    []
  );

  // `@media (min-width: 900px)` and `@keyframes ds-blink` contain no class selectors. Treating a
  // keyframe NAME as a class would reject `@keyframes ds-blink` for not being prefixed — which it
  // is, which would be a confusing thing to be told.
  assert.deepEqual(
    inspectDesignSystemStylesheet(
      '@media (min-width: 900px) {\n  .ds-rail {\n    width: 236px;\n  }\n}\n@keyframes ds-blink {\n  to {\n    opacity: 0;\n  }\n}\n'
    ),
    []
  );
});

test('a design-system stylesheet violation is reported at the line it occupies', () => {
  // Same property the globals.css rule already pins, for the same reason: a guard that names the
  // wrong line sends the next person to the wrong code. This repo's convention is a long block
  // comment above almost everything, so the drift is not one or two lines.
  const source = [
    '/* A block comment',
    '   spanning',
    '   several lines. */',
    '.ds-panel {',
    '  background: #241d14;',
    '}',
  ].join('\n');
  const [violation] = inspectDesignSystemStylesheet(source);
  assert.equal(violation.rule, 'raw-hex');
  assert.equal(violation.line, 5);
});

test('selectorLists ignores braces that are not rule openers', () => {
  assert.deepEqual(
    selectorLists('.ds-a,\n.ds-b {\n  color: red;\n}\n').map((list) => list.text.trim()),
    ['.ds-a,\n.ds-b']
  );
  assert.deepEqual(
    selectorLists('@import "x.css";\n@media screen {\n  .ds-a {\n    color: red;\n  }\n}\n').map((l) =>
      l.text.trim()
    ),
    ['.ds-a']
  );
});

test('an SVG url(#…) reference is not a colour, and a real hex beside it still is', () => {
  // ⚠️ Sprint 5's charting primitives are hand-rolled SVG on the token set (epic D7), so
  // `fill: url(#ds-bar-gradient)` is about to appear all over this directory. The rule flagged it as
  // a raw hex — a false positive on the exact markup the epic is going to write, which is how a
  // guard gets switched off rather than fixed. Found by stress-testing the rule against inputs the
  // tests did not cover, before a builder hit it.
  assert.deepEqual(inspectDesignSystemStylesheet('.ds-a {\n  fill: url(#abcdef);\n}\n'), []);
  assert.deepEqual(inspectDesignSystemStylesheet(".ds-a {\n  fill: url('#abcdef');\n}\n"), []);

  // Only the FRAGMENT is removed, so a genuine colour on the same line still reports. A fix that
  // blanked the whole declaration would have traded a false positive for a false negative, which is
  // the strictly worse direction for a drift guard.
  assert.deepEqual(
    inspectDesignSystemStylesheet('.ds-a {\n  fill: url(#abcdef);\n  color: #ff0000;\n}\n').map(
      (v) => v.rule
    ),
    ['raw-hex']
  );
});

test('a dot inside an attribute selector is not a class name', () => {
  // ⚠️ The fixtures below use `var(--gold)`, not `red`. They used `red` as innocuous filler until
  // the `literal-color` rule landed and correctly flagged it — a test fixture that quietly becomes
  // a violation of a NEW rule is how a selector test starts failing for a value reason.
  // `[data-x="a.b"]`, `[href=".."]`. The class pattern read the dot as a class and reported a
  // correctly-namespaced selector as a namespace violation — and attribute selectors are how this
  // design system expresses STATE (`[aria-current="page"]`), which is what the namespace rule's own
  // message recommends. The rule would have fired most often on exactly the markup it asks for.
  assert.deepEqual(inspectDesignSystemStylesheet('.ds-a[data-x="a.b"] {\n  color: var(--gold);\n}\n'), []);
  assert.deepEqual(
    inspectDesignSystemStylesheet('.ds-rail[aria-current="page"] {\n  color: var(--gold);\n}\n'),
    []
  );

  // ...and an unprefixed class carrying such an attribute is still caught, so the fix removed a
  // false positive without opening a false negative.
  assert.deepEqual(
    inspectDesignSystemStylesheet('.tag[data-x="a.b"] {\n  color: var(--gold);\n}\n').map((v) => v.rule),
    ['namespace']
  );
});

test('the namespace rule reaches inside :is() and :where()', () => {
  assert.deepEqual(inspectDesignSystemStylesheet(':where(.ds-a, .ds-b) {\n  color: var(--gold);\n}\n'), []);
  assert.deepEqual(
    inspectDesignSystemStylesheet(':where(.ds-a, .tag) {\n  color: var(--gold);\n}\n').map((v) => v.rule),
    ['namespace']
  );
});

test('a `font:` shorthand is caught even when a formatter has wrapped it', () => {
  // The rule was line-scoped, and this repo's prettier config wraps long declarations — so
  // `font\n  : 14px/1.2 Archivo;` slipped it entirely (fresh reviewer). Matched over the whole
  // source now, for the same reason `HEADING_BLOCK` is.
  assert.deepEqual(
    inspectDesignSystemStylesheet('.ds-a {\n  font\n    : 600 12px var(--sans);\n}\n').map((v) => v.rule),
    ['font-shorthand']
  );
});

test('a colour has to come from the scale, whatever notation it is written in', () => {
  // `raw-hex` was the ONLY colour rule, so every non-hex notation walked past it in a directory
  // whose premise is that a value is a choice from a scale (fresh reviewer).
  for (const value of ['rgb(232 185 60)', 'hsl(43 80% 57%)', 'oklch(0.7 0.1 80)', 'red']) {
    assert.deepEqual(
      inspectDesignSystemStylesheet(`.ds-a {\n  color: ${value};\n}\n`).map((v) => v.rule),
      ['literal-color'],
      `${value} is a hand-picked colour`
    );
  }

  // ...and a DERIVATION of a token is not a hand-picked colour. `globals.css` builds its two kraft
  // surfaces with exactly this idiom, so a rule that refused it would have been refusing the one
  // pattern the repo already uses to stay on the scale.
  for (const value of [
    'var(--gold)',
    'color-mix(in srgb, var(--gold) 55%, white)',
    'rgb(from var(--gold) r g b / 50%)',
    'linear-gradient(var(--gold), var(--gold-hot))',
    'transparent',
    'currentColor',
  ]) {
    assert.deepEqual(
      inspectDesignSystemStylesheet(`.ds-a {\n  color: ${value};\n}\n`),
      [],
      `${value} resolves to the scale`
    );
  }

  // A SELECTOR is not a value: `.ds-gold` must not be read as the named colour.
  assert.deepEqual(inspectDesignSystemStylesheet('.ds-gold {\n  color: var(--gold);\n}\n'), []);
});

test('a missing stylesheet root is LOUD, exactly like a missing swept root', () => {
  // It used to be wrapped in `if (existsSync(...))`, the exact inverse of `sourceFiles()`, whose own
  // comment says a missing root must be loud rather than empty. It was masked only because the
  // directory is in SWEPT_ROOTS too and the .tsx sweep throws first — so the guard's loudness
  // depended on statement order (fresh reviewer).
  const root = mkdtempSync(join(tmpdir(), 'design-drift-missing-'));
  try {
    assert.throws(() => inspectRepository(root), /does not exist/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
