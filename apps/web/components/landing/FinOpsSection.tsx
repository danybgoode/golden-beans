import { getSection } from '@/lib/landing-sections'
import { surfaceBadgeLabel } from '@/lib/maker-ops'
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
//      sketch. They get their own dashed, quieter treatment instead.
//
//      That distinction used to be drawn against §proof, which rendered a genuinely live read in
//      shipped-evidence chrome one section below. §proof was deleted in agentic-pm-public-surface
//      Sprint 2, so the contrast now has only one term — but the rule is unchanged and matters
//      MORE, not less: with no live reading anywhere on the page, `StatCard` around invented
//      figures would be the only stat-shaped thing here, and a reader has nothing to calibrate it
//      against.
//   3. The honesty line is inside the panel, not in a footnote below it.
//
// The alternative was to cut the section. It earns its place because the question it answers —
// "what is all this intelligence costing me, and is it worth it" — is one the reader is already
// asking, and a product that says "not yet, and here is exactly what we would build" is more
// credible than one that stays quiet about it.
const figures = [
  { label: 'Projected token spend', value: '$184', note: 'across 3 providers' },
  { label: 'Cost / completed workflow', value: '$0.42', note: 'includes retries + cache' },
  { label: 'Expected value signal', value: '+6 pts', note: 'North Star input projection' },
]

const facets = [
  { label: 'Attribution', detail: 'agent → workflow → Bet' },
  { label: 'Provider mix', detail: 'cost + quality by model' },
  { label: 'Appetite', detail: 'budget + alerts + stop' },
  { label: 'Unit economics', detail: 'cost per useful outcome' },
]

export function FinOpsSection() {
  // Status AND its wording both come from shared sources: the registry says this section is
  // `next`, and `surfaceBadgeLabel` says what `next` is called. This was the last place on the page
  // spelling that word by hand, which is how the bag and the panel drifted apart in round 6.
  // Mistral Vibe flagged it as a nit in round 10; it costs one import to remove the last copy.
  const section = getSection('finops')

  return (
    <section id="finops">
      <div className="wrap">
        <p className="eyebrow">FinOps for agentic making · next build</p>
        <h2 className="section-title">Know what your intelligence costs — and what it buys</h2>
        {/* The mockup's lead, verbatim. It states the mechanism ("attribute, then connect back to
            product value") and its verb is FUTURE — "will bring" — which is the one thing this
            section's copy has to keep getting right: it is the only section on this page about
            something that does not exist. The badge and the closing note below say so outright;
            this sentence just does not contradict them. */}
        {/* Epic D1 — spend control and unit economics. The tense is load-bearing and stays: this
            is the one section on the page describing something that does not exist, and every
            sentence in it is future or conditional. The badge and the "not built" line below are
            untouched by the register pass. */}
        <p className="measure">
          Spend control is not a bill you read at the end of the month — it is knowing which agent, which
          workflow and which Bet consumed the tokens, and whether the thing they bought was worth it.
          Golden Frijoles will bring AI unit economics into the same operating context as your North Star.
        </p>

        <div className="finops-concept section-lead">
          <p className="ops-status">
            <Badge status={section.status}>{surfaceBadgeLabel(section.status)}</Badge>
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
            cost down 31% while preserving the quality threshold this Bet requires. A recommendation, not an
            instruction — value beats cheapest-token theatre.
          </p>
          <p className="note finops-concept__next">
            Illustrative product direction — FinOps is the next build, not a shipped capability.
          </p>
        </div>
      </div>
    </section>
  )
}
