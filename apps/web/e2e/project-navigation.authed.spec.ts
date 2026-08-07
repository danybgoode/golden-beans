import { test, expect } from '@playwright/test'
import { readTenantRecord } from './helpers/authed-fixture'

function tenantSlug(): string {
  const slug = readTenantRecord()?.slug
  if (!slug) throw new Error('the project navigation smoke requires the auth-setup project')
  return slug
}

test('a project member can discover the live Flags and Tasks operating surfaces from /app', async ({
  page,
}) => {
  const slug = tenantSlug()
  await page.goto('/app')

  // `exact` because /app now carries more than one link per surface: the shell's section nav plus,
  // when the rail is on, its "Open tasks" shortcut. Both point at the same href — the ambiguity is
  // in the locator, not in the page — so the fix is to name the inventory link precisely rather
  // than to rename a legitimate second entry point (app-shell-and-agent-rail S2.3).
  await expect(page.getByRole('link', { name: 'Flags', exact: true })).toHaveAttribute(
    'href',
    `/app/flags/${slug}`
  )
  await expect(page.getByRole('link', { name: 'Tasks', exact: true })).toHaveAttribute(
    'href',
    `/app/tasks/${slug}`
  )

  const flagsResponse = await page.goto(`/app/flags/${slug}`)
  expect(flagsResponse?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: `Feature flags — ${slug}` })).toBeVisible()

  const tasksResponse = await page.goto(`/app/tasks/${slug}`)
  expect(tasksResponse?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: `Tasks — ${slug}` })).toBeVisible()
})
