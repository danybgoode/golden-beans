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
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const VIEWPORT = { width: 1440, height: 960 };

export async function openPrototype() {
  const body = readFileSync(join(HERE, 'console-prototype.html'), 'utf8');
  // ⚠️ A UNIQUE directory per call, not a fixed path (cross-family review, agy). It was
  // `join(tmpdir(), 'gb-console-prototype.html')` — one name shared by every caller on the machine.
  // Three scripts import this harness, and two developers, or one `&`-parallel invocation, would
  // have had a second writer truncating the file while the first browser was navigating to it.
  // The failure mode is a half-written prototype measured as if it were the design, which is the
  // one thing this file must never produce.
  const dir = mkdtempSync(join(tmpdir(), 'gb-prototype-'));
  const file = join(dir, 'console-prototype.html');
  writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`);
  // PLAYWRIGHT_BROWSERS_PATH may point at a prebuilt chromium; fall back to the bundled one.
  const executablePath = process.env.GB_CHROMIUM || undefined;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  await page.goto(`file://${file}`);
  await waitForApprovedFonts(page);
  // `close()` rather than a bare `browser`: the per-call temp directory has to go with the browser,
  // and leaving that to each caller is three places to forget it (cross-family review, agy).
  // `browser` is still returned so existing callers keep working.
  return {
    browser,
    page,
    async close() {
      await browser.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** The families the approved design is measured in. Both come from the prototype's own `<link>`. */
export const REQUIRED_FONTS = ['Archivo', 'IBM Plex Mono'];

/**
 * Block until the approved webfonts are actually loaded, and REFUSE to continue if they are not.
 *
 * ── Why this replaced a fixed 400 ms wait ─────────────────────────────────────────────────────
 * The prototype pulls Archivo and IBM Plex Mono from `fonts.googleapis.com`. The harness slept
 * 400 ms and measured whatever had arrived — so every number in `MEASURED-SPEC.md`, and every
 * reference PNG, silently depended on a CDN fetch finishing inside an arbitrary window.
 *
 * That is not a hypothetical flake, and the size of it is worth writing down. Measured on this
 * machine with the font CDN blocked, against the committed numbers:
 *
 *   | element         | fonts loaded | fonts NOT loaded |
 *   |-----------------|--------------|------------------|
 *   | .crumb-btn      | 122 x 30     | 126 x 30         |
 *   | .page-head h1   | 479 x 35     | 527 x 35         |
 *   | .btn-primary    | 115 x 38     | 122 x 38         |
 *
 * `measure-contract.mjs --check` is an EXACT comparison and is now a blocking CI step, so a slow
 * fetch would not have degraded the numbers — it would have turned the gate red for a reason
 * nobody could reproduce locally. Found by the fresh reviewer (Blocking) before it ran on a runner.
 *
 * ── Why `document.fonts` and not `document.fonts.check()` ─────────────────────────────────────
 * `check('12px Archivo')` returns TRUE when Archivo is installed as a SYSTEM font, which it is on
 * the machine these numbers were generated on — so it cannot tell "the webfont arrived" from "a
 * different font of the same name is installed", and those two disagree by 4px on the switcher
 * alone. `document.fonts` contains only CSS-declared faces, so a loaded entry there means the
 * `@font-face` genuinely resolved. Verified both ways: with the CDN reachable it lists both
 * families as `loaded`; with it blocked the set is empty.
 */
export async function waitForApprovedFonts(page) {
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(() => [
    ...new Set(
      [...document.fonts]
        .filter((face) => face.status === 'loaded')
        // Quote-normalised on BOTH sides. `measure-contract.mjs` already does this to
        // `getComputedStyle().fontFamily`, and a check that compares a normalised value on one path
        // and a raw one on the other is two implementations of the same job that currently agree
        // (CODE-QUALITY #2). Raised by cross-family review (agy) as a live false positive; probed
        // in Chromium and it is NOT — `FontFace.family` comes back unquoted even when the CSS
        // declared `font-family: "IBM Plex Mono"`. Hardened anyway, because the cost is one
        // `replace()` and the failure it would cause is this harness refusing a correct render.
        .map((face) => face.family.replace(/["']/g, ''))
    ),
  ]);
  const missing = REQUIRED_FONTS.filter((family) => !loaded.includes(family));
  if (missing.length > 0) {
    throw new Error(
      `the approved prototype's fonts did not load: ${missing.join(', ')}.\n` +
        `  Loaded: ${loaded.join(', ') || '(none)'}\n` +
        '  Every measurement and every reference render is in these families, so continuing would ' +
        'produce numbers and PNGs that cannot be reproduced anywhere else. The prototype fetches ' +
        'them from fonts.googleapis.com — check network access from this environment.'
    );
  }
}
