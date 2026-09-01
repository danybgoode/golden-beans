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

  // ⚠️ **The affordances MOVED with design-system-rails Story 5.2, and the property did not.**
  //
  // `/app` used to end in a bare `<ul>` of every surface — a link literally captioned "Flags" and
  // another captioned "Tasks". The approved `today` state has no such list, because the shell's
  // section nav IS the navigation and a page that lists its own routes is answering "which URLs
  // exist" rather than "did anything need me today".
  //
  // So this asserts the same thing through what a person actually clicks now: the **Ship** tab,
  // which lands on Features, and the **band's own link** to the queue. Rewritten rather than
  // deleted — "a member can reach the live operating surfaces from /app" is still exactly the
  // property worth defending, and a spec that quietly stopped checking it would be the more
  // expensive outcome.
  await expect(page.getByRole('link', { name: 'Ship', exact: true })).toHaveAttribute(
    'href',
    `/app/flags/${slug}`
  )
  await expect(page.getByRole('link', { name: /See every task/ })).toHaveAttribute(
    'href',
    `/app/tasks/${slug}`
  )

  const flagsResponse = await page.goto(`/app/flags/${slug}`)
  expect(flagsResponse?.status()).toBe(200)
  // ⚠️ The heading is "Features", not "Feature flags — <slug>" (console-ia-overhaul). The project
  // is already named in the top bar's switcher; repeating it in the h1 was the same fact twice, and
  // at 48px it wrapped to four lines on a real slug. What this spec actually cares about is that
  // the destination rendered its own page rather than an error or an empty shell — so it asserts
  // the heading AND that the list arrived, which the old title check never did.
  await expect(page.getByRole('heading', { name: 'Features', exact: true })).toBeVisible()
  await expect(page.locator('[data-feature-list]')).toBeVisible()

  const tasksResponse = await page.goto(`/app/tasks/${slug}`)
  expect(tasksResponse?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible()
})
