import { test, expect } from '@playwright/test'

test('the landing renders the approved roast, foil, icon, and tactile system', async ({ page }, testInfo) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  await expect(page.locator('.brand-lockup').first()).toBeVisible()
  await expect(page.locator('.golden-frijol-mark__face').first()).toBeVisible()
  // landing-redesign-v2 — the v2 headline. `toContainText` normalises the <br/> away, so this
  // reads as one string; the `.foil` assertion below is what pins which half gets the gold-foil
  // treatment, and that split is the whole typographic idea of the hero.
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your roadmap has')
  await expect(page.locator('h1 .foil')).toHaveText('enough opinions')
  await expect(page.locator('.tag svg').first()).toBeVisible()

  const beanFill = await page
    .locator('.golden-frijol-mark__face')
    .first()
    .evaluate((element) => getComputedStyle(element).fill)
  expect(beanFill).toBe('rgb(255, 215, 0)')

  for (const width of [360, 640, 900]) {
    await page.setViewportSize({ width, height: 844 })
    const [scrollWidth, clientWidth] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ])
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  }

  const primary = page.locator('.btn-gold').first()
  await expect(primary).toBeVisible()
  expect(await primary.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(
    44
  )

  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await primary.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('0s')

  await page.screenshot({ path: testInfo.outputPath('landing-desktop.png'), fullPage: true })
  expect(consoleErrors).toEqual([])
})

test('the auth rail is branded, keyboard-visible, and mobile-clean', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const response = await page.goto('/login')
  expect(response?.status()).toBe(200)

  await expect(page.locator('.auth-shell__card')).toBeVisible()
  await expect(page.locator('.brand-lockup')).toBeVisible()
  const email = page.getByLabel('Email')
  await email.focus()
  expect(await email.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none')

  await page.evaluate(() => {
    const cancelled = document.createElement('a')
    cancelled.id = 'cancelled-navigation'
    cancelled.href = '/install'
    cancelled.textContent = 'Stay here'
    cancelled.addEventListener('click', (event) => event.preventDefault())
    document.body.append(cancelled)
  })
  await page.locator('#cancelled-navigation').click()
  await expect(page.locator('.navigation-loader')).toHaveCount(0)
  await expect(page).toHaveURL(/\/login$/)

  const [scrollWidth, clientWidth] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ])
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)

  await page.screenshot({ path: testInfo.outputPath('login-mobile.png') })
})
