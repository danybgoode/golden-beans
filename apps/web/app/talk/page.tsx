import type { Metadata } from 'next'
import { BOOKING_URL, bookingEmbedUrl } from '@/lib/booking'
import { Icon } from '@/components/ui/Icon'
import { Frame, FrameLink } from '@/design-system/Frame'
import { Callout } from '@/design-system/primitives'

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
//   2. That script executes in OUR origin. An <iframe> does not: it is a cross-origin document, and
//      the same-origin policy alone stops it reading this page, its cookies or its DOM. (That is
//      ISOLATION, not sandboxing — there is no `sandbox` attribute here, deliberately; see the note
//      on the element itself.)
//   3. A modal gives the reader no room to be told what the conversation actually is. The Pods tier
//      is the one thing on the pricing table with no price on it, so the reader arriving here has
//      exactly one question — "what am I agreeing to?" — and a calendar grid does not answer it.
//
// ── The frame is NEVER the only way through ───────────────────────────────────────────────────
// An iframe to a third party has a failure mode a local test will never show you: it renders as a
// blank rectangle. A tracking blocker, a corporate proxy, an offline Cal.com, a future
// `X-Frame-Options` on their side — every one of those produces a page that looks finished and
// books nobody, and the reader cannot tell whether it is broken or still loading.
//
// CODE-QUALITY #8 ("a zero and a broken read are indistinguishable") is normally about numbers; it
// is the same failure. So the direct link is rendered UNCONDITIONALLY, as ordinary copy rather than
// as an error state — it costs one line for everyone and it is the whole feature for anyone the
// frame fails. It is not conditional on the frame failing, because nothing in this page can detect
// that: a cross-origin iframe's load event fires for a blocked frame too.
//
// ── design-system-rails · Sprint 6, Story 6.2 — the approved `public-talk` state ───────────────
//
// It moves from the landing's `Nav`/`Footer` to DD3's PUBLIC frame, at the 1080px measure the
// approved state uses. Two corrections were forced by the product's own facts, and both are the
// D10 class — the prototype's data is not the product's:
//
//   · The approved lede says **"Thirty minutes, no deck."** The shipped page, and the Cal.com event
//     it books (`quick-chat`), are **twenty**. The number the product can keep is the one that
//     ships; a mock's round number is not a scheduling change.
//   · The approved aside has three items. A **fourth** is kept — the direct booking link — because
//     it is the escape hatch above, and the header comment explains why it cannot be conditional.
//     Dropping it to match a mock would delete the only path through for every reader whose browser
//     blocks the frame.
//
// `force-dynamic` no longer has a flag to read — `Nav` (and its `isSignupEnabled()` call) is gone
// with the landing chrome — but the page still renders a THIRD-PARTY embed URL and nothing here
// should be frozen into a build. Kept deliberately rather than dropped as now-unused.
export const dynamic = 'force-dynamic'

export default function TalkPage() {
  return (
    <Frame
      variant="public"
      wide
      brandHref="/"
      agentFooter
      actions={
        <>
          <FrameLink href="/install">Try the demo</FrameLink>
          <FrameLink href="/login">Sign in</FrameLink>
        </>
      }
    >
      <h1>Let&apos;s work out whether a Pod is worth it</h1>
      <p className="ds-lede">
        Twenty minutes, no deck. Bring a number you want to move and we will say plainly whether this is the
        thing that moves it.
      </p>

      <div className="ds-talkgrid">
        {/* A third-party embed cannot be made to match the design system, so it is not pretended
            into one: it gets a bordered slot that says "this is somebody else's frame". Styling
            around an iframe until it almost matches is worse than admitting the seam.

            `title` is required, not decorative: it is the accessible name of the frame, and an
            unnamed iframe is announced as "frame" with no indication of what is in it. No `sandbox`
            attribute — a booking flow needs scripts, forms and same-origin storage to function, so a
            sandbox tight enough to be worth having would break the thing it is protecting. The
            isolation that matters (it cannot read this page) is inherent to cross-origin framing and
            is not something sandbox adds. */}
        <div className="ds-talkslot">
          <iframe
            src={bookingEmbedUrl()}
            title="Book a Pods conversation with Miyagi Sánchez on Cal.com"
            loading="lazy"
          />
        </div>

        <div className="ds-talkaside">
          <div className="ds-talkitem">
            <b>What we will actually do</b>
            <span>
              Look at your funnel, pick the one number worth moving first, and name what would have to be true
              for it to move. Not a demo, and not a sales call.
            </span>
          </div>
          <div className="ds-talkitem">
            <b>What you leave with</b>
            <span>
              A written answer either way — including &ldquo;not yet, and here is what to do instead.&rdquo;
              If it is not a fit we will say so on the call; that is cheaper for both of us than finding out
              in month two.
            </span>
          </div>
          {/* Unconditional, and deliberately not styled as an error. See the header comment: this
              page cannot detect a blocked frame, so the escape hatch has to be ordinary copy that is
              always there rather than a fallback waiting for a signal that never arrives. */}
          <div className="ds-talkitem">
            <b>Or book it directly</b>
            <span>
              The calendar is Cal.com. If it does not load — a blocker, a proxy, a bad connection — this is
              the same booking page, opened on its own.
              <FrameLink href={BOOKING_URL} target="_blank" rel="noopener noreferrer">
                Open the booking page
                <Icon name="external" size={13} />
              </FrameLink>
            </span>
          </div>
          <div className="ds-talkitem">
            <b>Would rather just look?</b>
            <span>
              The demo connector is live and needs no call.
              <FrameLink href="/install">Point Claude at it</FrameLink>
            </span>
          </div>
        </div>
      </div>

      <Callout>
        A third-party embed cannot be made to match the design system, so it is not pretended into one — it
        gets a dashed slot that says &ldquo;this is somebody else&apos;s frame&rdquo;. Styling around an
        iframe until it almost matches is worse than admitting the seam.
      </Callout>
    </Frame>
  )
}
