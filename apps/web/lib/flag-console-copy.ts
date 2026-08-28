// flags-console-parity · the console's load-bearing SENTENCES, where the gate can read them.
//
// ── Why this is a lib module and not JSX in the dialog ───────────────────────────────────────
// Story 2.2's acceptance is that disabling a feature "asks first, and the confirmation names the
// specific feature, the environment, and what stops" — the audit's §1 standard, written against
// buttons that say *Activate* without ever saying what activation changes.
//
// That is a claim about WORDS on the most dangerous control in the product: it is how someone kills
// `checkout.stripe_enabled` on a live marketplace. Inside a client island the sentence is reachable
// only through a signed-in browser, which is OUTSIDE the merge gate — so the one assertion that
// matters most would be pinned by nothing, and would degrade to "Are you sure?" the first time
// someone found it wordy.
//
// Import-free on purpose, like `data-table.ts` and `flag-list-view.ts`: that is what lets
// `npm run test:unit` — which IS the gate — cover it with no DOM and no module aliasing.

/**
 * What turning a feature OFF in one environment actually stops.
 *
 * Four things it must keep saying, each pinned by a spec in `flag-console-copy.test.ts`:
 *   1. the SPECIFIC feature key, never "this feature";
 *   2. the SPECIFIC environment, and not a hardcoded one;
 *   3. what STOPS — a consequence, not a restatement of the verb;
 *   4. that the change is NOT instant everywhere, because clients keep the old value until their
 *      next poll. An operator who pulls a kill switch and watches the symptom persist needs to know
 *      that is expected, rather than reaching for a second, worse lever.
 *
 * It also deliberately refuses to end on reassurance: turning it back on is cheap, and the orders
 * lost in between are not.
 */
export function describeTurnOffConsequence(flagKey: string, environment: string): string {
  return (
    `Everything relying on ${flagKey} in ${environment} falls back to its built-in default on the ` +
    `next snapshot poll — for a kill switch that means the feature it guards stops being served. ` +
    `Clients already running keep the old value until they poll again, so this is not instant ` +
    `everywhere. Turning it back on is one click, but whatever broke in between still broke.`
  )
}

/**
 * What serving a specific version in one environment does — the rollback confirmation.
 *
 * Same reasoning as `describeTurnOffConsequence` above, and the same reason it lives here: this is
 * the sentence someone reads mid-incident, when they have decided to go back to an older version
 * and are about to discard whatever the newer one changed. Words that matter that much do not
 * belong somewhere only a signed-in browser can reach.
 *
 * It says the three things the decision actually needs:
 *   1. WHICH version replaces WHICH — "v2 replaces v5", not "this version";
 *   2. that going backwards DISCARDS the newer versions' behaviour, without deleting them (the
 *      registry is append-only, so a rollback is reversible — but the reader should not have to
 *      already know that);
 *   3. that it is not instant everywhere, for the same polling reason a turn-off is not.
 */
export function describeRollback(input: {
  flagKey: string
  environment: string
  version: number
  /**
   * The version this environment SERVES RIGHT NOW, or null when it serves nothing.
   *
   * ── Why not `latestVersion` ───────────────────────────────────────────────────────────────
   * The first version of this took `latestVersion` and called any target below it "going BACK".
   * That is the wrong reference point and it produced a confidently false sentence: with
   * production on v1 and the newest at v5, choosing v3 was described as going back and losing
   * "v4 through v5" — when production was in fact rolling FORWARD from v1, and v4/v5 were never
   * applying there to begin with (cross-review, Agy, PR #120, Blocking).
   *
   * Direction is relative to where the environment IS, never to where the flag's history ends.
   */
  currentVersion: number | null
}): string {
  const goingBack = input.currentVersion !== null && input.version < input.currentVersion
  const from =
    input.currentVersion === null
      ? `${input.environment} is not serving ${input.flagKey} right now`
      : `${input.environment} is currently serving v${input.currentVersion} of ${input.flagKey}`
  // The versions being SKIPPED are the ones between the target and what is running — not everything
  // up to the newest. "v5 through v5" is what a naive range renders when exactly one is skipped, and
  // it reads like a bug in the sentence rather than a fact about the flag.
  const highest = input.currentVersion ?? input.version
  const skipped = input.version + 1 === highest ? `v${highest}` : `v${input.version + 1} through v${highest}`
  const direction = goingBack
    ? `Serving v${input.version} means ${input.environment} goes BACK to how this feature behaved at ` +
      `v${input.version}, and whatever changed in ${skipped} stops applying there.`
    : `Serving v${input.version} makes it the version ${input.environment} runs.`
  return (
    `${from}. ${direction} No version is deleted — every one stays in this feature's history, so ` +
    `this can be undone by serving another. Clients pick the change up on their next snapshot poll, ` +
    `not instantly.`
  )
}

