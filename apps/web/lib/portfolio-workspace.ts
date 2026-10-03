// portfolio-view · Sprint 2, Stories 2.1 + 2.2 (Roadmap/02-commercial/portfolio-view — the Architecture lock, D5, D12,
// C2, C3).
//
// Which workspace the portfolio shows, and when `/app` opens on it — as pure functions. ZERO imports, so both are
// asserted directly (`portfolio-workspace.test.ts`) rather than through a session the harness may not reach
// (CODE-QUALITY #5). They take the viewer's OWN membership list (`getUserProjects`, the named carve-out: ids, slugs,
// roles and workspaces, nothing from inside a project), so neither can choose a workspace the viewer is not in.

type MemberProjectLike = { workspace: { id: string; name: string } }

/** A portfolio needs two products to compare; with one there is nothing to put beside it (D5). */
export const PORTFOLIO_MIN_PRODUCTS = 2

/** How many of the viewer's projects sit in each workspace, keyed by workspace id. */
export function projectsPerWorkspace(projects: readonly MemberProjectLike[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const project of projects)
    counts.set(project.workspace.id, (counts.get(project.workspace.id) ?? 0) + 1)
  return counts
}

/**
 * The workspace a bare `/app/portfolio` shows: the one holding most of the viewer's projects; ties go to the workspace
 * name, then its id, so the answer is the same on every render. Null when the viewer holds no project at all.
 */
export function defaultPortfolioWorkspaceId(projects: readonly MemberProjectLike[]): string | null {
  const counts = projectsPerWorkspace(projects)
  const names = new Map(projects.map((p) => [p.workspace.id, p.workspace.name]))
  const ranked = [...counts.entries()].sort(
    ([leftId, leftCount], [rightId, rightCount]) =>
      rightCount - leftCount ||
      (names.get(leftId) ?? '').localeCompare(names.get(rightId) ?? '') ||
      leftId.localeCompare(rightId)
  )
  return ranked[0]?.[0] ?? null
}

/**
 * Does a visit to `/app` open on the portfolio?
 *
 * ⚠️ **Only a BARE `/app`.** `/app?project=<slug>` is the switcher's link to that project's Today (`todayHrefFor`), and
 * `/app?provision=…` is signup's recovery path; redirecting either would make Today unreachable for exactly the people
 * this epic serves, and break provisioning (lock C2). "Bare" means neither parameter carries a value.
 */
export function opensOnPortfolio(
  projects: readonly MemberProjectLike[],
  params: { project?: string | null; provision?: string | null }
): boolean {
  if (params.project?.trim() || params.provision?.trim()) return false
  for (const count of projectsPerWorkspace(projects).values())
    if (count >= PORTFOLIO_MIN_PRODUCTS) return true
  return false
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The workspace to show, given the viewer's own workspaces, their projects and an optional `?workspace=`.
 *
 * `requested` is a VIEW preference, matched against the viewer's own workspace list and nothing else (D12): a
 * malformed id or a workspace that is not theirs is `null`, which the page turns into a 404 — "not found", never
 * "forbidden" (AGENTS § The tenancy invariant). Without one, the default above.
 */
export function resolvePortfolioWorkspace<W extends { id: string }>(
  workspaces: readonly W[],
  projects: readonly MemberProjectLike[],
  requested: string | null | undefined
): W | null {
  const wanted = requested?.trim()
  if (wanted) return UUID_RE.test(wanted) ? (workspaces.find((w) => w.id === wanted) ?? null) : null
  const fallback = defaultPortfolioWorkspaceId(projects)
  return fallback === null ? null : (workspaces.find((w) => w.id === fallback) ?? null)
}

export const PORTFOLIO_HREF = '/app/portfolio'

/** The portfolio of one workspace — the switcher's entry and the page's own links build it here, once. */
export function portfolioHrefFor(workspaceId: string): string {
  return `${PORTFOLIO_HREF}?workspace=${encodeURIComponent(workspaceId)}`
}

/**
 * The loop-stage action reports a refusal or a failed save back to the page under this parameter (S2.3). Only these
 * values render anything; any other value is ignored, so a hand-typed URL can show at most one of these two sentences.
 */
export const LOOP_OUTCOME_PARAM = 'loop'
export const LOOP_OUTCOME_MESSAGES: Record<string, string> = {
  forbidden: 'Only a project owner can place it on the loop. Nothing was changed.',
  failed: 'The loop stage could not be saved. Nothing was changed — try again.',
}
