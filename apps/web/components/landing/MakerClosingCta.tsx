import { INSTALL_PROMPT } from '@/lib/install-prompt'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { CopyPromptCard } from './CopyPromptCard'
import { RunYourFirstBet } from './RunYourFirstBet'

// landing-maker-ops · Sprint 2, Story 2.8 — the closing ask.
//
// The mockup's closing is a headline and two buttons. This keeps that, and keeps one thing from the
// page it replaces: a copy-a-prompt card.
//
// ── golden-frijoles-plugin · Sprint 3, Story 3.3 — the card now hands over the INSTALL prompt ───
// It used to carry `decisionPrompt` (`lib/landing-prompts.ts`) — "should I even use this?", argued
// both ways by the reader's own agent. That prompt is still exported and still pinned by
// `e2e/landing-prompts.spec.ts` (a reader can still ask it, from `/northstar-self-serve.md`'s own
// links), but the closing ask's own card now does what closing asks are for: it hands the reader
// something to run right now. `INSTALL_PROMPT` (`lib/install-prompt.ts`) is the one string every
// install surface carries — `/install`, the signed-in onboarding page, and this card — so a reader
// who is ready does not have to go find a terminal command; it is already in their clipboard.
//
// `TryItSection`'s handoff prompt did NOT survive (see the epic's D1): it was the second of two
// copy-a-prompt blocks, and two is where a device stops reading as an invitation and starts reading
// as a pattern. The hero's `handoffPrompt` is unchanged — this file only ever touched the closing
// card.
export function MakerClosingCta() {
  const prompt = INSTALL_PROMPT

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
          Bring the idea. Bring your agents — whichever ones you like, now and when better ones arrive. Golden
          Frijoles gives you the rails to turn it into a product you can build, operate, test and grow.
        </p>

        <CopyPromptCard label="Paste this into your agent" prompt={prompt} className="prompt-card--center" />

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
