import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/site-url'

// GET /robots.txt — methodology-experience · Sprint 4, Story 4.3 (amendment A6).
//
// This repo did not own its robots.txt. Production served the deploy platform's default: a wall of
// content-signal boilerplate with NO `User-agent`, NO `Allow`, and — the part that matters — no
// `Sitemap:` line. Measured, not assumed.
//
// ── What this says, and what it deliberately does not ─────────────────────────────────────────
// Everything public is allowed, the signed-in and bearer-token surfaces are disallowed, and the
// sitemap is named. That last line is the point: a sitemap nothing points at is a file nobody
// fetches.
//
// It does NOT block AI crawlers. This product's public argument is that an agent should be able to
// read the methodology — the epic added a generated markdown edition specifically so one can
// (Story 4.2, amendment A6). Disallowing `GPTBot` while shipping `/llms.txt` would be the site
// contradicting itself, and it is the product owner's call to make, not a default to slip in here.
export const dynamic = 'force-dynamic'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          // Signed-in surfaces. A crawler following these gets a login redirect and learns nothing;
          // worse, a redirect chain looks like a broken site.
          '/app/',
          '/hub/',
          // Bearer-token share links. These are unguessable by design and must never be indexed —
          // a URL in an index is a URL that has stopped being private.
          '/s/',
          // Actions rather than content, and `/signup` 404s while its gate is off.
          '/login',
          '/signup',
          // The engine's API. Nothing here renders for a reader.
          '/api/',
        ],
      },
    ],
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  }
}
