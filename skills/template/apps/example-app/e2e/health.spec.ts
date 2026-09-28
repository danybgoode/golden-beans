import { test, expect } from '@playwright/test'

// The `api` project — the deterministic gate. No browser binaries: the `request` fixture only.
// TEMPLATE FILL-IN: replace with your first real story's API assertion.
test('health endpoint answers ok', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.ok()).toBeTruthy()
  expect(await res.json()).toEqual({ ok: true })
})
