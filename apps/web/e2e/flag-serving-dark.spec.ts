import { test, expect } from '@playwright/test'

test('flag serving and administration are flat 404s while the bootstrap gate is OFF', async ({ request }) => {
  test.skip(
    process.env.FLAG_SERVING_ENABLED === 'true',
    'dedicated dark-path pass requires FLAG_SERVING_ENABLED=false'
  )
  for (const path of ['/api/v1/flags/snapshot', '/api/v1/flags/admin']) {
    const response = await request.get(path, {
      headers: { Authorization: 'Bearer deliberately-invalid' },
    })
    expect(response.status()).toBe(404)
    expect(await response.text()).toBe('')
  }
})
