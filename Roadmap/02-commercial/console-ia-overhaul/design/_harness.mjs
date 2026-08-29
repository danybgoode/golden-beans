// Shared harness: load the approved prototype into a real browser.
// The prototype is authored as an artifact body (no <html>/<head>), so it is wrapped here.
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

export const HERE = dirname(fileURLToPath(import.meta.url))
export const VIEWPORT = { width: 1440, height: 960 }

export async function openPrototype() {
  const body = readFileSync(join(HERE, 'flags-console-prototype.html'), 'utf8')
  const file = join(tmpdir(), 'console-prototype.html')
  writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`)
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 })
  await page.goto(`file://${file}`)
  await page.waitForTimeout(400)
  return { browser, page }
}
