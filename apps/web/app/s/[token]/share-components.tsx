/** @jsxImportSource react */
// Pragma: a no-op under Next and required by the test rail — Playwright's transform pins its own jsx
// runtime, whose elements react-dom/server refuses to render. Same line, same reason, in
// app/hub/hub-components.tsx and app/hub/report-components.tsx.
import type { ReactNode } from 'react'
import type { PodReportLens } from '@/lib/pod-report-lens'
import { Frame } from '@/design-system/Frame'
import { Callout, Pill, Tile, Tiles } from '@/design-system/primitives'

// pod-report · Sprint 3, Story 3.1 — the share surface's own chrome and its two roadmap strips.
//
// Separate from page.tsx for the reason report-components.tsx is separate from its page: page.tsx
// imports `server-only` modules (the token resolver, the query libs), so a spec can never load it.
// These components import nothing but types and the design system, which is what lets
// e2e/report-share.spec.ts assert on real markup instead of only on HTTP status codes.
//
// design-system-rails · Sprint 6, Story 6.2 — reference state `public-share`. The frame is DD3's
// PUBLIC one: a slim bar, the mark, and at most one action. `hub.module.css` is gone from this file
// entirely — a share link had been borrowing the signed-in hub's private stylesheet, which is how a
// page read by somebody with no account ends up looking like a page for somebody with one.

/**
 * The frame around a shared report.
 *
 * ⚠️ **The mark is NOT a link, and the bar offers no way into the product.** The approved state's
 * own callout says why: a share link that quietly offers a way in is a share link that leaks a map
 * of the account. `Frame` renders the brand as plain text when it is given no `brandHref`, which is
 * what makes "no navigation into the product" a property of the markup rather than a promise.
 *
 * Carries the audience note as VISIBLE text, not as a comment or a data attribute. Someone who
 * receives an investor link and wonders why they cannot see the per-criterion rows should be able to
 * read the answer on the page rather than conclude the report is broken.
 */
export function ShareFrame({
  lens,
  audienceNote,
  sharedBy,
  children,
}: {
  lens: PodReportLens
  audienceNote: string
  /** Whose report this is — the project the token resolved, never anything the URL supplied. */
  sharedBy: string
  children: ReactNode
}) {
  return (
    // ⚠️ **NO actions in the bar, and that is the whole point of this page** (fresh reviewer, round
    // 7). A first version carried `What is this?` → `/install`, nine lines under a docstring saying
    // "the bar offers no way into the product" and above a callout telling the reader the same thing
    // in visible copy. The same PR had already refused to put the agent footer here for exactly that
    // reason. A claim a page makes about itself, contradicted by the page.
    //
    // The approved design does draw that control — as `onclick="toast('Learn what this is')"`, an
    // affordance that explains in place and NAVIGATES NOWHERE. The port turned it into an anchor
    // without noticing the difference. A toast needs a client island, and the explanation is already
    // on the page twice (the `Shared with you` head, and the closing callout), so the honest port of
    // a non-navigating control is no control.
    <Frame variant="public">
      <div className="ds-sharehead" data-share-lens={lens} data-testid="share-audience-note">
        <div className="ds-sharehead-body">
          <p className="ds-sharehead-title">Shared with you · {sharedBy}</p>
          <p className="ds-sharehead-note">
            A read-only view of one report. It shows what is below and nothing else about the project, and it
            can be switched off at any time by whoever made it.{' '}
            {/* ⚠️ ONE template string, not `{lens} lens`. React SSR separates adjacent text nodes
                with a `<!-- -->` marker so hydration can tell where one ended, so the two-expression
                form renders `client<!-- --> lens` and `report-share.spec.ts`'s
                `toContain('client lens')` fails against a page that LOOKS right. The spec is
                correct and the markup was wrong: a reader searching the page for "client lens"
                would not find it either. */}
            <Pill label>{`${lens} lens`}</Pill> {audienceNote}
          </p>
        </div>
        <span className="ds-sharehead-ro">Read only</span>
      </div>
      {children}
    </Frame>
  )
}

type EpicRow = { slug: string; name?: string | null; shipped: boolean }
type Counts = { epics: number; sprints: number; seeds: number; shippedEpics: number }

/**
 * The build order as a compact strip: what shipped, what is in flight, what is ahead.
 *
 * Team and client only (lens policy `showJourney`). Deliberately NOT linked: the hub's epic
 * drill-down is an authenticated surface, and a link from a public page to a 404 reads as a broken
 * report rather than as a boundary being respected.
 */
export function ShareJourneyStrip({
  epics,
  markerIndex,
  counts,
}: {
  epics: EpicRow[]
  markerIndex: number
  counts: Counts
}) {
  if (epics.length === 0) return null
  return (
    <section className="ds-report-section" data-testid="share-journey">
      <h2 className="ds-report-heading">Where the work is</h2>
      <p className="ds-lede">
        <b>{counts.shippedEpics}</b> of <b>{counts.epics}</b> epics shipped, in build order.
      </p>
      <div className="ds-listcard">
        {epics.map((epic, i) => (
          // A plain row, not a `ds-epic` anchor: this reader has nowhere to go. The class carries
          // the same layout and the element carries the truth about what is clickable.
          <div key={epic.slug} className="ds-epic">
            <span className="ds-epic-ord">{i + 1}</span>
            <span className="ds-epic-name">
              <b>{epic.name || epic.slug}</b>
            </span>
            <span className="ds-epic-state">
              {epic.shipped ? (
                <Pill state="on">shipped</Pill>
              ) : i === markerIndex ? (
                <Pill state="never">in flight</Pill>
              ) : (
                <Pill state="off">next</Pill>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

/**
 * The horizon, as counts rather than as a card grid.
 *
 * Every lens sees this — it is the least granular view there is, and the one that reads as progress
 * against a destination rather than as a backlog. Seeds are stated as a count and never named: an
 * un-groomed idea is not a promise, and putting an outsider's eyes on one turns it into a roadmap
 * commitment nobody made (the poster's own rule, applied to a page a client can read).
 */
export function ShareHorizonStrip({ counts, seeds }: { counts: Counts; seeds: number }) {
  return (
    <section className="ds-report-section" data-testid="share-horizon">
      <h2 className="ds-report-heading">The horizon</h2>
      <Tiles>
        <Tile label="Shipped" value={String(counts.shippedEpics)} />
        <Tile label="On the road ahead" value={String(counts.epics - counts.shippedEpics)} />
        <Tile label="Sprints tracked" value={String(counts.sprints)} />
        <Tile label="Ideas on the horizon" value={String(seeds)} />
      </Tiles>
      <p className="ds-hint">
        Ideas on the horizon are un-groomed and deliberately unnamed — they are possibilities, not
        commitments.
      </p>
    </section>
  )
}

/** The closing note every share link carries, whatever its lens. */
export function ShareFooterNote() {
  return (
    <Callout>
      No navigation into the product, because there is nothing here this reader may open. This link was issued
      deliberately and can be revoked at any time; every number on this page is computed from the
      repository&apos;s own history, and what could not be measured says so.
    </Callout>
  )
}
