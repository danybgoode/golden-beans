#!/usr/bin/env node
// measure-contract.mjs — read the approved design's real numbers out of a real browser.
//
// The console-ia-overhaul epic shipped a correct information architecture that looked nothing like
// the approved design, because every acceptance criterion was prose ("a project switcher and four
// sections") and prose cannot fail on the way a page looks. This script is the answer: the contract
// is MEASURED, so a story can cite a number instead of an adjective.
//
// Regenerates the spec table in CONSOLE-CONTRACT.md. Never hand-edit that table.
import { openPrototype } from './_harness.mjs'

const TARGETS = [
  ['.topbar', 'Top bar (tier 1)'], ['.crumb-btn', 'Project switcher'],
  ['.tabs', 'Section nav (tier 2)'], ['.tab[aria-selected="true"]', 'Section tab · active'],
  ['.tab', 'Section tab · inactive'], ['.rail', 'Rail (tier 3)'],
  ['.railnav button[aria-current="true"]', 'Rail item · active'], ['.railnav button', 'Rail item'],
  ['.content', 'Content column'], ['.page-head h1', 'Page h1'], ['.page-head p', 'Page subtitle'],
  ['.answer', 'The answer line'], ['.stat .n', 'Stat number'], ['.stat .k', 'Stat label'],
  ['.listhead', 'List header row'], ['.row', 'Feature row'], ['.row-key', 'Feature key'],
  ['.row-desc', 'Feature description'], ['.pill.on', 'State pill'], ['.sw', 'Switch'],
  ['.dormant', 'Dormant summary row'], ['.btn-primary', 'Primary button'], ['.btn-ghost', 'Secondary button'],
]

const { browser, page } = await openPrototype()
await page.evaluate(() => { APP.section = 'ship'; APP.rail = 'features'; APP.dormantOpen = false; render() })
await page.waitForTimeout(250)

const out = await page.evaluate((targets) => {
  const read = ([sel, label]) => {
    const el = document.querySelector(sel)
    if (!el) return { label, sel, missing: true }
    const s = getComputedStyle(el), r = el.getBoundingClientRect()
    return { label, sel,
      fontSize: parseFloat(s.fontSize), fontWeight: s.fontWeight,
      family: s.fontFamily.split(',')[0].replace(/["']/g, ''),
      textTransform: s.textTransform,
      width: Math.round(r.width), height: Math.round(r.height) }
  }
  return {
    rows: targets.map(read),
    // The three assertions the visual gate leads with.
    noVerticalScroll: document.documentElement.scrollHeight <= window.innerHeight,
    noHorizontalScroll: document.body.scrollWidth <= window.innerWidth,
    featureRows: document.querySelectorAll('.row').length,
    dormantSummaryPresent: !!document.querySelector('.dormant'),
    uppercaseElements: [...document.querySelectorAll('.content *')]
      .filter((e) => getComputedStyle(e).textTransform === 'uppercase' && e.textContent.trim())
      .map((e) => e.className || e.tagName),
    ground: getComputedStyle(document.body).backgroundColor,
  }
}, TARGETS)

console.log(`ground ${out.ground} · no-vertical-scroll ${out.noVerticalScroll} · no-horizontal-scroll ${out.noHorizontalScroll}`)
console.log(`feature rows ${out.featureRows} · dormant summary ${out.dormantSummaryPresent}`)
console.log(`uppercase elements in content: ${out.uppercaseElements.length} → ${out.uppercaseElements.join(', ') || 'none'}`)
console.log('\n| Element | Size / weight | Family | Box | Transform |')
console.log('|---|---|---|---|---|')
for (const r of out.rows) {
  if (r.missing) { console.log(`| ${r.label} | **MISSING** \`${r.sel}\` | | | |`); continue }
  console.log(`| ${r.label} | ${r.fontSize} / ${r.fontWeight} | ${r.family} | ${r.width} × ${r.height} | ${r.textTransform} |`)
}
await browser.close()
