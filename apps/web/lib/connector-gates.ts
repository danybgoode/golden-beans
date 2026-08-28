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

export type ConnectorGate = 'connector' | 'console' | null

/**
 * Which gate is closed, or `null` when minting may proceed.
 *
 * `connectorEnabled` is AGENTS rule #3's first kill switch. Minting creates the second one (a
 * revocable per-project token), so if minting did not also require the first, flipping the connector
 * off would stop it serving while still letting an owner mint credentials for it. A switch you can
 * route around is not a switch.
 *
 * `consoleEnabled` is checked because the action exists only to serve a page that 404s without it,
 * and a server action is reachable by POST whether or not its page ever rendered.
 *
 * **The connector is reported FIRST when both are closed**, and that ordering is deliberate: it is
 * the one that matters for rule #3, and an operator told "the console is off" while the connector
 * was also off would go and fix the wrong thing.
 */
export function closedConnectorGate(input: {
  connectorEnabled: boolean
  consoleEnabled: boolean
}): ConnectorGate {
  if (!input.connectorEnabled) return 'connector'
  if (!input.consoleEnabled) return 'console'
  return null
}
