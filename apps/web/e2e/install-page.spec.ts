import { test, expect } from '@playwright/test'
import { isExperimentGovernanceEnabled, isJourneyProjectionsEnabled } from '@/lib/flags'

// Story 2.2 (commercial-shell/sprint-2.md) — the install page's copy-your-URL field must show a
// real, live connector URL (seeded by scripts/seed-demo-project.mjs), not a placeholder.

test('the /install page renders a live connector URL that actually round-trips', async ({ request }) => {
  const page = await request.get('/install')
  expect(page.status()).toBe(200)
  const html = await page.text()

  const match = html.match(/value="(https?:\/\/[^"]*\/api\/v1\/public\/mcp\/c\/[^"]+)"/)
  expect(match, 'install page should render a connector URL in the copy field').not.toBeNull()
  const connectorUrl = match![1]

  const res = await request.post(connectorUrl, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
  })
  expect(res.status()).toBe(200)
  const body = await res.json()
  const names = body.result.tools.map((tool: { name: string }) => tool.name).sort()
  expect(names).toEqual([
    'compare_experiment',
    ...(isExperimentGovernanceEnabled() ? ['get_experiment_analysis'] : []),
    ...(isJourneyProjectionsEnabled() ? ['get_journey_cohort'] : []),
    'get_north_star',
    'get_tars_funnel',
  ])
})
