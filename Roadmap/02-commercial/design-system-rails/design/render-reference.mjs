#!/usr/bin/env node
// render-reference.mjs — render the 25 APPROVED states from the committed prototype.
//
// Baselines are DERIVED, never stored: a checked-in PNG drifts from the design it claims to
// represent and nobody notices. Re-run this to regenerate `design/reference/*.png`.
//
//   node Roadmap/02-commercial/design-system-rails/design/render-reference.mjs
//
// The STATE IDS BELOW ARE THE CONTRACT. Every story in sprints 2-6 cites one of them, and
// `console-visual.authed.spec.ts` asserts the built route against the state of the same id.
// Adding a state here without an approval line in APPROVED.md is the thing Rail 2 forbids.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { openPrototype, HERE } from './_harness.mjs'

const DIR = join(HERE, 'reference')
mkdirSync(DIR, { recursive: true })

const STATES = [
  // ── approved 2026-08-27 (console-ia-overhaul) ────────────────────────────
  ['ship-features',        () => { closeDoor(); leaveHub(); APP.section='ship'; APP.rail='features'; APP.dormantOpen=false; APP.view='list'; render() }],
  ['ship-features-dormant',() => { APP.dormantOpen=true; render() }],
  ['feature-value',        () => { APP.dormantOpen=false; render(); openFeature('checkout.stripe_enabled','value') }],
  ['feature-environments', () => openFeature('checkout.stripe_enabled','environments')],
  ['feature-funnel',       () => openFeature('checkout.stripe_enabled','funnel')],
  ['setup-connect',        () => { closeOverlay(); setSection('setup'); setRail('connect') }],
  ['setup-keys',           () => setRail('keys')],
  ['ship-activity',        () => { setSection('ship'); setRail('activity') }],
  ['ship-compare',         () => { setRail('features'); APP.view='compare'; render() }],
  // ── batch 1 · Measure — approved 2026-08-29 ──────────────────────────────
  ['measure-north-star',   () => { setSection('measure'); setRail('overview') }],
  ['measure-journeys',     () => setRail('journeys')],
  ['measure-journey',      () => openJourney('founding_merchant')],
  ['measure-scenarios',    () => { closeJourney(); setRail('scenarios') }],
  ['funnel-standalone',    () => openFunnelPage()],
  // ── batch 2 · Today, Ship, Setup — approved 2026-08-29 ───────────────────
  ['today',                () => { APP.route=null; setSection('today') }],
  ['tasks-standalone',     () => openTasksPage()],
  ['ship-experiments',     () => { APP.route=null; setSection('ship'); setRail('experiments') }],
  ['experiment-ready',     () => openExperiment('checkout_one_page')],
  ['experiment-blocked',   () => openExperiment('listing_photo_hints')],
  ['setup-destinations',   () => { closeExperiment(); setSection('setup'); setRail('destinations') }],
  ['setup-shares',         () => setRail('shares')],
  // ── batch 3 · the hub — approved 2026-08-29 ──────────────────────────────
  ['hub-roadmap',          () => enterHub()],
  ['hub-epic',             () => openEpic('console-ia-overhaul')],
  ['hub-horizon',          () => setHubTab('horizon')],
  ['hub-report',           () => setHubTab('report')],
  // ── batch 4 · the doors — approved 2026-08-29 ────────────────────────────
  ['door-login',           () => { leaveHub(); openDoor('login') }],
  ['door-signup-closed',   () => { SIGNUP_OPEN = false; openDoor('signup') }],
  ['door-signup-open',     () => { SIGNUP_OPEN = true; render() }],
  ['public-install',       () => { SIGNUP_OPEN = false; openDoor('install') }],
  ['public-share',         () => openDoor('share')],
  ['public-gone',          () => openDoor('gone')],
  ['public-talk',          () => openDoor('talk')],
]

const { browser, page } = await openPrototype()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
for (const [name, fn] of STATES) {
  await page.evaluate(fn)
  await page.waitForTimeout(250)
  await page.screenshot({ path: join(DIR, `${name}.png`) })
  console.log(`  + design/reference/${name}.png`)
}
await browser.close()
if (errors.length) {
  console.error(`\n${errors.length} page error(s) while rendering:`)
  errors.forEach((e) => console.error('  ' + e))
  process.exit(1)
}
console.log(`\n${STATES.length} reference states rendered at 1440x960 @2x, zero page errors.`)
