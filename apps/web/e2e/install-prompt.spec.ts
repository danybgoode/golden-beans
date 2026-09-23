import { test, expect } from '@playwright/test'
import { INSTALL_PROMPT } from '@/lib/install-prompt'

// golden-frijoles-plugin · Sprint 3, Story 3.3/3.4 — the install prompt is ONE string on three
// surfaces: the landing's closing CTA (`/`), `/install`, and the signed-in onboarding page.
//
// ── Why this checks the RENDERED HTML rather than trusting the import ───────────────────────────
// `CopyPromptCard` renders `{prompt}` as a text child of a `<pre>`, so a real page load is the only
// thing that proves the string actually reached the reader rather than sitting unused in a module
// nobody imports — the same "presence is not execution" failure class
// `check-onboarding-parity.mjs` (golden-frijoles/skills) exists to catch on the plugin repo's own
// surfaces. Both unauthed routes are checked here, in the `api` project (no browser needed — the
// prompt is server-rendered). The onboarding page needs a session; see
// `install-prompt.authed.spec.ts`.
//
// React SSR escapes the apostrophe as `&#x27;` in the raw HTML; decoded back before comparing so
// this asserts the exact string a reader who copies the rendered `<pre>` actually gets.
function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

test('the closing CTA (/) serves INSTALL_PROMPT verbatim', async ({ request }) => {
  const res = await request.get('/')
  expect(res.status()).toBe(200)
  const html = decodeHtmlEntities(await res.text())
  expect(html, '/ does not carry the install prompt verbatim').toContain(INSTALL_PROMPT)
})

test('/install serves INSTALL_PROMPT verbatim', async ({ request }) => {
  const res = await request.get('/install')
  expect(res.status()).toBe(200)
  const html = decodeHtmlEntities(await res.text())
  expect(html, '/install does not carry the install prompt verbatim').toContain(INSTALL_PROMPT)
})
