import { getSiteUrl } from '@/lib/site-url'
import { decisionPrompt } from '@/lib/landing-prompts'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { CopyPromptCard } from './CopyPromptCard'

// landing-redesign-v2 · Sprint 2, Story 2.2 — the closing CTA.
//
// The one move on this page I would defend hardest: the final ask is not "sign up", it is "ask
// your own agent whether this is worth it, and tell it to argue both sides." The prompt explicitly
// requires the agent to answer "where it probably would not help."
//
// A decision aid that can only reach one conclusion is an advert with extra steps, and the reader
// who notices that has learned the wrong thing about a product whose entire pitch is evidence over
// assertion. Handing them a prompt that can talk them out of it is the only version of this
// section consistent with the nine sections above it.
export function ClosingCta() {
  const prompt = decisionPrompt(getSiteUrl())

  return (
    <section id="decide">
      <div className="wrap center-cta">
        <p className="panel-label">Still deciding?</p>
        <h2 className="display">Fair.</h2>
        <p className="measure measure--narrow section-copy--center">
          Ask your agent whether Golden Beans is likely to move your North Star.
        </p>
        <p className="takeaway">At least one of us should practice what we preach.</p>

        <CopyPromptCard label="Paste this into your agent" prompt={prompt} className="prompt-card--center" />

        <div className="center-cta__actions">
          <Button href="#try">
            Try the prompt first
            <Icon name="arrow-right" />
          </Button>
          <Button href="#connect" variant="ghost">
            Connect your agent
          </Button>
        </div>

        <p className="note">
          Free to try. No credit card. No sales call mysteriously disguised as a &ldquo;quick chat&rdquo;.
        </p>
      </div>
    </section>
  )
}
