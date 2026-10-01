// workspaces · Sprint 2, Stories 2.1 + 2.2 (Roadmap/02-commercial/workspaces — the Architecture lock, D6 and D9).
//
// The two tenancy decisions of this epic, as pure functions. ZERO imports, on purpose: they are what AGENTS.md's
// tenancy invariant rests on, and this repo asserts decisions of that kind directly — `workspace-access.test.ts` hands
// them rows, with no database, no session and no framework (CODE-QUALITY #5; LEARNINGS: a guard behind state the
// harness cannot reach belongs in a zero-import module).
//
//   isInsideViewerWorkspaces   the seam re-check. lib/membership.ts runs it in all three of its reads.
//   intersectWorkspaceProjects the ONE legal multi-project read (lib/workspace.ts → getWorkspaceProjects).

/**
 * May a viewer whose workspaces are `viewerWorkspaceIds` reach a project that lives in `projectWorkspaceId`?
 *
 * Fails CLOSED on anything that is not a positive answer: a missing or empty workspace id is "no", never "the check
 * does not apply". Since migration B the column is NOT NULL, so a null here means a read that lost the column — which
 * must deny, not pass through.
 */
export function isInsideViewerWorkspaces(
  projectWorkspaceId: unknown,
  viewerWorkspaceIds: ReadonlySet<string>
): boolean {
  return (
    typeof projectWorkspaceId === 'string' &&
    projectWorkspaceId !== '' &&
    viewerWorkspaceIds.has(projectWorkspaceId)
  )
}

export type WorkspaceProjectCandidate = { id: string; slug: string; workspaceId: string }
export type ViewerMembership = { projectId: string; role: string }
export type WorkspaceProject = { id: string; slug: string; role: string }

/**
 * The projects of `workspaceId` a viewer may read TOGETHER: same workspace ∩ their own project memberships, and
 * nothing at all unless they are a member of that workspace.
 *
 * Every condition is re-applied here even though the caller's queries already filter by it — a query that lost a
 * WHERE clause must still not widen the answer (LEARNINGS: a rule enforced in two places for two reasons).
 * Ordered by slug, so a page that lists them is stable.
 */
export function intersectWorkspaceProjects(input: {
  workspaceId: string
  viewerWorkspaceIds: ReadonlySet<string>
  projects: readonly WorkspaceProjectCandidate[]
  memberships: readonly ViewerMembership[]
}): WorkspaceProject[] {
  if (!isInsideViewerWorkspaces(input.workspaceId, input.viewerWorkspaceIds)) return []
  const roleByProject = new Map(
    input.memberships.map((membership) => [membership.projectId, membership.role])
  )
  return input.projects
    .filter((project) => project.workspaceId === input.workspaceId && roleByProject.has(project.id))
    .map((project) => ({ id: project.id, slug: project.slug, role: roleByProject.get(project.id)! }))
    .sort((left, right) => left.slug.localeCompare(right.slug))
}
