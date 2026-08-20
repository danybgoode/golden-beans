import { RunYourFirstBet } from './RunYourFirstBet'

// landing-maker-ops · Sprint 2, Story 2.7 — the way of working behind the product.
//
// ── What was cut, and why (epic D5) ───────────────────────────────────────────────────────────
// The mockup's version of this section carries a CTA pointing at `href="#"` and, underneath it, the
// line *"Read online / download experience placeholder — to be designed in a focused session."*
// That sentence is a note from one designer to another that ended up rendered as product copy, and
// the link beside it goes nowhere. Both are gone.
//
// The section keeps everything that is actually true: the methodology exists, it came out of
// building this product, and the way to learn it is to run one real Bet on your own project. So the
// CTA carries the mockup's LABEL ("Explore the methodology") over the page's real DESTINATION —
// starting a Bet — rather than the mockup's `href="#"`. A button that says "explore" and goes
// nowhere is the version of this that cannot ship; the epic that writes the document re-points it.
//
// ── Three steps, not nine ─────────────────────────────────────────────────────────────────────
// The field guide listed all nine named moves of the method (Orient · Shape · Bet · Route · Slice ·
// Bound · Prove · Reconsider · Learn). Nine mono pills at 9.5px is a spec sheet, and a reader
// scanning a kraft card takes nothing from it. Three is the method's actual shape — decide, run,
// close — and it is the same three beats the hero's "Bring an idea. Consider it. Operate it." sets
// up, so the page teaches one vocabulary instead of two.
const steps = ['Consider', 'Operate', 'Exit']

export function MethodologySection() {
  return (
    <section className="band" id="methodology">
      <div className="wrap method-grid">
        <div>
          <p className="eyebrow">The way of working behind the product</p>
          <h2 className="section-title">Learn it by making something real</h2>
          <p className="measure">
            The method came out of building Golden Frijoles, and the way to learn it is to use it: bring your
            own project, install the rails, shape a Bet with your agents, build it, prove it, and find out
            what actually happened.
          </p>
          <p className="takeaway">Your project. Not our demo.</p>

          <div className="button-row">
            <RunYourFirstBet label="Explore the methodology" />
          </div>
        </div>

        <div className="field-guide">
          <p className="eyebrow">Field guide</p>
          <h3>From an idea to one shipped, proven Bet</h3>
          <p>Enough theory to make the next decision, then straight back to your product.</p>
          <ol className="field-guide__steps">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="field-guide__doctrine">Practice earns doctrine. Reality gets the last word.</p>
        </div>
      </div>
    </section>
  )
}
