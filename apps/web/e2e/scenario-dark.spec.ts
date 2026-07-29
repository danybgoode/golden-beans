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
