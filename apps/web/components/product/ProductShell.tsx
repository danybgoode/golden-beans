import 'server-only'
import type { ProjectRouteSegment } from '@/lib/project-route-inventory'
import { BrandLockup } from '@/components/brand/BrandLockup'
import { Icon } from '@/components/ui/Icon'
import { getShellNav } from '@/lib/shell-nav'
import { railLinksFor, shellRendersAccountMenu, TODAY_HREF, type ShellSection } from '@/lib/console-shell'
import { SignOutButton } from './SignOutButton'
import { AgentRail } from './AgentRail'
import { ConsoleRail } from './ConsoleRail'
import { CommandPalette } from './CommandPalette'
import { ShellErrorBoundary } from './ShellErrorBoundary'

/**
 * Product chrome is rendered inside each page after its auth/flag guard resolves.
 *
 * This must not become an App Router layout: Next may stream a parent layout before a child calls
 * `notFound()`, turning the required dark-route 404 into a 200 with not-found content. Keeping the
 * shell below the guard makes the HTTP status and the visual rail agree.
 *
 * app-shell-and-agent-rail · Sprint 1, Story 1.3 — the section nav.
 * console-ia-overhaul · Sprint 1, Story 1.3 — the four-destination header, behind
 * `CONSOLE_SHELL_ENABLED`.
 *
 * `projectSlug` is the page's own project, passed so the sections point at the project you are
 * actually looking at. It is a HINT, not an authorization input: lib/shell-nav.ts matches it
 * against the membership list it reads server-side and ignores anything that does not match, so a
 * slug in a URL can never make this render another tenant's sections.
 *
 * ── `section` is REQUIRED, and that is the point (epic README, A8) ────────────────────────────
 * Next.js gives a Server Component no pathname, and the alternative — a client island calling
 * `usePathname()` — is the one thing this file's comments forbid twice: the shell wraps every
 * signed-in route including error and gated states, so a client island here would be the single
 * component able to break all of them at once.
 *
 * So each page declares where it lives. Making the prop required rather than optional turns "every
 * page belongs to a section" into a compile error at all 26 render sites (18 files) instead of a convention that
 * decays the first time someone adds a route. `home` is `/app` itself, and it has to be said out
 * loud rather than achieved by leaving the prop off.
 *
 * Deliberately NOT gated by AGENT_RAIL_ENABLED (app-shell-and-agent-rail README, D6). A rail can be
 * born off and flipped on; navigation that vanishes with a flag is a worse failure than no flag.
 */
