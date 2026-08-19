import type { Metadata } from 'next'
import { BOOKING_URL, bookingEmbedUrl } from '@/lib/booking'
import { Nav } from '@/components/landing/Nav'
import { Footer } from '@/components/landing/Footer'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Panel } from '@/components/ui/Panel'

export const metadata: Metadata = {
  title: 'Golden Frijoles — book a Pods conversation',
  description:
    'A short call about running a Pod with your team: what you would be measured on, and whether it is worth it.',
}

// landing-maker-ops · Sprint 5 — the Pods booking flow.
//
// ── Why this is a ROUTE and not an embed on the pricing tier ──────────────────────────────────
// The obvious build is Cal.com's own embed script dropped into `PricingSection`, which opens the
// booker in a modal. It was rejected for three reasons, in increasing order of importance:
//
//   1. It puts a third-party <script> on the landing page — the page every visitor loads — to serve
//      a control that a small fraction of them will ever press.
//   2. That script executes in OUR origin. An <iframe> does not: it is a sandboxed document that
//      cannot read this page, its cookies or its DOM. Same booking, strictly less trust extended.
//   3. A modal gives the reader no room to be told what the conversation actually is. The Pods tier
//      is the one thing on the pricing table with no price on it, so the reader arriving here has
//      exactly one question — "what am I agreeing to?" — and a calendar grid does not answer it.
//
// So: our nav, our ground, our framing, and Cal.com asked to render only the part it is good at.
//
// ── The frame is NEVER the only way through ───────────────────────────────────────────────────
// An iframe to a third party has a failure mode a local test will never show you: it renders as a
// blank rectangle. A tracking blocker, a corporate proxy, an offline Cal.com, a future
// `X-Frame-Options` on their side — every one of those produces a page that looks finished and
// books nobody, and the reader cannot tell whether it is broken or still loading.
//
// CODE-QUALITY #8 ("a zero and a broken read are indistinguishable") is normally about numbers; it
// is the same failure. So the direct link is rendered UNCONDITIONALLY, above the frame, as ordinary
// copy rather than as an error state — it costs one line for everyone and it is the whole feature
// for anyone the frame fails. It is not conditional on the frame failing, because nothing in this
// page can detect that: a cross-origin iframe's load event fires for a blocked frame too.
export default function TalkPage() {
  return (
    <>
      <Nav />
      <main>
        <section className="talk">
          <div className="wrap">
            <p className="eyebrow">The vault · Pods</p>
            <h1 className="section-title">Let&apos;s work out whether a Pod is worth it</h1>
            <p className="measure">
              A Pod is your team, running the ways of working this product was built with — and measured
              before and after, because &ldquo;it felt faster&rdquo; is not a Pod Report. This call is the
              part where we find out whether that applies to you.
            </p>

            <div className="talk-grid section-lead">
              <div>
                <Panel className="talk-brief">
                  <p className="kicker">What the call is</p>
                  <ul className="plain-list">
                    <li>Twenty minutes, with Miyagi. Not a demo, and not a sales call.</li>
                    <li>
                      What your team ships now, where the time actually goes, and what you would want to be
                      able to prove afterwards.
                    </li>
                    <li>An honest read on whether a Pod would help — including when it would not.</li>
                  </ul>
                  <p className="note">
                    If it is not a fit we will say so on the call. That is cheaper for both of us than finding
                    out in month two.
                  </p>
                </Panel>

                {/* Unconditional, and deliberately not styled as an error. See the header comment:
                    this page cannot detect a blocked frame, so the escape hatch has to be ordinary
                    copy that is always there rather than a fallback that waits for a signal that
                    never arrives. */}
                <Panel className="talk-direct">
                  <p className="kicker">Or book it directly</p>
                  <p className="card-copy">
                    The calendar below is Cal.com. If it does not load — a blocker, a proxy, a bad connection
                    — this link is the same booking page, opened on its own.
                  </p>
                  <Button href={BOOKING_URL} variant="ghost" className="panel-tail">
                    Open the booking page
                    <Icon name="external" />
                  </Button>
                </Panel>
              </div>

              <div className="talk-embed">
                <p className="surface-note">
                  <strong>Booking runs on Cal.com</strong>
                  <span>
                    A real scheduler, embedded — the times below are Miyagi&apos;s actual availability
                  </span>
                </p>
                {/* `title` is required, not decorative: it is the accessible name of the frame, and
                    an unnamed iframe is announced as "frame" with no indication of what is in it.
                    No `sandbox` attribute — a booking flow needs scripts, forms and same-origin
                    storage to function, so a sandbox tight enough to be worth having would break
                    the thing it is protecting. The isolation that matters (it cannot read this
                    page) is inherent to cross-origin framing and is not something sandbox adds. */}
                <iframe
                  src={bookingEmbedUrl()}
                  title="Book a Pods conversation with Miyagi Sánchez on Cal.com"
                  className="talk-frame"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