/**
 * What "turning on" a version will actually serve — said before the click, not after.
 *
 * ── The defect this exists to prevent ─────────────────────────────────────────────────────────
 * "On" in the console means an activation row points at a version. What a PM means by on is "the
 * feature is being served". They come apart whenever a version's `defaultVariantKey` names a
 * falsey variant — which, live, is the LATEST version of **34 of 42** `miyagisanchez` flags.
 *
 * So a button reading "Turn on in production" could activate a version that serves `false`, and the
 * page would then report the feature as on while nothing changed for a user. That is the epic's own
 * outcome test ("which of these are on") answered with the storage fact instead of the operational
 * one, on the surface that kills a live checkout.
 *
 * Returns null when activating is unambiguous — the version serves a truthy default, so "on" means
 * what it says and no dialog is warranted. A string means the caller must confirm.
 */
export function describeActivationSurprise(input: {
  flagKey: string
  environment: string
  version: number
  defaultValue: unknown
  readable: boolean
}): string | null {
  if (!input.readable) {
    return (
      `v${input.version} of ${input.flagKey} cannot be evaluated, so there is no way to say what ` +
      `${input.environment} would serve. Turning it on anyway means ${input.environment} starts ` +
      `serving a definition this console could not read.`
    )
  }
  // Only a literal `false` is called out. A string, a number or a JSON value is not "off" — it is a
  // non-boolean flag doing its job, and claiming otherwise would make the dialog cry wolf on every
  // multivariate flag until nobody reads it.
  if (input.defaultValue !== false) return null
  return (
    `Turning ${input.flagKey} on in ${input.environment} makes it serve v${input.version} — and ` +
    `v${input.version} evaluates to false by default, so the feature it guards still will NOT ` +
    `appear. "On" here means ${input.environment} is serving this definition, not that the feature ` +
    `is live. To actually switch the feature on, publish a version whose default variant is true.`
  )
}

/**
 * What revoking a snapshot key breaks.
 *
 * ── Why this moved here, VERBATIM ─────────────────────────────────────────────────────────────
 * Sprint 3 Story 3.1's acceptance: "Both revoke confirmations keep their current consequence text
 * verbatim — the wording naming 401s on the next poll, and catalog publishes failing from a named
 * source, is load-bearing and was cross-review-hardened."
 *
 * "Verbatim" and "in two places" are incompatible over time: the moment the credentials route had
 * its own copy, the two could drift and nothing would notice. So the string moved to one module
 * that both surfaces import, and `flag-console-copy.test.ts` pins the load-bearing clauses. The
 * words are unchanged from `flag-manager.tsx` — this is a move, not a rewrite.
 */
export const REVOKE_SNAPSHOT_KEY_CONSEQUENCE =
  'Any client reading the flag snapshot with this key starts getting 401s on its next poll, and ' +
  'falls back to whatever defaults it was built with. Revoking cannot be undone — mint a ' +
  'replacement first if this key is in production.'

/** What revoking a catalog sync key breaks. Same reasoning as above; `source` names the publisher. */
export function describeRevokeSyncKey(source: string): string {
  return (
    `Catalog publishes from ${source} start failing on the next sync — flag definitions from that ` +
    `publisher stop reaching this project until someone mints a new key and redeploys it. ` +
    `Revoking cannot be undone.`
  )
}

// ── console-ia-overhaul · Sprint 3, Story 3.1 — the features list's answer line ───────────────
//
// Here rather than in `flag-vocabulary.ts` for this file's founding reason: these words are
// load-bearing and this is the only place the gate can read them without module aliasing. The
// vocabulary module re-exports them, so D7's "one place to look for a flag word" still holds.
//
// The COUNTS are `summariseFlagList` in `lib/flag-list-view.ts`. Only the phrasing is here.

/** Structurally what `summariseFlagList` returns — restated so this module stays import-free. */
export type FlagListSummaryCounts = {
  total: number
  serving: number
  switchedOff: number
  neverSwitched: number
}

/**
 * The clauses of the answer line, with **zero-count clauses dropped** (A20).
 *
 * Returned as parts rather than a string so a test can assert *which clauses exist* — the property
 * that actually matters — instead of matching a rendered sentence. A `toContainText` assertion on
 * the whole line is what `flags-visual-rule-builder` learned not to trust: Playwright normalises
 * whitespace, so the check passed while asserting nothing.
 *
 * Dropping rather than rendering `0` is not tidiness. On live production `switchedOff` is **0 in
 * every environment**, so "0 deliberately switched off" would be the sentence every reader gets,
 * forever — a summary announcing an empty category as though it were news.
 */
export function answerLineClauses(summary: FlagListSummaryCounts): string[] {
  const clauses: string[] = []
  if (summary.serving > 0) {
    clauses.push(`serving ${summary.serving} ${summary.serving === 1 ? 'feature' : 'features'}`)
  }
  if (summary.switchedOff > 0) {
    clauses.push(`${summary.switchedOff} deliberately switched off`)
  }
  if (summary.neverSwitched > 0) {
    clauses.push(`${summary.neverSwitched} never turned on here`)
  }
  return clauses
}

