import { test, expect } from '@playwright/test'

test('flag snapshot serving is a flat 404 while the bootstrap gate is OFF', async ({ request }) => {
  test.skip(process.env.FLAG_SERVING_ENABLED === 'true', 'dedicated dark-path pass requires FLAG_SERVING_ENABLED=false')
  const response = await request.get('/api/v1/flags/snapshot', {
    headers: { Authorization: 'Bearer deliberately-invalid' },
  })
  expect(response.status()).toBe(404)
  expect(await response.text()).toBe('')
})
