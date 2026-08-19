import { getSection } from '@/lib/landing-sections'
import { Badge } from '@/components/ui/Badge'

// landing-maker-ops · Sprint 2, Story 2.6 — AI unit economics, labelled as the concept it is.
//
// This is the only section on this page describing something that does not exist, and epic D4 says
// it ships as an explicit concept or not at all. Three things make that structural rather than a
// promise in a comment:
//
//   1. The status comes from the registry (`lib/landing-sections.ts`), which carries `next` for
//      this id. Nobody can quietly upgrade the claim by editing a string in this file.
//   2. The figures deliberately do NOT use `StatCard`. That component's entire contract is "this is
//      a reading" — it will not even render a placeholder in place of a number it could not read —
//      and borrowing it for four invented figures would put a shipped-evidence device around a
//      sketch. They get their own dashed, quieter treatment instead, so a reader scanning the page
//      cannot mistake this panel for the live one in §proof.
//   3. The honesty line is inside the panel, not in a footnote below it.
//
// The alternative was to cut the section. It earns its place because the question it answers —
// "what is all this intelligence costing me, and is it worth it" — is one the reader is already
// asking, and a product that says "not yet, and here is exactly what we would build" is more
// credible than one that stays quiet about it.
const figures = [
  { label: 'Projected token spend', value: '$184', note: 'Across three providers' },
  { label: 'Cost per completed workflow', value: '$0.42', note: 'Retries and cache included' },
  { label: 'Expected value signal', value: '+6 pts', note: 'Projected North Star input' },
]

const facets = [
  { label: 'Attribution', detail: 'agent → workflow → Bet' },
  { label: 'Provider mix', detail: 'cost and quality, by model' },
  { label: 'Appetite', detail: 'budget, alerts, stop' },
  { label: 'Unit economics', detail: 'cost per useful outcome' },
]

export function FinOpsSection() {
  const section = getSection('finops')

  return (
    <section id="finops">
      <div className="wrap">
        <p className="eyebrow">FinOps for agentic making</p>
        <h2 className="section-title">Know what your intelligence costs, and what it buys</h2>
        <p className="measure">
          Token spend is only useful once you can attribute it to the agent, the workflow and the Bet that
          consumed it, then connect it back to product value. This would bring AI unit economics into the same
          operating context as your North Star.
        </p>

        <div className="finops-concept section-lead">
          <p className="ops-status">
            <Badge status={section.status}>Next build</Badge>
            <span>
              Nothing on this panel is built or measured. It is the shape of the capability, drawn so you can
              tell us it is wrong before we build it.
            </span>
          </p>

          <div className="finops-figures">
            {figures.map((figure) => (
              <div className="finops-figure" key={figure.label}>
                <small>{figure.label}</small>
                <b>{figure.value}</b>
                <span>{figure.note}</span>
              </div>
            ))}
          </div>

          <div className="finops-facets">
            {facets.map((facet) => (
              <div className="finops-facet" key={facet.label}>
                <small>{facet.label}</small>
                <strong>{facet.detail}</strong>
              </div>
            ))}
          </div>

          <p className="note">
            The kind of thing it would tell you: route routine classification to a smaller model, projected
            cost down 31%, quality threshold for this Bet preserved. A recommendation, not an instruction —
            the cheapest token is not automatically the right one.
          </p>
        </div>
      </div>
    </section>
  )
}
