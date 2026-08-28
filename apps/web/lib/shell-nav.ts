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
  /**
   * The console chrome for this render, or `null` when it does not apply — the SINGLE field that
   * decides, deliberately.
   *
   * Non-null exactly when `CONSOLE_SHELL_ENABLED` is open **and** there is a session. Not the env
   * var alone: every element of the console (switcher, account menu, palette over entitled surfaces)
   * presupposes a session, and the two demo dashboards render this shell anonymously. An anonymous
   * visitor is not a degraded signed-in user.
   *
   * A previous revision carried a separate `consoleEnabled` boolean beside this, with the chrome
   * branching on one and the account menu on the other — an invariant maintained by hand at four
   * return sites, where one mismatch reopens the zero-sign-out bug. One field cannot disagree with
   * itself. See `shellRendersAccountMenu`.
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

/**
 * The header for a viewer entitled to nothing here — a zero-project session, or a slug they are not
 * a member of. `buildConsoleHeader` finds no surface for an empty membership list, so this is the
 * Today tab and nothing else, which is exactly right: `/app` is the only place they can go.
 */
function emptyHeader(activeSection: ShellSection) {
  return buildConsoleHeader({
    activeSection,
    activeProjectSlug: '',
    projects: [],
    // ALL FALSE, not `readGates()`. With an empty project list no surface can be entitled whatever
    // the gates say, so the real values were a read whose result could not matter — and a call that
    // looks like it feeds a decision, but cannot, is the kind of thing a later reader trusts
    // (cross-review, Mistral Vibe). Passing the closed record explicitly says "no gate is consulted
    // on this path"; it also keeps `ProjectSurfaceGates` a closed record, so adding a fifth gate is
    // still a compile error here rather than a silently-defaulted `{}`.
    gates: {
      'experiment-governance': false,
      'flag-console': false,
      'flag-serving': false,
      'journey-projections': false,
      signals: false,
      'console-shell': false,
      'legacy-keys': false,
      'legacy-flag-credentials': false,
    },
  })
}

/** The gate values, read once per call. One resolution point, two consumers (header and rail). */
function readGates(): ProjectSurfaceGates {
  const consoleShell = isConsoleShellEnabled()
  return {
    'experiment-governance': isExperimentGovernanceEnabled(),
    'flag-console': isFlagConsoleEnabled(),
    'flag-serving': isFlagServingEnabled(),
    'journey-projections': isJourneyProjectionsEnabled(),
    signals: isSignalsEnabled(),
    'console-shell': consoleShell,
    // A7: the INVERSE, derived here rather than read from a second env var. The legacy credential
    // routes are nav entries exactly while their merged replacement is not.
    'legacy-keys': !consoleShell,
    // ...and the flags console's credential route additionally needs its own console ON, because
    // the route 404s without it. Listing it on `!consoleShell` alone put a dead link in the nav for
    // the (flags console off, shell off) combination — a conjunction the single-valued `gate` field
    // cannot express, so it is derived here where both values are in hand.
    'legacy-flag-credentials': !consoleShell && isFlagConsoleEnabled(),
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
  const gateOpen = isConsoleShellEnabled()
  try {
    const user = await getSessionUser()
    // Anonymous is a legitimate state here: the demo project's dashboards render without a session
    // (lib/dashboard-auth.ts' allow-listed carve-out), and they use this same shell.
    // ── Anonymous keeps the PUBLIC chrome, gate or no gate ───────────────────────────────────
    // This returns `EMPTY`, so `header` is null here on purpose. The console is *an information architecture for the
    // signed-in console* — it has a project switcher, an account menu and a palette over surfaces
    // that all require a session. An anonymous visitor is not a degraded signed-in user.
    //
    // This is not hypothetical: `/app/funnel/golden-beans-demo/<key>` and its impact twin are
    // ANONYMOUSLY readable (lib/public-demo.ts' allow-list) and render this shell. A previous
    // revision keyed the chrome on the env var alone, which would have given that public page a logo,
    // an empty sections nav, an empty identity slot and a ⌘K palette listing nothing — on a page with
    // no session to have surfaces for. Caught by the fresh reviewer's third pass on PR #122, as a
    // regression this epic introduced rather than one it inherited.
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
        header: gateOpen ? emptyHeader(activeSection) : null,
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
    // A foreign slug yields no SECTIONS — unchanged, and the tenancy reason above is why. What it no
    // longer yields is the LEGACY chrome: with the console on, this now degrades to a console header
    // holding Today alone, the same honest shape a zero-project session gets. Two states that both
    // mean "you are entitled to nothing here" were being answered two different ways, and Story 3.5
    // deletes the legacy branch — after which the old answer would have been a bare logo with no nav
    // and no account menu (fresh reviewer, PR #122, second pass).
    if (!activeProject) {
      return {
        ...EMPTY,
        userEmail: user.email ?? null,
        header: gateOpen ? emptyHeader(activeSection) : null,
      }
    }

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
      header: gateOpen
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
    // ── `EMPTY`, and the reasoning here was WRONG TWICE. Both corrections are worth keeping. ──
    //
    // (1) The original comment said Story 2.2 is "satisfied by construction: with the gate on, the
    //     legacy branch does not render at all". That is FALSE, and the fresh reviewer was right to
    //     say so: `header !== null` implies gate-on-and-session, but the converse does not, and this
    //     catch is the sole exception. `getSessionUser()` and `getUserProjects()` are both inside the
    //     `try`, so with the console lit an outage drops a signed-in operator onto the legacy branch,
    //     whose `Connect` goes to `/install` — the demo project's URL.
    //
    // (2) So I changed this to return a console header when the gate is open... which reintroduced
    //     a version of the defect the same reviewer caught one round earlier. `getSessionUser()` is
    //     the first statement in the `try`; if it REJECTS (a transport failure — it returns null for
    //     an ordinary auth error, but a rejection is not that), we land here knowing nothing about
    //     whether a session exists, and the two demo dashboards are anonymously readable and render
    //     this shell.
    //
    //     ⚠️ MEASURED, because the first two versions of this note overstated it: with `EMPTY`'s
    //     null `activeProject` and null `userEmail`, the switcher (`{activeProject && …}`) and the
    //     account menu (`shellRendersAccountMenu`) are both already suppressed. What an anonymous
    //     visitor would actually have got is a logo, a lone "Today" tab and an empty ⌘K palette —
    //     which is still console chrome on a public page, and still wrong, but it is not a switcher
    //     and not an account menu. The accurate version is the one 90 lines above.
    //
    // Trading a bounded Should-fix for a Blocking is the wrong direction. The catch does not know
    // who is asking, so it must return the answer that is safe for BOTH: the public chrome. A
    // signed-in operator seeing `/install` during an outage is a wrong-tenant confusion, bounded
    // (rule #2 means `/install` only ever serves the demo project) and identical to pre-epic
    // behaviour — not something this epic introduced.
    //
    // The right response to "your claim is false" was to fix the CLAIM, not to make a worse change.
    // The claim is fixed in `ProductShell`'s comment instead.
    return EMPTY
  }
}
