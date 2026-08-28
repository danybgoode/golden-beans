// console-ia-overhaul · Sprint 3, Story 3.2 — Funnel and Impact, on the feature they describe.
//
// ── Why these are panes and not pages ─────────────────────────────────────────────────────────
// `/app/funnel/<slug>/<key>` and `/app/impact/<slug>/<key>` both still exist and still work; Story
// 1.2 removed them from the NAV because their own inventory descriptions told the reader to "swap
// the feature key in the URL" — which is the single line the epic's outcome test is written
// against. A funnel is not a destination, it is one view of one feature, so it lives on the feature
// and the key comes from the route.
//
// ⚠️ **A4 — THE HONEST EMPTY STATE IS THE DELIVERABLE, for 42 of 42 features today.**
// Measured on production 2026-08-27: `features` (the TARS registry) holds ONE row for
// `miyagisanchez` — `setup_guide` — against 42 rows in `flag_registries`, and the join on `key`
// returns ZERO. They are separate tables with separate lifecycles and separate naming conventions,
// and not one flag has a TARS counterpart. So for every feature a reader can click today, these
// tabs render a SENTENCE naming which absence this is — never a zero, which would say "measured, and
// the answer is nothing" about something nobody is measuring.
//
// That is also why neither pane may call `notFound()`. The pages they came from do
// (`app/app/funnel/[projectSlug]/[featureKey]/page.tsx:26`), and a tab that 404s the whole feature
// page because the OTHER registry has no row would be a regression caused by a missing measurement.

import type { FunnelResult } from '@/lib/tars-query'
import type { FeatureImpactResult } from '@/lib/north-star-query'

/**
 * Why a feature has no funnel, in the reader's words.
 *
 * Each reason gets its own sentence, because they are different facts and a reader can act on
 * exactly one of them. A single "no data" would collapse "nobody is measuring this" (normal, and
 * the answer for every flag today) into "something went wrong" (not normal at all).
 */
function absence(reason: string, flagKey: string, what: 'funnel' | 'impact'): { head: string; body: string } {
  if (reason === 'feature_not_found') {
    return {
      head: what === 'funnel' ? 'Nothing is measuring this yet' : 'No impact to attribute yet',
      body:
        `${flagKey} is a feature flag. It has no ${what} because nothing in the TARS registry is ` +
        `measuring it — those are two separate registries, and a flag gets a ${what} only once a ` +
        `signal is registered under the same key.`,
    }
  }
  if (reason === 'project_not_found') {
    return {
      head: 'This project could not be read',
      body: 'The project this feature belongs to could not be resolved. Nothing is wrong with the feature.',
    }
  }
  return {
    head: what === 'funnel' ? 'The funnel could not be read' : 'The impact could not be read',
    body: 'The query failed. This is a fault, not an absence — the numbers exist and could not be fetched.',
  }
}

function Empty({ head, body }: { head: string; body: string }) {
  return (
    <div className="empty">
      <b>{head}</b>
      <span>{body}</span>
    </div>
  )
}

export function FunnelPane({ flagKey, result }: { flagKey: string; result: FunnelResult }) {
  if (!result.ok) {
    const { head, body } = absence(result.reason, flagKey, 'funnel')
    return <Empty head={head} body={body} />
  }
  const { feature, tars } = result
  // Percentages are OF THE TARGETED population, which is what makes the three numbers a funnel
  // rather than three unrelated counts. Guarded at zero: `0/0` is `NaN`, and a funnel reading
  // "NaN%" is worse than one reading nothing.
  const share = (value: number) => (tars.targeted === 0 ? null : Math.round((value / tars.targeted) * 100))
  const rows: Array<[string, number]> = [
    ['Targeted', tars.targeted],
    ['Adopted', tars.adopted],
    ['Retained', tars.retained],
  ]
  return (
    <>
      <div className="kpis">
        {rows.map(([label, value]) => (
          <div className="kpi" key={label}>
            <div className="n">{value.toLocaleString('en-US')}</div>
            <div className="k">
              {label}
              {share(value) === null ? '' : ` · ${share(value)}%`}
            </div>
          </div>
        ))}
      </div>
      <div className="field">
        <span className="lab">Targeted → adopted → retained</span>
        {rows.map(([label, value]) => (
          <div className="funnel-bar" key={label}>
            <div className="funnel-bar__head">
              <span>{label}</span>
              <span className="mono">{value.toLocaleString('en-US')}</span>
            </div>
            <div className="funnel-bar__track">
              <div className="funnel-bar__fill" style={{ width: `${share(value) ?? 0}%` }} />
            </div>
          </div>
        ))}
        {/* Preserved from the page this pane replaces, verbatim in substance: the counts are
            registry-declared, not gateway-observed. Dropping it while moving the numbers would
            quietly upgrade what they claim. */}
        <p className="hint">
          Targeted, adopted and retained are declared by the registry, not observed at a gateway — this engine
          counts the events a signal names. Last synced {new Date(feature.syncedAt).toLocaleString('en-US')}.
        </p>
      </div>
    </>
  )
}

export function ImpactPane({ flagKey, result }: { flagKey: string; result: FeatureImpactResult }) {
  if (!result.ok) {
    const { head, body } = absence(result.reason, flagKey, 'impact')
    return <Empty head={head} body={body} />
  }
  const { inputs } = result
  if (inputs.length === 0) {
    return (
      <Empty
        head="No input is linked to this feature"
        body={`${flagKey} is measured, but no North Star input is attached to it — so there is nothing this page could attribute a movement to.`}
      />
    )
  }
  return (
    <>
      {inputs.map((input) => {
        const latest = input.series.at(-1) ?? null
        const total = input.series.reduce((sum, point) => sum + point.value, 0)
        return (
          <div className="field" key={input.key}>
            <span className="lab">{input.name}</span>
            {/* An empty series is NOT a zero. A card reading "0" for a metric nobody has recorded is
                the honest-looking zero this repo has shipped to production before; the sentence is
                the whole message when there are no readings. */}
            {latest === null ? (
              <Empty
                head="Nothing recorded yet"
                body={`${input.name} has no readings, so there is no movement to attribute to ${flagKey}.`}
              />
            ) : (
              <>
                <div className="kpis">
                  <div className="kpi">
                    <div className="n">{latest.value.toLocaleString('en-US')}</div>
                    <div className="k">Latest · {latest.date}</div>
                  </div>
                  <div className="kpi">
                    <div className="n">{total.toLocaleString('en-US')}</div>
                    <div className="k">
                      Total · {input.series[0].date} → {latest.date}
                    </div>
                  </div>
                  <div className="kpi">
                    <div className="n">{input.series.length.toLocaleString('en-US')}</div>
                    <div className="k">Days recorded</div>
                  </div>
                </div>
                {/* ⚠️ Correlation, said out loud. The prototype's own copy makes this point and it is
                    the one claim this pane could overstate: a number moving after a feature went on
                    is not the feature having moved it. The causal answer is an experiment, and the
                    sentence names where that lives. */}
                <p className="hint">
                  This is what the input did, beside a feature that is on — a correlation this page can see,
                  not a causal claim. To make it causal, run it as an experiment from Ship › Experiments.
                  Source: {input.valueSource}.
                </p>
              </>
            )}
          </div>
        )
      })}
    </>
  )
}
