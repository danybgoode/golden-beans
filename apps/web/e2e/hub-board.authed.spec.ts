// The css-module shim must load before anything that could import a CSS module (see its own header).
import './helpers/css-module-shim'

import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readTenantRecord } from './helpers/authed-fixture'
import {
  extractSignature,
  signatureArgs,
  diffSignature,
  type Signature,
} from '@/design-system/state-contract-core.mjs'
import { EmptyBoard } from '../app/hub/[projectSlug]/board/board-components'

// board-sinks-and-scrumban · Sprint 2 — the Board tab, signed in, against its approved surfaces.
//
// The visual gate (`console-visual.authed.spec.ts`) measures the ROUTE against `hub-board` — one state per manifest
// row. The route has two more approved states, and this file measures them with the gate's own functions: the card
// view (`?card=`, `hub-board-card`) and the empty board (`hub-board-empty`). It also presses every copy button the
// card view has and reads the clipboard back, because "copies the exact text" is S2.3's whole acceptance.

const CONTRACT = JSON.parse(
  readFileSync(join(__dirname, '..', 'design-system', 'STATE-CONTRACT.json'), 'utf8')
) as { states: Record<string, Signature> }

function slug(): string {
  const record = readTenantRecord()
  if (!record?.slug) throw new Error('the board spec needs the auth-setup project')
  return record.slug
}

test('the board: six columns in order, the answer names the next pull, filters live in the URL', async ({
  page,
}) => {
  await page.goto(`/hub/${slug()}/board`)
  await expect(page.locator('main h1')).toHaveText('Board')
  const columns = page.locator('.ds-tiles--board > .ds-tile .ds-tile-label')
  await expect(columns).toHaveText(['To groom', 'Grooming', 'Ready to build', 'Building', 'QA', 'Shipped'])
  await expect(page.locator('.ds-answer')).toContainText('Next to pull: An idea nobody has bet on yet.')
  // The hub frame's tabs: Board is the fourth hub tab, second in order, and current here.
  await expect(page.locator('nav a[aria-current="page"]')).toHaveText('Board')

  await page.getByRole('link', { name: 'Feature', exact: true }).click()
  await expect(page).toHaveURL(/\/board\?type=feature$/)
  await expect(page.getByRole('link', { name: 'Feature', exact: true })).toHaveAttribute(
    'aria-current',
    'true'
  )
  await page.reload() // a filtered board survives a reload — it is the URL
  // The fixture's four epics are Features; its two seeds carry no type, so the filter leaves exactly the epics.
  await expect(page.locator('.ds-board-card')).toHaveCount(4)
  for (const meta of await page.locator('.ds-board-card-meta').allTextContents())
    expect(meta).toContain('Feature')
})

test('the card view matches the approved hub-board-card state', async ({ page }) => {
  await page.goto(`/hub/${slug()}/board?card=fixture-unbet`)
  const built = await page.evaluate(extractSignature, signatureArgs('product'))
  const differences = diffSignature(CONTRACT.states['hub-board-card'], built)
  expect(differences, differences.join('\n')).toEqual([])
})

test('every copy button on a card copies its exact text', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto(`/hub/${slug()}/board?card=fixture-unbet`)
  const read = () => page.evaluate(() => navigator.clipboard.readText())

  await page.getByRole('button', { name: 'Copy the kickoff prompt' }).click()
  const kickoff = await read()
  expect(kickoff.split('\n')[0]).toBe(
    'Start by pushing the epic branch, before anything else — it is what moves this card to Building on the board:'
  )
  expect(kickoff).toContain('git switch -c feat/fixture-unbet origin/main')

  for (const text of [
    'Build epic fixture-unbet',
    'node skills/groom/emit-epic-kickoff.mjs --epic fixture-unbet',
  ]) {
    await page.getByRole('button', { name: `Copy: ${text}` }).click()
    expect(await read()).toBe(text)
  }
})

test('an unknown card is a 404, never an empty card', async ({ page }) => {
  const response = await page.goto(`/hub/${slug()}/board?card=no-such-initiative`)
  expect(response?.status()).toBe(404)
})

test('the empty board matches the approved hub-board-empty state', async ({ page }) => {
  // The authed tenant always has a pushed board, so the empty state is rendered with the page's own component and
  // measured with the gate's own extractor — the same pair of functions, a different source of markup.
  await page.goto('/login') // any page of ours, for the design-system stylesheet's scope classes
  await page.setContent(
    `<div class="ds"><main>${renderToStaticMarkup(createElement(EmptyBoard))}</main></div>`
  )
  const built = await page.evaluate(extractSignature, signatureArgs('product'))
  const differences = diffSignature(CONTRACT.states['hub-board-empty'], built)
  expect(differences, differences.join('\n')).toEqual([])
})
