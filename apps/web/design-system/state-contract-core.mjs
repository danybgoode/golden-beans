// state-contract-core.mjs — the block vocabulary and the comparison. NO browser, NO node imports.
//
// ⚠️ **Split from `state-contract.mjs`, and the split is not cosmetic.** The generator has to open a
// real browser, so it imports `_harness.mjs`, which uses `import.meta.url`. Playwright transpiles a
// spec to CJS, so a spec importing the generator dies with *"Cannot use 'import.meta' outside a
// module"* before a single test is collected — and Playwright reports that as **"No tests found"**,
// which is a green-looking exit for a suite that never ran.
//
// The same reason `approved-states.mjs` exists beside `render-reference.mjs`: three things read the
// state ids and only one of them needs Chromium. Here, two things read the vocabulary — the
// generator and the gate — and only the generator needs a browser.
//
// Everything in this file is pure. `extractSignature` is handed to `page.evaluate` and runs INSIDE
// a page, in two different browsers against two different class vocabularies, which is why it
// closes over nothing and takes its vocabulary as an argument.

/**
 * The block vocabulary — BOTH selectors, side by side, in ONE table.
 *
 * ⚠️ **Declared as a pair rather than derived from the class names.** Only 81 of the design
 * system's 360 `ds-` classes share a name with a prototype class: `system.css` is a hand-written
 * port that added modifiers (`btn--primary` for `btn btn-primary`) and renamed the chart family
 * (`plot` → `ds-chart`, `smalls` → `ds-chart-smalls`). A `ds-` + name mapping would have been a
 * guess that happened to work on a third of the vocabulary. Two lists in two files that currently
 * agree is the failure this table exists to avoid.
 *
 * `facts` runs against the matched element and returns the data-independent half of the block.
 */
