// console-ia-overhaul · Sprint 1, Story 1.3 (epic README, D1, D2, A8) — what the header renders.
//
// ── Why a pure, zero-import module and not logic inside ProductShell ──────────────────────────
// `ProductShell` wraps EVERY signed-in route, including error and gated states. It is the one
// component in the tree with no useful failure mode of its own, which is why `lib/shell-nav.ts`
// promises never to throw. The same argument applies to the arithmetic: which tabs exist, which one
// is current, and where each one points are decisions worth asserting directly rather than through
// a credential-gated page the `api` Playwright project can only ever see a login redirect from.
//
// CODE-QUALITY rule 5 and this repo's own precedent (`lib/agent-rail-visibility.ts`,
// `lib/flag-list-view.ts`): when a decision sits behind state the harness cannot reach, extract it
// and assert it. This module imports nothing but the inventory, which is itself pure.

import {
  CONSOLE_SECTIONS,
  getProjectSurfaceLinks,
  getSectionLinks,
  type ConsoleSection,
  type ProjectSurfaceGates,
  type ProjectSurfaceLink,
} from './project-route-inventory'

/**
 * The sections a page can declare itself to be in, plus `home`.
 *
 * `home` is `/app` itself — the Command Center — and it is deliberately part of the same closed
 * union rather than an optional prop. `ProductShell`'s `section` is REQUIRED (A8), so every one of
 * its call sites is forced to answer "where does this page live?", and "nowhere in particular" has
 * to be said out loud as `home` rather than achieved by omission.
 */
export type ShellSection = ConsoleSection | 'home'

/**
 * `Today` IS `/app`, and that resolves a tension the sprint docs left open.
 *
 * Story 1.3 says the logo links to Today; Story 1.4 says "Today has no rail and renders full width".
 * Those two only fit together if Today is a page rather than a container — and it already is: `/app`
 * is Command Center, whose entire subject is "did anything need me today". So Today's href is
 * `/app`, the logo points at the same place, and `tasks` (the one `today` surface) is reached from
 * Command Center and from ⌘K rather than from a rail that Story 1.4 says must not exist.
 *
 * Recorded in the epic README as A11 rather than decided here in silence.
 */
export const TODAY_HREF = '/app'

export type ConsoleTab = {
  id: ShellSection
  label: string
  href: string
  /** True for the section the current page declared. Rendered as `aria-current`. */
  current: boolean
}

export type ConsoleProjectChoice = {
  slug: string
  /**
   * Where switching to this project lands you: the SAME section you are reading now, if that
   * project entitles it, and `/app` otherwise.
   *
   * `ProductShell`'s old comment explained that it linked to `/app` instead of offering a switcher
   * because "a real switcher has to know the CURRENT surface to move you to the same page in another
   * project, and this component is deliberately not told the route segment". A8 changed that
   * premise: the shell is now told its SECTION. It is still not told the route segment, and this
   * does not pretend otherwise — it moves you to the equivalent *section*, which is a promise it can
   * actually keep, rather than to the equivalent page, which it cannot.
   */
  href: string
  current: boolean
}

export type ConsoleHeader = {
  tabs: ConsoleTab[]
  projects: ConsoleProjectChoice[]
}

/**
 * Where a section's tab points: its first entitled surface.
 *
 * "First" is inventory order, which is the order the rail renders in too — so the tab lands you on
 * the top of the list you are about to see, not on an arbitrary member of it. `null` when the
 * viewer entitles nothing in the section.
 */
export function getSectionEntryHref(
  links: readonly ProjectSurfaceLink[],
  section: ConsoleSection
): string | null {
  return getSectionLinks(links, section)[0]?.href ?? null
}

/**
 * The header model for one render.
 *
 * ── A tab that leads nowhere is worse than a missing tab ──────────────────────────────────────
 * A section is only rendered when the viewer entitles at least one surface inside it. This is not
 * cosmetic: `Ship` holds three surfaces riding three independent gates, and on a Vercel PREVIEW all
 * three are closed (`FLAG_SERVING_ENABLED`, `EXPERIMENT_GOVERNANCE_ENABLED` and the console gate are
 * Production-scoped — epic README, A2). Rendering `Ship` there would give every preview a tab that
 * 404s, and a member who is not an owner would get the same on `Setup` if it held only owner
 * surfaces.
 *
 * `Today` is the exception and always renders, because `/app` always exists for a signed-in member
 * with a project. It is the one destination that cannot be gated away.
 */
export function buildConsoleHeader(input: {
  activeSection: ShellSection
  activeProjectSlug: string
  /** Every project the viewer belongs to, with their role in each — the switcher's contents (D1). */
  projects: readonly { slug: string; role: string }[]
  gates: ProjectSurfaceGates
}): ConsoleHeader {
  const activeProject = input.projects.find((project) => project.slug === input.activeProjectSlug)
  const activeLinks = activeProject
    ? getProjectSurfaceLinks({
        projectSlug: activeProject.slug,
        role: activeProject.role,
        gates: input.gates,
      })
    : []

  const tabs: ConsoleTab[] = []
  for (const section of CONSOLE_SECTIONS) {
    if (section.id === 'today') {
      tabs.push({
        id: 'today',
        label: section.label,
        href: TODAY_HREF,
        // `home` and `today` are the same destination, so a page declaring either marks this tab.
        // Kept as two names because they answer different questions: `home` is where /app itself
        // says it lives, `today` is what a surface classified into that section says.
        current: input.activeSection === 'today' || input.activeSection === 'home',
      })
      continue
    }
    const href = getSectionEntryHref(activeLinks, section.id)
    if (href === null) continue
    tabs.push({
      id: section.id,
      label: section.label,
      href,
      current: input.activeSection === section.id,
    })
  }

  const projects: ConsoleProjectChoice[] = input.projects.map((project) => {
    const current = project.slug === input.activeProjectSlug
    // The equivalent section in THAT project, resolved with THAT project's role — not the active
    // one's. A member of A and an owner of B must not be offered B's owner-only Setup landing on the
    // strength of being an owner of A. Gates are process-wide, roles are per project.
    const sectionForProject =
      input.activeSection === 'home' || input.activeSection === 'today'
        ? TODAY_HREF
        : getSectionEntryHref(
            getProjectSurfaceLinks({
              projectSlug: project.slug,
              role: project.role,
              gates: input.gates,
            }),
            input.activeSection
          )
    return { slug: project.slug, href: sectionForProject ?? TODAY_HREF, current }
  })

  return { tabs, projects }
}
