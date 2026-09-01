// design-system-rails · Sprint 5, Story 5.2 — which project Today is about.
//
// ── Why this is a module and not four lines inside `app/app/page.tsx` ─────────────────────────
// Two reasons, and the second is the real one.
//
// 1. A Next.js page file may only export the framework's own names, so a helper exported for a test
//    is a build error. It has to live somewhere; here is where.
// 2. It decides a tenancy-ADJACENT question, and this repo's rule is that anything of that shape is
//    asserted directly rather than by rendering a page (CODE-QUALITY #5). `active-project.test.ts`
//    hands it a membership list and a slug; no session, no database, no browser.
//
// ── Why a fallback is correct HERE and wrong one route over ───────────────────────────────────
// `lib/shell-nav.ts` deliberately does NOT fall back when a caller supplies a slug the viewer is not
// a member of, and its comment says why: on `/app/funnel/<slug>/…` the chrome would then name one
// project while the `<main>` named another, which is the quiet mismatch a person acts on without
// noticing.
//
// `/app` is different in the one way that matters: it is not addressed by tenant. There is no
// foreign data on the page to disagree with, the slug is a VIEW preference carried by the project
// switcher, and 404-ing the home page over a stale bookmark would be a worse answer than showing a
// reader their own default project.
//
// ⚠️ **`projects` is ALWAYS the viewer's own membership list, resolved server-side from the
// session.** That is what makes the fallback safe rather than convenient: the parameter can only
// ever choose among projects the viewer already has, so it selects a view and never a tenant
// (AGENTS.md — the request never selects the tenant).

/**
 * The project Today renders, given the viewer's memberships and an optional requested slug.
 *
 * Returns `null` only when the viewer belongs to nothing, which is a real state (`?provision=failed`
 * reaches it) and gets its own empty page rather than a wall of zeroes.
 *
 * ⚠️ **Generic over `{ slug }` rather than typed to `MemberProject`, and that is not stylistic.**
 * `lib/membership.ts` imports React's `cache`, so importing its type would drag React into a module
 * whose whole point is to be testable with `node --test` and no framework — the repo's own recorded
 * rule that pure logic stays import-free of runtime-only modules. Node's type stripping resolved
 * `react` and died on `cache` the first time this file named that type.
 */
export function resolveActiveProject<T extends { slug: string }>(
  projects: readonly T[],
  requestedSlug: string | undefined | null
): T | null {
  if (projects.length === 0) return null
  const slug = requestedSlug?.trim()
  if (!slug) return projects[0]
  return projects.find((project) => project.slug === slug) ?? projects[0]
}
