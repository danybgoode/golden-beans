import { AgentWindow } from '@/components/ui/AgentWindow'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ChatBubble, ChatThread } from '@/components/ui/ChatThread'
import { ContextCard, ContextOption } from '@/components/ui/ContextCard'
import { Icon } from '@/components/ui/Icon'
import { SurfaceNote } from './SurfaceNote'

// landing-redesign-v2 · Sprint 2, Story 2.1 — the repositioned hero.
// landing-frijoles-rebrand · Sprint 2, Story 2.1 — the window becomes a conversation.
//
// The headline this replaces was "The growth engine your agent operates." It was an accurate
// description of what was built and a poor description of who buys it: it opened on the primitive
// set, for a reader who has not yet been told what primitives are FOR. The hero opens on the
// problem the reader already has — a roadmap with more opinions than evidence — and lets the
// engine be the reason receipts are possible rather than the thing being sold.
//
// ── Why the window is now a chat and not a tool-call log ──────────────────────────────────────
// The previous version rendered `you ▸ …` / `⚙ golden frijoles → …` lines through
// `ActivityFeedItem`. That is an accurate picture of what happens and a poor picture of what it
// FEELS like: the reader's whole experience of this product is a conversation inside a tool they
// already have open, and a log reads as a developer surface. The thread also gives the one genuinely
// new idea its own object — the context card is a third party's contribution to a conversation
// between two, which is exactly the pitch.
//
// ── The hero window is an ILLUSTRATION and says so ────────────────────────────────────────────
// It shows a conversation shape, not a live read. Further down the page §6 renders a REAL agent
// window over live demo-tenant data, and a reader who cannot tell those two apart learns nothing
// from either — the honest one gets no credit and the illustration gets undeserved weight. Hence
// the surface note above the frame (landing-redesign-v2 D4); it is the same reason
// `references/design-direction.md` insists the frame device never fakes a product screenshot.
export function Hero() {
  return (
    <section className="hero">
      <div className="wrap hero-grid">
        {/* No class: `.hero-copy` used to live here and is NOT a container style — it was the old
            hero's paragraph rule (`max-width: 52ch`), and putting it on the column capped the
            headline at 476px inside a 596px track, breaking "Your roadmap has" across two lines.
            The sub-paragraphs carry `.hero-sub` instead. */}
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
          <p className="hero-sub hero-sub--tight">
            Ask what to bet on. Shape the case together. See what happens.
          </p>
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
          {/* The word "illustration" is not optional here. This note once carried the mockup's
              wording ("In ChatGPT, Claude, or your agent · Golden Frijoles supplies the product
              context"), which describes where the conversation happens but never says it is
              invented — while the window shows specific lift and confidence figures. The footer's
              ledger already claimed the hero was labelled as an illustration, so the page was
              asserting a label it did not have. Caught in cross-family review of PR #92. */}
          <SurfaceNote
            label="This happens in your agent"
            detail="Illustration — not a live session, and not anyone's real numbers"
          />
          {/* No status chip: the platform pills take its place. The chip used to read "via MCP",
              which is the one place on this frame a reader would look to decide whether it is live
              — and it said yes, over an invented conversation. */}
          <AgentWindow
            title="product conversation"
            layout="thread"
            platforms={['ChatGPT', 'Claude', 'your agent']}
          >
            <ChatThread>
              <ChatBubble actor="user">What should we bet on this cycle?</ChatBubble>
              {/* NOT "live product context". The frame above this says "not a live session", and a
                  card inside it calling itself live is the same mixed signal the hero's old "via
                  MCP" chip sent — the one landing-redesign-v2's review had to remove. What the card
                  is illustrating is that the product context is THERE; "live" is a claim about this
                  particular conversation, which is invented. PR #95 review. */}
              <ContextCard source="Golden Frijoles · your product context" meta="North Star: activation">
                <ContextOption
                  title="Onboarding redesign"
                  detail="+8–12% expected lift · high confidence · ~3 weeks"
                  verdict={<Badge status="live">STRONGER</Badge>}
                />
                {/* The weaker option deliberately gets a plain tag rather than a Badge: `Badge`
                    speaks only in live/next/blocked, and borrowing "next" to mean "worse bet" would
                    put a lifecycle vocabulary on a comparison. */}
                <ContextOption
                  title="Loyalty program"
                  detail="Retention-dependent · low confidence · ~6 weeks"
                  verdict={<span className="tag">WEAKER</span>}
                />
              </ContextCard>
              <ChatBubble actor="agent">
                Onboarding looks like the better bet. Before we call it a redesign, I think we can test the
                two biggest drop-offs with a much smaller appetite. Want to shape that together?
              </ChatBubble>
            </ChatThread>
          </AgentWindow>
        </div>
      </div>
    </section>
  )
}
