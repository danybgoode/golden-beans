import 'server-only'

// Story 2.2 (commercial-shell/sprint-2.md) — resolves the public base URL for building the
// install page's copy-your-URL field. Deliberately NOT a `req.headers.get('host')` fallback
// (Roadmap/LEARNINGS.md: a bare-container Host-header fallback can build a broken URL from a
// garbage header), and deliberately NOT keyed off NODE_ENV either — `next start` always sets
// NODE_ENV=production regardless of where it's actually running (CI's e2e job, a local manual
// `npm run start`, or real Vercel prod all set it identically), so a `NODE_ENV === 'production'`
// branch would silently serve a hardcoded prod URL to CI and local testing too. Production MUST
// set SITE_URL explicitly (owed to Daniel — currently unset, so prod would fall through to the
// localhost default below); the only safe default here is localhost.
export function getSiteUrl(): string {
  const configured = process.env.SITE_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  return 'http://localhost:3000'
}

// A cross-review catch on this PR: without this check, a real Vercel production deploy that's
// missing SITE_URL would silently show a live-looking but broken `localhost:3000` connector URL
// on the public install page. `VERCEL_ENV` (set by Vercel's own build/runtime, distinct from
// NODE_ENV — see this file's other header comment for why NODE_ENV can't be used for this) is only
// 'production' when actually running on Vercel's production deployment, never in CI or a local
// `npm run start` — so this can't falsely hide the connector anywhere this repo tests it.
export function isSiteUrlMisconfiguredInProduction(): boolean {
  return process.env.VERCEL_ENV === 'production' && !process.env.SITE_URL?.trim()
}