/**
 * The whole answer line for one environment.
 *
 * The empty case says so in words rather than rendering a bare environment name with nothing after
 * it. A project with no features at all is a real state — every new tenant starts there — and a
 * dangling "Production is" reads as a bug.
 */
/**
 * The keys the answer line will name, and how it says "and the rest".
 *
 * The approved design does not merely count what is serving — it NAMES it:
 * *"Right now Production is serving `checkout.stripe_enabled` and `domain.paywall_enabled`."*
 * That is the difference between a page that reports a number and one that answers a question, and
 * a comment in `flag-console.tsx` claimed this behaviour for a function that only counted (fresh
 * reviewer, PR #124).
 *
 * Capped at three because the line is prose, not a list: a tenant serving twenty flags would push
 * the summary off the screen it is meant to fit on.
 */
const NAMED_KEYS_LIMIT = 3

/**
 * The answer line, as SEGMENTS rather than a string.
 *
 * ⚠️ **The string version was ungrammatical, and in the design's own shape.** Gluing every clause
 * into one sentence produced
 *
 *     Production is serving checkout.stripe_enabled and domain.paywall_enabled and 40 never turned
 *     on here.
 *
 * — where the 40 dormant flags are grammatically inside the list of things being served. Live
 * production (3 on / 39 never, A20) gets exactly that. With more than three serving it got worse:
 * `…and 2 more and 37 never turned on here.` (fresh reviewer, PR #124, round 2.)
 *
 * The prototype does not glue: it uses **separate sentences** — *"Right now Production is serving X
 * and Y. The other 40 have never been switched on in Production…"* — and that is the fix. One
 * sentence per fact.
 *
 * Segments rather than a string because the design renders the keys in gold mono (`.mono`) and the
 * environment and counts in bold. A plain string cannot carry that, and the ported `.answer code`
 * rule matched nothing because there was no element to match (N1).
 */
export type AnswerSegment = { text: string; emphasis?: 'strong' | 'mono' }

export function flagListAnswerSegments(
  summary: FlagListSummaryCounts,
  environment: string,
  servingKeys: readonly string[] = []
): AnswerSegment[] {
  if (summary.total === 0) return [{ text: `No features in ${environment} yet.` }]

  const segments: AnswerSegment[] = [{ text: 'Right now ' }, { text: environment, emphasis: 'strong' }]

  // Sentence 1 — what is serving, named. "nothing" when none are, which is the common case on this
  // product's own tenant in two environments out of three.
  if (summary.serving === 0 || servingKeys.length === 0) {
    segments.push({
      text: summary.serving === 0 ? ' is serving nothing.' : ` is serving ${summary.serving}.`,
    })
  } else {
    segments.push({ text: ' is serving ' })
    const shown = servingKeys.slice(0, NAMED_KEYS_LIMIT)
    const rest = servingKeys.length - shown.length
    shown.forEach((key, index) => {
      if (index > 0) segments.push({ text: index === shown.length - 1 && rest === 0 ? ' and ' : ', ' })
      segments.push({ text: key, emphasis: 'mono' })
    })
    if (rest > 0) segments.push({ text: ` and ${rest} more` })
    segments.push({ text: '.' })
  }

  // Sentence 2 — only when something was deliberately switched off. On live production this is
  // never rendered: `off` is 0 in every environment (A20).
  if (summary.switchedOff > 0) {
    segments.push({ text: ' ' }, { text: String(summary.switchedOff), emphasis: 'strong' })
    segments.push({
      text: `${summary.switchedOff === 1 ? ' feature was' : ' features were'} deliberately switched off here.`,
    })
  }

  // Sentence 3 — the dormant majority, said as its own fact rather than appended to the first.
  if (summary.neverSwitched > 0) {
    segments.push({ text: ' The other ' }, { text: String(summary.neverSwitched), emphasis: 'strong' })
    segments.push({
      text: ` have never been switched on in ${environment} — nobody turned them off, nobody ever turned them on.`,
    })
  }

  return segments
}

/** The same line as plain text. Used by tests and by anything that cannot render markup. */
export function flagListAnswerLine(
  summary: FlagListSummaryCounts,
  environment: string,
  servingKeys: readonly string[] = []
): string {
  return flagListAnswerSegments(summary, environment, servingKeys)
    .map((segment) => segment.text)
    .join('')
}

/** The one row a collapsed dormant group renders. Plural-safe: "1 feature has", "39 features have". */
export function dormantGroupLabel(count: number, environment: string): string {
  return count === 1
    ? `1 feature has never been turned on in ${environment}`
    : `${count} features have never been turned on in ${environment}`
}
