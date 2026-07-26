// Story 2.1 (commercial-shell/sprint-2.md) — the connector's kill-switch. Born unset/OFF
// (epic README, "Kill-switch" section): the MCP connector route no-ops 404 until this is
// deliberately flipped to 'true' (Story 3.3, production only).
//
// Deliberately NOT `import 'server-only'` here (unlike its sibling lib/*.ts files): this is a
// zero-import pure function (Roadmap/LEARNINGS.md — keep pure logic free of framework/runtime-only
// imports) so the e2e suite can assert its dark-default behavior directly, without booting a
// second differently-enved server just to exercise the one-line flag check the route makes.
export function isConnectorEnabled(): boolean {
  return process.env.CONNECTOR_ENABLED === 'true'
}

// multi-tenant-activation · Sprint 2, Story 2.1 — self-serve signup's enablement gate. Same
// polarity and same dark-by-default contract as the connector flag above (epic README,
// "Kill-switch"): born unset/OFF, flipped deliberately in production at Story 3.3.
//
// Exactly `=== 'true'` — not a truthiness check. `SIGNUP_ENABLED=false`, `=0`, `=off` and an
// accidental `= ` must ALL read as OFF; an enablement gate that opens on a typo isn't a gate.
// Everything downstream of this reads it fresh per request (no module-level capture). Vercel still
// snapshots environment variables into a deployment, so a changed value needs a new Git-tracked
// deployment before running functions can observe it (AGENTS.md rule #4).
export function isSignupEnabled(): boolean {
  return process.env.SIGNUP_ENABLED === 'true'
}

// event-destination-router · Sprint 1, Story 1.2 — the dispatcher's enablement gate. Third flag,
// same polarity, same dark-by-default contract as its two siblings above (epic README,
// "Kill-switch"): born unset/OFF in preview and production, flipped deliberately once Sprint 2 has
// a real sink and Sprint 3 has proven it against a disposable receiver.
//
// Exactly `=== 'true'`, for the same reason as `isSignupEnabled`: `DESTINATION_DELIVERY_ENABLED=
// false`, `=0`, `=off`, `=TRUE` and an accidental `= ` must ALL read as OFF. A gate that opens on a
// typo is not a gate — and this particular one opens outbound HTTP to third-party systems.
//
// WHAT IT GATES, PRECISELY: only the dispatcher (lib/delivery-dispatch.ts). Ingest and OUTBOX
// PERSISTENCE stay fully active while it is OFF, which is the whole design — turning delivery off
// must lose no events, it must only stop them moving. If you ever find yourself reading this flag
// on the /track path, something has gone wrong: an ingest that depends on a delivery flag has
// reintroduced exactly the coupling the outbox exists to remove.
//
// Read fresh per request, no module-level capture — but note that on Vercel a new value still needs
// a REDEPLOY to reach running functions (AGENTS.md, corrected 2026-07-21: env vars are snapshotted
// into a deployment at build time). "Set" and "live" are two separate facts.
export function isDestinationDeliveryEnabled(): boolean {
  return process.env.DESTINATION_DELIVERY_ENABLED === 'true'
}

// entity-journeys-projections · Sprint 1, Story 1.1 — enablement gate for every NEW journey seam.
// Born unset/OFF. Definition management, later projections, UI/API and MCP reads must all disappear
// while dark, without changing ingest, TARS, experiments or destination delivery.
//
// Read fresh on every request/action. As above, changing a Vercel env value still needs a new
// Git-tracked deployment before the running app receives the new snapshot.
export function isJourneyProjectionsEnabled(): boolean {
  return process.env.JOURNEY_PROJECTIONS_ENABLED === 'true'
}

// experiment-governance-v2 · Sprint 1 — enablement gate for NEW registry/lifecycle management
// only. Existing local SDK bucketing, exposure ingest and v1 comparison never consult this flag:
// governance must be removable without changing runtime assignment or losing telemetry.
// Born unset/OFF; changing it on Vercel requires a new Git-tracked deployment.
export function isExperimentGovernanceEnabled(): boolean {
  return process.env.EXPERIMENT_GOVERNANCE_ENABLED === 'true'
}

