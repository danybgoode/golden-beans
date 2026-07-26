/** @jsxImportSource react */
// The pragma above is a NO-OP for Next (react/jsx-runtime is already its default) and load-bearing
// for the test rail: Playwright's transform hardcodes its OWN jsx runtime, which emits `__pw_type`
// objects that react-dom/server cannot render. Without this line, any spec that renders this
// component — or anything importing it — dies with "Objects are not valid as a React child".
// Added at Sprint 2.5c, when e2e/pod-report-surface.spec.tsx started rendering FreshnessStamp.
import type { Freshness, FreshnessTone } from '@/lib/hub-freshness'
import { freshnessLabel } from '@/lib/hub-freshness'
import styles from './hub.module.css'

// pod-report · Sprint 1, Story 1.2 — presentational pieces shared by the journey view and the epic
// drill-down, so the freshness stamp and the empty state look and behave identically everywhere a
// hub page can render them.
//
// Kept free of page-specific data shapes (RoadmapRow, ReportArtifact) on purpose: it's what lets
// e2e/hub-journey.spec.ts render EmptyHubState directly with react-dom/server instead of over HTTP
// against a real project slug. The alternative — asserting the empty state by hitting a real,
// shared, IMMUTABLE-once-pushed tenant — can only ever pass on a database that has never received
// a roadmap push, which stops being true of a real dev's local Supabase after the very first
// successful run of this suite (and this repo is explicitly told never to `supabase db reset` to
// paper over that). Rendering the component directly sidesteps that shared-state trap entirely.

const TONE_CLASS: Record<FreshnessTone, string> = {
  fresh: styles.freshnessFresh,
  recent: styles.freshnessRecent,
  stale: styles.freshnessStale,
  unknown: styles.freshnessUnknown,
}

export function FreshnessStamp({ freshness }: { freshness: Freshness }) {
  return (
    <p className={`${styles.freshness} ${TONE_CLASS[freshness.tone]}`} data-freshness-tone={freshness.tone}>
      <span className={styles.freshnessDot} aria-hidden="true" />
      {freshness.tone === 'stale' && <strong>possibly stale — </strong>}
      {freshness.iso ? (
        <time dateTime={freshness.iso} title={freshness.iso}>
          {freshnessLabel(freshness)}
        </time>
      ) : (
        <span>{freshnessLabel(freshness)}</span>
      )}
    </p>
  )
}

export function EmptyHubState({ projectSlug }: { projectSlug: string }) {
  return (
    <div className={styles.emptyState} data-testid="hub-empty-state">
      <p className={styles.emptyStateKicker}>No roadmap pushed yet</p>
      <h2>This hub is warmed up and waiting on a roast.</h2>
      <p>
        <code>{projectSlug}</code> has never pushed a roadmap artifact, so there is nothing to show — this is
        an empty hopper, not a broken page and not a zero.
      </p>
      <p>Push one from a checkout of that roadmap:</p>
      <pre className={styles.emptyStateCmd}>
        <code>node scripts/roadmap-push.mjs</code>
      </pre>
      <p className="note">Once a push lands, this page renders it automatically — no redeploy needed.</p>
    </div>
  )
}
