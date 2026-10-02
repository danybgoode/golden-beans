import { test, expect } from '@playwright/test'
import { createHash, randomBytes } from 'node:crypto'
import { disposableSession } from './helpers/disposable-session'
import { specWorkspaceId } from './helpers/spec-workspace'
import { AGENT_USAGE_EVENT, agentUsageIdempotencyKey } from '../lib/agent-usage'

// finops · Sprint 3, Story 3.3 — /app/finops signed in: a non-member's 404, the empty state, and the populated state
// built from the two real rails (the roadmap push and the `$agent_usage` push), never from rows written by hand.
// The error state (a failed read) cannot be provoked from a browser without breaking the database; its rendering is
// one branch in page.tsx and is named in the sprint doc as not asserted here.

test.describe('/app/finops (finops 3.3)', () => {
  test('a project I am not a member of is a 404, not the page', async ({ browser }) => {
    const session = await disposableSession(browser)
    try {
      const { data: foreign, error } = await session.db
        .from('projects')
        .insert({
          workspace_id: await specWorkspaceId(session.db),
          slug: `spec-finops-foreign-${randomBytes(5).toString('hex')}`,
          api_key_hash: null,
        })
        .select('slug')
        .single()
      if (error || !foreign) throw new Error(error?.message)
      const response = await session.page.goto(`/app/finops/${foreign.slug}`)
      expect(response?.status()).toBe(404)
    } finally {
      await session.cleanup()
    }
  })

  test('empty, then populated from the two pushes', async ({ browser }) => {
    const session = await disposableSession(browser)
    try {
      const { page, db } = session
      const project = await session.addProject('owner', 'finops page')

      // EMPTY — nothing pushed: the page says how to turn the push on, with the setting's real name.
      await page.goto(`/app/finops/${project.slug}`)
      await expect(page.locator('main[data-finops-state="empty"]')).toHaveCount(1)
      await expect(page.getByText('No usage yet.')).toBeVisible()
      await expect(page.getByText('gf-kit config set spend.telemetry on')).toBeVisible()
      await expect(page.getByText(/Claude Code only — other agents not measured/)).toBeVisible()

      // Through the real rails, with a real key for this project.
      const key = `gb_key_spec_${randomBytes(24).toString('base64url')}`
      await db.from('api_keys').insert({
        project_id: project.id,
        key_hash: createHash('sha256').update(key).digest('hex'),
        label: 'finops page spec',
      })
      const roadmap = await page.request.post('/api/v1/roadmap/push', {
        headers: { Authorization: `Bearer ${key}` },
        data: {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          source: { commit: 'abc1234', ref: 'main' },
          items: [
            {
              name: 'Workspaces',
              slug: 'workspaces',
              area: '02 Commercial',
              grain: 'Epic',
              status: 'Shipped',
              appetite: 'M',
              sprint_progress: '10/10 stories',
              quote_low_usd: 24,
              quote_high_usd: 35,
              actual_usd: 33.08,
            },
            { name: 'FinOps', slug: 'finops', area: '09 Platform Infra', grain: 'Epic', status: 'In progress', appetite: 'L' },
          ],
        },
      })
      expect(roadmap.status()).toBe(200)
      const tok = { input: 1, output: 1000, cache_read: 1_000_000, cache_write_5m: 0, cache_write_1h: 10_000 }
      const usage = {
        session_id: `sess-${randomBytes(4).toString('hex')}`,
        epic: 'finops',
        branch: 'feat/finops-s3',
        model_breakdown: { 'claude-opus-5-5': { tokens: tok, usd: 0.3 } },
        skill_breakdown: { 'golden-frijoles:groom': { tokens: tok, usd: 0.3 } },
        tokens_by_kind: tok,
        usd_estimate: 0.3,
        price_table_date: '2026-10-02',
        first_at: new Date(Date.now() - 3_600_000).toISOString(),
        last_at: new Date().toISOString(),
      }
      const track = await page.request.post('/api/v1/track', {
        headers: { Authorization: `Bearer ${key}` },
        data: {
          userId: 'agent:claude-code',
          event: AGENT_USAGE_EVENT,
          metadata: usage,
          context: { version: 1, idempotencyKey: agentUsageIdempotencyKey(usage) },
        },
      })
      expect(track.status()).toBe(201)

      // POPULATED — the approved surface: three tiles, Epics, By skill (and By model), the ≈ API $ note.
      await page.goto(`/app/finops/${project.slug}`)
      const main = page.locator('main[data-finops-state="populated"]')
      await expect(main).toHaveCount(1)
      for (const label of ['Spend this month', 'Quote hit rate', 'Cost per shipped story'])
        await expect(main.locator('.ds-tile-label', { hasText: label })).toHaveCount(1)
      await expect(main.locator('.ds-tile', { hasText: 'Quote hit rate' })).toContainText('1 of 1')
      const epics = main.getByRole('table', { name: 'Epics' })
      await expect(epics.getByRole('row', { name: /Workspaces/ })).toContainText('$24–35')
      await expect(epics.getByRole('row', { name: /Workspaces/ })).toContainText('≈$33')
      await expect(epics.getByRole('row', { name: /FinOps/ })).toContainText('so far')
      await expect(main.getByRole('table', { name: 'By skill' })).toContainText('golden-frijoles:groom')
      await expect(main.getByRole('table', { name: 'By model' })).toContainText('claude-opus-5-5')
      await expect(main.getByRole('button', { name: 'Export CSV' })).toBeVisible()
      await expect(page.getByText(/≈ API \$ is a list-price equivalent/)).toBeVisible()
    } finally {
      await session.cleanup()
    }
  })
})
