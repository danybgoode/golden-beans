// console-ia-overhaul · Sprint 2, Story 2.1 — which gate refuses a connector mint.
//
// ── Why a pure module rather than a private function in the action ────────────────────────────
// This decides whether AGENTS rule #3 holds: "the connector has TWO independent kill switches, and
// minting the second must never route around the first." That property rested on one unasserted
// line inside a server action — deleting `if (!isConnectorEnabled())` left every guard in the suite
// green while minting became reachable with the connector switched off (fresh reviewer, PR #123).
//
// A server action cannot be imported by the unit layer (its `@/…` aliases do not resolve under
// `node --test`), so a property that lives there can only ever be source-scanned. Extracted here it
// is a truth table the gate can actually run — the same reasoning as `lib/agent-rail-visibility.ts`
// and `lib/console-shell.ts`, and the same reasoning CODE-QUALITY rule 5 gives.
//
// Zero imports on purpose: the caller supplies the already-read env values, which is what keeps this
// testable without booting a differently-enved process.

// ⚠️ **`'console'` is GONE — mockups-as-built Story 3.3 deleted `CONSOLE_SHELL_ENABLED`.** The
// console is not behind a flag any more; there is no state in which this action serves a page that
// does not exist, so there is no second gate to report. `connectorEnabled` is the whole rule #3
// question and always was — the console check was about a 404 that can no longer happen.
export type ConnectorGate = 'connector' | null

/**
 * Which gate is closed, or `null` when minting may proceed.
 *
 * `connectorEnabled` is AGENTS rule #3's first kill switch. Minting creates the second one (a
 * revocable per-project token), so if minting did not also require the first, flipping the connector
 * off would stop it serving while still letting an owner mint credentials for it. A switch you can
 * route around is not a switch.
 *
 * ⚠️ **The `consoleEnabled` half is gone with `CONSOLE_SHELL_ENABLED` (Story 3.3).** It existed
 * because the action served a page that 404'd while the console was dark; nothing is dark now, so
 * the second branch could never be taken. A gate whose value cannot change is a gate that reads
 * like a decision while making none — the same argument `project-route-inventory.ts` records for
 * the `legacy-keys` gate it deleted for exactly this reason.
 *
 * The signature stays an OBJECT with one field rather than collapsing to a bare boolean: this is
 * the seam AGENTS rule #3 rests on, and a second gate arriving later must be an added field rather
 * than a changed shape at every call site.
 */
export function closedConnectorGate(input: { connectorEnabled: boolean }): ConnectorGate {
  if (!input.connectorEnabled) return 'connector'
  return null
}
