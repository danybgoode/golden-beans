// The product's vocabulary — the words, and the words that are not allowed.
//
// ── This GENERALISES `flag-vocabulary.ts`; it does not replace it ─────────────────────────────
// Story 2.5's wording is precise about that, and so is the existing module: it maps STORED values to
// what a person reads, holds no arithmetic, and changes no data. That discipline is right and stays
// where it is. What was missing is the layer above — the rules that apply to every surface, which
// had nowhere to live and so lived in a Do-not list nothing executed.
//
// ── The rule that decides every disagreement ──────────────────────────────────────────────────
// **Where the approved design and the control plane disagree about a word, the control plane wins,
// and the disagreement is recorded here.** The last epic's example is the clearest: the design says
// *"a release toggle is off by default"*, which maps onto `defaultVariantKey: 'off'` — and that
// creates a feature you cannot turn on. The design is describing an intention; the control plane is
// describing what will happen. A person acts on the second.

/**
 * Words that describe the STORAGE MODEL rather than the reader's job (contract Do-not #7).
 *
 * Each entry is a word the product has actually shipped in user-facing copy, with what to say
 * instead. This is not a style preference: a page that says *"activating a flag changes one
 * environment snapshot with optimistic revision protection"* has told the reader about a row, a
 * column and a concurrency strategy, and nothing about whether their feature is on.
 */
export const STORAGE_WORDS: readonly { word: string; insteadSay: string; why: string }[] = [
  {
    word: 'snapshot',
    insteadSay: 'what Production is serving',
    why: 'a snapshot is the row that got written; the reader wants to know what is live',
  },
  {
    word: 'immutable version',
    insteadSay: 'the version you turned on',
    why: 'immutability is a storage guarantee, not something the reader does',
  },
  {
    word: 'optimistic revision protection',
    insteadSay: 'nobody else changed it while you were looking',
    why: 'names a concurrency strategy; the reader wants to know their change stuck',
  },
  {
    word: 'registry',
    insteadSay: 'the features this project has',
    why: 'the table it lives in, not the thing it holds',
  },
  {
    word: 'projection',
    insteadSay: 'what we worked out from your events',
    why: 'a derived table; the reader has never heard of it',
  },
  {
    word: 'upsert',
    insteadSay: 'saved',
    why: 'a database verb that reached user-facing copy in two prior epics',
  },
  {
    // ⚠️ `'row'` was here and has been REMOVED, and the removal is the point. My own test failed on
    // `role="row"` and on a data table describing its own rows — both of which are correct usage. A
    // table genuinely has rows; the defect is calling a FEATURE a row, and no scanner can tell those
    // apart from the word alone.
    //
    // Banning it anyway would have produced a rule people route around, which is worse than no
    // rule: the ones below are unambiguous, and a list that only fires on real violations is a list
    // that keeps its authority. The domain-noun problem is caught by review, where judgement lives.
    word: 'database record',
    insteadSay: 'the feature / the key / the destination — whatever it actually is',
    why: 'names the storage location of a thing the reader knows by its own name',
  },
]

/**
 * Where uppercase is allowed, and why.
 *
 * ⚠️ **Contract Do-not #3 says uppercase appears in "exactly two places, and never in mono".
 * BOTH halves are violated, and my first count of this was wrong.**
 *
 * It read: *"eight rules apply uppercase inside `.is-console`, and none of them is mono — so half
 * of that Do-not is already satisfied."* That was true of `console.css` and **false of the
 * console**: the scan read two of the four stylesheets that paint it. Widened, `globals.css` adds
 * twelve more console rules and **every one of them is uppercase AND mono** — the pair the contract
 * forbids outright (fresh reviewer, Major, mutation-verified).
 *
 * `.product-shell__signal` is the clearest: `console.css` resets it inside
 * `.is-console .product-shell__identity`, so the LIT console is fine — and the legacy branch, which
 * is what a `CONSOLE_SHELL_ENABLED` rollback serves, renders uppercase mono.
 *
 * Rather than delete eighteen rules blind in the sprint that builds the language — Sprint 2 owns
 * none of those surfaces, and a blind sweep is how a redesign breaks a page nobody was looking at —
 * every one is listed with what it is, whether it is mono, and which sprint removes it.
 * `vocabulary.test.ts` fails if the set ever **grows**. **A list that cannot grow is the difference
 * between a Do-not and a decision**: these are recorded debt with an owner, not an oversight
 * nobody costed.
 */
/**
 * Which selectors Do-not #3 actually governs.
 *
 * ⚠️ **The contract is a CONSOLE contract.** `CONSOLE-CONTRACT.md` measures the signed-in console
 * and says uppercase appears there in *"exactly two places, and never in mono"*. It says nothing
 * about the landing, the methodology chapters or the hub — all of which have their own approved
 * brand voice in which an uppercase mono kicker is a deliberate, shipped pattern
 * (`.kicker`, `.methodology-phase-label`, `.gapStamp` and 20 more).
 *
 * A cross-family reviewer was right that the scan was too narrow to support the claim
 * `vocabulary.ts` made — it read two of the four stylesheets that paint the console and concluded
 * "none of them is mono" about the product. Widening it to every stylesheet, though, would apply a
 * console rule to brand surfaces it was never written for, and a rule that fires on correct work is
 * a rule people switch off. So the scan is widened and the SCOPE is stated.
 */
