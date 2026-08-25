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
  latestVersion: number
  /** Null when the environment is currently serving nothing. */
  replacing: string | null
}): string {
  const goingBack = input.version < input.latestVersion
  const from =
    input.replacing === null
      ? `${input.environment} is not serving ${input.flagKey} right now`
      : `${input.environment} is currently serving a different version of ${input.flagKey}`
  // "v5 through v5" is what a naive range renders when exactly one version is being skipped, and it
  // reads like a bug in the sentence rather than a fact about the flag.
  const skipped =
    input.version + 1 === input.latestVersion
      ? `v${input.latestVersion}`
      : `v${input.version + 1} through v${input.latestVersion}`
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
