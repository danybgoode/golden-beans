import { getSection } from '@/lib/landing-sections'
import { isConnectorWritesEnabled } from '@/lib/flags'
import { Badge } from '@/components/ui/Badge'
import { SectionDivider } from '@/components/ui/SectionDivider'
import { SurfaceNote } from './SurfaceNote'

// landing-redesign-v2 · Sprint 2, Story 2.1 — ④ Agnostic about ideas. Conservative about actions.
// landing-frijoles-rebrand · Sprint 2, Story 2.5 — the release room.
//
// The section describes a property the product genuinely has: every write from an agent is staged
// and confirmed before it applies. That shipped with signals-loop, which is why this section's
// registry entry names that epic rather than this one.
//
// ── Why the framing moved from approval to a shared plan ──────────────────────────────────────
// The previous version's app bar read "WAITING ON YOU" over a question — "Show Checkout v2 to 10%
// of eligible customers in Mexico?" — with a "Confirm 10% release" button. That is the UI of
// supervising software, and it fights the section's own claim: the argument is not that you police
// your agent, it is that you and it look at the same evidence and decide together. So the plan is
// stated rather than asked, the three cells say what the two of you agreed to watch, and the
// buttons offer running it, tuning it, or not yet.
//
// This is a presentation change, not a promise change. Nothing here weakens the staging guarantee
// — the collaboration strip is where the guarantee becomes legible, because "what would worry us"
// and "if it goes sideways" ARE the guardrails, written in the reader's language.
//
// ── The enablement sentence is COMPUTED, not written down ─────────────────────────────────────
// Carried over from InvertedLoopSection.tsx, which learned it the hard way: a previous version
// stated a flag's position as a literal, and the sentence was false a few hours later when the flag
// flipped. A landing page asserting its own product is switched off while it serves is the failure
// nobody notices, because the page keeps rendering — it just lies. So the one sentence whose truth
// depends on a gate reads the gate. Both states are honest and neither needs editing at launch.
// (The page is already `force-dynamic`, so this is read fresh per request.)
const GUARDRAILS = [
  { label: 'Why 10%?', value: 'Enough signal without betting the whole market.' },
  { label: 'What would worry us?', value: 'Payment failures +0.5% or checkout completion down.' },
  { label: 'If it goes sideways', value: 'Return everyone to the current checkout.' },
]

export function PrincipleSection() {
  const section = getSection('principle')
  const writesLive = isConnectorWritesEnabled()

  return (
    <>
      <SectionDivider number={4} title="A product principle" />
      <section className="band" id="principle">
        <div className="wrap">
          <h2 className="display measure measure--wide">
            Agnostic about ideas.
            <br />
            <em className="foil">Conservative about actions</em>
          </h2>
          <p className="measure">
            You and your agent can investigate, disagree, compare, challenge and propose freely. When an idea
            turns into a real product change, the plan gets explicit: audience, expected result, guardrails,
            rollback, and what you&apos;ll watch together.
          </p>
          <p className="takeaway">Be adventurous in thought. Deliberate in action.</p>

          <div className="section-lead">
            {/* The plan below carries a specific audience and specific thresholds in real product
                chrome. Without the word "illustration" this frame reads as a screenshot of a live
                decision sitting in someone's account. PR #92 review. */}
            <SurfaceNote
              label="In Golden Frijoles /app · release room"
              detail="Illustration — a shared plan before a real change, not anyone's account"
            />
            <div className="app-shell">
              <div className="app-bar">
                <span>Checkout v2 · first release</span>
                <Badge status="live">READY TO TRY TOGETHER</Badge>
              </div>
              <div className="app-body">
                <div className="shared-plan">
                  <div className="shared-plan__head">
                    <div>
                      <p className="panel-label">The plan we shaped</p>
                      <h3 className="shared-plan__title">
                        Try Checkout v2 with 10% of eligible customers in Mexico
                      </h3>
                    </div>
                    <Badge status="next">SMALL FIRST STEP</Badge>
                  </div>
                  <p>
                    Start with 1 in 10 eligible customers in Mexico. The rest stay on today&apos;s checkout
                    while we compare completion, payment failures and revenue per visitor.
                  </p>
                </div>

                <div className="collab-strip">
                  {GUARDRAILS.map((guardrail) => (
                    <div className="collab-cell" key={guardrail.label}>
                      <span>{guardrail.label}</span>
                      <strong>{guardrail.value}</strong>
                    </div>
                  ))}
                </div>

                {/* ── These are PICTURES of controls, and the markup now says so ──────────────
                    They were `<button type="button">` with no handler: focusable, announced to a
                    screen reader as actionable, activating to do precisely nothing. "Inert by
                    construction" was true of the JavaScript and false of the experience — a
                    keyboard user tabs into three buttons on a marketing page and presses them.
                    Caught in cross-family review of PR #95.

                    Rendered as spans instead of `disabled` buttons deliberately. Disabled means
                    "this control exists and you may not use it right now", which is a different and
                    still-untrue claim — there is no rollout here to run. A picture of a decision row
                    is what this is, so it is marked `aria-hidden` and the sentence beneath carries
                    the meaning for anyone not looking at it. */}
                <p className="sr-only">
                  Illustration of the decision row: run the 10% test, tune the plan, or save for later.
                </p>
                <div className="button-row decision-row" aria-hidden="true">
                  <span className="btn btn-gold">Run the 10% test</span>
                  <span className="btn btn-ghost">Tune the plan</span>
                  <span className="btn btn-ghost">Save for later</span>
                </div>
                <p className="note section-lead">
                  Not &ldquo;approve your agent.&rdquo; More &ldquo;we&apos;ve looked at this together;
                  let&apos;s try it carefully.&rdquo;
                </p>
              </div>
            </div>
          </div>

          <div className="section-lead measure">
            <h3 className="card-title">Shared courage. Sensible guardrails</h3>
            <p>
              Golden Frijoles keeps meaningful actions visible and reversible, so working with an agent feels
              less like supervising software and more like having company in the uncertainty.
            </p>
            <p className="takeaway">Try together. Watch together. Learn together.</p>
            <p className="note">
              {writesLive
                ? 'Live today: the staged write tools are switched on, and every one of them still requires your explicit confirmation before it applies.'
                : 'The staged write path is built and deliberately switched off until it is verified end to end — so this page does not claim a live write surface before there is one.'}{' '}
              <Badge status="live">SHIPPED · {section.epic}</Badge>
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
