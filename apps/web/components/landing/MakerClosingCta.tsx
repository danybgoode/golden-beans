import { getSiteUrl } from '@/lib/site-url'
import { decisionPrompt } from '@/lib/landing-prompts'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { CopyPromptCard } from './CopyPromptCard'
import { RunYourFirstBet } from './RunYourFirstBet'

// landing-maker-ops · Sprint 2, Story 2.8 — the closing ask.
//
// The mockup's closing is a headline and two buttons. This keeps that, and keeps one thing from the
// page it replaces: the decision prompt.
//
// ── Why the decision prompt survives the repositioning ────────────────────────────────────────
// It is the page's single strongest credibility device, and it is nearly free to keep. The prompt
// hands the reader something to paste into their own agent and explicitly requires that agent to
// argue both sides — including where this product probably would not help. A decision aid that can
// only reach one conclusion is an advert with extra steps, and a page whose entire pitch is
// "evidence over assertion" cannot close by asking for trust. Cutting it because the mockup does
// not draw it would have cost the page the one moment where it acts on its own argument.
//
// `TryItSection`'s handoff prompt did NOT survive (see the epic's D1): it was the second of two
// copy-a-prompt blocks, and two is where a device stops reading as an invitation and starts reading
// as a pattern. `/northstar-self-serve.md` is still reachable — the footer's agent manifest links
// it — so nothing that was usable without an account became unreachable.
export function MakerClosingCta() {
  const prompt = decisionPrompt(getSiteUrl())

  return (
    <section id="start">
      <div className="wrap center-cta">
        <p className="eyebrow">Your next idea does not need a department</p>
        <h2 className="display">
          What do you want
          <br />
          <em className="foil">to make?</em>
        </h2>
        {/* Epic D1 — "you bring the agent", which is the closing ask and also the honest limit of
            what this product is. It ships no model and picks no side. */}
        <p className="measure measure--narrow section-copy--center">
          Bring the idea. Bring your agents — whichever ones you like, now and when better ones arrive.
          Golden Frijoles gives you the rails to turn it into a product you can build, operate, test and grow.
        </p>

        <CopyPromptCard
          label="Not sure? Ask your own agent"
          prompt={prompt}
          className="prompt-card--center"
        />

        <div className="center-cta__actions">
          <RunYourFirstBet />
          {/* `/install`, not `/#connect`: the section that anchor pointed at was cut, and /install is
              where the tokenized connector URL is actually minted — it was the destination all three
              of that section's buttons had anyway. */}
          <Button href="/install" variant="ghost">
            Connect your agent
            <Icon name="arrow-right" />
          </Button>
        </div>

        <p className="note">Magic beans, but with telemetry.</p>
      </div>
    </section>
  )
}
