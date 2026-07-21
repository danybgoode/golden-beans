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
// Everything downstream of this reads it fresh per request (no module-level capture), so the
// production flip takes effect on the running functions without a redeploy.
export function isSignupEnabled(): boolean {
  return process.env.SIGNUP_ENABLED === 'true'
}
