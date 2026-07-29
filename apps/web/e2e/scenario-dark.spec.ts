import { test, expect } from '@playwright/test'

test('resilience snapshot is a flat 404 before credential work while its root gate is OFF', async ({
  request,
}) => {
  test.skip(
    process.env.RESILIENCE_SCENARIOS_ENABLED === 'true',
    'dedicated dark-path pass requires RESILIENCE_SCENARIOS_ENABLED=false'
  )
  const response = await request.get('/api/v1/scenarios/snapshot?projectId=foreign&environment=production', {
    headers: { Authorization: 'Bearer deliberately-invalid' },
  })
  expect(response.status()).toBe(404)
  expect(await response.text()).toBe('')
})

test('execution stays dark while emergency stop remains reachable with both scenario gates OFF', async ({
  request,
}) => {
  test.skip(
    process.env.RESILIENCE_SCENARIOS_ENABLED === 'true' ||
      process.env.SECURITY_SIMULATIONS_ENABLED === 'true',
    'dedicated execution-dark pass requires both scenario gates OFF'
  )
  const headers = {
    Authorization: 'Bearer deliberately-invalid',
    'x-miyagi-clerk-actor': 'user_fixture',
  }
  const start = await request.post('/api/v1/scenarios/admin', {
    headers,
    data: {
      operation: 'start_run',
      runId: '11111111-1111-4111-8111-111111111111',
      expectedRevision: 1,
      reason: 'dark-path assertion',
    },
  })
  expect(start.status()).toBe(404)
  expect(await start.text()).toBe('')

  const stop = await request.post('/api/v1/scenarios/admin', {
    headers,
    data: {
      operation: 'transition_run',
      runId: '11111111-1111-4111-8111-111111111111',
      expectedRevision: 1,
      transition: 'abort',
      reason: 'emergency stop must stay reachable',
    },
  })
  expect(stop.status()).toBe(401)
})

test('security runner is a flat 404 before body or credential work while OFF', async ({ request }) => {
  test.skip(
    process.env.SECURITY_SIMULATIONS_ENABLED === 'true',
    'dedicated dark-path pass requires SECURITY_SIMULATIONS_ENABLED=false'
  )
  const response = await request.post('/api/v1/scenarios/security', {
    headers: {
      Authorization: 'Bearer deliberately-invalid',
      'Content-Type': 'application/json',
    },
    data: 'not-json',
  })
  expect(response.status()).toBe(404)
  expect(await response.text()).toBe('')
})

test('automatic breaker is a flat 404 before body or credential work while OFF', async ({
  request,
}) => {
  for (const options of [
    {},
    { headers: { Authorization: 'Bearer invalid' }, data: { malformed: true } },
  ]) {
    const response = await request.post('/api/v1/breakers/automatic', options)
    expect(response.status()).toBe(404)
    expect(await response.text()).toBe('')
  }
})
