// methodology-experience · Sprint 4, Story 4.3 (amendment A6) — what this site tells crawlers exists.
//
// ── This did not exist, and Story 4.3 assumed it did ──────────────────────────────────────────
// The story's acceptance read "the routes appear wherever the site tells crawlers what exists".
// Measured on live production: `/sitemap.xml` was a **404**, and `/robots.txt` was the deploy
// platform's default boilerplate with no `User-agent`, no `Allow` and no `Sitemap:` line. The
// sentence read as though a crawler manifest were already in place. Nothing owned building one.
//
// ── What belongs here, and what deliberately does not ─────────────────────────────────────────
// Only routes that are PUBLIC, STABLE and meaningful to a stranger. Everything excluded is excluded
// for a stated reason, because a sitemap's failure mode is silent: listing a route that 404s or that
// requires a session teaches a crawler the site is broken, and omitting a real one is invisible.
//
//   · `/hub/*`, `/app/*`   — signed-in surfaces. A crawler reaching them gets a login redirect.
//   · `/s/[token]`         — a bearer URL. Listing it would publish the token; the whole point of a
//                            share link is that it travels by hand.
//   · `/login`, `/signup`  — actions, not content, and `/signup` is gated by `SIGNUP_ENABLED`. A
//                            sitemap that names a route which 404s while a flag is off is the
//                            "announced vs shipped" defect (CODE-QUALITY #9) in a machine-readable
//                            file, where nobody would notice it.
//
// The methodology routes are DERIVED from the content module, never listed by hand — the same rule
// as `generateStaticParams`, so a seventh chapter appears in the sitemap with no edit here and a
// retired one cannot linger.

/** A route in the sitemap, with the hint crawlers use to prioritise a recrawl. */
export interface PublicRoute {
  path: string
  changeFrequency: 'daily' | 'weekly' | 'monthly'
  priority: number
}

/**
 * Build the public route set.
 *
 * `chapterIds` is a parameter rather than an import so this stays pure and unit-testable — and so
 * the spec can assert the round trip (every chapter in the module is in the sitemap, and every
 * methodology path in the sitemap is a chapter) against the SAME list the routes are generated
 * from, rather than against a re-typed copy.
 */
export function publicRoutes(chapterIds: readonly string[]): PublicRoute[] {
  return [
    // The landing changes with every repositioning; the methodology changes when the method does.
    { path: '/', changeFrequency: 'weekly', priority: 1 },
    { path: '/methodology', changeFrequency: 'monthly', priority: 0.9 },
    ...chapterIds.map((id) => ({
      path: `/methodology/${id}`,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    // The generated edition: one document carrying the whole method, and the cheapest thing an
    // agent can fetch to get all of it (Story 4.2).
    { path: '/methodology/edition.md', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/install', changeFrequency: 'monthly', priority: 0.6 },
    { path: '/talk', changeFrequency: 'monthly', priority: 0.5 },
    // Agent-facing manifests. Listing them is not decoration: it is how a crawler that has never
    // seen this site finds the machine-readable entry points at all.
    { path: '/llms.txt', changeFrequency: 'monthly', priority: 0.5 },
    { path: '/northstar-self-serve.md', changeFrequency: 'monthly', priority: 0.4 },
  ]
}
