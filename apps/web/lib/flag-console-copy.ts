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
