import { Table, TableCell, TableHead } from '@/design-system/primitives'

// portfolio-view · Sprint 2, Story 2.1 — the approved `portfolio-loading` state: the column row with no rows yet, shown
// under the page head while the rows are read. A Suspense fallback rather than a route `loading.tsx`, so the page's
// 404 and redirects are decided before anything streams (see page.tsx). No placeholder figures: a skeleton number reads
// as a number (CODE-QUALITY #8).

export const PORTFOLIO_COLUMNS = [
  'Loop',
  'North Star',
  'Funnel',
  'Running',
  'Lead time',
  'Spend vs quote',
] as const

export function LoadingTable() {
  return (
    <div data-portfolio-state="loading" aria-busy="true">
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
      </Table>
    </div>
  )
}
