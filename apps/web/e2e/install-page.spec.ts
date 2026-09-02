import { test, expect } from '@playwright/test'
import { isExperimentGovernanceEnabled, isJourneyProjectionsEnabled, isTaskMcpToolEnabled } from '@/lib/flags'

// Story 2.2 (commercial-shell/sprint-2.md) — the install page's copy-your-URL field must show a
// real, live connector URL (seeded by scripts/seed-demo-project.mjs), not a placeholder.

test('the /install page renders a live connector URL that actually round-trips', async ({ request }) => {
  const page = await request.get('/install')
  expect(page.status()).toBe(200)
  const html = await page.text()

  // ⚠️ `<code>`, not `value="…"` — design-system-rails Story 6.2. The page moved from the landing's
  // `CopyUrlField` (a readonly `<input>`) to `design-system/copy-field.tsx`, which renders the value
  // as `<code>` on purpose: a credential is not something you edit, and an input's single
  // horizontally-scrollable line hides most of what a reader is about to copy. The assertion is the
  // same one — the URL a visitor can actually take away — against the markup that now carries it.
  const match = html.match(/<code[^>]*>(https?:\/\/[^<]*\/api\/v1\/public\/mcp\/c\/[^<]+)<\/code>/)
  expect(match, 'install page should render a connector URL in the copy field').not.toBeNull()
  const connectorUrl = match![1]

  const res = await request.post(connectorUrl, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
  })
  expect(res.status()).toBe(200)
  const body = await res.json()
  const names = body.result.tools.map((tool: { name: string }) => tool.name).sort()
  // Sorted, so gated entries can be listed in their natural place rather than alphabetically by
  // hand — `get_task`/`list_tasks` do not sort adjacent to each other.
  expect(names).toEqual(
    [
      'compare_experiment',
      ...(isExperimentGovernanceEnabled() ? ['get_experiment_analysis'] : []),
      ...(isJourneyProjectionsEnabled() ? ['get_journey_cohort'] : []),
      'get_north_star',
      'get_tars_funnel',
      // signals-loop Sprint 2 — gated on connector AND signals, like its siblings above.
      ...(isTaskMcpToolEnabled() ? ['get_task', 'list_tasks'] : []),
    ].sort()
  )
})
