import 'server-only'
import { getSessionUser } from './supabase-auth'
import { getUserProjects, type MemberProject } from './membership'
import {
  isConsoleShellEnabled,
  isExperimentGovernanceEnabled,
  isFlagConsoleEnabled,
  isFlagServingEnabled,
  isJourneyProjectionsEnabled,
  isSignalsEnabled,
} from './flags'
import {
  getProjectSurfaceLinks,
  type ProjectSurfaceGates,
  type ProjectSurfaceLink,
} from './project-route-inventory'
import { buildConsoleHeader, type ConsoleHeader, type ShellSection } from './console-shell'

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
  /**
   * console-ia-overhaul · Story 1.3 — the four-section header, or `null` while the console gate is
   * off (and whenever there is no active project to build one for).
   *
   * Resolved HERE rather than in the component, for the same reason `links` is: this is the one
   * module that has already read the session, the memberships and the gates, and a second resolution
   * point is a second thing that can disagree. `ProductShell` renders what it is handed.
   *
   * `null` is what makes D4 auditable: with `CONSOLE_SHELL_ENABLED` unset this is never populated,
   * so the component takes its legacy branch and the gate-off render is unchanged by construction —
   * a property `git diff` can check, not one prose promises.
   */
  header: ConsoleHeader | null
  /**
   * The signed-in address, for the console header's account menu. `null` when anonymous — the two
   * demo dashboards render this shell without a session.
   *
   * It is the VIEWER'S OWN email and it is already rendered on `/app` today; this moves where it is
   * shown, not who can see it. Story 1.3 drops `/app`'s own copy when the console gate is on, so it
   * appears once either way.
   */
  userEmail: string | null
}

/** The gate values, read once per call. One resolution point, two consumers (header and rail). */
function readGates(): ProjectSurfaceGates {
  return {
    'experiment-governance': isExperimentGovernanceEnabled(),
    'flag-console': isFlagConsoleEnabled(),
    'flag-serving': isFlagServingEnabled(),
    'journey-projections': isJourneyProjectionsEnabled(),
    signals: isSignalsEnabled(),
  }
}

const EMPTY: ShellNav = {
  activeProject: null,
  projects: [],
  links: [],
  header: null,
  userEmail: null,
}

// console-ia-overhaul · Sprint 1, Story 1.2 (epic README, D3) — DEFAULT_FEATURE_HINT is DELETED, and
// so is the parameter it was passed to. It read `'your-feature-key'`, and its comment explained that
// funnel/impact links "carry a placeholder the user edits". Both surfaces have left the inventory,
// `ProjectSurface['href']` no longer takes a feature hint at all, and the routes are reached from a
// feature's own page in Sprint 3 — so there is no longer anywhere for a placeholder to go. That is
// the difference between deleting a constant and making it unrepresentable.

/**
 * Resolve the section nav for the current request.
 *
 * Never throws. The shell wraps every signed-in page, including error and gated states, so a nav
 * that could throw would be able to turn a working page into a crash — the shell is the one
 * component in the tree with no useful failure mode of its own. A read failure degrades to the
 * logo alone, which is honest: we could not list your sections.
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
export async function getShellNav(
  projectSlug?: string,
  /**
   * Which of the four destinations the calling page lives in (A8). Defaults to `home` so the two
   * anonymously-readable demo dashboards — which render this shell without a session — need no
   * ceremony; every authenticated page passes its own, and `ProductShell`'s prop is REQUIRED, so the
   * compiler is what makes each of the 18 call sites answer.
   */
  activeSection: ShellSection = 'home'
): Promise<ShellNav> {
  try {
    const user = await getSessionUser()
    // Anonymous is a legitimate state here: the demo project's dashboards render without a session
    // (lib/dashboard-auth.ts' allow-listed carve-out), and they use this same shell.
    if (!user) return EMPTY

    const projects = await getUserProjects(user.id)
    // ── A signed-in user with NO project still gets the console chrome ────────────────────────
    // This used to `return EMPTY`, which routed them to the LEGACY header — and `/app` had already
    // dropped its own sign-out because the gate was on, so the page carried no sign-out at all
    // (fresh reviewer, PR #122; reachable via `/app?provision=failed`). They are signed in; the
    // shell owes them a way out.
    //
    // The header it gets is honest rather than empty: `buildConsoleHeader` finds no entitled surface
    // for a slug that is not in an empty membership list, so it renders the Today tab alone — which
    // is exactly right, because `/app` is the only place they can go.
    if (projects.length === 0) {
      return {
        ...EMPTY,
        userEmail: user.email ?? null,
        header: isConsoleShellEnabled()
          ? buildConsoleHeader({
              activeSection,
              activeProjectSlug: '',
              projects: [],
              gates: readGates(),
            })
          : null,
      }
    }

    // A slug the caller supplied that the viewer is NOT a member of does not silently fall back to
    // their first project (fresh-reviewer finding). The two anonymously-readable demo dashboards
    // are exactly this case: a member of `acme` opening /app/funnel/golden-beans-demo/setup_guide
    // is allowed to (lib/dashboard-auth.ts' allow-list) — and would have got `acme`'s sections and
    // `acme`'s activity rail wrapped around the DEMO project's numbers. Not a leak, since it is the
    // viewer's own data, but the chrome and the <main> would name different tenants, which is the
    // kind of quiet mismatch a person acts on without noticing.
    //
    // No slug at all (the /app home) still defaults to the first project: there is nothing to
    // contradict there.
    const activeProject = projectSlug ? (projects.find((p) => p.slug === projectSlug) ?? null) : projects[0]
    if (!activeProject) return EMPTY

    // Read once, per render, and passed to both consumers. Two reads of the same gates could not
    // disagree today (they are pure env reads), but one resolution point is what keeps the header
    // and the rail describing the same product.
    const gates = readGates()

    return {
      activeProject,
      projects,
      userEmail: user.email ?? null,
      links: getProjectSurfaceLinks({
        projectSlug: activeProject.slug,
        role: activeProject.role,
        gates,
      }),
      header: isConsoleShellEnabled()
        ? buildConsoleHeader({
            activeSection,
            activeProjectSlug: activeProject.slug,
            projects,
            gates,
          })
        : null,
    }
  } catch (error) {
    console.error('[shell-nav] could not resolve the section nav:', error)
    return EMPTY
  }
}
