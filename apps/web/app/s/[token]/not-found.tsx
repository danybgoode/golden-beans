import { Frame, FrameLink } from '@/design-system/Frame'

// design-system-rails · Sprint 6, Story 6.2 — the approved `public-gone` state.
//
// ── ONE page for unknown, malformed, expired AND revoked (finding F2) ──────────────────────────
//
// `page.tsx` calls `notFound()` for all four, deliberately, so the page cannot tell an attacker
// which one a token is. That is the whole design: **there is no expired state, and adding one to
// satisfy a doc would be implementing a security regression.** `sprint-6.md` asked for "the expired
// state" as a designed page until reading the route corrected it.
//
// So the copy below says the three possibilities and refuses to say which — and it says WHY it
// refuses, because a reader who is not an attacker deserves to know the page is being careful
// rather than vague.
//
// ── Why this is scoped to `/s/[token]` and is not a root `not-found.tsx` ──────────────────────
//
// A root one would change every 404 in the product, including the ones the dark routes serve as
// their gate (`isReportSharesEnabled`, `isSignupEnabled`, the console's per-feature guards). Those
// 404s are a security boundary rather than a page, and redesigning them is not this story. The
// epic's own platform-first note is the rule: *every route keeps the gate it has today.*
export default function ShareNotFound() {
  return (
    <Frame variant="public" brandHref="/" actions={<FrameLink href="/login">Sign in</FrameLink>}>
      <div className="ds-gone">
        <div className="ds-gone-glyph" aria-hidden="true">
          {/* A broken-link mark, drawn inline rather than reached for from `Icon`: `icon-names.ts`
              is a closed union and has no "unlink", and widening a shared seam to draw one glyph on
              one 404 is a bigger change than the picture is worth. It is decorative — the sentence
              below carries the meaning. */}
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M9.5 14.5 14.5 9.5" />
            <path d="M10.8 7.3 12.6 5.5a4 4 0 0 1 5.7 5.7l-1.8 1.8" />
            <path d="M13.2 16.7 11.4 18.5a4 4 0 0 1-5.7-5.7l1.8-1.8" />
          </svg>
        </div>
        <h1>This link is not working</h1>
        <p>
          It may have expired, been switched off, or never have been a link at all. Whoever shared it can make
          you a new one.
        </p>
        <p className="ds-gone-quiet">
          We deliberately do not say which of those it is — telling a stranger the difference between
          &ldquo;expired&rdquo; and &ldquo;never existed&rdquo; is a way to find out which links are real.
        </p>
        <div className="ds-gone-acts">
          <FrameLink href="/install">See what Golden Frijoles does</FrameLink>
          <FrameLink href="/login" variant="primary">
            Sign in
          </FrameLink>
        </div>
      </div>
    </Frame>
  )
}
