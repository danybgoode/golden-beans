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

import { Empty as DsEmpty, Field, Stat } from '@/design-system/primitives'
import { formatUtc } from '@/lib/format-utc'
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
    // ⚠️ **The two absences have DIFFERENT causes, and one sentence for both sent the operator to
    // fix the wrong thing** (cross-review, agy, round 2 — correctly).
    //
    //   Funnel  → `getFeatureFunnelByProjectId` misses when `features` (the TARS registry) has no
    //             row for this key.
    //   Impact  → `getFeatureImpactByProjectId` misses when `feature_inputs` has no row — a North
    //             Star input has to be LINKED to the key, which is a different act in a different
    //             table from registering a TARS signal.
    //
    // A feature can have one and not the other, which is precisely why naming which absence this is
    // was the deliverable (A4). Saying "TARS" on the Impact tab was the same defect A4 exists to
    // prevent, one table over.
    return what === 'funnel'
      ? {
          head: 'Nothing is measuring this yet',
          body:
            `${flagKey} is a feature flag. It has no funnel because nothing in the TARS registry is ` +
            `measuring it — those are two separate registries, and a flag gets a funnel only once a ` +
            `signal is registered under the same key.`,
        }
      : {
          head: 'No impact to attribute yet',
          body:
            `${flagKey} is a feature flag, and no North Star input is linked to it. Impact is the ` +
            `movement of an input you have attached to a feature, so there is nothing here until ` +
            `one is — which is a different act from registering it for a funnel.`,
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

/**
 * ⚠️ **The empty state IS the deliverable here, for 42 of 42 features.** It is the design system's
 * own empty state (`ds-empty`), not a paragraph — it has to read as "this is what you are looking
 * at", because on every flag a reader can click today, it is the whole pane.
 */
function Empty({ head, body }: { head: string; body: string }) {
  return <DsEmpty title={head} body={body} />
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
  // ⚠️ The BAR is clamped and the NUMBER is not, deliberately (cross-review, agy, round 2 — Nit).
  // A bar cannot be more than full, so an anomalous `adopted > targeted` must not paint outside its
  // track. The percentage beside it stays whatever the data says, because "133%" is information —
  // it tells a reader something upstream is wrong, and silently clamping it to 100 would hide the
  // one signal that a count is impossible.
  const barWidth = (value: number) => Math.min(100, Math.max(0, share(value) ?? 0))
  const rows: Array<[string, number]> = [
    ['Targeted', tars.targeted],
    ['Adopted', tars.adopted],
    ['Retained', tars.retained],
  ]
  return (
    <>
      <div className="ds-kpis">
        {rows.map(([label, value]) => (
          <Stat
            key={label}
            value={value.toLocaleString('en-US')}
            label={`${label}${share(value) === null ? '' : ` · ${share(value)}%`}`}
          />
        ))}
      </div>
      <Field label="Targeted → adopted → retained">
        {rows.map(([label, value]) => (
          <div className="ds-bar" key={label}>
            <div className="ds-bar-head">
              <span>{label}</span>
              <span className="ds-mono">{value.toLocaleString('en-US')}</span>
            </div>
            {/* ⚠️ Magnitude is `--gold` ALONE (DD4) — never four categorical hues, never a second
                axis — and a nonzero value never rounds to zero pixels: `.ds-bar-fill` carries a
                min-width floor, and the exact count sits beside the bar rather than only inside
                it. */}
            <div className="ds-bar-track">
              <div className="ds-bar-fill" style={{ width: `${barWidth(value)}%` }} />
            </div>
          </div>
        ))}
        {/* Preserved from the page this pane replaces, verbatim in substance: the counts are
            registry-declared, not gateway-observed. Dropping it while moving the numbers would
            quietly upgrade what they claim. */}
        {/* ⚠️ `formatUtc`, not `new Date(…).toLocaleString()`. The raw form renders the literal
            string "Invalid Date" for a malformed or missing timestamp — a bad historical row making
            a dashboard unreadable is exactly what that helper exists to prevent, and it says
            "Unknown time" instead (cross-review, agy). It is also timezone-stable, which
            `toLocaleString` on a server-rendered page is not. */}
        <p className="ds-hint">
          Targeted, adopted and retained are declared by the registry, not observed at a gateway — this engine
          counts the events a signal names. Last synced {formatUtc(feature.syncedAt)}.
        </p>
      </Field>
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
          <Field label={input.name} key={input.key}>
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
                <div className="ds-kpis">
                  <Stat value={latest.value.toLocaleString('en-US')} label={`Latest · ${latest.date}`} />
                  <Stat
                    value={total.toLocaleString('en-US')}
                    label={`Total · ${input.series[0].date} → ${latest.date}`}
                  />
                  <Stat value={input.series.length.toLocaleString('en-US')} label="Days recorded" />
                </div>
                {/* ⚠️ Correlation, said out loud. The prototype's own copy makes this point and it is
                    the one claim this pane could overstate: a number moving after a feature went on
                    is not the feature having moved it. The causal answer is an experiment, and the
                    sentence names where that lives. */}
                <p className="ds-hint">
                  This is what the input did, beside a feature that is on — a correlation this page can see,
                  not a causal claim. To make it causal, run it as an experiment from Ship › Experiments.
                  Source: {input.valueSource}.
                </p>
              </>
            )}
          </Field>
        )
      })}
    </>
  )
}
