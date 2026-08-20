import type { Metadata } from 'next'
import Link from 'next/link'
import { getSiteUrl } from '@/lib/site-url'
import { Nav } from '@/components/landing/Nav'
import { SelfTrackBeacon } from '@/components/landing/SelfTrackBeacon'
import { Footer } from '@/components/landing/Footer'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { PhaseLabel } from '@/components/methodology/PhaseLabel'
import { MethodologyBlocks } from '@/components/methodology/MethodologyBlocks'
import {
  METHODOLOGY_CHAPTERS,
  METHODOLOGY_CHECKPOINT,
  METHODOLOGY_PHASES,
  METHODOLOGY_PREFLIGHT,
} from '@/lib/methodology-chapters'

// methodology-experience · Sprint 2, Story 2.2 — the methodology index, at its own URL (epic D7).
//
// ── Real routes, not a `display:none` SPA (mockup defect 4) ───────────────────────────────────
// The mockup's home is one of two `<section class="page">` toggled by a click handler with no URL
// change. This is a plain server-rendered route: no client state, no flag (epic D10 — the route is
// held dark by not being linked from `Nav`/`Footer`/the landing, not by a gate), no DB read, so
// nothing here needs `force-dynamic` (AGENTS/D9 precedent is about routes that read a flag or the
// database per request; this one reads neither).
//
// ── The six cards are DERIVED, never hand-listed ───────────────────────────────────────────────
// `MethodologySection`'s temporary `FIELD_GUIDE_PHASES` constant on the landing is the "two lists
// that must agree" defect this repo keeps getting bitten by (see that file's own header comment).
// Both the hero's phase card and the chapter grid below read straight off
// `METHODOLOGY_PHASES`/`METHODOLOGY_CHAPTERS` — there is no second list here to drift out of step.
//
// ── The cards are real `next/link`s (mockup defect 5) ──────────────────────────────────────────
// The mockup's cards are `<div onclick>`: unfocusable, unreachable by keyboard, announced as
// nothing by a screen reader. `.methodology-card` below is an `<a>`, so it inherits the site-wide
// `:where(a, button, ...):focus-visible` focus ring (globals.css) for free — no separate focus
// treatment to keep in sync with every other control on the page.
//
// ── The brand links home ───────────────────────────────────────────────────────────────────────
// `Nav` renders `BrandLockup` with no `href` override, so it defaults to `/` — there is currently
// no other way back to the site from the methodology (epic README's substitution table), and this
// route gets that for free by reusing `Nav` rather than rebuilding the mockup's non-linking brand.
// methodology-experience · Sprint 4, Story 4.3 — this route's own metadata.
//
// `async generateMetadata` and not a static object, following `app/layout.tsx`'s recorded reasoning
// (epic D9): a static object is evaluated once and bakes in whatever `SITE_URL` was set at build
// time, and this repo's `typecheck-build` job runs `npm run build` with NO env vars at all.
//
// ── Why this matters more than a tidy tag ─────────────────────────────────────────────────────
// Before this, all seven methodology URLs served the LANDING's title and description — measured on
// live production (amendment A6). A search result, a link preview and an agent's page list could
// not tell the index from a chapter from the sales page. That is not a polish item; it is the
// difference between six pages existing and six pages being findable.
//
// D9's rule applies unchanged: a link preview travels WITHOUT the qualification the page carries,
// so it describes the shape and names no capability a flag flip could falsify. Nothing here claims
// the method is easy, proven, or that anyone has used it.
export async function generateMetadata(): Promise<Metadata> {
  const siteUrl = getSiteUrl()
  const title = 'The Golden Frijoles methodology'
  const description =
    'Six chapters that take one real idea through one bounded, shipped, verified Bet. Bring your own project and your own agents.'

  return {
    title,
    description,
    alternates: { canonical: `${siteUrl}/methodology` },
    openGraph: {
      title,
      description,
      url: `${siteUrl}/methodology`,
      siteName: 'Golden Frijoles',
      type: 'article',
    },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default function MethodologyIndexPage() {
  return (
    <>
      {/* Story 4.1 — the reader becomes evidence. Same beacon as the landing, naming its surface;
          the event is chosen server-side from a closed set. */}
      <SelfTrackBeacon surface="methodology" />
      <Nav />
      <main>
        <section className="band">
          <div className="wrap method-grid">
            <div>
              <p className="kicker">Learn by doing</p>
              <h1 className="display">Make something real</h1>
              <p className="measure">
                The Golden Frijoles methodology is a practical way to build products with humans and agents as
                one operating system. Bring your own project. Use your own agents. Learn the method while you
                make.
              </p>
              <div className="button-row">
                <Button href={`/methodology/${METHODOLOGY_CHAPTERS[0]!.id}`}>
                  Start with a real idea
                  <Icon name="arrow-right" size={14} />
                </Button>
                {/* Story 4.2 — the edition is GENERATED from the same module this page renders
                    (epic D5), so this button cannot hand anyone a stale fork of the methodology.
                    The story's alternative was to CUT it rather than point at a file that would
                    silently diverge; generation is built, so it ships.

                    A plain link and not a download attribute: an agent fetching this URL should get
                    the method as readable text, which is the larger half of what it is for
                    (amendment A6). A browser still saves it with one keystroke. */}
                <Button href="/methodology/edition.md" variant="ghost">
                  Read it as one document
                  <Icon name="book" size={14} />
                </Button>
              </div>
            </div>

            <div className="panel methodology-direction">
              <p className="methodology-direction__label">Direction · your North Star surrounds the loop</p>
              <ul className="methodology-direction__phases">
                {METHODOLOGY_PHASES.map((phase) => (
                  <li key={phase.id}>
                    <strong>{phase.title}</strong>
                    <span>{phase.summary}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── §0, the closing and the checkpoint (amendment A5) ─────────────────────────────
            The v0.3 mockup dropped all three of these; the v0.2 field guide has them, and the
            product owner ruled on 2026-08-19 that they ship. None is a seventh chapter — D7's
            six-chapter structure is untouched — so they are index content with no route of their
            own, rendered through the SAME `MethodologyBlocks` the chapters use.

            §0 sits above the chapter grid because it is a precondition for chapter 1, and the line
            that matters most in it ("Do not create a tutorial project") is the one a reader needs
            BEFORE they pick a chapter, not after. */}
        <section>
          <div className="wrap methodology-aside methodology-prose">
            {/* No `kicker` above this one. The section's title IS "Before you begin", and a mono
                kicker carrying the same three words directly above the heading printed them twice
                — visible the moment the page was opened, invisible to every assertion in the
                suite. The other sections' kickers name a CATEGORY the heading then states
                ("Methodology index" / "Six chapters. One real project"); here they collapsed. */}
            <h2 className="methodology-aside__title">{METHODOLOGY_PREFLIGHT.title}</h2>
            <MethodologyBlocks blocks={METHODOLOGY_PREFLIGHT.blocks} />
          </div>
        </section>

        <section>
          <div className="wrap">
            <div className="methodology-index__head">
              <p className="kicker">Methodology index</p>
              {/* A4: no terminal full stop — `check-design-drift`'s `heading-period` rule reads the
                  final character of heading text. The internal stop stays; it is a two-beat title,
                  not a sentence run past its end. */}
              <h2 className="section-title">Six chapters. One real project</h2>
              <p>Read in order the first time. Jump straight to a chapter when you come back.</p>
            </div>

            <div className="methodology-cards">
              {METHODOLOGY_CHAPTERS.map((chapter) => (
                <Link key={chapter.id} href={`/methodology/${chapter.id}`} className="methodology-card">
                  <PhaseLabel phase={chapter.phase} />
                  <span className="methodology-card__num">{String(chapter.number).padStart(2, '0')}</span>
                  <h3>{chapter.title}</h3>
                  <p>{chapter.summary}</p>
                  <span className="methodology-card__arrow">
                    Read chapter
                    <Icon name="arrow-right" size={12} />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* The closing. It reads as an ending, so it is last.
            It deliberately carries NO phase recap, though the v0.2 source's closing has one: the
            Direction card at the top of this same page already renders those three lines from
            `METHODOLOGY_PHASES`, and printing them again here is the "say each thing once" defect
            D4 exists to prevent. See the note on `METHODOLOGY_CHECKPOINT`. */}
        <section className="band">
          <div className="wrap methodology-aside methodology-prose">
            <p className="kicker">{METHODOLOGY_CHECKPOINT.title}</p>
            <MethodologyBlocks blocks={METHODOLOGY_CHECKPOINT.blocks} />
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
