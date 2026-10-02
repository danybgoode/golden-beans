'use client'

import { Button } from '@/design-system/primitives'
import { epicsCsv, type FinopsEpicRow } from '@/lib/finops-view'

// finops 3.3 — the approved head's "Export CSV": the Epics table exactly as the page shows it, built in the browser
// from the rows the server already rendered. No second read, no endpoint.
export function ExportCsv({ rows, projectSlug }: { rows: FinopsEpicRow[]; projectSlug: string }) {
  const download = () => {
    const blob = new Blob([`${epicsCsv(rows)}\n`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectSlug}-finops-epics.csv`
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <Button onClick={download} icon="arrow-down">
      Export CSV
    </Button>
  )
}
