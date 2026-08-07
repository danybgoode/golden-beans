import 'server-only'
import { getSessionUser } from './supabase-auth'
import { getUserProjects, type MemberProject } from './membership'
import {
  isExperimentGovernanceEnabled,
  isFlagServingEnabled,
  isJourneyProjectionsEnabled,
  isSignalsEnabled,
} from './flags'
import { getProjectSurfaceLinks, type ProjectSurfaceLink } from './project-route-inventory'

// app-shell-and-agent-rail · Sprint 1, Story 1.3 — what the shell's section nav renders.
//
// ── D1: this module RENDERS the inventory; it does not define a second one ────────────────────
// `lib/project-route-inventory.ts` already carries every surface with a label, an audience and a
// gate, and is already unit-tested. The audit read the /app page's bare `<ul>` as "there is no
// information architecture"; there is one, it was simply never presented. A hardcoded list in
// ProductShell would be a duplicate source of truth that drifts the first time a surface is added.
// If the nav ever needs a grouping the inventory cannot express, extend the inventory (with its
// test) — never inline a list here.
//
// ── Tenancy ───────────────────────────────────────────────────────────────────────────────────
// The caller passes the slug it is rendering, but that slug is only ever MATCHED against the
// membership list this module reads server-side. A slug the signed-in user is not a member of
// simply does not match, and they get their own default project's sections instead of a foreign
// project's — the request never selects the tenant (AGENTS.md; CODE-QUALITY rule 10).

export type ShellNav = {
  /** The project whose sections are shown, or null when there is nobody (or nothing) to show. */
  activeProject: MemberProject | null
  /** Every project the signed-in user belongs to — the switcher's contents. */
  projects: MemberProject[]
  /** Entitled, gate-open surfaces for `activeProject`, straight from the inventory. */
  links: ProjectSurfaceLink[]
}

const EMPTY: ShellNav = { activeProject: null, projects: [], links: [] }

// The funnel/impact dashboards are addressed per FEATURE key, and which features a project has
// registered is the registry's business, not the shell's — so their links carry a placeholder the
// user edits. Same constant and same reasoning as app/app/page.tsx, which is why it is exported:
// two copies of this string would be two things to change when a feature picker finally lands.
export const DEFAULT_FEATURE_HINT = 'your-feature-key'

/**
 * Resolve the section nav for the current request.
 *
 * Never throws. The shell wraps every signed-in page, including error and gated states, so a nav
 * that could throw would be able to turn a working page into a crash — the shell is the one
 * component in the tree with no useful failure mode of its own. A read failure degrades to the
 * static links (Home / Connect / Agent notes), which is honest: we could not list your sections.
 *
 * ── Why swallowing getUserProjects' throw here is NOT the bug that function exists to prevent ──
 * (cross-review, Mistral Vibe, PR #71.) `getUserProjects` throws rather than returning [] on a
 * query failure, deliberately: an empty list renders as "you're not a member of any project" and
 * would read as an AUTHORIZATION answer when it is really an outage. That reasoning is about the
 * PROJECT LIST, and it is untouched — app/app/page.tsx still calls `getUserProjects` directly and
 * still lets the throw surface as an error page.
 *
 * What degrades here is only the NAV, whose honest failure is "we could not list your sections"
 * rather than "you have none": the shell renders no `<details>` at all in that case, so nothing
 * asserts an absence. The failure is logged loudly below. If this ever starts hiding a real
 * misconfiguration, the fix is a louder log — never a throw from the component that wraps every
 * page in the product.
 */
export async function getShellNav(projectSlug?: string): Promise<ShellNav> {
  try {
    const user = await getSessionUser()
    // Anonymous is a legitimate state here: the demo project's dashboards render without a session
    // (lib/dashboard-auth.ts' allow-listed carve-out), and they use this same shell.
    if (!user) return EMPTY

    const projects = await getUserProjects(user.id)
    if (projects.length === 0) return EMPTY

    const activeProject = (projectSlug && projects.find((p) => p.slug === projectSlug)) || projects[0]

    return {
      activeProject,
      projects,
      links: getProjectSurfaceLinks({
        projectSlug: activeProject.slug,
        role: activeProject.role,
        featureHint: DEFAULT_FEATURE_HINT,
        gates: {
          'experiment-governance': isExperimentGovernanceEnabled(),
          'flag-serving': isFlagServingEnabled(),
          'journey-projections': isJourneyProjectionsEnabled(),
          signals: isSignalsEnabled(),
        },
      }),
    }
  } catch (error) {
    console.error('[shell-nav] could not resolve the section nav:', error)
    return EMPTY
  }
}
