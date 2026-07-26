/** @jsxImportSource react */
// Pragma: a no-op under Next and required by the test rail — Playwright's transform pins its own jsx
// runtime, whose elements react-dom/server refuses to render. Same line, same reason, in
// app/hub/hub-components.tsx and app/hub/report-components.tsx.
import type { ReactNode } from 'react'
import type { PodReportLens } from '@/lib/pod-report-lens'
import styles from '../../hub/hub.module.css'

// pod-report · Sprint 3, Story 3.1 — the share surface's own chrome and its two roadmap strips.
//
// Separate from page.tsx for the reason report-components.tsx is separate from its page: page.tsx
// imports `server-only` modules (the token resolver, the query libs), so a spec can never load it.
// These components import nothing but types and a stylesheet, which is what lets
// e2e/report-share.spec.tsx assert on real markup instead of only on HTTP status codes.

/**
 * The frame around a shared report.
 *
 * Carries the audience note as VISIBLE text, not as a comment or a data attribute. Someone who
 * receives an investor link and wonders why they cannot see the per-criterion rows should be able to
 * read the answer on the page rather than conclude the report is broken.
 */
export function ShareFrame({
  lens,
  audienceNote,
  children,
}: {
  lens: PodReportLens
  audienceNote: string
  children: ReactNode
}) {
  return (
    <main className={styles.report} data-share-lens={lens}>
      <div className="wrap">
        <p className={styles.kicker}>Pod Report · shared link</p>
        <p className={styles.shareAudience} data-testid="share-audience-note">
          <span className="tag tag-next">{`${lens} lens`}</span>
          <span>{audienceNote}</span>
        </p>
        {children}
      </div>
    </main>
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
    <section className={styles.shareStrip} data-testid="share-journey">
      <h2 className={styles.shareStripTitle}>Where the work is</h2>
      <p className={styles.shareStripLede}>
        <b className="data">{counts.shippedEpics}</b> of <b className="data">{counts.epics}</b> epics
        shipped, in build order.
      </p>
      <ol className={styles.shareJourneyList}>
        {epics.map((epic, i) => (
          <li
            key={epic.slug}
            className={epic.shipped ? styles.shareJourneyShipped : styles.shareJourneyAhead}
          >
            <span className={`tag ${epic.shipped ? 'tag-live' : 'tag-next'}`}>
              {epic.shipped ? '✅' : i === markerIndex ? '🔨' : '🔜'}
            </span>{' '}
            {epic.name || epic.slug}
            {i === markerIndex && !epic.shipped && <em className={styles.shareHere}> — in flight</em>}
          </li>
        ))}
      </ol>
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
    <section className={styles.shareStrip} data-testid="share-horizon">
      <h2 className={styles.shareStripTitle}>The horizon</h2>
      <div className={styles.counts}>
        <div className={styles.countPill}>
          <b className="data">{counts.shippedEpics}</b>
          <span>shipped</span>
        </div>
        <div className={styles.countPill}>
          <b className="data">{counts.epics - counts.shippedEpics}</b>
          <span>on the road ahead</span>
        </div>
        <div className={styles.countPill}>
          <b className="data">{counts.sprints}</b>
          <span>sprints tracked</span>
        </div>
        <div className={styles.countPill}>
          <b className="data">{seeds}</b>
          <span>ideas on the horizon</span>
        </div>
      </div>
      <p className="note">
        Ideas on the horizon are un-groomed and deliberately unnamed — they are possibilities, not
        commitments.
      </p>
    </section>
  )
}
