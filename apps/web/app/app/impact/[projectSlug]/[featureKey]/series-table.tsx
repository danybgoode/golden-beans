'use client'
import { useMemo } from 'react'
import type { DailySeriesPoint } from '@/lib/north-star'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'

// app-component-kit-adoption · Sprint 2, Story 2.3 — the impact time series, as a DataTable.
//
// ── Why this file exists at all ───────────────────────────────────────────────────────────────
// `DataTable`'s `columns` carry accessor FUNCTIONS, and functions cannot cross the server→client
// boundary as props. `impact/[featureKey]/page.tsx` is a server component, so it cannot build the
// columns itself — every DataTable call site needs a client island to declare them in. The other
// converted routes got this for free because they already had `'use client'` managers; impact did
// not, so it gets the smallest possible one. This is a consequence of D2 (the table receives rows
// and never fetches), not a workaround for it: the page still does the authorized read and hands
// the rows down.
//
// The series is NOT turned into a chart. That is #14's decision and #16's work; this epic gives the
// headline figures StatCards (in the page) and leaves the numbers legible as a table.

export function ImpactSeriesTable({ inputName, series }: { inputName: string; series: DailySeriesPoint[] }) {
  const columns = useMemo<DataTableColumn<DailySeriesPoint>[]>(
    () => [
      { key: 'date', header: 'Date', value: (point) => point.date },
      // The raw number, so 9 sorts before 10 rather than after it.
      { key: 'value', header: 'Value', value: (point) => point.value },
    ],
    []
  )

  return (
    <DataTable
      caption={`${inputName} — daily values`}
      columns={columns}
      rows={series}
      rowKey={(point) => point.date}
      filterLabel="Filter days"
      empty="No data yet for this input. Values appear here once the source event is tracked, or once a value is pushed for it."
    />
  )
}