export const BLOCK_KINDS = [
  {
    kind: 'head',
    proto: '.page-head',
    product: '.ds-page-head',
    // The primary action's LABEL. `+ New journey` is a stub in the prototype and a modal in the
    // product (epic D8) — the contract is that the control is there and says the same words, never
    // what happens when it is pressed.
    facts: { action: { proto: '.btn-primary', product: '.ds-btn--primary' } },
  },
  { kind: 'answer', proto: '.answer', product: '.ds-answer' },
  {
    kind: 'tiles',
    proto: '.tiles',
    product: '.ds-tiles',
    facts: { count: { proto: '.tile', product: '.ds-tile' } },
  },
  {
    kind: 'list',
    proto: '.listcard',
    product: '.ds-listcard',
    facts: { columns: { proto: '.listhead', product: '.ds-listhead' } },
  },
  { kind: 'empty', proto: '.empty', product: '.ds-empty' },
  { kind: 'plot', proto: '.plot', product: '.ds-chart' },
  {
    kind: 'smallplots',
    proto: '.smalls',
    product: '.ds-chart-smalls',
    facts: { count: { proto: '.small', product: '.ds-chart-small' } },
  },
  { kind: 'bars', proto: '.hbars, .vbars', product: '.ds-chart-bars, .ds-chart-cols' },
  { kind: 'card', proto: '.card', product: '.ds-card' },
  { kind: 'steps', proto: '.steps', product: '.ds-steps' },
  { kind: 'field', proto: '.field', product: '.ds-field' },
  { kind: 'crumbs', proto: '.crumbrow', product: '.ds-crumbrow' },
  {
    kind: 'summary',
    proto: '.summary',
    product: '.ds-summary',
    facts: { count: { proto: '.stat', product: '.ds-stat' } },
  },
  { kind: 'toolbar', proto: '.toolbar', product: '.ds-toolbar' },
  { kind: 'kpis', proto: '.kpis', product: '.ds-kpis' },
  // The 33rd state's three blocks (epic D8). `.ds-dialog-head` does not exist yet — Sprint 2 builds
  // it, and until then the gate says so rather than agreeing with a page that has no dialog.
  // ⚠️ The feature modal's tab strip. It surfaced only once `.scrim .modal` became the first scope
  // — before that, `feature-value`, `feature-environments` and `feature-funnel` were all scored
  // against the FEATURE LIST behind the open modal and came out byte-identical to `ship-features`.
  // Three more states asserted against a screen nothing had looked at, found by the same guard that
  // found the seven doors.
  { kind: 'tabs', proto: '.modal-tabs', product: '.ds-tabs--panel' },
  { kind: 'dialoghead', proto: '.modal-head', product: '.ds-dialog-head' },
  { kind: 'dialogbody', proto: '.modal-body', product: '.ds-dialog-body' },
  { kind: 'dialogfoot', proto: '.modal-foot', product: '.ds-dialog-actions' },
  { kind: 'demobar', proto: '.demobar', product: '.ds-demobar' },
  { kind: 'sharehead', proto: '.sharehead', product: '.ds-sharehead' },
  { kind: 'talkgrid', proto: '.talkgrid', product: '.ds-talkgrid' },
  { kind: 'goneglyph', proto: '.glyph', product: '.ds-gone-glyph' },
  { kind: 'goneacts', proto: '.acts', product: '.ds-gone-acts' },
  { kind: 'gonequiet', proto: '.quiet', product: '.ds-gone-quiet' },
  { kind: 'band', proto: '.band', product: '.ds-band' },
  { kind: 'legend', proto: '.legend', product: '.ds-legend' },
  { kind: 'sectionlabel', proto: '.rail-label', product: '.ds-rail-label' },
  { kind: 'sprints', proto: '.sprints', product: '.ds-sprints' },
  { kind: 'destinations', proto: '.dests', product: '.ds-dests' },
  { kind: 'haze', proto: '.haze', product: '.ds-haze' },
  { kind: 'provenance', proto: '.prov', product: '.ds-prov' },
  { kind: 'document', proto: '.doc', product: '.ds-doc' },
  { kind: 'doorbrand', proto: '.doorbrand', product: '.ds-doorbrand' },
  { kind: 'title', proto: 'h1', product: 'h1' },
  { kind: 'doorform', proto: '.doorform', product: '.ds-doorform' },
  { kind: 'doorfoot', proto: '.doorfoot', product: '.ds-doorfoot' },
  { kind: 'doornote', proto: '.doornote', product: '.ds-doornote' },
  // ⚠️ **`versions` has no product class yet, and pairing it with one that does not exist is
  // DELIBERATE.** `measure-journey` draws its version list as `.vers`; the built page renders a
  // `ListCard`. The gate therefore says *"block N: the approved state has `versions`, the page has
  // `list`"* on that route until Sprint 2 builds the primitive — which is the gate working, not a
  // gap in it. Widening `versions` to also match `.ds-listcard` would make the two agree by
  // deleting the question.
  { kind: 'versions', proto: '.vers', product: '.ds-vers' },
  // A product callout is real copy; a `.callout.info` is the designer's annotation and never
  // reaches here (see ANNOTATION above).
  { kind: 'callout', proto: '.callout:not(.info)', product: '.ds-callout:not(.ds-callout--info)' },
  // Last, because it is the loosest: a bare paragraph directly in the content column — the door's
  // lede, and the "Showing 2 rows for 42 features" line under Ship > Features' list.
  { kind: 'note', proto: 'p', product: 'p' },
];

/**
 * The designer's annotations — EXCLUDED from the sequence, COUNTED beside it (epic D2-c).
 *
 * All 22 `.callout.info` blocks in the prototype carry the same `◆` and twenty of them explain the
 * design to a reviewer: *"Deliberately the same list as Ship › Features…"*, *"Three strengths of one
 * colour, not three colours."* Building those would be building the annotation.
 *
 * ⚠️ **Two of the 22 are genuine product copy** — `console-prototype.html:2600` (the journey-version
 * immutability note, which the built page already renders as a real `Callout`) and `:1967`'s
 * non-dangerous branch. The markup cannot tell them apart, so the contract treats every one as an
 * annotation and consequently does NOT assert product callouts. That is a named gap rather than a
 * hidden one, which is why the count is emitted: a state that gains or loses one shows up in the
 * diff even though the sequence ignores it.
 */
