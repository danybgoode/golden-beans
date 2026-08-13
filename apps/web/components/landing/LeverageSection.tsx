import { Icon, type IconName } from '@/components/ui/Icon'
import { SectionDivider } from '@/components/ui/SectionDivider'

// landing-redesign-v2 · Sprint 2, Story 2.1 — ⑤ Less coordination. More product management.
// landing-frijoles-rebrand · Sprint 2, Story 2.4 — the two paths, side by side.
//
// The claim in this section is quantitative — fewer stops between a question and a decision — and
// the previous version rendered it as two stacked panels, which is the one layout that makes a
// count impossible to see. Side by side, the reader counts it themselves in about a second, which
// is the entire argument.
//
// ── The stop counts are DERIVED ──────────────────────────────────────────────────────────────
// "7 STOPS" and "3 STOPS" come from the arrays below, not from two strings written next to them.
// Two things that must agree get one implementation (CODE-QUALITY.md #2) — otherwise the first
// person to add a step to the left column ships a badge that quietly lies about the number of items
// directly beneath it.
type Stop = { icon: IconName; label: string; detail?: string }

const TODAY: Stop[] = [
  { icon: 'help', label: 'Question', detail: 'Should we change onboarding?' },
  { icon: 'trend-up', label: 'Find the dashboard' },
  { icon: 'database', label: 'Ask analytics what the dashboard means' },
  { icon: 'code', label: 'Ask engineering what actually shipped' },
  { icon: 'flask', label: 'Reconstruct the experiment' },
  { icon: 'group', label: 'Meeting before the meeting' },
  { icon: 'check-circle', label: 'Finally: form a view' },
]

const WITH_FRIJOLES: Stop[] = [
  { icon: 'help', label: 'Question', detail: 'Should we change onboarding?' },
  {
    icon: 'group',
    label: 'Look together',
    detail: 'Your agent already has the product context, goal and history.',
  },
  {
    icon: 'check-circle',
    label: 'Shape the next move',
    detail: 'Smaller test, clear appetite, evidence attached.',
  },
]

function JourneyPath({ stops }: { stops: Stop[] }) {
  return (
    <div className="journey-path">
      {stops.map((stop, index) => (
        // Index is part of the key because a path may legitimately repeat a label, and the
        // sequence is static — there is no reorder for a positional key to go wrong against.
        <div key={`${stop.label}-${index}`}>
          {index > 0 && <span className="journey-arrow" aria-hidden="true" />}
          <div className="journey-node">
            <span className="journey-node__icon" aria-hidden="true">
              <Icon name={stop.icon} size={13} />
            </span>
            <span>
              <b>{stop.label}</b>
              {stop.detail && <small>{stop.detail}</small>}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

export function LeverageSection() {
  return (
    <>
      <SectionDivider number={5} title="Less coordination. More product management" />
      <section id="leverage">
        <div className="wrap">
          <h2 className="section-title">The question shouldn&apos;t take longer than the answer</h2>
          <p className="measure">
            Golden Frijoles doesn&apos;t remove the people around product work. It removes the scavenger hunt
            between a question, a shared read, and the next sensible move.
          </p>
          <p className="takeaway">Same product. Much less carrying it around by yourself.</p>

          <div className="section-lead">
            <p className="mobile-hint">Side by side on purpose · swipe to compare</p>
            {/* `.scroll-x` is the rail globals.css already provides — max-width, overflow-x: auto
                and overscroll-behavior-x: contain. The comparison is legitimately wider than a
                phone; the PAGE never is, which is what mobile-heuristics.browser.spec.ts measures.
                Reusing the rail rather than writing a second scroller keeps the two in step. */}
            <div className="journey-scroll scroll-x">
              <div className="journey-compare">
                <div className="journey-col">
                  <div className="journey-head">
                    <p className="panel-label">Today · the context treasure hunt</p>
                    <span className="tag">{TODAY.length} STOPS</span>
                  </div>
                  <JourneyPath stops={TODAY} />
                  <p className="note section-lead">We considered adding another meeting here for realism.</p>
                </div>

                <div className="journey-col journey-col--after">
                  <div className="journey-head">
                    <p className="panel-label">With Golden Frijoles · shared context</p>
                    <span className="tag tag-live">{WITH_FRIJOLES.length} STOPS</span>
                  </div>
                  <JourneyPath stops={WITH_FRIJOLES} />
                  <div className="shared-plan section-lead">
                    <p className="panel-label">Result</p>
                    <p className="shared-plan__result">
                      You arrive at the conversation already accompanied by the context — not carrying a
                      folder of screenshots like evidence at trial.
                    </p>
                  </div>
                  <p className="note section-lead">Your calendar may experience side effects.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
