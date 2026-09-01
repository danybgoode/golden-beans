import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase-auth'
import { getUserProjects } from '@/lib/membership'
import { resolveActiveProject } from '@/lib/active-project'
import { isSignupEnabled } from '@/lib/flags'
import { getShellNav } from '@/lib/shell-nav'
import { shellRendersAccountMenu } from '@/lib/console-shell'
import { SignOutButton } from '@/components/product/SignOutButton'
import { ProductShell } from '@/components/product/ProductShell'
import { CommandCenter } from '@/components/product/CommandCenter'
import { Empty, PageHead } from '@/design-system/primitives'

// multi-tenant-activation · Sprint 1, Story 1.1 — the authed shell. Unauthed → /login; a signed-in
// member sees EXACTLY their own projects (getUserProjects is a service-role read of the
// membership join table — never derived from the URL).
//
// design-system-rails · Sprint 5, Story 5.2 — this route is **Today** (DD1). Two things changed
// beyond the render:
//
// 1. **It shows ONE project, not a stack of them.** The console chrome names a single tenant in its
//    switcher, and the page under it used to list every project the viewer belongs to — so the
//    header and the body disagreed about whose numbers were on screen. That is the quiet kind of
//    mismatch a person acts on without noticing, and it is the same class the shell's own
//    foreign-slug rule exists to prevent (`lib/shell-nav.ts`).
// 2. **The switcher now switches.** Every project's Today entry used to resolve to the bare `/app`,
//    so on the one page where the switcher is most useful it was a menu of N links to the page you
//    were already on — Story 4.1's own rule, "a control that goes nowhere is worse than no control",
//    measured on the home page. `todayHrefFor` carries the slug.
//
// ⚠️ **The slug is a VIEW preference, never a tenant selector.** It is matched against the viewer's
// own membership list — read server-side from the session — and anything that does not match falls
// back to their first project. A hand-typed `?project=` therefore reaches nothing it could not
// already reach, which is AGENTS.md's rule: the request never selects the tenant.
//
// ⚠️ The fallback is deliberate HERE and would be wrong on a route addressed by tenant.
// `getShellNav` refuses to fall back for a supplied slug, because on `/app/funnel/<slug>/…` the
// chrome and the `<main>` would then name different projects. `/app` is not addressed by tenant at
// all, there is no foreign data to show, and 404-ing the home page over a stale bookmark would be a
// worse answer than showing the reader their own default. The RESOLVED slug is what reaches
// `getShellNav`, so it never sees a slug the viewer is not a member of.
export const dynamic = 'force-dynamic'

export default async function AppHome({
  searchParams,
}: {
  searchParams: Promise<{ provision?: string; project?: string }>
}) {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const projects = await getUserProjects(user.id)

  // multi-tenant-activation · Sprint 2 — the provisioning RETRY trigger. LOAD-BEARING for signup
  // recovery and easy to delete by accident in a rewrite of this page (sprint-3.md says so
  // explicitly), so it stays exactly where it was: above any render, before Today runs a single
  // query.
  //
  // /app is the one surface EVERY authenticated route funnels through, whichever way the user
  // signed in, which makes it the right place to NOTICE a missing tenant. The provisioning itself
  // happens in app/app/provision/route.ts — a Route Handler, because only a Route Handler can set
  // the one-time key cookie.
  //
  // `?provision=failed` breaks the loop: after a failed attempt we render the honest empty state
  // below instead of bouncing back and retrying forever.
  const { provision, project: requestedSlug } = await searchParams
  if (projects.length === 0 && isSignupEnabled() && provision !== 'failed') {
    redirect('/app/provision')
  }

  const active = resolveActiveProject(projects, requestedSlug)

  // Resolved from the SAME seam the shell uses, so the page and its chrome cannot disagree about
  // whether an account menu was rendered — or about which project they are describing.
  // `getSessionUser` and `getUserProjects` are both React `cache()`d per request, so this adds no
  // query, only the pure header arithmetic.
  const shellNav = await getShellNav(active?.slug, 'home')

  return (
    <ProductShell projectSlug={active?.slug} section="home" railActive={null}>
      <main>
        {/* console-ia-overhaul · Story 1.3 — this line renders exactly when the shell did NOT
            render an account menu, so sign-out is present once and never zero times.

            It used to test `!isConsoleShellEnabled()`, which is a DIFFERENT question: the shell
            also needs a resolved header and an email, and a signed-in user with no project (say,
            `/app?provision=failed`) has neither — so the gate being on suppressed this line while
            the shell fell back to the legacy header that has no account menu, leaving the page
            with no way to sign out at all. Found by the fresh reviewer on PR #122.

            Both sides now ask the same predicate rather than two conditions that are supposed to
            agree. */}
        {!shellRendersAccountMenu(shellNav) && (
          <p>
            Signed in as {user.email} · <SignOutButton />
          </p>
        )}

        {active === null ? (
          // The provisioning empty state. A brand-new user must not meet a wall of zeroes
          // (sprint-3.md, step 6) — Today renders one project's numbers, and with no project there
          // are none to render.
          <>
            <PageHead title="Your projects" lede="You are signed in, and not a member of anything yet." />
            <Empty
              title="No project yet"
              body="Ask an owner to add you to theirs, or create one once self-serve signup is live. Nothing on this page can be shown until there is a project to show it for."
            />
          </>
        ) : (
          <CommandCenter project={active} />
        )}
      </main>
    </ProductShell>
  )
}