export const ANNOTATION = { proto: '.callout.info', product: '.ds-callout--info' };

/**
 * Text that is in the accessibility tree and NOT on the screen, removed before any word is compared.
 *
 * ⚠️ **Without this the gate fired on five routes for being MORE accessible than the design.** The
 * approved lists end in an empty action column; the built ones render
 * `<span class="ds-visually-hidden">Actions</span>` so the column has a name a screen reader can
 * announce. The contract is about what is DRAWN, so a guard that reads the accessibility tree would
 * have been "fixed" by deleting the accessible name from five lists — a real regression bought to
 * make a picture match. Same class as the `columnheader` finding this file's neighbour records.
 */
export const HIDDEN_TEXT = '.ds-visually-hidden, .visually-hidden, .sr-only, [hidden]';

/**
 * The content column, DERIVED rather than typed.
 *
 * ⚠️ **Seven states do not render into `<main>` at all, and the first version of this file scored
 * them against whatever screen was left there.** `render()` in the prototype is
 * `renderDoors(); if(APP.door) return; …` — so for `door-login`, both signup states and the four
 * `public-*` states, `<main class="content">` still holds the PREVIOUS state's markup while the
 * door paints over it. All seven came out as an identical `head, answer, list`, which was
 * `setup-shares` measured seven times. A contract that reports a confident signature for a screen
 * it never looked at is this epic's own defect wearing the epic's own uniform.
 *
 * Detected instead of listed: if a door is on screen, the door IS the content. A list of door
 * states would be a second thing to keep in step with `approved-states.mjs`.
 */
// ⚠️ `.scrim .modal` comes FIRST: an overlay is on top of whatever it opened over, so a modal state
// scored against the screen behind it would be the door bug again in a different container.
export const PROTO_SCOPE = [
  '.scrim .modal',
  '.doorlayer .doorcard',
  '.doorlayer .pubwrap',
  '.doorlayer .gone',
  'main.content',
];
export const PRODUCT_SCOPE = ['.ds-dialog[open]', '.ds-doorcard', 'main'];

/**
 * Extract one signature. **Runs inside a page**, in two different browsers, against two different
 * class vocabularies — so it closes over nothing and takes everything it needs as an argument.
 *
 * The walk is depth-first in document order and does NOT descend into a block it has matched: a
 * page is free to wrap its blocks in as many layout divs as it likes, and a `.ds-tile` inside a
 * `.ds-tiles` must be counted by the tiles block rather than emitted as a block of its own.
 */
