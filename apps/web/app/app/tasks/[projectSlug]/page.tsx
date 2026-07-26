import { notFound } from 'next/navigation'
import { requireProjectMembership } from '@/lib/dashboard-auth'
import { isSignalsEnabled } from '@/lib/flags'
import { listTasksByProjectId, promoteEligibleSignals } from '@/lib/tasks'
import { evaluateFrictionForProject } from '@/lib/friction-eval'
import { TaskQueue } from './task-queue'

// signals-loop · Sprint 2, Story 2.2 — the task queue, for humans.
//
// ── Why this page exists at all, when the point of the epic is agents ────────────────────────
// "Humans see what agents see" is the acceptance criterion, and it is a trust requirement rather
// than a convenience. An agent claiming and resolving work against a queue nobody can inspect is
// unauditable by construction — the first time someone asks "why did it close that?", the answer
// has to be a page, not a database query. This renders exactly what `list_tasks` returns, from the
// same functions, so the two surfaces cannot drift into disagreeing about a tenant's own queue.

export const dynamic = 'force-dynamic'

export default async function TasksPage({
  params,
}: {
  params: Promise<{ projectSlug: string }>
}) {
  // Dark means NONEXISTENT, and the check runs before auth or any project lookup — so while the
  // seam is off this route cannot even confirm that a project slug exists. Same ordering as every
  // other gated surface here (journeys, experiments, shares).
  if (!isSignalsEnabled()) notFound()

  const { projectSlug } = await params
  // Resolves the tenant server-side from the SESSION, never from the slug alone. A non-member gets
  // the same 404 as a nonexistent project — slug-guessing must not become an existence oracle.
  const membership = await requireProjectMembership(projectSlug)

  // Opening the queue is what makes the queue current (Amendment 3): friction detectors run, then
  // qualifying signals promote — both scoped to this one tenant, both internally throttled. The
  // page is a read path, so it is one of the two triggers the lazy model relies on.
  //
  // Both fail SOFT. A refresh hiccup must degrade to a slightly stale queue, never to an error
  // page: someone opening this during an incident needs the list they have, not a stack trace.
  await evaluateFrictionForProject(membership.projectId, projectSlug).catch(() => null)
  await promoteEligibleSignals(membership.projectId).catch(() => 0)

  const tasks = await listTasksByProjectId(membership.projectId, { limit: 100 })

  return (
    <main>
      <h1>Tasks — {projectSlug}</h1>
      <p>
        <a href="/app">← Your projects</a>
      </p>
      <p>
        Errors and friction the engine grouped, ranked by <strong>users affected × frequency</strong>{' '}
        and decayed by recency. Every field of every evidence bundle is computed from your own
        events — no model wrote any of it.
      </p>
      <TaskQueue slug={projectSlug} tasks={tasks} />
    </main>
  )
}
