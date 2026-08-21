import { handoffPrompt } from '@/lib/landing-prompts'
import { getSiteUrl } from '@/lib/site-url'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { CopyPromptCard } from './CopyPromptCard'
import { RunYourFirstBet } from './RunYourFirstBet'

// landing-maker-ops · Sprint 2, Story 2.1 — the repositioned hero, rebuilt by
// agentic-pm-public-surface · Sprint 2, Story 2.1 (epic D3.1 and D5).
//
// The headline opens on a buyer who may not be inside a company: agents made it possible for one
// person to hold a product that used to need a department, and what that person lacks is not the
// ability to ship — it is somewhere for the shipping to go.
//
// ── The right column is now a thing you can use, not a picture of one ────────────────────────
// It used to carry two objects: a kraft bag listing the four Ops surfaces, and an illustrated agent
// window showing a conversation that never happened. Both were arguments made in pictures, on a
// page whose whole claim is evidence over assertion — and the reader had to take both on trust.
//
// A `CopyPromptCard` carrying `handoffPrompt` replaces them. The reader pastes it into their own
// agent, which reads `/llms.txt`, explains us plainly (the prompt explicitly tells it NOT to sell),
// and offers to run the North Star workshop. That is a stronger opening than a stat tile, because
// it does not require being believed: a stranger's own agent goes and checks.
//
// ── Nothing honest was lost with the bag, and that was checked rather than hoped ──────────────
// The bag's rows were DERIVED from `MAKER_OPS_SURFACES` with each gate resolved per request — the
// fix for three separate review findings that were all one defect (a gated capability listed
// without its qualification, found once per surface because fixing one list never reached the
// other). Deleting it removes a second copy of that derivation, not the derivation: §ops resolves
// the same surfaces from the same module, per request, and the long note explaining why it must
// stay derived now lives in `OpsSection.tsx`, which is its only remaining site.
//
// This component therefore reads NO flags. If a future hero needs to make a capability claim, it
// resolves it from `lib/maker-ops.ts` — it does not write one down here.
//
// ── Why the page now carries TWO prompt cards (epic D5) ──────────────────────────────────────
// `landing-readability-pass` D1 cut the old §try on the grounds that two copy-a-prompt blocks read
// as a pattern rather than an invitation. That ruling stands for two blocks asking the SAME thing.
// These ask different things at different moments: the top offers to teach you something, and the
// closing CTA asks your own agent whether to bother with us at all. The page also now has a
// graphic-free hero, which needs a reason to exist.
//
// `handoffPrompt` had been written, documented, specced and CALL-SITE-FREE for two epics — dead
// code that every test in `e2e/landing-prompts.spec.ts` was faithfully exercising. This is its
// first real call site since §try was cut.
export function MakerHero() {
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
            Agents can turn your ideas into reality faster than ever. Golden Frijoles gives you and your agent
            the methodology, operating rails and evidence to keep building.
          </p>
          <p className="hero-sub hero-sub--tight">
            Plant your own Golden Frijoles across product, delivery, security and AI operations and see the
            magic happen.
          </p>
          <p className="takeaway takeaway--lead">One maker. A whole operation.</p>

          <div className="hero-cta">
            <RunYourFirstBet />
            {/* methodology-experience · Story 2.4 — re-pointed from `/#methodology` to the real
                route. The in-page section is a PREVIEW of the method (its contents page and a
                one-paragraph pitch); this button's words promise to show how the method works, and
                only `/methodology` does that. Jumping a reader down the sales page to a card that
                then asks them to click again is the offer being made twice. */}
            <Button href="/methodology" variant="ghost">
              See how the method works
              <Icon name="arrow-right" />
            </Button>
          </div>

          <p className="micro">Bring an idea. Consider it. Operate it. Exit on the Evidence.</p>
        </div>

        {/* The card is the hero's second object, and the only one. `handoffPrompt` takes the site
            URL rather than hardcoding one so a preview deployment hands the reader a prompt that
            points at the preview — which is what makes this testable before it is merged
            (AGENTS.md rule #5, and the reasoning in lib/landing-prompts.ts). */}
        <div className="hero-magic">
          <CopyPromptCard
            label="HANDOFF PROMPT · PASTE INTO YOUR AGENT"
            prompt={handoffPrompt(getSiteUrl())}
          />
        </div>
      </div>
    </section>
  )
}
