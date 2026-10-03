import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase-auth'
import { getUserProjects } from '@/lib/membership'
import { getUserWorkspaces } from '@/lib/workspace'
import { getPortfolio } from '@/lib/portfolio'
import {
  PORTFOLIO_MIN_PRODUCTS,
  projectsPerWorkspace,
  resolvePortfolioWorkspace,
} from '@/lib/portfolio-workspace'
import { buildPortfolioRowView, type CellView, type RowLinks } from '@/lib/portfolio-view'
import { getProjectSurfaceLinks } from '@/lib/project-route-inventory'
import { readGates } from '@/lib/shell-nav'
import { todayHrefFor } from '@/lib/console-shell'
import { ProductShell } from '@/components/product/ProductShell'
import { Callout, Empty, PageHead, Table, TableCell, TableHead, TableRow } from '@/design-system/primitives'
import { LoopControl } from './loop-control'
import { LoadingTable, PORTFOLIO_COLUMNS } from './loading-table'

// portfolio-view · Sprint 2, Story 2.1 (Roadmap/02-commercial/portfolio-view — the Architecture lock, D1, D2, D6, D12).
//
// Every product of ONE workspace on one page, a row each, from `getPortfolio()` and nothing else (D1 — the tenancy
// rule lives there, cited not restated). The five approved states (seed → Visuals) and what triggers each:
//
//   portfolio            the chosen workspace holds 2+ of the viewer's products
//   portfolio-loading    the Suspense fallback (`loading-table.tsx`), while the rows are read
//   portfolio-empty      it holds fewer than two — there is nothing to put a product beside
//   portfolio-error      `error.tsx` when the viewer's own workspaces or projects could not be read (both THROW), or
//                        inline when the rows' legal read failed closed
//   portfolio-loop-unbuilt  a row whose stage is unset says "Not placed", and "Place it" to an owner
//
// `?workspace=` is a VIEW preference matched against the viewer's own workspaces; anything else is a 404 (D12). Rows
// only: no totals, no ranking (D6). Every cell links to the page its figure came from — and is plain text when that
// page's gate is off for this viewer, because a link that lands on a 404 is worse than no link.
export const dynamic = 'force-dynamic'

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string | string[] }>
}) {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const query = await searchParams
  const requested = Array.isArray(query.workspace) ? query.workspace[0] : query.workspace
  const [workspaces, projects] = await Promise.all([getUserWorkspaces(user.id), getUserProjects(user.id)])
  // Nobody to compare: `/app` is where a person with no project is looked after (provisioning).
  if (projects.length === 0 && !requested) redirect('/app')
  // ⚠️ Every redirect and 404 is decided HERE, before the Suspense boundary below. A route-level `loading.tsx` starts
  // streaming a 200 before the page runs, so a `notFound()` after it rendered the not-found UI under status 200 —
  // found by the authed spec, which asserts the status, not the words.
  const workspace = resolvePortfolioWorkspace(workspaces, projects, requested)
  if (!workspace) notFound()

  const mine = projects.filter((project) => project.workspace.id === workspace.id)
  const held = projectsPerWorkspace(projects).get(workspace.id) ?? 0

  return (
    <ProductShell projectSlug={undefined} section="home" railActive={null}>
      <main>
        {held < PORTFOLIO_MIN_PRODUCTS ? (
          <div data-portfolio-state="empty">
            <PageHead title="Your workspace" lede={workspace.name} />
            <Empty
              title="Your workspace has one product."
              body="The portfolio appears when you add a second."
            />
          </div>
        ) : (
          <>
            <PageHead
              title="Your workspace"
              lede={`${workspace.name} — every product you belong to, placed on the Consider · Operate · Exit loop.`}
              actions={
                <a className="ds-btn ds-btn--secondary" href={todayHrefFor(mine[0].slug)}>
                  Open a product
                </a>
              }
            />
            {/* The approved `portfolio-loading` state is this fallback: the head is already there, the rows are read. */}
            <Suspense fallback={<LoadingTable />}>
              <PortfolioRows userId={user.id} workspaceId={workspace.id} />
            </Suspense>
          </>
        )}
      </main>
    </ProductShell>
  )
}

async function PortfolioRows({ userId, workspaceId }: { userId: string; workspaceId: string }) {
  const rows = await getPortfolio(userId, workspaceId)
  // The viewer holds 2+ products here (counted from their own memberships), so no rows means the legal read failed
  // closed — it returns [] on any error. That is "couldn't load", never "one product" (D2).
  if (rows.length === 0)
    return (
      <div data-portfolio-state="error">
        <Callout tone="warn">Couldn&apos;t load your workspace. Try again.</Callout>
      </div>
    )
  const gates = readGates()
  return (
    <div data-portfolio-state="portfolio">
      <Table>
        <TableHead>
          <TableCell header wide>
            Product
          </TableCell>
          {PORTFOLIO_COLUMNS.map((column) => (
            <TableCell header key={column}>
              {column}
            </TableCell>
          ))}
        </TableHead>
        {rows.map((row) => {
          const surfaces = new Map(
            getProjectSurfaceLinks({ projectSlug: row.project.slug, role: row.project.role, gates }).map(
              (link) => [link.routeSegment, link.href]
            )
          )
          const links: RowLinks = {
            today: todayHrefFor(row.project.slug),
            northStar: surfaces.get('north-star'),
            report: `/hub/${encodeURIComponent(row.project.slug)}/report`,
            experiments: surfaces.get('experiments'),
            flags: surfaces.get('flags'),
            finops: surfaces.get('finops'),
          }
          const cells = buildPortfolioRowView(row, links)
          return (
            <TableRow key={row.project.id}>
              <TableCell wide>
                <a href={links.today} data-product={row.project.slug}>
                  {row.project.slug}
                </a>
                <span className="ds-state-detail">{row.project.role}</span>
              </TableCell>
              <TableCell>
                <LoopControl
                  projectId={row.project.id}
                  cell={row.loop_stage}
                  isOwner={row.project.role === 'owner'}
                />
              </TableCell>
              <Figure cell={cells.northStar} column="north-star" />
              <Figure cell={cells.funnel} column="funnel" />
              <TableCell>
                <FigureBody cell={cells.running} column="running" />
                <FigureBody cell={cells.killSwitches} column="kill-switches" secondary />
              </TableCell>
              <Figure cell={cells.leadTime} column="lead-time" />
              <Figure cell={cells.spend} column="spend" />
            </TableRow>
          )
        })}
      </Table>
      <p className="ds-hint">
        Figures from pushed reports say when they were pushed. Not set means not set, never zero.
      </p>
    </div>
  )
}

function Figure({ cell, column }: { cell: CellView; column: string }) {
  return (
    <TableCell>
      <FigureBody cell={cell} column={column} />
    </TableCell>
  )
}

/** One figure: its text (a link to where it came from, when that page is open to this viewer) and its detail line. */
function FigureBody({ cell, column, secondary }: { cell: CellView; column: string; secondary?: boolean }) {
  const text = cell.href ? <a href={cell.href}>{cell.text}</a> : cell.text
  return (
    <span
      data-cell={column}
      data-cell-tone={cell.tone}
      className={secondary ? 'ds-state-detail' : undefined}
      // The secondary line is clipped to one line by `.ds-state-detail`; the whole sentence stays reachable.
      title={secondary ? cell.text : undefined}
    >
      {text}
      {cell.detail ? <span className="ds-state-detail">{cell.detail}</span> : null}
    </span>
  )
}