export const CONSOLE_SURFACE_PREFIXES: readonly string[] = [
  '.is-console',
  '.ds-',
  '.ds ',
  '.product-shell',
  '.console-rail',
  '.command-palette',
  '.command-center',
  '.agent-rail',
  '.data-table',
  '.stat-card',
  '.flag-insight',
]

/** True when a selector paints the signed-in console, which is what Do-not #3 governs. */
export function isConsoleSurface(selector: string): boolean {
  return CONSOLE_SURFACE_PREFIXES.some((prefix) => selector.includes(prefix))
}

export const UPPERCASE_ALLOWED: readonly {
  selector: string
  what: string
  keep: boolean
  /** `true` where the rule is ALSO mono — the pair Do-not #3 forbids outright. Debt, never new. */
  mono?: true
}[] = [
  // The two the contract approves.
  { selector: '.listhead', what: "the feature list's column header row", keep: true },
  { selector: '.grp', what: 'the dormant group heading', keep: true },
  // The design system's own name for the first of those two. `console.css`'s `.listhead` is what it
  // replaces, and both are live until Sprint 6 deletes the old world — so both are listed, and the
  // count of APPROVED places is still two things, under three selectors during the overlap.
  { selector: '.ds-table-head', what: "the data table's column header row (replaces .listhead)", keep: true },
  // The SPECIMEN's sample of the `label` type step. It is uppercase because that step is — a
  // specimen that rendered the uppercase step in sentence case would be lying about the scale it
  // exists to show. Not product copy, and not a third place uppercase appears in the product.
  { selector: '.ds-specimen-type--label', what: 'the specimen showing the `label` step', keep: true },
  // ── design-system-rails · Sprint 4 — the PAGE layer's own uppercase, all of it approved ──────
  // Every entry below replaces one of the `keep: false` rows further down, in the same commit that
  // lands its page (sprint contract #11). They are `keep: true` because the contract approves each:
  // the column header row and the group heading are the two the design has, and Story 4.1's
  // acceptance names the header row's 11/600 uppercase Archivo explicitly. **None is mono** — the
  // pair Do-not #3 forbids outright — and the test above is what says so rather than this comment.
  { selector: '.ds-listhead', what: "the list card's column header row (replaces .listhead)", keep: true },
  { selector: '.ds-grp', what: 'the state-run heading (replaces .grp)', keep: true },
  // A form field's label. The prototype's `.field > .lab` is the rule this replaces, and that row
  // is recorded below as `keep: false` — it is uppercase in the approved design too, so the
  // replacement inherits `keep: true` and the OLD selector is what leaves in Sprint 6.
  { selector: '.ds-label', what: 'a form field label (replaces .field > .lab)', keep: true },
  { selector: '.ds-matrix', what: "the environment matrix's column headers", keep: true },
  { selector: '.ds-envtable', what: "the environments table's header (replaces .envtable th)", keep: true },
  { selector: '.ds-here', what: 'the "you are here" marker on the environments table', keep: true },
  // The six the contract does not, each on a surface a later sprint rebuilds.
  { selector: '.rail-label', what: "the rail's “Environment” label — Sprint 3", keep: false },
  { selector: '.field > .lab', what: 'form field labels — Sprint 4', keep: false },
  { selector: '.note-box .lab2', what: 'the note box label — Sprint 4', keep: false },
  { selector: '.envtable th', what: "the environments table's header — Sprint 4", keep: false },
  {
    selector: '.data-table thead th',
    what:
      'the shared data table header — Sprint 4. TWO rules, and they disagree: `globals.css` sets ' +
      '`font: 600 11px var(--mono)`, and `console.css` resets the LIT console to `var(--sans)`. ' +
      'The mono one is what a rollback serves, which is why this is recorded as mono debt.',
    keep: false,
    mono: true,
  },
  { selector: '.command-palette__kind', what: "the palette's result kind — Sprint 3", keep: false },
  // ⚠️ THE ONES IN `globals.css`, found only once the scan was widened past `console.css`
  // (fresh reviewer, Major). `vocabulary.ts` claimed "none of them is mono"; that was true of
  // `console.css` and false of the console. Every entry below is uppercase AND mono — the pair
  // Do-not #3 forbids outright — on a console surface.
  //
  // They are recorded rather than deleted here for the same reason the six above are: Sprint 2 owns
  // none of these surfaces, and a blind sweep of twelve selectors in the sprint that builds the
  // language is how a redesign breaks a page nobody was looking at.
  {
    selector: '.product-shell__signal',
    what: 'the legacy header identity — Sprint 3',
    keep: false,
    mono: true,
  },
  {
    selector: "[data-surface-status='gated']",
    what: 'the rail GATED badge — Do-not #2 deletes it entirely, Sprint 3',
    keep: false,
    mono: true,
  },
  {
    selector: '.command-palette__panel',
    what: "the palette result's kind label — Sprint 3",
    keep: false,
    mono: true,
  },
  { selector: '.agent-rail__panel', what: 'the agent rail disclosure — Sprint 3', keep: false, mono: true },
  {
    selector: '.agent-rail__section',
    what: 'the agent rail section heading — Sprint 3',
    keep: false,
    mono: true,
  },
  {
    selector: '.stat-card__label',
    what: 'the stat tile label — replaced by .ds-stat-label, Sprint 5',
    keep: false,
    mono: true,
  },
  { selector: '.command-center__gaps', what: "Today's gap disclosure — Sprint 5", keep: false, mono: true },
  {
    selector: '.data-table__filter-label',
    what: "the data table's filter label — Sprint 4",
    keep: false,
    mono: true,
  },
  { selector: '.data-table__count', what: "the data table's count — Sprint 4", keep: false, mono: true },
  { selector: '.data-table caption', what: "the data table's caption — Sprint 4", keep: false, mono: true },
  {
    selector: '.flag-insight__diff',
    what: "the flag insight diff's label — Sprint 4",
    keep: false,
    mono: true,
  },
]

