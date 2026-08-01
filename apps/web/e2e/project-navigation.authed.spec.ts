import { test, expect } from '@playwright/test'
import { readTenantRecord } from './helpers/authed-fixture'

function tenantSlug(): string {
  const slug = readTenantRecord()?.slug
  if (!slug) throw new Error('the project navigation smoke requires the auth-setup project')
  return slug
}

test('a project member can discover the live Flags and Tasks operating surfaces from /app', async ({ page }) => {
  const slug = tenantSlug()
  await page.goto('/app')

  await expect(page.getByRole('link', { name: 'Flags' })).toHaveAttribute('href', `/app/flags/${slug}`)
  await expect(page.getByRole('link', { name: 'Tasks' })).toHaveAttribute('href', `/app/tasks/${slug}`)

  const flagsResponse = await page.goto(`/app/flags/${slug}`)
  expect(flagsResponse?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: `Feature flags — ${slug}` })).toBeVisible()

  const tasksResponse = await page.goto(`/app/tasks/${slug}`)
  expect(tasksResponse?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: `Tasks — ${slug}` })).toBeVisible()
})
