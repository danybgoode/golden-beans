#!/usr/bin/env node
// render-reference.mjs — render the ten approved states from the committed prototype.
//
// Baselines are DERIVED, never stored: a checked-in PNG can drift from the design it claims to
// represent and nobody notices. Re-run this to regenerate `design/reference/*.png` before a
// screenshot-diff run.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { openPrototype, HERE } from './_harness.mjs'

const DIR = join(HERE, 'reference')
mkdirSync(DIR, { recursive: true })

const STATES = [
  ['01-ship-features',          () => { APP.section='ship'; APP.rail='features'; APP.dormantOpen=false; APP.view='list'; render() }],
  ['02-ship-features-expanded', () => { APP.dormantOpen=true; render() }],
  ['03-feature-value',          () => { APP.dormantOpen=false; render(); openFeature('checkout.stripe_enabled','value') }],
  ['04-feature-environments',   () => openFeature('checkout.stripe_enabled','environments')],
  ['05-feature-funnel',         () => openFeature('checkout.stripe_enabled','funnel')],
  ['06-today',                  () => { closeOverlay(); setSection('today') }],
  ['07-setup-connect',          () => { setSection('setup'); setRail('connect') }],
  ['08-setup-keys',             () => setRail('keys')],
  ['09-ship-activity',          () => { setSection('ship'); setRail('activity') }],
  ['10-compare',                () => { setRail('features'); APP.view='compare'; render() }],
]

const { browser, page } = await openPrototype()
for (const [name, fn] of STATES) {
  await page.evaluate(fn)
  await page.waitForTimeout(250)
  await page.screenshot({ path: join(DIR, `${name}.png`) })
  console.log(`  + design/reference/${name}.png`)
}
await browser.close()
console.log(`\n${STATES.length} reference states rendered at 1440×960 @2x.`)
