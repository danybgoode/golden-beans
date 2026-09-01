// design-system-rails · Sprint 4, Story 4.3 — Ship › Scheduled changes.
//
// ── This route exists because the approved rail has four items and the product had three ──────
// ⚠️ **There is no scheduling capability anywhere in this product.** No table, no job, no control,
// nothing that could write a future change — verified by grep across the whole repo at the
// architecture lock. The sprint doc originally said this surface "renders the same row language with
// its honest empty state (the rail shows `0` today)", which described the PROTOTYPE's rail as though
// it were the product's; a builder would have gone looking for a page that does not exist.
//
// Dropping a rail item is an amendment to an approved design, so it went to the product owner
// rather than into an architect's judgement. **Decided 2026-08-29 by Daniel: ship the designed
// empty-state route.** The recommendation was the opposite — drop the item and record the gap,
// because Story 4.1's own rule is *"a control that goes nowhere is worse than no control"* — and
// that counter-argument is recorded in the epic README (D13) rather than lost.
//
// ── The mitigation is the copy, and it is the whole deliverable ───────────────────────────────
// The accepted condition was that the empty state says **plainly that scheduling is not available
// yet**. It must NOT read as "you have no scheduled changes", which implies you could have some and
// sends a reader looking for the control that would create one. An empty state is one of the ten
// states and is a deliverable, not a fallback.
//
// So: `unbuilt`, not `empty`. `references/ux-guidelines.md` is explicit that the two "must look
// different" — one is *you cannot do this right now* and it comes back, the other is *this is not
// built yet* and it does not. This page is the second, and it is the first surface in the product
// to render that state.
//
// ── Gate: dark means nonexistent, before auth ─────────────────────────────────────────────────
// Same shape as every gated route in the product: the flag check runs BEFORE
// `requireProjectMembership`, so while the console is dark this 404s for everyone rather than
// leaking its existence through a login redirect. It rides `FLAG_CONSOLE_ENABLED` because it sits in
// Ship beside Features and Activity, and a rail item that survived a console rollback would point at
// a page rendered by an epic that had been rolled back.

import { notFound } from 'next/navigation'
import { requireProjectMembership } from '@/lib/dashboard-auth'
import { isFlagConsoleEnabled } from '@/lib/flags'
import { Callout, EmptyCard, PageHead } from '@/design-system/primitives'
import { ProductShell } from '@/components/product/ProductShell'

export const dynamic = 'force-dynamic'

export default async function ScheduledChangesPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  if (!isFlagConsoleEnabled()) notFound()
  const { projectSlug } = await params
  // MEMBER-readable. There is nothing here to protect — the page holds no data at all — and
  // owner-gating a page that says "this is not built yet" would tell a member less than it tells
  // everyone else for no boundary in return.
  await requireProjectMembership(projectSlug)

  return (
    <ProductShell projectSlug={projectSlug} section="ship" railActive="scheduled">
      <main>
        <PageHead
          title="Scheduled changes"
          lede="A change you set now that happens to an environment later, on its own, without anybody being awake for it."
        />

        {/* ⚠️ **This says the capability does not exist. It does not say you have none.** The
            difference is the entire reason this page was allowed to ship: "Nothing is scheduled"
            reads as an empty list, sends a reader hunting for the control that would fill it, and
            makes the product look broken rather than unfinished. */}
        <EmptyCard
          state="unbuilt"
          title="Scheduling is not built yet"
          body={
            <>
              Nothing in Golden Frijoles can schedule a feature change today — there is no control that
              creates one, so this is not an empty list. When it exists, a change you set for later will wait
              here where you can see it coming, and you will be able to cancel it before it happens.
            </>
          }
        />

        {/* Where to go INSTEAD, because a page that only says "not yet" is a dead end. Turning a
            feature on and off is available right now, and it is one click away. */}
        <Callout>
          Until then, a feature change happens the moment you make it. You can turn one on or off per
          environment from <a href={`/app/flags/${projectSlug}`}>Features</a>, and every change is recorded
          with who made it and why in <a href={`/app/flag-audit/${projectSlug}`}>Activity</a>.
        </Callout>
      </main>
    </ProductShell>
  )
}
