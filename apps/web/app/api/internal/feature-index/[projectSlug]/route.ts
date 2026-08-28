import { NextResponse } from 'next/server'
import { requireProjectMembership } from '@/lib/dashboard-auth'
import { getFlagRegistryView } from '@/lib/flag-registry'
import { projectFeatureIndex } from '@/lib/console-palette'

// console-ia-overhaul · Sprint 3, Story 3.4 — what `⌘K` needs to match a feature key, and nothing
// else.
//
// ── Why this route exists at all, and why it is the epic's ONE stated deviation (A6) ──────────
// The Platform-first note promises "no new query". No new SQL is written here — this calls the
// EXISTING `getFlagRegistryView()` — but it is one new ROUTE, and that was decided in A6 rather
// than discovered by a reviewer.
//
// The alternative was seeding the palette from the pages that already hold the registry. It does
// not work: the palette opens on EVERY `/app` route, so seeding means paying the registry's cost on
// every signed-in render to serve a control most sessions never press. Measured against production
// for the largest real tenant (`miyagisanchez`, 2026-08-27): the full registry is **5 round trips,
// 15,639 bytes of definition JSONB and 55 lifecycle-audit rows**. The keys and descriptions alone
// are **1,102 bytes**.
//
// ── The number Story 3.4 has to state ─────────────────────────────────────────────────────────
// **`/app` route load cost is UNCHANGED — zero added queries, zero added bytes.** Nothing here runs
// until somebody presses `⌘K`, and the palette fetches once per page (`CommandPalette` caches the
// result for the life of the component). ~1.1 KB crosses the wire instead of ~16 KB, because the
// projection happens HERE rather than in the browser.
//
// ── No new auth boundary ──────────────────────────────────────────────────────────────────────
// `requireProjectMembership` FIRST, before any read — the same gate every signed-in surface calls,
// literally the same function. A member of another project gets the same flat 404 they get
// everywhere else, and an unauthenticated caller is redirected to /login exactly as a page would
// be. That redirect is why the client treats any non-JSON answer as "features are not indexed"
// rather than as an error worth reporting: following a redirect to a login page is a 200 with HTML
// in it, and `fetch` follows redirects by default.
//
// ⚠️ Flag keys and descriptions are deliberately MEMBER-readable — `getFlagRegistryView` is
// documented as exactly that, and the features list spreads the same data into the page for every
// member. This route hands back strictly LESS than that page already does (no versions, no
// activations, no audit), so it widens nothing.

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params
  const membership = await requireProjectMembership(projectSlug)
  const registry = await getFlagRegistryView(membership.projectId)

  return NextResponse.json(
    { features: projectFeatureIndex(registry.flags) },
    {
      // Per-viewer data behind a session. A shared cache must never hold it, and a browser cache
      // would serve a stale index after a feature is created — which is the one moment a reader is
      // most likely to reach for `⌘K`.
      headers: { 'Cache-Control': 'private, no-store' },
    }
  )
}
