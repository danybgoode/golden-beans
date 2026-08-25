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
