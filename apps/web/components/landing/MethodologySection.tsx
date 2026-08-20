import { RunYourFirstBet } from './RunYourFirstBet'

// landing-maker-ops · Sprint 2, Story 2.7 — the way of working behind the product.
// methodology-experience · Sprint 1, Stories 1.2 + 1.3 — one word for the second move, and the card
// previews the chapters instead of repeating the phases.
//
// ── What was cut, and why (landing-maker-ops D5) ──────────────────────────────────────────────
// The mockup's version of this section carries a CTA pointing at `href="#"` and, underneath it, the
// line *"Read online / download experience placeholder — to be designed in a focused session."*
// That sentence is a note from one designer to another that ended up rendered as product copy, and
// the link beside it goes nowhere. Both are gone.
//
// The section keeps everything that is actually true: the methodology exists, it came out of
// building this product, and the way to learn it is to run one real Bet on your own project. So the
// CTA carries the mockup's LABEL ("Explore the methodology") over the page's real DESTINATION —
// starting a Bet — rather than the mockup's `href="#"`. That note used to end "the epic that writes
// the document re-points it"; this is that epic, and Story 2.4 is where the re-point happens. It
// has NOT happened yet: `/methodology` does not exist on this branch, and shipping a link to a
// route that 404s would be a worse version of the placeholder this section already refused once.
//
// ── The card previews the six chapters, not the three phases (epic D4) ────────────────────────
// This list was `['Consider', 'Operate', 'Exit']`, under a comment titled "Three steps, not nine"
// arguing that the field guide's nine named moves were a spec sheet and three was the method's real
// shape. Story 1.1 has since made §loop itself Consider / Operate / Exit — so the page rendered the
// same three words twice, once as the loop and once as the field guide's contents, and a reader
// scrolling from one to the other learned nothing new.
//
// Three is still the method's shape; it is just no longer THIS section's job to say so. What a
// contents page owes a reader is what is actually inside, so the card lists the six real chapters.
// The phase names return as group labels rather than as the argument — an index says which part of
// the loop a chapter belongs to, which is a different act from teaching the loop.
//
// ── This list is TEMPORARY and Story 2.1 replaces it ──────────────────────────────────────────
// Two lists that must agree is the defect `MakerHero`'s bag rows were bitten by three times in one
// epic, and it is the reason `lib/landing-sections.ts` exists. Here it lives for exactly one sprint
// by design: `lib/methodology-chapters.ts` is Sprint 2's shared surface and does not exist yet, and
// Sprint 1 is carved to ship standalone if the appetite runs out. Story 2.4 replaces this constant
// with a derive from that module and deletes this note with it. If you are reading this and
// `lib/methodology-chapters.ts` exists, that replacement did not happen — do it now.
const FIELD_GUIDE_PHASES = [
  { phase: 'Consider', chapters: ['Bring an idea', 'Design it', 'Place the Bet'] },
  { phase: 'Operate', chapters: ['Build it', 'Prove it'] },
  { phase: 'Exit', chapters: ['Decide what happens next'] },
]

export function MethodologySection() {
  return (
    <section className="band" id="methodology">
      <div className="wrap method-grid">
        <div>
          <p className="eyebrow">The way of working behind the product</p>
          <h2 className="section-title">Learn it by making something real</h2>
          <p className="measure">
            The method came out of building Golden Frijoles, and the way to learn it is to use it: bring your
            own project, install the rails, design a Bet with your agents, build it, prove it, and find out
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
          <div className="field-guide__contents">
            {FIELD_GUIDE_PHASES.map((group, groupIndex) => {
              // The chapter number is COMPUTED from the group's position, never written down beside
              // the title. A hand-numbered list is two things that must agree, in the one component
              // whose comment above is about exactly that — and the numbers are what a reader uses
              // to find their place, so a wrong one is worse than none.
              const offset = FIELD_GUIDE_PHASES.slice(0, groupIndex).reduce(
                (total, previous) => total + previous.chapters.length,
                0
              )

              return (
                <div key={group.phase}>
                  <p className="field-guide__phase">{group.phase}</p>
                  <ol className="field-guide__chapters">
                    {group.chapters.map((title, index) => (
                      <li key={title}>
                        <span className="field-guide__n">{String(offset + index + 1).padStart(2, '0')}</span>
                        {title}
                      </li>
                    ))}
                  </ol>
                </div>
              )
            })}
          </div>
          <p className="field-guide__doctrine">Practice earns doctrine. Reality gets the last word.</p>
        </div>
      </div>
    </section>
  )
}
