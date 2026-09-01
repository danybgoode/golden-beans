import { notFound } from 'next/navigation'
import { requireProjectMembership } from '@/lib/dashboard-auth'
import { isSignalsEnabled } from '@/lib/flags'
import { listTasksByProjectId, promoteEligibleSignals } from '@/lib/tasks'
import { evaluateFrictionForProject } from '@/lib/friction-eval'
import { splitTaskBands } from '@/lib/today-bands'
import { TaskQueue } from './task-queue'
import { ProductShell } from '@/components/product/ProductShell'
import { Answer, Crumb, Crumbs, PageHead } from '@/design-system/primitives'

// signals-loop · Sprint 2, Story 2.2 — the task queue, for humans.
//
// ── Why this page exists at all, when the point of the epic is agents ────────────────────────
// "Humans see what agents see" is the acceptance criterion, and it is a trust requirement rather
// than a convenience. An agent claiming and resolving work against a queue nobody can inspect is
// unauditable by construction — the first time someone asks "why did it close that?", the answer
// has to be a page, not a database query. This renders exactly what `list_tasks` returns, from the
// same functions, so the two surfaces cannot drift into disagreeing about a tenant's own queue.
//
// ── design-system-rails · Sprint 5, Story 5.6 — it is Today's bands, at full length (DD5) ─────
// It used to be a four-column `<table>` with a `▸`/`▾` toggle in a cell. The approved design has no
// such thing, and the reason is not taste: a queue is not a fifth place to look, it is the MIDDLE of
// Today — the part where something has picked a task up — mounted as its own page so it can show the
// two closed states Today collapses into one band.
//
// The row itself is `design-system/bands.tsx`' `TaskLine`, the same component Today renders. What
// differs is the `actions` slot: Today links here, and here you can claim, resolve and dismiss.
// **The interactive half is untouched in substance** — the actions, the evidence pointer field and
// the evidence drawer all survive, because deleting a capability to satisfy a geometry assertion is
// not what "render from the design system" asks for.

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
  //
  // ⚠️ Today does NOT do this, deliberately. `/app` is a read surface that every session lands on,
  // and running two write paths on it would make the home page a mutation trigger — which is a
  // different thing from a queue you opened on purpose.
  await evaluateFrictionForProject(membership.projectId, projectSlug).catch(() => null)
  await promoteEligibleSignals(membership.projectId).catch(() => 0)

  const tasks = await listTasksByProjectId(membership.projectId, { limit: 100 })
  const bands = splitTaskBands(tasks)

  return (
    <ProductShell projectSlug={projectSlug} section="today" railActive={null}>
      <main>
        <Crumbs back={{ href: '/app', label: 'Today' }}>
          <Crumb>All tasks</Crumb>
        </Crumbs>
        <PageHead title="Tasks" lede="Every signal that became a job, and who has it." />
        <Answer>
          <strong>This is Today&rsquo;s bands at full length — the same design, mounted as its own page.</strong>{' '}
          A task queue is not a fifth place to look; it is the middle of Today, which is where you will
          actually see it. Ranked by <strong>users affected × frequency</strong> and decayed by recency —
          every field of every evidence bundle is computed from your own events, and no model wrote any of
          it.
        </Answer>
        {/* ⚠️ `bands.unknown` is passed too, and the client renders it under its own heading rather
            than dropping it. The database CHECK allows exactly four statuses, so it is empty today —
            but a fifth added by a migration would otherwise vanish from a queue whose entire promise
            is that a human sees what an agent sees. */}
        <TaskQueue slug={projectSlug} bands={bands} />
      </main>
    </ProductShell>
  )
}
