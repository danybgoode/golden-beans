import {
  isDestinationDeliveryEnabled,
  isResilienceScenariosEnabled,
  isSecuritySimulationsEnabled,
} from '@/lib/flags'
import { MAKER_OPS_SURFACES, resolveSurfaceStatus, surfaceBadgeLabel } from '@/lib/maker-ops'
import { AgentWindow } from '@/components/ui/AgentWindow'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ChatBubble, ChatThread } from '@/components/ui/ChatThread'
import { ContextCard, ContextOption } from '@/components/ui/ContextCard'
import { Icon } from '@/components/ui/Icon'
import { RunYourFirstBet } from './RunYourFirstBet'
import { SurfaceNote } from './SurfaceNote'

// landing-maker-ops · Sprint 2, Story 2.1 — the repositioned hero.
//
// The headline this replaces was "Your roadmap has enough opinions", which opened on a problem the
// reader has *inside a company*. The buyer this epic is written for may not be in one: agents made
// it possible for one person to hold a product that used to need a department, and what that person
// lacks is not the ability to ship — it is somewhere for the shipping to go.
//
// ── What the mockup asked for and what actually ships ─────────────────────────────────────────
// The mockup draws its own logo as a rotated `<span class="bean">`, its own kraft bag, and its own
// round stamp. Two of those three already exist here as `.baglabel` and `.roundstamp` (they have
// been in the design system since it landed), and the third is `GoldenFrijolMark`, which is the
// canonical mark. So the bag below is the existing packaging device with the mockup's contents in
// it, not a second bag — the substitution table in the epic README has the full list.
//
// ── The FinOps row carries a badge and the other three do not ────────────────────────────────
// The mockup's bag lists four ingredients as though all four were in the packet. Three are; FinOps
// is not built. A bag label is the most literal "here is what you are buying" surface on the page,
// so an unqualified fourth row is the exact failure CODE-QUALITY #9 names — a capability stated as
// live while it does not exist. One badge, on the one row that needs it. Putting a badge on all
// four would empty the badge of meaning, which is the same mistake in the other direction.
//
// ── The window is an ILLUSTRATION and says so ─────────────────────────────────────────────────
// Further down the page §proof renders a REAL agent window over live demo-tenant data in
// deliberately identical chrome. The `SurfaceNote` is the only thing that tells them apart, and
// `e2e/landing.browser.spec.ts` asserts every framed window on this page carries one.
// ── The bag's rows ARE the Ops surfaces, resolved ────────────────────────────────────────────
// This was a hand-written list parallel to `MAKER_OPS_SURFACES`, and the duplication cost three
// separate review findings that were all the same defect: a gated capability listed here without
// its qualification, found once per surface because fixing one list never reached the other
// (SecOps in round 4, DevOps in round 5, after the Ops panel itself in round 3).
//
// A badge on the third one would have been the third patch for one root cause. Deriving the rows
// instead makes the class of bug unrepresentable (CODE-QUALITY #2): a surface cannot be qualified
// in the panel and bare on the bag, because there is only one list and one status resolution.
export function MakerHero() {
  const gates = {
    resilienceScenariosEnabled: isResilienceScenariosEnabled(),
    securitySimulationsEnabled: isSecuritySimulationsEnabled(),
    destinationDeliveryEnabled: isDestinationDeliveryEnabled(),
  }
  const bagRows = MAKER_OPS_SURFACES.map((surface) => ({
    surface,
    resolved: resolveSurfaceStatus(surface, gates),
  }))

  return (
    <section className="hero" id="hero">
      <div className="wrap hero-grid">
        <div>
          <p className="eyebrow">For makers and their agents</p>
          {/* No terminal full stop, and the internal one is doing real work: the line is two beats,
              and the second is the payoff. Headings are titles, not sentences — the D7 rule
              `scripts/check-design-drift.mjs` enforces, which reads only the final character. */}
          <h1 className="display">
            Make more.
            <br />
            <em className="foil">Grow what works</em>
          </h1>
          {/* Rewritten in Sprint 3 after agy and vibe independently flagged the same line. It read
              "Agents turn your ideas into working software faster than you can decide what to build
              next" — a speed claim nobody can check, in a voice the brand does not use, on the one
              sentence a reader definitely reads. Neither model's replacement is used verbatim; what
              they were right about is that the line asserted a benefit instead of naming the
              problem, and the problem is the thing this reader already has. */}
          <p className="hero-sub">
            Your agents can build almost anything you describe. What they cannot do is remember what it was
            for a month later, or tell you whether it worked.
          </p>
          <p className="hero-sub hero-sub--tight">
            Golden Frijoles gives that work somewhere to land: shared product context, operating rails, and
            evidence that outlives the conversation it came from.
          </p>
          <p className="takeaway takeaway--lead">One maker. A whole operation.</p>

          <div className="hero-cta">
            <RunYourFirstBet />
            <Button href="/#methodology" variant="ghost">
              See how the method works
              <Icon name="arrow-right" />
            </Button>
          </div>

          <p className="micro">
            Bring an idea. Shape it. Build it. Operate it. Learn from what actually happened.
          </p>
        </div>

        <div className="hero-magic">
          <div className="baglabel">
            <span className="roundstamp">
              Actual
              <br />
              magic
              <br />
              beans*
            </span>
            <div className="brand">
              <b>Golden Frijoles</b>
              <small>Maker grade</small>
            </div>
            <div className="netwt">
              <span>Grow ideas into products</span>
            </div>
            {bagRows.map(({ surface, resolved }) => (
              <div className="row" key={surface.id}>
                <b>{surface.tab}</b>
                <span>
                  {surface.bagContents}
                  {surfaceBadgeLabel(resolved.status) ? (
                    <Badge status="next" onKraft className="baglabel__badge">
                      {surfaceBadgeLabel(resolved.status)}
                    </Badge>
                  ) : null}
                </span>
              </div>
            ))}
            <p className="motto">
              *No supernatural claims. The agents do most of the suspicious-looking part.
            </p>
          </div>

          <div className="hero-window">
            <SurfaceNote
              label="This happens in your agent"
              detail="Illustration — not a live session, and not anyone's real numbers"
            />
            <AgentWindow
              title="shaping a Bet"
              layout="thread"
              platforms={['Claude', 'ChatGPT', 'your agent']}
            >
              <ChatThread>
                <ChatBubble actor="user">I want onboarding to feel instant. Help me shape it.</ChatBubble>
                <ChatBubble actor="agent">
                  I read your North Star, your activation journey and the last two weeks of signals. The drop
                  is before first value, not at account creation.
                </ChatBubble>
                {/* The Bet renders as a ContextCard, not a bespoke panel: the card is already this
                    page's device for "here is what Golden Frijoles contributed to a conversation
                    between you and your agent", and a Bet is exactly that. */}
                <ContextCard source="Golden Frijoles · your product context" meta="Ready to place">
                  <ContextOption
                    title="Outcome"
                    detail="More new users reach first value in the same session."
                  />
                  <ContextOption title="Appetite" detail="Three days, with agent execution bounded." />
                  <ContextOption
                    title="Evidence"
                    detail="Activation input, plus movement on the journey it belongs to."
                  />
                </ContextCard>
              </ChatThread>
            </AgentWindow>
          </div>
        </div>
      </div>
    </section>
  )
}
