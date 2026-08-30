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
 * ⚠️ **Contract Do-not #3 says uppercase appears in "exactly two places, and never in mono".**
 * Verified against the live stylesheet on 2026-08-30: **eight** rules apply
 * `text-transform: uppercase` inside `.is-console`, and **none of them is mono**.
 *
 * So half of that Do-not is already satisfied — the mono defect was fixed in `console-ia-overhaul`
 * — and the other half is not, four times over. Rather than delete six rules blind in Sprint 2,
 * every one is listed here with what it is and which sprint owns it, and `vocabulary.test.ts`
 * fails if the set ever grows. **A list that cannot grow is the difference between a Do-not and a
 * decision**: the six extras are recorded debt with an owner, not an oversight nobody costed.
 */
export const UPPERCASE_ALLOWED: readonly { selector: string; what: string; keep: boolean }[] = [
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
  // The six the contract does not, each on a surface a later sprint rebuilds.
  { selector: '.rail-label', what: "the rail's “Environment” label — Sprint 3", keep: false },
  { selector: '.field > .lab', what: 'form field labels — Sprint 4', keep: false },
  { selector: '.note-box .lab2', what: 'the note box label — Sprint 4', keep: false },
  { selector: '.envtable th', what: "the environments table's header — Sprint 4", keep: false },
  { selector: '.data-table thead th', what: 'the shared data table header — Sprint 4', keep: false },
  { selector: '.command-palette__kind', what: "the palette's result kind — Sprint 3", keep: false },
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