export function extractSignature({ scope, kinds, annotation, side, hiddenText }) {
  const HIDDEN_TEXT_SELECTOR = hiddenText;
  const root = scope.reduce((found, selector) => found ?? document.querySelector(selector), null);
  if (root === null) return { missing: true, blocks: [], disclosures: 0, annotations: 0, unknown: [] };

  // ⚠️ **The fall-through is the dangerous branch, so it is checked rather than trusted.**
  // The prototype paints every door and public screen into `.doorlayer` and leaves the PREVIOUS
  // console screen sitting in `<main class="content">` underneath. The first version of this file
  // scoped to `main` unconditionally and scored eleven of those states against whatever was left
  // there — seven of them came out as an identical `head, answer, list`, which was `setup-shares`
  // measured seven times. A confident signature for a screen nothing looked at is this epic's own
  // defect wearing this epic's own uniform, so reaching `main` while a door is up is an ERROR and
  // never a default.
  if (
    side === 'proto' &&
    document.querySelector('.doorlayer, .scrim') !== null &&
    !root.closest('.doorlayer, .scrim')
  ) {
    return {
      missing: true,
      blocks: [],
      disclosures: 0,
      annotations: 0,
      unknown: ['a door or a modal is on screen and the scope resolved to <main> underneath it'],
    };
  }

  const blocks = [];
  const unknown = [];
  let disclosures = 0;
  let annotations = 0;

  // VISIBLE words only — see HIDDEN_TEXT. The clone is so removing the hidden spans cannot mutate
  // the page a later assertion in the same run is about to read.
  const text = (element) => {
    if (!element) return '';
    const copy = element.cloneNode(true);
    for (const hidden of copy.querySelectorAll(HIDDEN_TEXT_SELECTOR)) hidden.remove();
    return (copy.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  };

  // ⚠️ **DIRECT CHILDREN ONLY — the walk does not descend, and that is the assertion.**
  //
  // The approved design's content column is a FLAT STACK: every screen function in the prototype
  // emits a page head, an answer, a tile row, a list card and nothing nested. So is the product's
  // `<main>`. The first version of this walk descended through unmatched elements looking for
  // something it recognised, and the result was a contract reporting `span.n` and `option` as
  // blocks while Ship › Features' four-count strip — a real block, missing from the vocabulary —
  // was invisible on both sides at once. A comparison cannot see a block neither side emits.
  //
  // One level, everything named. A page that wraps its blocks in a layout div fails with the class
  // of that div in the message, which is the honest answer: the design has no such wrapper.
  // ⚠️ **ONE exception to "direct children only": a `<div>` with no class at all.**
  // `funnelPageScreen()` wraps its pane in `<div style="margin-top:18px">` — a spacing wrapper
  // that carries no design meaning, which is exactly what "no class" means here. Its children are
  // spliced in rather than the div being named as a block, and rather than the walk being made
  // recursive again (which is what let `span.n` be reported as a block). A classed wrapper is still
  // a block and still has to be in the vocabulary.
  const children = [...root.children].flatMap((child) =>
    child.tagName === 'DIV' && child.classList.length === 0 ? [...child.children] : [child]
  );

  for (const child of children) {
    // Order matters. An annotation is checked first because it must never reach the sequence, and
    // a `<details>` before the kinds because a disclosure wrapping a card is a disclosure.
    if (child.matches(annotation[side])) {
      annotations += 1;
      continue;
    }
    // ⚠️ **A `<dialog>` is an OVERLAY, not a block in the content sequence.** Destinations renders
    // `ConfirmDialog` as a direct child of `<main>`; closed, it paints nothing, and open it covers
    // the page rather than sitting in its flow. Counting it as a content block made the route
    // report an extra unnamed block forever — found by the unknown-block guard, which is the guard
    // working rather than a false positive.
    //
    // Skipped rather than named as a kind, because a dialog's own contents ARE asserted: an open
    // one becomes the SCOPE (`PRODUCT_SCOPE` starts at `.ds-dialog[open]`), so the wizard state is
    // measured on its own terms instead of as a lump inside the page that opened it.
    if (child.tagName === 'DIALOG') continue;

    if (child.tagName === 'DETAILS') {
      // Counted here so it does not reach the block sequence. The TOTAL is taken over the whole
      // scope below — see the `disclosures` assignment after the loop.
      continue;
    }
    const kind = kinds.find((entry) => child.matches(entry[side]));
    if (kind === undefined) {
      // Recorded, never walked past. `readContract` refuses to emit a signature containing one of
      // these, so the vocabulary cannot quietly stop covering something.
      unknown.push(`${child.tagName.toLowerCase()}${[...child.classList].map((c) => `.${c}`).join('')}`);
      continue;
    }
    const block = { kind: kind.kind };
    for (const [name, selectors] of Object.entries(kind.facts ?? {})) {
      if (name === 'count') {
        block.count = child.querySelectorAll(selectors[side]).length;
      } else if (name === 'columns') {
        const head = child.querySelector(selectors[side]);
        // The WORDS, not their case: the stylesheet uppercases these, so asserting the source
        // case would make a faithful port fail on `text-transform`.
        block.columns = head === null ? null : [...head.children].map(text);
      } else if (name === 'action') {
        const action = child.querySelector(selectors[side]);
        block.action = action === null ? null : text(action);
      }
    }
    blocks.push(block);
  }

  // ⚠️ **Counted over the WHOLE scope, not among direct children** (cross-family review, Codex,
  // Blocking). The loop above only sees the content column's own children, so a `<details>` nested
  // inside a recognised block — a disclosure inside a `.ds-card`, which is exactly where the
  // Medusa-truth one lives on `/app` — was invisible while the contract's whole claim is that the
  // approved design draws NONE. The one that mattered most was the one it could not see.
  disclosures = root.querySelectorAll('details').length;

  return { missing: false, blocks, disclosures, annotations, unknown };
}

/** The argument `extractSignature` needs for one side. Built here so both callers cannot disagree. */
export function signatureArgs(side) {
  return {
    scope: side === 'proto' ? PROTO_SCOPE : PRODUCT_SCOPE,
    kinds: BLOCK_KINDS.map(({ kind, proto, product, facts }) => ({ kind, proto, product, facts })),
    annotation: ANNOTATION,
    hiddenText: HIDDEN_TEXT,
    side,
  };
}

/**
 * Compare a built route's signature against its approved state's.
 *
 * @returns {string[]} human-readable differences, empty when the two agree. A LIST rather than a
 * boolean, because "this page does not match its design" is not an actionable failure and "block 3
 * is `tiles` with 3 tiles, the approved state has 4" is.
 *
 * ⚠️ `annotations` is REPORTED, never compared. The prototype paints them and the product must not
 * (D2-c), so an equality assertion on that number would be red on every correct page.
 */
export function diffSignature(approved, built) {
  const differences = [];
  if (built.missing) return ['the route rendered no <main> at all'];

  // ⚠️ **The built route's UNRECOGNISED blocks are a difference, not a note** (cross-family review,
  // Codex, Blocking). They were collected and never compared, so a page could add an entire
  // unnamed block to its content column — a stray panel, a leftover stack — and still pass, because
  // the recognised sequence either side of it was unchanged. `readContract` already refuses to
  // EMIT a signature containing one; the built side has to refuse to ACCEPT one, or the guard only
  // covers the half of the comparison nobody was going to break.
  if (built.unknown.length > 0) {
    differences.push(
      `the page renders ${built.unknown.length} block(s) the approved design has no name for: ` +
        `${built.unknown.join(', ')}. Either it is not in the design, or the block vocabulary in ` +
        'state-contract-core.mjs is missing a kind — both are decisions, neither is a pass.'
    );
  }

  if (built.disclosures !== 0) {
    differences.push(
      `${built.disclosures} <details> disclosure(s) in <main> — the approved design draws none, and ` +
        'a capability with no home gets a modal, never a disclosure (epic D3)'
    );
  }

  const length = Math.max(approved.blocks.length, built.blocks.length);
  for (let index = 0; index < length; index += 1) {
    const want = approved.blocks[index];
    const got = built.blocks[index];
    if (want === undefined) {
      differences.push(`block ${index + 1}: the page renders an extra \`${got.kind}\``);
      continue;
    }
    if (got === undefined) {
      differences.push(
        `block ${index + 1}: the approved state has a \`${want.kind}\` and the page has nothing`
      );
      continue;
    }
    if (want.kind !== got.kind) {
      differences.push(
        `block ${index + 1}: the approved state has \`${want.kind}\`, the page has \`${got.kind}\``
      );
      continue;
    }
    if (want.count !== undefined && want.count !== got.count) {
      differences.push(
        `block ${index + 1} (\`${want.kind}\`): ${got.count} where the approved state has ${want.count}`
      );
    }
    if (want.columns !== undefined && JSON.stringify(want.columns) !== JSON.stringify(got.columns)) {
      differences.push(
        `block ${index + 1} (\`${want.kind}\`): columns ${JSON.stringify(got.columns)} where the ` +
          `approved state has ${JSON.stringify(want.columns)}`
      );
    }
    if (want.action !== undefined && want.action !== got.action) {
      differences.push(
        `block ${index + 1} (\`${want.kind}\`): primary action ${JSON.stringify(got.action)} where the ` +
          `approved state has ${JSON.stringify(want.action)}`
      );
    }
  }
  return differences;
}
