import { AgentWindow } from '@/components/ui/AgentWindow'
import { ActivityFeedItem } from '@/components/ui/ActivityFeedItem'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { SurfaceNote } from './SurfaceNote'

// landing-redesign-v2 · Sprint 2, Story 2.1 — the repositioned hero.
//
// The headline this replaces was "The growth engine your agent operates." It was an accurate
// description of what was built and a poor description of who buys it: it opened on the primitive
// set, for a reader who has not yet been told what primitives are FOR. The v2 hero opens on the
// problem the reader already has — a roadmap with more opinions than evidence — and lets the
// engine be the reason receipts are possible rather than the thing being sold.
//
// ── The hero window is an ILLUSTRATION and says so ────────────────────────────────────────────
// It shows a conversation shape, not a live read. Further down the page §6 renders a REAL agent
// window over live demo-tenant data, and a reader who cannot tell those two apart learns nothing
// from either — the honest one gets no credit and the illustration gets undeserved weight. Hence
// the surface note above the frame (epic D4); it is the same reason `references/design-direction
// .md` insists the frame device never fakes a product screenshot.
export function Hero() {
  return (
    <section className="hero">
      <div className="wrap hero-grid">
        {/* No class: `.hero-copy` used to live here and is NOT a container style — it was the old
            hero's paragraph rule (`max-width: 52ch`), and putting it on the column capped the
            headline at 476px inside a 596px track, breaking "Your roadmap has" across two lines.
            The v2 sub-paragraphs carry `.hero-sub` instead. */}
        <div>
          <p className="eyebrow">Product management, minus some of the politics</p>
          <h1 className="display">
            Your roadmap has
            <br />
            <em className="foil">enough opinions</em>
          </h1>
          <p className="hero-sub">
            Give your agent the goals your company agreed on and the context behind them.
          </p>
          <p className="hero-sub hero-sub--tight">Ask what to bet on. See the evidence. Make the call.</p>
          <p className="takeaway takeaway--lead">Now your decisions have receipts.</p>

          <div className="hero-cta">
            <Button href="#connect">
              Connect your agent
              <Icon name="arrow-right" />
            </Button>
            <Button href="#try" variant="ghost">
              Try it in your agent
              <Icon name="arrow-right" />
            </Button>
          </div>

          <p className="micro">
            Works with Claude and ChatGPT. Bring whichever agent you already argue with.
          </p>
        </div>

        <div>
          {/* "Example" is not optional here. This note carried the mockup's wording ("In ChatGPT,
              Claude, or your agent · Golden Frijoles supplies the product context"), which describes
              where the conversation happens but never says it is invented — while the window shows
              specific lift and confidence figures and its chip reads "via MCP". The footer's
              ledger already claimed the hero was labelled as an illustration, so the page was
              asserting a label it did not have. Caught in cross-family review of PR #92. */}
          <SurfaceNote
            label="Example conversation in your agent"
            detail="Illustration — not a live session, and not anyone's real numbers"
          />
          {/* `status="illustration"`, matching §2. The chip read "via MCP", which is the one place
              on this frame a reader would look to decide whether it is live — and it said yes. */}
          <AgentWindow title="your agent · golden frijoles connected" status="illustration">
            <ActivityFeedItem actor="human">what should we bet on this cycle?</ActivityFeedItem>
            <ActivityFeedItem actor="agent" name="golden frijoles">
              comparing against your North Star…
            </ActivityFeedItem>
            <div className="stack">
              <div>
                <b>Onboarding redesign</b>
                <br />
                <span className="hero-window__meta">
                  Expected lift: +8–12% activation · confidence: high · ~3 weeks to signal
                </span>
              </div>
              <div>
                <b>Loyalty program</b>
                <br />
                <span className="hero-window__meta">
                  Expected lift: retention-dependent · confidence: low · ~6 weeks to signal
                </span>
              </div>
            </div>
            <div className="agent-result">
              Your call. I brought the case.
              <span className="cursor" />
            </div>
          </AgentWindow>
        </div>
      </div>
    </section>
  )
}
