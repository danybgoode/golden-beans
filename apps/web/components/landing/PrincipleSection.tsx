import { getSection } from '@/lib/landing-sections'
import { isConnectorWritesEnabled } from '@/lib/flags'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Panel } from '@/components/ui/Panel'
import { SectionDivider } from '@/components/ui/SectionDivider'
import { SurfaceNote } from './SurfaceNote'

// landing-redesign-v2 · Sprint 2, Story 2.1 — ④ Agnostic about ideas. Conservative about actions.
//
// The section that describes a property the product genuinely has: every write from an agent is
// staged and confirmed before it applies. That shipped with signals-loop, which is why this
// section's registry entry names that epic rather than this one.
//
// ── The enablement sentence is COMPUTED, not written down ─────────────────────────────────────
// Carried over from InvertedLoopSection.tsx, which learned it the hard way: a previous version of
// that section stated a flag's position as a literal, and the sentence was false a few hours later
// when the flag flipped. A landing page asserting its own product is switched off while it serves
// is the failure nobody notices, because the page keeps rendering — it just lies. So the one
// sentence whose truth depends on a gate reads the gate. Both states are honest and neither needs
// editing at launch. (The page is already `force-dynamic`, so this is read fresh per request.)
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
            Your agent can investigate, compare, challenge and propose. Anything that changes the product gets
            staged first.
          </p>
          <p className="takeaway">Then you make the call.</p>

          <div className="section-lead">
            {/* The staged proposal below carries specific numbers (+4–7% lift, 82% confidence)
                in real product chrome. Without the word "illustration" this frame reads as a
                screenshot of a live decision waiting on someone. PR #92 review. */}
            <SurfaceNote
              label="In Golden Frijoles /app · releases"
              detail="Illustration — your agent proposes, you confirm, with your own data"
            />
            <div className="app-shell">
              <div className="app-bar">
                <span>PROPOSED RELEASE · checkout-v2</span>
                <Badge status="next">WAITING ON YOU</Badge>
              </div>
              <div className="app-body">
                <h3>Show Checkout v2 to 10% of eligible customers in Mexico?</h3>
                <p className="app-body__lede">
                  Your agent suggested a small first release. 1 in 10 eligible customers in Mexico would see
                  the new checkout; everyone else stays on the current version while you watch the result.
                </p>
                <div className="row2 app-body__reasons">
                  <Panel>
                    <p className="panel-label">Why this size?</p>
                    <p>Enough traffic to learn without putting the whole market behind an unproven change.</p>
                  </Panel>
                  <Panel>
                    <p className="panel-label">What are we watching?</p>
                    <p>Expected North Star lift: +4–7% · current confidence: 82%.</p>
                  </Panel>
                </div>
                <div className="button-row">
                  <Button href="#connect">Confirm 10% release</Button>
                  <Button href="#connect" variant="ghost">
                    Change audience
                  </Button>
                </div>
                <p className="note section-lead">
                  Because &ldquo;the AI did it&rdquo; isn&apos;t much of an audit trail.
                </p>
              </div>
            </div>
          </div>

          <div className="section-lead measure">
            <h3 className="card-title">Your agent gets leverage. Not a blank cheque</h3>
            <p>Every write stages first. Every credential is scoped. Every action leaves a trail.</p>
            <p className="takeaway">Autonomy is great. Surprise production changes less so.</p>
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
