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
// ── Every row that is not fully live carries its own badge, and the badge is RESOLVED ────────
// The mockup's bag lists four ingredients as though all four were in the packet. Only one is
// unqualified: FinOps is not built, and SecOps and DevOps each ride a gate that is closed in
// production today. A bag label is the most literal "here is what you are buying" surface on the
// page, so an unqualified row is the exact failure CODE-QUALITY #9 names.
//
// This comment previously read "one badge, on the one row that needs it" — true of the first draft
// (which badged FinOps only) and FALSE by the time the rows were derived and three of them
// qualified. A comment asserting a property the code does not have is CODE-QUALITY #3, and it is
// the kind a reviewer reads as evidence and spends their scrutiny elsewhere. Caught by Mistral
// Vibe in round 7 of PR #100.
//
// The concern behind the old wording still stands and is still handled: a badge on EVERY row would
// empty the badge of meaning. Product Ops has none, because it needs none — the badge appears only
// where there is something to qualify, and `surfaceBadgeLabel` returns null for a live surface so
// that cannot drift.
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
          {/* Set at the mockup's scale (`.hero .hero-sub` in globals.css), which is a size up from the
              rest of the page's body copy. This is the one paragraph a reader definitely reads. */}
          <p className="hero-sub">
            Agents can turn your ideas into reality faster than ever. Golden Frijoles gives you and your
            agent the methodology, operating rails and evidence to keep building.
          </p>
          <p className="hero-sub hero-sub--tight">
            Plant your own Golden Frijoles across product, delivery, security and AI operations and see the
            magic happen.
          </p>
          <p className="takeaway takeaway--lead">One maker. A whole operation.</p>

          <div className="hero-cta">
            <RunYourFirstBet />
            <Button href="/#methodology" variant="ghost">
              See how the method works
              <Icon name="arrow-right" />
            </Button>
          </div>

          <p className="micro">Bring an idea. Consider it. Operate it. Exit on the Evidence.</p>
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

          {/* ── The note sits UNDER this frame, and only this one ─────────────────────────────
              Everywhere else on the page it labels the frame from above. Here the window is
              positioned across the bag's lower-left corner at wide widths, so anything stacked on
              top of it lands on kraft and becomes unreadable — the caveat is the one element that
              cannot afford to be hard to read. Below the frame it is a caption, which is a normal
              way to caption a picture and keeps DOM order equal to reading order. */}
          <div className="hero-window">
            <AgentWindow layout="thread">
              <ChatThread>
                <ChatBubble actor="user">I want onboarding to feel instant. Help me design it.</ChatBubble>
                <ChatBubble actor="agent">
                  I read your North Star, your activation journey and the last two weeks of signals. The drop
                  is before first value, not at account creation.
                </ChatBubble>
                {/* The Bet renders as a ContextCard, not a bespoke panel: the card is already this
                    page's device for "here is what Golden Frijoles contributed to a conversation
                    between you and your agent", and a Bet is exactly that. */}
                <ContextCard>
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
            <SurfaceNote
              label="This happens in your agent"
              detail="Illustration — not a live session, and not anyone's real numbers"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
