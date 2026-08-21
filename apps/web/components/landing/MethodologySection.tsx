import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { METHODOLOGY_PHASES, chaptersInPhase } from '@/lib/methodology-chapters'

// landing-maker-ops · Sprint 2, Story 2.7 — the way of working behind the product.
// methodology-experience · Sprint 1, Stories 1.2 + 1.3 — one word for the second move, and the card
// previews the chapters instead of repeating the phases.
// methodology-experience · Sprint 2, Story 2.4 — the promise finally has a destination.
//
// ── The CTA goes where it says now (landing-maker-ops D5, closed) ──────────────────────────────
// The mockup's version of this section carried a CTA pointing at `href="#"`, under the line "Read
// online / download experience placeholder — to be designed in a focused session". Both were cut,
// and the button carried the mockup's LABEL over the page's real DESTINATION — starting a Bet —
// because a button that says "explore" and goes nowhere is the version that cannot ship. That note
// ended: "the epic that writes the document re-points it."
//
// This is that epic, and this is that re-point. The destination is `/methodology`.
//
// It is a plain `Button` rather than `RunYourFirstBet` because the two asks are genuinely
// different: this one offers to teach you the method, and `Run your first Bet` offers to start one.
// While they shared a destination, sharing a component was what kept the label honest. Now that
// they do not, `RunYourFirstBet`'s `label` prop has no call site and is removed with this change —
// the same reasoning that removed its `variant` prop, and the reason this section does not simply
// pass a different label to it.
//
// ── The chapter list is DERIVED, which was always the plan ─────────────────────────────────────
// Story 1.3 shipped this list as an inline constant, under a comment saying it was temporary and
// that Story 2.4 would replace it with a derive from `lib/methodology-chapters.ts`. That comment is
// gone because the thing it promised has happened: there is ONE list of chapters in this product,
// and both this card and `/methodology` read it. Two lists that must agree is the defect
// `MakerHero`'s bag rows were bitten by three times in one epic; it lived here for exactly one
// sprint, by design, because Sprint 1 was carved to ship standalone.
export function MethodologySection() {
  return (
    <section className="band" id="methodology">
      <div className="wrap method-grid">
        <div>
          <p className="eyebrow">The way of working behind the product</p>
          <h2 className="section-title">Learn it by making something real</h2>
          {/* Epic D1 — high product taste, and the difference between something that demos well
              and something that holds up in production. Both are borrowed phrases; neither needed
              re-pointing, because they are already about the person rather than the org. */}
          <p className="measure">
            Agents make it cheap to build something that demos well. What they do not give you is the taste
            to know whether it should exist, or the evidence that it held up once real people used it. The
            method came out of building Golden Frijoles, and the way to learn it is to use it: bring your own
            project, install the rails, design a Bet with your agents, build it, prove it, and find out what
            actually happened.
          </p>
          <p className="takeaway">Your project. Not our demo.</p>

          <div className="button-row">
            <Button href="/methodology">
              Explore the methodology
              <Icon name="arrow-right" />
            </Button>
          </div>
        </div>

        <div className="field-guide">
          <p className="eyebrow">Field guide</p>
          <h3>From an idea to one shipped, proven Bet</h3>
          <p>Enough theory to make the next decision, then straight back to your product.</p>
          <div className="field-guide__contents">
            {METHODOLOGY_PHASES.map((phase) => (
              <div key={phase.id}>
                <p className="field-guide__phase">{phase.title}</p>
                <ol className="field-guide__chapters">
                  {/* The number comes off the chapter itself. Story 1.3 computed it from the
                      group's position because there was nothing else to read it from; now
                      `chapter.number` is the single place a chapter's position is stated, so this
                      card cannot disagree with the route about which chapter is 04. */}
                  {chaptersInPhase(phase.id).map((chapter) => (
                    <li key={chapter.id}>
                      <span className="field-guide__n">{String(chapter.number).padStart(2, '0')}</span>
                      {chapter.title}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          <p className="field-guide__doctrine">Practice earns doctrine. Reality gets the last word.</p>
        </div>
      </div>
    </section>
  )
}
