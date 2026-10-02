import { notFound, redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase-auth'
import { getUserWorkspaces, getWorkspaceProjects } from '@/lib/workspace'
import { getHubRoadmapByProjectId } from '@/lib/hub-query'
import { boardQuery, buildBoard, hasStages, parseBoardFilters, type BoardCard } from '@/lib/hub-board'
import type { RoadmapRow } from '@/lib/roadmap-artifact-schema'
import { Frame } from '@/design-system/Frame'
import { BoardView } from '../../../[projectSlug]/board/board-components'

export const dynamic = 'force-dynamic'

// board-sinks-and-scrumban · Sprint 4, Story 4.2 — one board across a workspace (D11; lock C8, C9).
//
// ── Tenancy (AGENTS.md § The tenancy invariant — cited, not restated) ──────────────────────────────────────────────
// The ONLY multi-project read is `getWorkspaceProjects(userId, workspaceId)`: the projects of THAT workspace the viewer
// is a member of, and nothing unless they belong to it. Each of those projects' latest roadmap artifact is then read by
// its id, exactly as its own board reads it. There is no other project lookup on this path: the URL's workspace id is
// only ever a key into the viewer's OWN workspace list, and `?project=` only ever filters the list the helper returned.
//
//   · no session                        → /login (no demo carve-out: a workspace is never public)
//   · a malformed id                    → 404
//   · a workspace the viewer is not in  → 404 ("not found", never "forbidden" — the workspaces epic's rule)
//   · `?project=` outside that list     → 404, even when the project exists in another workspace
//
// The route is keyed by workspace ID: workspaces have no slug (lock C8). It reuses the project board's view, so the six
// columns, the filters and the WIP advice are the same component; a card opens on ITS project's board.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function WorkspaceBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ project?: string | string[]; type?: string | string[]; risk?: string | string[] }>
}) {
  const { workspaceId } = await params
  const query = await searchParams
  const user = await getSessionUser()
  if (!user) redirect('/login')
  if (!UUID_RE.test(workspaceId)) notFound()

  const workspace = (await getUserWorkspaces(user.id)).find((w) => w.id === workspaceId)
  if (!workspace) notFound()

  const projects = await getWorkspaceProjects(user.id, workspaceId)
  const projectFilter = (Array.isArray(query.project) ? query.project[0] : query.project) ?? null
  if (projectFilter !== null && !projects.some((p) => p.slug === projectFilter)) notFound()
  const shown = projectFilter ? projects.filter((p) => p.slug === projectFilter) : projects

  const results = await Promise.all(shown.map((p) => getHubRoadmapByProjectId(p.id)))
  if (results.some((r) => !r.ok && r.reason === 'query_failed'))
    throw new Error('Roadmap artifact lookup failed')
  const items: RoadmapRow[] = results.flatMap((r, i) =>
    r.ok && Array.isArray(r.artifact.payload?.items)
      ? r.artifact.payload.items.map((row) => ({ ...row, project: shown[i].slug }) as RoadmapRow)
      : []
  )
  const withBoard = shown.filter((_, i) => {
    const r = results[i]
    return r.ok && hasStages(r.artifact.payload?.items ?? [])
  }).length

  const filters = parseBoardFilters(query)
  const board = buildBoard(items, { filters })
  const base = `/hub/w/${workspaceId}/board`
  const carry: Record<string, string> = projectFilter ? { project: projectFilter } : {}
  const firstProject = projectFilter ?? projects[0]?.slug ?? null

  const projectChip = (label: string, project: string | null) => (
    <a
      key={`project-${project ?? 'all'}`}
      className="ds-chip"
      href={`${base}${boardQuery(filters, project ? { project } : {})}`}
      aria-current={projectFilter === project ? 'true' : undefined}
    >
      {label}
    </a>
  )

  return (
    <Frame
      variant="hub"
      brandHref="/app"
      scope={workspace.name}
      actions={
        <a className="ds-btn ds-btn--secondary ds-btn--sm" href="/app">
          Back to the console
        </a>
      }
      nav={
        <a href={base} aria-current="page">
          Board
        </a>
      }
    >
      <BoardView
        board={board}
        filters={filters}
        base={base}
        freshness={null}
        version={null}
        showAnswer={false}
        lede={`Every initiative in ${workspace.name}, from an idea to shipped, across the projects you belong to.`}
        action={
          firstProject ? (
            <a className="ds-btn ds-btn--primary" href={`/hub/${encodeURIComponent(firstProject)}/board`}>
              Open a project&apos;s board
            </a>
          ) : undefined
        }
        leadingChips={[
          projectChip('All projects', null),
          ...projects.map((p) => projectChip(p.slug, p.slug)),
        ]}
        carry={carry}
        cardHref={(card: BoardCard) =>
          `/hub/${encodeURIComponent(card.project ?? '')}/board?card=${encodeURIComponent(card.slug)}`
        }
        note={
          <p className="ds-hint">
            Every project in this workspace that you belong to. Filter by project. {withBoard} of{' '}
            {shown.length} project
            {shown.length === 1 ? ' has' : 's have'} pushed a board; a project with none yet shows nothing
            here until it does (
            <code className="ds-mono">npx -y @golden-frijoles/kit roadmap-extract --sink hub</code>).
          </p>
        }
      />
    </Frame>
  )
}