export async function ProductShell({
  children,
  projectSlug,
  section,
  railTop,
  railActive,
}: {
  children: React.ReactNode
  projectSlug?: string
  section: ShellSection
  /**
   * Section-level controls rendered above the rail's links — today, Ship's environment picker.
   * See `ConsoleRail`'s `top` prop: the rail is shared across sections and must not learn what an
   * environment is, so the section that HAS one supplies it.
   */
  railTop?: React.ReactNode
  /**
   * Which rail entry is the page being viewed — see `ConsoleRail`'s `activeSegment`.
   *
   * ⚠️ **REQUIRED, and `null` must be written out.** It was optional, and exactly ONE route of the
   * twenty-one passed it: `/app/flags/[projectSlug]`. Every other console page rendered a rail with
   * no active entry at all — so "you can't tell where you are" (two of Daniel's five complaints) was
   * not that the cue was too subtle, it was that on twenty pages THERE WAS NO CUE. The CSS rule
   * existed, `aria-current` was wired, and almost nothing ever set it.
   *
   * An optional prop that twenty callers forget is indistinguishable from a prop nobody needed.
   * Required with an explicit `null` for "this page is not in the rail" makes the omission a
   * compile error instead of a blank rail — the same reasoning as `iconKey` in Story 2.4.
   */
  railActive: ProjectRouteSegment | null
}) {
  const { activeProject, projects, links, header, userEmail } = await getShellNav(projectSlug, section)

  return (
    // `is-console` is set by the SAME field that decides whether console chrome renders at all,
    // so the approved design's stylesheet cannot reach the public demo dashboards or the legacy
    // branch. One condition, one answer — the alternative is two flags kept in lockstep by hand,
    // which is the bug this shell already paid for once (see the `header`/`consoleEnabled` note).
    // ⚠️ **`ds` is what makes the design system PAINT here, and Sprint 3 is where it arrives.**
    //
    // Sprint 2 scoped every rule in `system.css` to `.ds .ds-…` — deliberately, because
    // `console.css`'s `.is-console main p` at (0,1,2) was out-specifying bare `.ds-*` rules at
    // (0,1,0) and stripping the primitives' own colours. `.ds .ds-x` is (0,2,0) and wins.
    //
    // The consequence nobody had hit yet: `is-console` alone gets the TOKEN VALUES
    // (`tokens.css` is scoped `.ds, .is-console`) and NONE of the primitive paint. A `ds-env`
    // button on the console would have rendered as an unstyled `<button>` with correct colours
    // available and none of them applied — valid markup, no design.
    //
    // So the two classes mean two different things, and both are needed:
    //   `is-console` — this is the console: tokens, and `console.css` applies.
    //   `ds`         — this subtree renders FROM the design system: `system.css` applies.
    // Sprints 4–6 assemble pages from `design-system/primitives`, and this is the line that lets
    // them. See **D3** (the design system's classes are namespaced: prefix `ds-`, scope root `.ds`).
    //
    // ⚠️ This cited "D15", which does not exist — the epic's decisions run D1–D14. Invented in a
    // comment whose own contract line is "Cite a decision; never re-derive one" (fresh reviewer).
    //
    // ⚠️ **AND THE TWO ARE NO LONGER ONE CONDITION — design-system-rails Story 5.3.** The paragraph
    // above already argued that `is-console` and `ds` answer different questions, and then set both
    // from `header !== null`, which answers only the first. That coupling was invisible until a page
    // body rendered from the design system on a route that has no console header:
    // `/app/funnel/<demo>/<key>` and its impact twin are ANONYMOUSLY readable (`lib/public-demo.ts`'
    // allow-list, AGENTS rule #2), so `getShellNav` returns `EMPTY`, `header` is null — and Story
    // 5.3's rebuilt panes would have rendered every `ds-` class with no `.ds` ancestor: valid
    // markup, correct colours available, none of them applied. Exactly the failure the paragraph
    // above describes, arriving from the other direction.
    //
    // So each class is set by the question it actually answers:
    //   `ds`         — this subtree renders FROM the design system. True wherever this shell renders,
    //                  because the page body inside it does, session or no session.
    //   `is-console` — this is the console: `console.css` applies, and the console chrome is there.
    //
    // Those two anonymous demo dashboards are the ONLY renders this changes, and they are precisely
    // the two routes Story 5.3 rebuilds — verified by enumerating the allow-list. Nothing else
    // reaches this component without a session.
    <div className={`product-shell ds${header === null ? '' : ' is-console'}`}>
      <header className="product-shell__header">
        {/*
          ── D4: the gate-off branch below is UNTOUCHED, and that is auditable ───────────────────
          `header === null` means the console chrome does not apply to this render — the gate is
          unset, OR there is no session (the two demo dashboards render this shell anonymously), OR
          `getShellNav` degraded. All three want the same public/legacy chrome. It is ONE field, and
          the account menu below reads the same one, so the chrome and the menu cannot disagree about
          whether this is a console render.

          ⚠️ **This branch is no longer the pre-epic markup, and Story 3.5 is why.** Sprints 1 and 2
          kept it byte-identical so `git diff` could check the dark-launch guarantee; that guarantee
          has been discharged — the console has been LIVE in production since Sprint 2 (A19) — and
          3.5's whole content is the reduction below. What it is now is the PUBLIC chrome: a logo,
          `Connect`, `Agent notes`, and the project signal.

          ⚠️ **`isConsoleShellEnabled()` is NOT retired with it**, and A16 says why: `header === null`
          stopped meaning "the gate is off" in Sprint 1. Two states reach this branch permanently and
          neither is about the gate — an anonymous viewer, and `getShellNav`'s catch. The flag stays
          a real kill switch; what changed is that flipping it back now lands a signed-in operator on
          a header with no section nav, navigating from Command Center's own links. Said out loud
          rather than discovered by whoever flips it.

          ── One honest qualification, because "unchanged" was too strong ──────────────────────
          This BRANCH is byte-identical. The DATA it renders is not: Story 1.2 removes `funnel` and
          `impact` from the inventory unconditionally (D3), so with the gate off the Sections
          disclosure lists eleven surfaces where it listed thirteen. That is the intended change —
          both were nav entries whose own description told you to edit the URL — but `git diff` on
          this file cannot show it, and the guarantee was being stated absolutely. Neither dashboard
          loses its only entry: `CommandCenter` still links both with a real feature key. Raised by
          the fresh reviewer on PR #122.
        */}
        {header === null ? (
          <>
            <BrandLockup compact href="/app" />
            <nav aria-label="Product" className="product-shell__nav">
              {/* ── Story 3.5 — what this branch LOST, and what it kept ──────────────────────────
                  **`Home` and the `<details>` disclosure are deleted** (epic README, A16). What
                  remains is the PUBLIC chrome, and that is the whole point of the reduction.

                  `Home` was safe to delete because its destination is duplicated: `BrandLockup`
                  above links `/app` in both branches, so this loses a LINK, not a route.

                  The `Sections` disclosure required `activeProject`, which requires a session — so
                  it never rendered anonymously, and its deletion is signed-in-only by construction.
                  The one state that loses it is "signed in with `CONSOLE_SHELL_ENABLED` off", which
                  is the kill-switch state; Command Center still lists every entitled surface as a
                  link, so nothing becomes unreachable, and the console's own four-section nav is
                  what replaced it.

                  ⚠️ **`Connect` and `Agent notes` STAY, permanently.** This branch is what an
                  anonymous visitor to the two demo dashboards gets — they have no session, so no
                  console header — and it is their ONLY route to `/install` and `/llms.txt`. Story
                  3.5 as originally written would have deleted them along with "the now-dead
                  gate-off branch"; A16 corrected that, and `console-shell-public.browser.spec.ts`
                  asserts both hrefs so the correction cannot be undone by someone tidying up. */}

              {/* ⚠️ THIS HREF STAYS `/install`, and reverting it here is Story 2.2's actual fix.
                  (Fresh reviewer, PR #123, Blocking.)

                  A previous revision pointed this at `/app/setup/connect/<slug>` whenever a project
                  was resolved. But this is the LEGACY branch — it renders when `header === null`,
                  which includes **the console gate being off** — and that route's first statement is
                  `if (!isConsoleShellEnabled()) notFound()`. So with the gate unset (its value in
                  production right now) every signed-in operator clicking `Connect` got a hard 404,
                  on a link that worked before this epic. A nav entry pointing at a route that 404s
                  is the exact defect this epic exists to remove.

                  Story 2.2's criterion is "**with the gate on**, nothing in the signed-in shell links
                  to `/install`". The console branch has no Connect link at all — `Setup › Connect
                  your agent` in the rail is the destination — so on every normal path the criterion
                  holds and this line needed no change.

                  ⚠️ It is NOT satisfied "by construction", and an earlier version of this comment
                  said it was. There is one path where the gate is on and this branch still renders:
                  `getShellNav`'s catch, which cannot know whether a session exists (`getSessionUser`
                  is the first thing inside its `try`) and therefore returns the PUBLIC chrome. So
                  during a Supabase outage with the console lit, a signed-in operator can reach
                  `/install` from here and copy the demo project's connector URL.

                  That is a wrong-tenant confusion, not a leak — rule #2 means `/install` only ever
                  serves the demo project — it is bounded to an outage, and it is exactly what
                  happened before this epic. It is left alone deliberately: the alternative (console
                  chrome from the catch) puts console chrome on the public demo dashboards — a logo,
                  a lone Today tab and an empty palette (measured; the switcher and account menu are
                  already suppressed by `EMPTY`'s null project and null email). Still wrong for a
                  public page, and the worse trade of the two. Fixing it properly means
                  narrowing that `try` so a session read failing is distinguishable from a nav read
                  failing, which is a change this sprint does not need to make.
                  (Both halves found by the fresh reviewer, PR #123, rounds 2 and 3.) */}
              <a href="/install">
                <Icon name="cable" />
                Connect
              </a>
              <a href="/llms.txt">
                <Icon name="book" />
                Agent notes
              </a>
            </nav>

            {/*
              Which project these sections belong to. When the user has more than one, the label links
              to /app rather than opening a switcher menu: a real switcher has to know the CURRENT
              surface to move you to the same page in another project, and this component is
              deliberately not told the route segment. A menu that silently dropped you on a different
              page than the one you were reading would be a worse answer than the one honest link.
            */}
            {activeProject ? (
              <span className="product-shell__signal" data-project={activeProject.slug}>
                <Icon name="gauge" />
                {projects.length > 1 ? (
                  <a href="/app">
                    {activeProject.slug} · {projects.length - 1} more
                  </a>
                ) : (
                  activeProject.slug
                )}
              </span>
            ) : (
              <span className="product-shell__signal">
                <Icon name="gauge" />
                Engine ready
              </span>
            )}
          </>
        ) : (
          <>
            {/* The logo goes to Today, which IS /app — see lib/console-shell.ts' TODAY_HREF note on
                why that resolves Story 1.3's "logo links to Today" against Story 1.4's "Today has no
                rail". One destination, named twice. */}
            <BrandLockup compact href={TODAY_HREF} />

            {/* Four destinations, generated from the inventory's `section` field (D2). A hardcoded
                list here is what lib/shell-nav.ts' own D1 comment forbids, and CONSOLE_SECTIONS is
                the single ordered list both this and the rail read.

                A section with no entitled surface is ABSENT rather than disabled: on a Vercel
                preview three of Ship's gates are closed (A2), and a tab that 404s is worse than a
                tab that is not there. */}

            <div className="product-shell__identity">
              {/* ⚠️ The palette moved INTO the top bar, because Story 3.2 asks for a visible `⌘K`
                  affordance there and the component now renders its own trigger. It used to mount in
                  the body, which is why the shortcut had no button: a component that returns `null`
                  when closed cannot show you that it exists. The panel still portals over the page —
                  only the trigger is in the bar. */}
              <ShellErrorBoundary>
                <CommandPalette links={links} projectSlug={activeProject?.slug ?? null} />
              </ShellErrorBoundary>
              {/* The project switcher (D1). ONE tier — Golden Beans has no organisation layer, and
                  the production schema has no table that could support one. A `<details>` again, for
                  the same reason as the legacy disclosure: no client island in the shell.

                  ⚠️ **This is why no console page's `<h1>` names the project any more.** Every
                  signed-in route used to render `<h1>Keys — miyagisanchez</h1>` and a
                  "← Your projects" link, which spent a heading and a line on facts this control
                  already carries two inches above them — and on a real tenant slug the title
                  wrapped, which is CONSOLE-CONTRACT.md's Do-not #1 measured on twelve pages instead
                  of one. The sweep is recorded HERE, at the control that makes the repetition
                  redundant, rather than as the same paragraph pasted into twelve files.

                  With one project there is nothing to switch to, so it renders as a label rather
                  than a menu that opens onto a list of one. */}
              {activeProject &&
                (projects.length > 1 ? (
                  <details className="product-shell__switcher">
                    <summary>
                      <Icon name="gauge" />
                      {activeProject.slug}
                    </summary>
                    <div className="product-shell__menu">
                      <ul>
                        {header.projects.map((project) => (
                          <li key={project.slug}>
                            <a href={project.href} aria-current={project.current ? 'true' : undefined}>
                              {project.slug}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </details>
                ) : (
                  <span className="product-shell__signal" data-project={activeProject.slug}>
                    <Icon name="gauge" />
                    {activeProject.slug}
                  </span>
                ))}

              {/* The account menu carries the sign-out that used to sit in /app's own header.
                  `/app` drops its own copy exactly when THIS renders — both sides ask
                  `shellRendersAccountMenu`, so the control appears once and can never appear zero
                  times. It previously branched on the env var on one side and on `userEmail` here,
                  which is two conditions that were supposed to agree and did not: a signed-in user
                  with no project got the legacy header AND a suppressed page line, and therefore no
                  sign-out anywhere (fresh reviewer, PR #122). */}
              {shellRendersAccountMenu({ header, userEmail }) && (
                <details className="product-shell__account">
                  <summary>
                    <Icon name="panels" />
                    Account
                  </summary>
                  <div className="product-shell__menu">
                    <p>{userEmail}</p>
                    <SignOutButton />
                  </div>
                </details>
              )}
            </div>
          </>
        )}
      </header>

      {/* ── TIER 2: the section nav, a FULL-WIDTH row of its own ──────────────────────────────────
          ⚠️ **This was inside the 54px top bar, and the approved design has TWO tiers.** Measured on
          the running console before touching anything: `.product-shell__header` was 1440x54 with the
          tabs nested inside it at 289x43 — one bar carrying everything. The prototype's `#sectionnav`
          is a SIBLING of `.topbar`, a 1440x44 row with its own background and bottom border.

          Nothing caught it, and this is why: `MEASURED-SPEC.md` carries "Section nav (tier 2)
          1440 x 44" — generated from the prototype — but `console-gate-spec.ts`, the array actually
          asserted against the PRODUCT, has no row for either tier. The number was measured, written
          down, published in a contract, and never compared to the thing it described. Both tiers are
          in the gate now.

          Rendering it only when there are tabs keeps the gate-off and anonymous branches unchanged:
          `header === null` never reaches here. */}
      {header !== null && header.tabs.length > 0 ? (
        <nav aria-label="Sections" className="product-shell__nav product-shell__tabs">
          {header.tabs.map((tab) => (
            <a
              key={tab.id}
              href={tab.href}
              className="product-shell__tab"
              // `aria-current="page"` rather than a class alone: the mark has to reach a screen
              // reader, not just the pixels. Absent (not "false") when it is not the current
              // one — `aria-current="false"` is a value some readers announce.
              aria-current={tab.current ? 'page' : undefined}
            >
              {tab.label}
            </a>
          ))}
        </nav>
      ) : null}
      <div className="product-shell__body">
        {/*
          Story 1.4 — the per-section rail. FIRST in the DOM, unlike the agent rail below: this is
          navigation for the page you are on, so a screen reader and a keyboard user should meet it
          before the content, in the same order a sighted reader meets it on the left.

          `railLinksFor` returns [] for Today (which IS /app — A11) and for a section whose every
          surface is gated off, and `ConsoleRail` renders null on an empty list. So "Today renders
          full width" and "no empty rail" are one branch, decided in the pure module.
        */}
        {header !== null && (
          <ConsoleRail
            links={railLinksFor(section, links)}
            top={railTop}
            activeSegment={railActive}
            label={section === 'today' ? undefined : `In ${section[0].toUpperCase()}${section.slice(1)}`}
          />
        )}
        {/*
          Story 1.5 — ⌘K, the ONE client island in the shell, inside the ONE error boundary in
          apps/web (A9). If it throws, the boundary renders null and the page it sits on is
          untouched. Without the boundary the nearest one is Next's own error page, which would mean
          a bad keystroke replacing every signed-in route in the product with an error screen.

          Seeded from the links getShellNav already resolved — a second VIEW of that list, never a
          second read, which is also what makes it safe for a client component to hold: it inherits
          the server's entitlement filtering rather than re-implementing it.
        */}
        {children}
        {/*
          Sprint 2, Story 2.2 — the rail is here, in the shell, so it is present on EVERY /app
          route rather than on whichever pages someone remembered to add it to. It renders nothing
          at all unless AGENT_RAIL_ENABLED is exactly 'true' AND a membership was resolved; see
          lib/agent-rail-visibility.ts for why both conditions are spelled out in one place.

          It sits after {children} in the DOM on purpose: a screen reader and a keyboard user reach
          the page's own content first, and the rail is positioned into the sidebar by CSS.
        */}
        {/* ── console-ia-overhaul · the AgentRail does NOT render on console routes ─────────────
            Decided by Daniel, 2026-08-28, closing CONSOLE-CONTRACT.md's Do-not #4 — which the epic
            had left open ("a decision the epic never made, and it must be made explicitly rather
            than inherited"). The rail is in none of the ten approved reference states, and inside
            the console grid it squeezed the content column to 544px against the approved 1180,
            which is why every table clipped.

            ⚠️ **`header !== null` is the console, and after A19 that is every signed-in /app route.**
            So this condition does not merely narrow the rail — it retires it from the signed-in
            product. `activeProject` requires a session, and an anonymous visitor has none, so the
            remaining branch renders nothing in practice. Said plainly because the honest version of
            this change is "the agent rail is gone", not "the agent rail is conditional".

            That is a control removed, so the ordering rule applies: what did it carry, and where
            does each thing live now? It carried the agent's recent activity and its waiting-on-you
            queue. The approved design gives both a destination — **"What changed & why"** in the top
            bar — which is a real place rather than a deletion. Building that is the replacement, and
            until it exists this trades a squeezed console for a missing surface. Flagged rather than
            filed as done. */}
        {header === null && activeProject && (
          <AgentRail projectId={activeProject.id} projectSlug={activeProject.slug} />
        )}
      </div>
    </div>
  )
}