// pod-report · Sprint 3, Story 3.1 — the share-link enablement gate. Sixth flag, same polarity and
// same dark-by-default contract as its siblings (epic README, "Kill-switch"): born unset/OFF,
// flipped deliberately at Story 3.3.
//
// Exactly `=== 'true'`, for the reason the others give: a gate that opens on a typo is not a gate.
// This one is worth stating plainly, because of the five flags above it this is the only one whose
// OFF state is protecting data from ANONYMOUS readers rather than protecting a feature from being
// used early. While it is off, `/s/<token>` must 404 for every token — valid, revoked or invented —
// so the flag is a real kill switch for the whole surface and not merely a feature toggle.
//
// The fine-grained kill is revoking the individual row (lib/report-shares.ts + revokeApiKey). The
// two are independent by design: a revoked token must die while the flag is ON, and every token
// must die while the flag is OFF, regardless of validity. Same two-independent-kill-switches shape
// as the MCP connector (AGENTS rule #3).
export function isReportSharesEnabled(): boolean {
  return process.env.REPORT_SHARES_ENABLED === 'true'
}

// signals-loop · Story 1.0 — the seventh flag, and the enablement gate for the whole signals seam:
// error/friction capture, deterministic grouping, signal→task promotion, the dashboard task views
// and the connector's task READ tools. Born unset/OFF.
//
// Amendment 5 (epic README) added this. The groom had planned only CONNECTOR_WRITES_ENABLED below,
// but that flag gates a mutation surface, not a seam — and capture/grouping/tasks is a new ingest
// AND storage surface, which every prior epic gave its own born-OFF gate
// (JOURNEY_PROJECTIONS_ENABLED, EXPERIMENT_GOVERNANCE_ENABLED, REPORT_SHARES_ENABLED). Without
// this, the only way to stop signal capture would be a revert.
//
// Exactly `=== 'true'`, for the reason all six above give: a gate that opens on a typo is not a
// gate. Read fresh per request; on Vercel a changed value still needs a new Git-tracked deployment
// (AGENTS.md rule #4 — "set" and "live" are two separate facts).
export function isSignalsEnabled(): boolean {
  return process.env.SIGNALS_ENABLED === 'true'
}

// signals-loop · Story 1.0 — the engine's FIRST PUBLIC MUTATION SURFACE, and therefore the flag on
// this list whose OFF state matters most. Born unset/OFF, flipped deliberately at Story 3.4.
//
// WHAT IT GATES, PRECISELY: only the staged connector write tools (claim/resolve/dismiss). Signal
// capture, grouping, promotion, the dashboard and the task READ tools all ride isSignalsEnabled()
// above and are unaffected. Turning writes off must not stop the queue filling — it must only stop
// an agent changing it.
//
// This flag is ONE of three independent kill switches on that surface (epic README, Amendment 2):
// this env gate · revoking the project's connector token · revoking the agent_write credential.
// Any one of them alone must be sufficient, which is why none of them is checked in place of
// another. AGENTS rule #3 requires two for the connector; the first mutation path earns a third.
export function isConnectorWritesEnabled(): boolean {
  return process.env.CONNECTOR_WRITES_ENABLED === 'true'
}

/** Registration predicate for journey-only MCP tools. The route still performs its connector gate
 * before token resolution; this shared pure predicate pins that a journey tool needs BOTH gates. */
export function isJourneyMcpToolEnabled(): boolean {
  return isConnectorEnabled() && isJourneyProjectionsEnabled()
}

/** Registration predicate for the task READ tools. Same shape as the journey predicate above: the
 * route enforces its route-wide connector flag and revocable token first, and this pins that a task
 * tool additionally needs the signals seam to be enabled. */
export function isTaskMcpToolEnabled(): boolean {
  return isConnectorEnabled() && isSignalsEnabled()
}

/** Registration predicate for the staged WRITE tools. Deliberately requires all three flags rather
 * than delegating to isTaskMcpToolEnabled(): a reader checking "can this agent mutate?" should see
 * every condition in one expression, not inherit two of them from a helper named after reads. The
 * credential checks (connector token + agent_write key, same project) are enforced separately at
 * call time — a flag can only decide whether the tool EXISTS. */
export function isConnectorWriteToolEnabled(): boolean {
  return isConnectorEnabled() && isSignalsEnabled() && isConnectorWritesEnabled()
}

/** Governed experiment reads are independently removable while the legacy compare tool remains
 * available. The connector route still enforces its route-wide flag and revocable token first. */
export function isExperimentGovernanceMcpToolEnabled(): boolean {
  return isConnectorEnabled() && isExperimentGovernanceEnabled()
}
