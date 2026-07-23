import { test, expect } from '@playwright/test'
import { isJourneyMcpToolEnabled, isJourneyProjectionsEnabled } from '@/lib/flags'

test('journey MCP registration requires connector ON and journey ON independently', () => {
  const connector = process.env.CONNECTOR_ENABLED
  const journey = process.env.JOURNEY_PROJECTIONS_ENABLED
  try {
    process.env.CONNECTOR_ENABLED = 'true'
    process.env.JOURNEY_PROJECTIONS_ENABLED = 'false'
    expect(isJourneyMcpToolEnabled()).toBe(false)
    process.env.CONNECTOR_ENABLED = 'false'
    process.env.JOURNEY_PROJECTIONS_ENABLED = 'true'
    expect(isJourneyMcpToolEnabled()).toBe(false)
    process.env.CONNECTOR_ENABLED = 'true'
    process.env.JOURNEY_PROJECTIONS_ENABLED = 'true'
    expect(isJourneyMcpToolEnabled()).toBe(true)
  } finally {
    if (connector === undefined) delete process.env.CONNECTOR_ENABLED
    else process.env.CONNECTOR_ENABLED = connector
    if (journey === undefined) delete process.env.JOURNEY_PROJECTIONS_ENABLED
    else process.env.JOURNEY_PROJECTIONS_ENABLED = journey
  }
})

// This spec has a dedicated CI pass against a built server whose gate is explicitly OFF. It also
// remains in the normal ON suite but skips there, preventing a test-process/server flag mismatch
// from presenting a misleading kill-switch result.
test('journey seams are nonexistent before auth while OFF and old surfaces stay live', async ({ request }) => {
  test.skip(isJourneyProjectionsEnabled(), 'dedicated dark-path pass requires JOURNEY_PROJECTIONS_ENABLED=false')

  expect((await request.get('/app/journeys/golden-beans-demo')).status()).toBe(404)

  // Deliberately omit Authorization. The gate must run before auth: removing or reordering it
  // changes this exact response from 404 to 401 and fails the dedicated OFF integration pass.
  const subject = await request.get(
    '/api/v1/journeys/missing_journey/subject?subjectId=opaque-dark-subject&version=1',
  )
  expect(subject.status()).toBe(404)
  expect(await subject.json()).toEqual({ ok: false, error: 'Not found' })

  const cohort = await request.get(
    '/api/v1/journeys/missing_journey/cohort?version=1&from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z&asOf=2026-02-01T00:00:00Z&timezone=UTC',
  )
  expect(cohort.status()).toBe(404)
  expect(await cohort.json()).toEqual({ ok: false, error: 'Not found' })

  expect((await request.get('/llms.txt')).status()).toBe(200)
})
