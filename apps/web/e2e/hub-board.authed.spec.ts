// The css-module shim must load before anything that could import a CSS module (see its own header).
import './helpers/css-module-shim'

import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
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
  // The fixture's kickoff, byte for byte (auth.setup.ts seeds exactly this).
  const KICKOFF =
    'Start by pushing the epic branch, before anything else — it is what moves this card to Building on the board:\n' +
    '`git switch -c feat/fixture-unbet origin/main && git push -u origin feat/fixture-unbet`'
  const expected: Record<string, string> = {
    'Copy the kickoff prompt': KICKOFF,
    'Copy: kickoff prompt': KICKOFF,
    'Copy: Build epic fixture-unbet': 'Build epic fixture-unbet',
  }
  const buttons = page.locator('main button[aria-label^="Copy"]')
  const names = await buttons.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''))
  // EVERY copy button on the card is pressed — and every one is accounted for, so a new button cannot slip past.
  expect(names.sort()).toEqual(Object.keys(expected).sort())
  for (const name of names) {
    await page.getByRole('button', { name, exact: true }).click()
    expect(await read(), name).toBe(expected[name])
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

// ── board-sinks-and-scrumban · Sprint 4, Story 4.2 — one board across a workspace (tenancy) ───────────────────────

function serviceDb() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  return createClient(url, key, { auth: { persistSession: false } })
}

/** The fixture tenant's workspace — read with the service role, the way the spec knows it; the PAGE never sees this. */
async function fixtureWorkspaceId(): Promise<string> {
  const { data, error } = await serviceDb()
    .from('projects')
    .select('workspace_id')
    .eq('slug', slug())
    .single()
  if (error || !data?.workspace_id)
    throw new Error(`could not read the fixture's workspace: ${error?.message}`)
  return data.workspace_id as string
}

test('the workspace board matches the approved hub-workspace-board state and shows the viewer’s projects', async ({
  page,
}) => {
  const ws = await fixtureWorkspaceId()
  await page.goto(`/hub/w/${ws}/board`)
  const built = await page.evaluate(extractSignature, signatureArgs('product'))
  const differences = diffSignature(CONTRACT.states['hub-workspace-board'], built)
  expect(differences, differences.join('\n')).toEqual([])
  // Every card names its project and opens on THAT project's board.
  const first = page.locator('.ds-board-card').first()
  await expect(first).toContainText(slug())
  await expect(first).toHaveAttribute('href', new RegExp(`^/hub/${slug()}/board\\?card=`))
  // The project filter is the viewer's projects, and it carries in the URL.
  await page.getByRole('link', { name: slug(), exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/hub/w/${ws}/board\\?project=${slug()}$`))
})

test('tenancy: another workspace, a malformed id, and a project from another workspace are all 404 (S4.2)', async ({
  page,
}) => {
  const db = serviceDb()
  // A workspace that exists and that the viewer does NOT belong to, holding a project that also exists.
  const { data: other, error } = await db
    .from('workspaces')
    .insert({ name: 'not yours' })
    .select('id')
    .single()
  if (error || !other) throw new Error(`could not create a foreign workspace: ${error?.message}`)
  const foreignSlug = `foreign-${Date.now()}`
  const { data: foreign, error: pErr } = await db
    .from('projects')
    .insert({ workspace_id: other.id, slug: foreignSlug })
    .select('id')
    .single()
  if (pErr || !foreign) throw new Error(`could not create a foreign project: ${pErr?.message}`)
  try {
    for (const url of [
      `/hub/w/${other.id}/board`,
      '/hub/w/not-a-uuid/board',
      `/hub/w/${await fixtureWorkspaceId()}/board?project=${foreignSlug}`,
    ]) {
      const response = await page.goto(url)
      expect(response?.status(), url).toBe(404)
      await expect(page.locator('body')).not.toContainText(foreignSlug)
    }
  } finally {
    // Leave nothing behind: the fixture teardown deletes ITS workspace, and a stray project would block it.
    await db.from('projects').delete().eq('id', foreign.id)
    await db.from('workspaces').delete().eq('id', other.id)
  }
})

test('signed out, a workspace board sends you to sign in — a workspace is never public', async ({
  browser,
}) => {
  const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await anonymous.newPage()
  await page.goto(`/hub/w/${await fixtureWorkspaceId()}/board`)
  await expect(page).toHaveURL(/\/login/)
  await anonymous.close()
})
