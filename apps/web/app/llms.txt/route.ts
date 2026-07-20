import { getSiteUrl } from '@/lib/site-url'

// GET /llms.txt — Story 3.2 (commercial-shell/sprint-3.md). An `llms.txt`-style manifest listing
// the public routes and the connector's docs, for a searcher (human or agent) that wants a plain-
// text map of the offer instead of parsing rendered HTML. Built as a real route (not a hand-
// maintained static string) for two reasons: (1) `getSiteUrl()` — never a hardcoded prod URL, same
// rule as every other absolute URL in this app (see lib/site-url.ts) — so this can't drift to a
// wrong-env URL the way a checked-in static file could; (2) it only claims what's ACTUALLY live
// this sprint, mirroring app/page.tsx's own honesty rule (references/landing-end-state.md's
// section map has 'next'-status sections this manifest deliberately omits — a manifest is a claim
// surface too, same "✅ only for shipped" guardrail as the landing itself, design-direction.md).
//
// Same force-dynamic rationale as app/page.tsx/app/install/page.tsx: a build-time-frozen response
// would (a) bake in whatever SITE_URL the CI build happens to have (none, in the typecheck-build
// job) and (b) go stale the moment this list changes without a redeploy.
export const dynamic = 'force-dynamic'

export async function GET() {
  const siteUrl = getSiteUrl()

  const body = `# Golden Beans

> The growth engine your agent operates: telemetry ingest, TARS funnels, North Star metrics, and
> A/B experiments, exposed to your agent as MCP tools over a per-project connector.

## Public routes

- ${siteUrl}/
  The landing page — the product pitch, a live proof section reading the real synthetic demo
  project, and the waitlist signup.
- ${siteUrl}/install
  Get your own tokenized MCP connector URL ("Add to Claude" deep-link) for the demo project, plus
  the SDK install docs for wiring your own product into the engine.

## Connector docs (MCP)

- POST ${siteUrl}/api/v1/public/mcp/c/{token}
  A per-project, revocable, read-only MCP endpoint. \`{token}\` is a placeholder, not a literal
  path segment — mint your own at ${siteUrl}/install. Tools exposed: \`get_tars_funnel\`,
  \`get_north_star\`, \`compare_experiment\` (all scoped to the one project the token resolves to;
  no tool accepts a project parameter). Returns 404 while the connector is disabled
  (\`CONNECTOR_ENABLED\` unset — the default until this epic's launch story flips it on).

This manifest lists only what is live in this deployment right now.
`

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