/**
 * A disagreement between the approved design and the control plane, and how it was settled.
 *
 * Recorded rather than resolved silently, because the design is an artefact somebody approved: a
 * builder who finds the product saying something else needs to know that was a decision.
 */
export const CONTROL_PLANE_WINS: readonly { design: string; product: string; why: string }[] = [
  {
    design: 'a release toggle is off by default',
    product: 'a release toggle has no default until you set one',
    why:
      'the design sentence maps onto `defaultVariantKey: "off"`, and a flag whose default variant ' +
      'is `off` with no rule above it is a feature you cannot turn on. The design describes an ' +
      'intention; the control plane describes what will happen, and a person acts on the second.',
  },
  {
    design: 'Never turned on',
    product: 'Never turned on here',
    why:
      'activation is per ENVIRONMENT. Without "here" the label claims something about the whole ' +
      'product that the stored row only claims about one environment — 39 of 42 flags on ' +
      'miyagisanchez are in that state in Production, and a different number in each of the others.',
  },
]

/** Every word `STORAGE_WORDS` bans, lowercased, for a scanner. */
export function bannedWords(): string[] {
  return STORAGE_WORDS.map((entry) => entry.word.toLowerCase())
}

/**
 * The words the specimen says, so it says them once.
 *
 * ⚠️ **Story 2.5 asks that "every user-facing word in `design-system/` goes through" this module,
 * and none of them did.** `vocabulary.ts` shipped as a lint registry imported by exactly one file —
 * its own test — while `page.tsx` hard-coded the same strings the registry describes. "Never turned
 * on here" existed as a literal in `CONTROL_PLANE_WINS` and, separately, as a literal on the
 * specimen, with nothing welding them: correcting the registry would have left the rendered page
 * saying the old thing (fresh reviewer, round 2, Major).
 *
 * Folding `flag-vocabulary.ts` into this module is Sprint 3's half of the story (D14) — it edits a
 * live, gated product route, which Sprint 2's build contract says it does not do. This half is the
 * half that can land without touching one.
 */
export const SPECIMEN_WORDS = {
  /** Per-ENVIRONMENT activation. The "here" is load-bearing — see `CONTROL_PLANE_WINS`. */
  neverActivated: controlPlaneWord('Never turned on'),
  /** The pill's word for a deliberate kill. The SWITCH's label is `switchOff` — they differ. */
  on: 'On',
  off: 'Turned off',
  /**
   * ⚠️ Separate from `off` on purpose. `off` was `'Off'` and became `'Turned off'` to satisfy the
   * pill, which left the key meaning something different from the `<Switch label="Off">` four lines
   * below it — a registry key quietly changing meaning to pass its own test (fresh reviewer,
   * round 5, Minor). Two words, two keys.
   */
  switchOn: 'On',
  switchOff: 'Off',
} as const

/**
 * The product's wording for a design phrase the control plane overrules.
 *
 * Throws rather than falling back: a missing entry means the specimen is about to render a word the
 * registry does not know about, and silently rendering the design's version is how the two drift.
 */
export function controlPlaneWord(design: string): string {
  const entry = CONTROL_PLANE_WINS.find((candidate) => candidate.design === design)
  if (!entry) {
    throw new Error(
      `no CONTROL_PLANE_WINS entry for "${design}" — the specimen may not invent a word the ` +
        'vocabulary has not settled'
    )
  }
  return entry.product
}
