import { AgentWindow } from '@/components/ui/AgentWindow'
import { ChatBubble, ChatThread } from '@/components/ui/ChatThread'
import { ContextCard } from '@/components/ui/ContextCard'
import { SectionDivider } from '@/components/ui/SectionDivider'
import { SurfaceNote } from './SurfaceNote'

// landing-redesign-v2 · Sprint 2, Story 2.1 — ② Bring an agent to the argument. Not to win it.
// landing-frijoles-rebrand · Sprint 2, Story 2.1 — the exchange, not the comparison table.
//
// Illustrated, and labelled as such (landing-redesign-v2 D4). The numbers here are a shape, not a
// read: there is no customer whose onboarding redesign this is. §6 is where the page shows numbers
// it can be held to.
//
// ── What changed, and why it is the better argument ───────────────────────────────────────────
// The previous version showed a `compare_initiatives` call returning two ranked options with
// confidence badges. It made the section's own headline false: "not to win it" over a window whose
// entire content is a machine declaring a winner. The thread below argues the section's actual
// claim — the agent brings a finding, then asks the reader how much the problem is worth, and the
// bet comes back SMALLER than the one the reader proposed. Nobody wins the argument; the scope does
// the moving. That is also the real shape of the appetite conversation this product runs
// (`Roadmap/WAYS-OF-WORKING.md` → Betting & appetite), so the illustration is at least illustrating
// something true.
export function ArgumentSection() {
  return (
    <>
      <SectionDivider number={2} title="Bring an agent to the argument" />
      <section className="band" id="argument">
        <div className="wrap">
          <h2 className="section-title">Not to win it</h2>
          <p className="measure">
            Your agent can compare the bets against the goal, check what happened before, and work out what
            waiting could cost.
          </p>
          <p className="takeaway">It doesn&apos;t care whose idea it was. Neither does the math.</p>

          <div className="section-lead">
            <SurfaceNote
              label="Example · shaping in your agent"
              detail="Illustration — not a Golden Frijoles chat screen, and not anyone's real numbers"
            />
            <AgentWindow title="shape a bet" status="illustration" layout="thread">
              <ChatThread>
                <ChatBubble actor="user">I think we should redesign onboarding.</ChatBubble>
                <ContextCard source="Golden Frijoles found something" meta="59% miss first value">
                  <div>
                    <strong>Most of the drop happens at two choices we already control.</strong>
                    <small>We may not need a redesign to learn whether removing them helps.</small>
                  </div>
                </ContextCard>
                <ChatBubble actor="agent">
                  I&apos;d start smaller. How much is this problem worth to us: a focused intervention, a
                  meaningful cycle, or a larger journey rethink?
                </ChatBubble>
                <ChatBubble actor="user">A meaningful cycle.</ChatBubble>
                <ChatBubble actor="agent">
                  <strong>Medium appetite.</strong> Good. Let&apos;s shape the smallest bet that can move
                  activation without accidentally inventing Onboarding 3.0.
                </ChatBubble>
              </ChatThread>
              <p className="note chat-thread__foot">
                Much nicer than &ldquo;because Steve really believes in it.&rdquo; Steve is probably lovely.
              </p>
            </AgentWindow>
          </div>
        </div>
      </section>
    </>
  )
}
