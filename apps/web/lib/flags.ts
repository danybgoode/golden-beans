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
