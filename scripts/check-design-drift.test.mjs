import assert from 'node:assert/strict';
import test from 'node:test';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  SWEPT_ROOTS,
  VOICE_AND_STYLE_ROOTS,
  inspectDesignSource,
  inspectRepository,
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
