import { test, expect } from '@playwright/test'

test('flag catalog sync is a flat 404 before credential or body work while its root gate is OFF', async ({ request }) => {
  test.skip(
    process.env.FLAG_DEFINITION_SYNC_ENABLED === 'true',
    'dedicated dark-path pass requires FLAG_DEFINITION_SYNC_ENABLED=false'
  )
  const response = await request.post('/api/v1/flags/sync', {
    headers: { Authorization: 'Bearer deliberately-invalid', 'Content-Type': 'application/json' },
    data: { contractVersion: 999, entries: 'malformed' },
  })
  expect(response.status()).toBe(404)
  expect(await response.text()).toBe('')
})
