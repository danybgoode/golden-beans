import { getSection } from '@/lib/landing-sections'
import { isSignalsEnabled, isConnectorWritesEnabled } from '@/lib/flags'
import { ActivityFeedItem } from '@/components/ui/ActivityFeedItem'
import { AgentWindow } from '@/components/ui/AgentWindow'
import { Badge } from '@/components/ui/Badge'
import { Panel } from '@/components/ui/Panel'

// Section 4 — The inverted loop. signals-loop · Sprint 3, Story 3.3 (part A).
//
// This is intentionally a product-shape section, not a dashboard disguised as one. There is no task
// count here to misread as either an empty queue or a broken read — a zero and a broken read are
// indistinguishable, and this repo has a LEARNINGS entry from shipping exactly that.
//
// ── The enablement sentence is COMPUTED, not written down ─────────────────────────────────────
// The first version of this section stated "signals and connector writes remain deliberately gated
// off" as a literal. That was true when it was written and false a few hours later, because Story
// 3.4 flips both gates in this same sprint — leaving the landing page asserting that its own
// product is switched off while it serves. A stale claim about our own state is worse than the
// vaguer sentence it replaced: it is checkable, and wrong.
//
// So the sentence reads the same flags the engine reads. Both states are honest, neither needs
// editing at launch, and the failure mode this removes is the one nobody notices — the page keeps
// rendering, it just lies. (The flags are read fresh per request; the page is already dynamic
// because sibling sections read live data.)
export function InvertedLoopSection() {
  const section = getSection('inverted-loop')
  const signalsLive = isSignalsEnabled()
  const writesLive = isConnectorWritesEnabled()

  return (
    <section className="band section-compact" id="inverted-loop">
      <div className="wrap">
        <p className="kicker">The inverted loop</p>
        <h2>
          The loop ends in <em className="gold-em">your</em> agent.
        </h2>
        <p className="section-copy">
          A signal becomes a structured task with product context. Your agent pulls it over MCP, fixes it in
          your workflow, then resolves it with an evidence pointer — a commit, pull request, or note you can
          inspect.
        </p>

        <AgentWindow
          className="loop-window"
          title="golden-beans — the task stays in your workflow"
          status="evidenced"
        >
          <ActivityFeedItem actor="agent" icon="arrow-right">
            1. signal → grouped into a structured task with product context
          </ActivityFeedItem>
          <ActivityFeedItem actor="agent" icon="arrow-right">
            2. your agent → pulls the ranked task over MCP
          </ActivityFeedItem>
          <ActivityFeedItem actor="agent" icon="arrow-right">
            3. your workflow → fix, then resolve with an evidence pointer
          </ActivityFeedItem>
          <p className="note">
            Grouping, impact ranking, and the evidence bundle are computed deterministically. No model writes
            any field of a task.
          </p>
        </AgentWindow>

        <div className="row2 comparison-grid">
          <Panel>
            <p className="kicker">Golden Beans</p>
            <h3>Your agent owns the last mile.</h3>
            <p>
              {signalsLive && writesLive
                ? 'Running today: signals are captured and grouped, the read tools serve a ranked queue, and the staged write tools let your agent claim and resolve — each write confirmed before it applies.'
                : signalsLive
                  ? 'Running today: signals are captured and grouped, and your agent can pull a ranked queue over MCP. The staged write tools stay switched off until the whole loop is verified end to end.'
                  : 'The loop is built and deliberately switched off until it is verified end to end — so this page does not claim a live task queue before there is one.'}
            </p>
          </Panel>
          <Panel className="panel--next">
            <p className="kicker">PostHog Desktop</p>
            <h3>Announced, not shipped.</h3>
            <p>
              PostHog Desktop is announced for Summer 2026, not a released product today. Its proposed
              integrated-AI loop is therefore not presented here as a live like-for-like comparison.
            </p>
          </Panel>
        </div>

        <p className="section-status">
          <Badge status="live">LIVE · {section.epic}</Badge>
        </p>
      </div>
    </section>
  )
}
