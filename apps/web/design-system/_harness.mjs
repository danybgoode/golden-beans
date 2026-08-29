// Shared harness: load the approved prototype into a real browser.
// The prototype is authored as an artifact body (no <html>/<head>), so it is wrapped here.
//
// ⚠️ COMMIT THIS FILE. Its absence from `console-ia-overhaul/design/` is why both
// `measure-contract.mjs` and `render-reference.mjs` died with ERR_MODULE_NOT_FOUND on a fresh
// clone for four days — through an entire build, unnoticed, because nothing in CI ran them.
// That is Mechanism D in the epic README. `design-system-rails` Story 1.4 puts all three scripts
// under CI (`--check` on `extract-css` and `measure-contract`, a full render on this harness), so a
// missing import now fails in minutes rather than in four days.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const VIEWPORT = { width: 1440, height: 960 };

export async function openPrototype() {
  const body = readFileSync(join(HERE, 'console-prototype.html'), 'utf8');
  const file = join(tmpdir(), 'gb-console-prototype.html');
  writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`);
  // PLAYWRIGHT_BROWSERS_PATH may point at a prebuilt chromium; fall back to the bundled one.
  const executablePath = process.env.GB_CHROMIUM || undefined;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  await page.goto(`file://${file}`);
  await page.waitForTimeout(400);
  return { browser, page };
}
