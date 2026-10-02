import { getSection } from '@/lib/landing-sections'
import { surfaceBadgeLabel } from '@/lib/maker-ops'
import { Badge } from '@/components/ui/Badge'

// landing-maker-ops · Sprint 2, Story 2.6 — AI unit economics. finops · Sprint 3, Story 3.4 — now LIVE, and it says
// only what /app/finops shows.
//
// Until finops shipped, this was the one section describing something that did not exist, with four invented figures
// in a deliberately un-StatCard-like treatment. The figures are GONE, not swapped for real ones: a landing page has no
// reader's data to show, and borrowing our own numbers would be a reading presented as the reader's. What is left is
// the mechanism, stated in the present tense because it runs:
//
//   1. The status still comes from the registry (`lib/landing-sections.ts`, now `live`), never from a string here.
//   2. Every claim is one /app/finops or the build view can show: measured from Claude Code sessions (metrics only),
//      a quote calibrated from your own shipped epics, an alert when spend passes it — alert only, nothing is stopped
//      (finops D8) — and Claude Code only, said outright (D12).
//   3. The one part still unbuilt — cost linked to the North Star movement it bought — keeps a `next` badge of its
//      own, in words, inside the panel. The section is live; that sentence is not, and it says so.
const facets = [
  { label: 'Measured', detail: 'from your own Claude Code sessions' },
  { label: 'Quoted', detail: 'from your shipped epics, at grooming' },
  { label: 'Alerted', detail: 'in the build view, when spend passes the quote' },
  { label: 'Stamped', detail: 'into the epic at close — the next quote learns' },
]

export function FinOpsSection() {
  const section = getSection('finops')

  return (
    <section id="finops">
      <div className="wrap">
        <p className="eyebrow">FinOps for agentic making</p>
        <h2 className="section-title">Know what each epic costs — against what you expected</h2>
        <p className="measure">
          Every epic gets a quote when it is groomed, calibrated from what your own shipped epics actually
          cost. While it is built, the build view shows spend against that quote; at close the actual is
          stamped into the epic, so the next quote is better. Push your usage and FinOps in the console breaks
          it down by epic, skill and model.
        </p>

        <div className="finops-concept section-lead">
          <p className="ops-status">
            <Badge status={section.status}>{surfaceBadgeLabel(section.status)}</Badge>
            <span>
              Measured, not estimated: token counts from your own sessions — never their content — priced as ≈
              API $, a list-price equivalent. Claude Code only; other agents are not measured yet.
            </span>
          </p>

          <div className="finops-facets">
            {facets.map((facet) => (
              <div className="finops-facet" key={facet.label}>
                <small>{facet.label}</small>
                <strong>{facet.detail}</strong>
              </div>
            ))}
          </div>

          <p className="note">
            Over the quote is an alert, not a stop — we do not host your agents, so nothing is throttled on
            your behalf.
          </p>
          <p className="ops-status finops-concept__next">
            <Badge status="next">{surfaceBadgeLabel('next')}</Badge>
            <span>
              Cost per outcome — connecting the spend to the North Star movement it bought — is the next
              build.
            </span>
          </p>
        </div>
      </div>
    </section>
  )
}
