import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'

// landing-frijoles-rebrand · Sprint 2, Story 2.2 (epic D6) — the shameless infomercial.
//
// ── Why a joke section is a serious decision ──────────────────────────────────────────────────
// Every other section on this page is arguing that claims should be checkable, and the page is
// therefore full of caveats, honest badges and "this is an illustration" notes. That much
// scrupulousness reads as either trustworthy or defensive, and which one it reads as depends
// entirely on whether the page sounds like it has a person behind it. This band is where the voice
// gets to be unmistakable, so the nine careful sections around it read as a choice rather than as a
// legal department.
//
// ── The one rule it does not get to break ─────────────────────────────────────────────────────
// EVERY invented thing here is labelled as invented, inline, at the point of the claim — not in the
// footer, not in small print at the bottom of the page. The asterisk resolves under the headline,
// the testimonials carry "we wrote these" beside them rather than below them, and the struck-through
// consultant price sits next to the real one. A parody section that a skimming reader could mistake
// for a claim would cost this page exactly the thing the other nine sections are trying to build,
// and it would cost it faster than they build it.
//
// The `<s>` is a real strikethrough element rather than the mockup's literal `~~$999~~`: the tildes
// are markdown that nothing on this page renders, and would have shipped as four visible tildes.
const CLAIMS = [
  {
    kicker: "But wait, there's less",
    headline: 'Fewer status checks',
    copy: 'Your agent can follow the bet, build and release without asking engineering to narrate the entire software-development lifecycle.',
  },
  {
    kicker: 'Amazing technology',
    headline: 'Ideas now come with trade-offs',
    copy: 'Shape the problem, set an appetite, write down the no-gos. Watch a “quick idea” become suspiciously specific before anyone builds it.',
  },
  {
    kicker: 'New! Human companionship',
    headline: 'Flunk together',
    copy: 'Not every bet wins. Keep the evidence, keep the learning, and have another go without reconstructing six months of context from Slack.',
  },
]

const TESTIMONIALS = [
  { quote: '“My PM hasn’t asked if I’m done yet.”', attribution: '— Dev, visibly confused' },
  { quote: '“We cancelled the meeting before the meeting.”', attribution: '— PM, now free at 3:30' },
  {
    quote: '“Apparently ‘because I said so’ has a confidence score now.”',
    attribution: '— Executive, still doing fine',
  },
]

export function InfomercialSection() {
  return (
    <section className="infomercial" id="infomercial">
      <div className="wrap">
        <div className="infomercial__lede">
          <p className="infomercial__eyebrow">Shameless infomercial</p>
          <h2 className="infomercial__headline">
            Fix your org
            <br />
            in three easy steps!*
          </h2>
          <p className="infomercial__pitch">
            Tired of opinions? Meetings? Finding out the “small tweak” has its own migration plan? Try{' '}
            <b>
              Golden Frijoles<sup>TM</sup>
            </b>
            , the revolutionary product-management companion system that lets you and your agent experience
            context at the same time.
          </p>
          <p className="infomercial__footnote">
            *Golden Frijoles cannot fix your org. Frankly, that sounded expensive.
          </p>
        </div>

        <div className="cards3 section-lead">
          {CLAIMS.map((claim, index) => (
            // The rotation is a class per position rather than an inline transform: the landing
            // forbids inline styles (landing-redesign-v2 D3) and three fixed angles are a design
            // decision, not a computed geometry.
            <div className={`infomercial__card infomercial__card--${index + 1}`} key={claim.headline}>
              <p className="infomercial__card-kicker">{claim.kicker}</p>
              <p className="infomercial__card-headline">{claim.headline}</p>
              <p>{claim.copy}</p>
            </div>
          ))}
        </div>

        <div className="infomercial__testimonials">
          <div className="infomercial__testimonials-head">
            <div>
              <p className="infomercial__card-kicker">Totally real testimonials†</p>
              <h3 className="infomercial__testimonials-title">People are already saying things</h3>
            </div>
            <p className="infomercial__footnote">†They are not. We wrote these.</p>
          </div>
          <div className="cards3 section-lead">
            {TESTIMONIALS.map((testimonial) => (
              <blockquote className="infomercial__quote" key={testimonial.attribution}>
                <b>{testimonial.quote}</b>
                <cite>{testimonial.attribution}</cite>
              </blockquote>
            ))}
          </div>
        </div>

        <div className="infomercial__close">
          <p className="infomercial__price">
            <s>$999 / consultant / day</s> <span>Starts at $0</span>
          </p>
          <p className="infomercial__spots">Only 7,483 unlimited spots left!</p>
          <Button href="#try" className="btn-stamp">
            Yes, I want product companionship
            <Icon name="arrow-right" />
          </Button>
          <p className="infomercial__footnote">
            Act now and receive exactly the same product for exactly the same price later.
          </p>
        </div>
      </div>
    </section>
  )
}
