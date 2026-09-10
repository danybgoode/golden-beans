// mockups-as-built · Sprint 3, Story 3.1 — the day-by-day readings, from the page head.
//
// ⚠️ **This is the capability the approved state does not draw, and it is not lost.**
// `app-component-kit-adoption` Story 2.3 built a sortable, filterable table of every reading, and
// `feature-panes.tsx` keeps one per input behind a `<details>` — one of the SIX `flags/…`
// disclosures epic D6 deliberately leaves alone, on a route this epic's gate does not open.
//
// This route IS opened by the gate, and the approved `measure-north-star` state draws no disclosure
// and no table: its inputs are illustrative. A sparkline is a shape; the table is the numbers, and
// somebody reconciling a figure against their own system needs the second. So it moves into the
// modal seam, which is what epic D3 says to do when a screen would otherwise lose something — a
// disclosure is never the answer, and when the two rules conflict the answer is a modal.
//
// The trigger is SECONDARY: `measure-north-star`'s head carries `action: null`, and reading your own
// numbers is not the primary thing to do on this screen.

import { NewThingDialog } from '@/components/product/NewThingDialog'
import { ImpactSeriesTable } from '@/app/app/impact/[projectSlug]/[featureKey]/series-table'
import type { FeatureImpactInput } from '@/lib/north-star-query'

export function NorthStarReadings({ inputs }: { inputs: FeatureImpactInput[] }) {
  return (
    <NewThingDialog
      variant="secondary"
      label="Every reading"
      title="Every reading, input by input"
      lede="The numbers behind the plots — sortable and filterable, for reconciling against your own system."
    >
      {inputs.length === 0 ? (
        <p>No leading input is registered, so there is nothing recorded to show.</p>
      ) : (
        inputs.map((input) => (
          <section key={input.key}>
            <h2>{input.name}</h2>
            <p className="ds-hint">
              {input.series.length === 0
                ? 'Nothing recorded yet.'
                : `${input.series.length} reading${input.series.length === 1 ? '' : 's'}, totalling ${input.series
                    .reduce((sum, point) => sum + point.value, 0)
                    .toLocaleString(
                      'en-US'
                    )} across ${input.series[0].date} → ${input.series[input.series.length - 1].date}.`}
            </p>
            <ImpactSeriesTable inputName={input.name} series={input.series} />
          </section>
        ))
      )}
    </NewThingDialog>
  )
}
