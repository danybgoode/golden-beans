import { ActivityFeedItem } from '@/components/ui/ActivityFeedItem'
import { AgentWindow } from '@/components/ui/AgentWindow'
import { Badge } from '@/components/ui/Badge'
import { SectionDivider } from '@/components/ui/SectionDivider'
import { SurfaceNote } from './SurfaceNote'

// landing-redesign-v2 · Sprint 2, Story 2.1 — ② Bring an agent to the argument. Not to win it.
//
// Illustrated, and labelled as such (epic D4). The numbers in this window are a shape, not a read:
// there is no customer whose onboarding redesign this is. §6 is where the page shows numbers it
// can be held to.
//
// The confidence values are deliberately mismatched in kind — "HIGH CONFIDENCE" against "10%
// CONFIDENCE" — because that is what the comparison actually looks like when one bet has a direct
// path to the North Star and the other depends on a retention effect nobody has measured yet.
// Rounding both to the same scale would make the illustration tidier and the point weaker.
export function ArgumentSection() {
  return (
    <>
      <SectionDivider number="②" title="Bring an agent to the argument" />
      <section className="band" id="argument">
        <div className="wrap">
          <h2 className="section-title">Not to win it.</h2>
          <p className="measure">
            Your agent can compare the bets against the goal, check what happened before, and work out what
            waiting could cost.
          </p>
          <p className="takeaway">It doesn&apos;t care whose idea it was. Neither does the math.</p>

          <div className="section-lead">
            <SurfaceNote label="Example conversation in your agent" detail="Not a Golden Beans chat screen" />
            <AgentWindow title="your agent · golden beans connected" status="illustration">
              <ActivityFeedItem actor="human">what should we bet on this cycle?</ActivityFeedItem>
              <ActivityFeedItem actor="agent" name="compare_initiatives">
                onboarding_redesign vs. loyalty_program
              </ActivityFeedItem>
              <div className="stack">
                <div className="bet-row">
                  <span>Onboarding redesign — direct North Star lift · ~3 weeks to signal</span>
                  <Badge status="live">HIGH CONFIDENCE</Badge>
                </div>
                <div className="bet-row bet-row--last">
                  <span>Loyalty program — lift depends on retention · ~6 weeks to signal</span>
                  <Badge status="next">10% CONFIDENCE</Badge>
                </div>
              </div>
              <div className="agent-result">
                <b>Your call.</b> Your agent did the homework. You decide whether the evidence is good enough.
              </div>
              <p className="note">
                Much nicer than &ldquo;because Steve really believes in it.&rdquo; Steve is probably lovely.
              </p>
            </AgentWindow>
          </div>
        </div>
      </section>
    </>
  )
}
