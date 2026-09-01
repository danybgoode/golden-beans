// RETIRED — design-system-rails · Sprint 4, Story 4.5.
//
// This route minted and revoked credentials. Setup › Keys now does both, for all four kinds, and
// the replacement landed in the SAME commit that emptied this file — the ordering rule this epic
// keeps (`console-ia-overhaul` A3): never a cleanup story, because with the console live a missing
// control is noticed the day it goes missing.
//
// ── A redirect, not a 404, and not a deletion ─────────────────────────────────────────────────
// The sprint walkthrough allows either. A redirect is the kinder half of it: this URL is in
// bookmarks, in the two epics of commit messages that reference it, and in whatever an operator
// pasted into a runbook. `permanentRedirect` tells a browser and a crawler that the move is
// permanent, which is what it is.
//
// The FILE stays because the coverage manifest carries a row for this route with `retiresIn: 4`, and
// `route-manifest.test.ts` asserts every manifest row points at a real `page.tsx`. `liveRows()` is
// what removes it from the denominator; deleting the file would instead make the manifest and the
// repository disagree. It owes no reference state — a redirect has no design.
//
// ── No auth check here, deliberately ──────────────────────────────────────────────────────────
// The destination is owner-gated (`requireProjectOwnership` at the route), so a member following
// this link gets the same flat 404 they got from this page before. Re-checking here would be a
// second, weaker copy of a boundary that is already enforced where it matters — and this file must
// not become somewhere a future edit could relax it.

import { permanentRedirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function RetiredCredentialRoute({
  params,
}: {
  params: Promise<{ projectSlug: string }>
}) {
  const { projectSlug } = await params
  permanentRedirect(`/app/setup/keys/${projectSlug}`)
}
