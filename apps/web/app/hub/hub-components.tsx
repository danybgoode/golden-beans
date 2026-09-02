/** @jsxImportSource react */
// The pragma above is a NO-OP for Next (react/jsx-runtime is already its default) and load-bearing
// for the test rail: Playwright's transform hardcodes its OWN jsx runtime, which emits `__pw_type`
// objects that react-dom/server cannot render. Without this line, any spec that renders this
// component — or anything importing it — dies with "Objects are not valid as a React child".
// Added at Sprint 2.5c, when e2e/pod-report-surface.spec.tsx started rendering FreshnessStamp.
import type { ReactNode } from 'react'
import type { Freshness } from '@/lib/hub-freshness'
import { freshnessLabel } from '@/lib/hub-freshness'
import { Empty } from '@/design-system/primitives'

// pod-report · Sprint 1, Story 1.2 — presentational pieces shared by the journey view, the epic
// drill-down, the horizon, the report and the public share link, so the freshness stamp and the
// empty state look and behave identically everywhere a hub page can render them.
//
// Kept free of page-specific data shapes (RoadmapRow, ReportArtifact) on purpose: it's what lets
// e2e/hub-journey.spec.ts render EmptyHubState directly with react-dom/server instead of hitting a
// real, shared, IMMUTABLE-once-pushed tenant — which can only ever pass on a database that has
// never received a roadmap push, and stops being true after the first successful run.
//
// design-system-rails · Sprint 6, Story 6.3 — both render from `design-system/` now. The freshness
// stamp keeps its `data-freshness-tone` attribute and its `<time>`: those are what `hub.spec.ts`
// and `pod-report-surface.spec.tsx` assert on, and a port that quietly renamed them would be a
// visual change wearing a test failure's clothes.

export function FreshnessStamp({ freshness }: { freshness: Freshness }) {
  return (
    <span className="ds-freshness" data-freshness-tone={freshness.tone}>
      <span className="ds-freshness-dot" aria-hidden="true" />
      {freshness.tone === 'stale' && <strong>possibly stale — </strong>}
      {freshness.iso ? (
        <time dateTime={freshness.iso} title={freshness.iso}>
          {freshnessLabel(freshness)}
        </time>
      ) : (
        <span>{freshnessLabel(freshness)}</span>
      )}
    </span>
  )
}

/**
 * The provenance line every hub surface opens with — the approved `.prov` stamp.
 *
 * *A report that cannot tell you how stale it is, is a screenshot.* Every hub page is a VIEW of an
 * append-only artifact somebody pushed, so the first thing on it says when that push happened, what
 * it was computed from, and which version this is. One component, because four surfaces render it
 * and four hand-written copies is three chances to leave one saying the wrong thing.
 */
export function HubProvenance({
  freshness,
  from,
  version,
  children,
}: {
  freshness: Freshness
  /** What the artifact was computed from — "27 epics and 79 sprints". */
  from: ReactNode
  version: number
  /** Anything that belongs at the right-hand end, such as "Nothing here is typed by hand." */
  children?: ReactNode
}) {
  return (
    <p className="ds-prov">
      <FreshnessStamp freshness={freshness} />
      <span className="ds-prov-sep" aria-hidden="true">
        ·
      </span>
      <span>
        from <b>{from}</b>
      </span>
      <span className="ds-prov-sep" aria-hidden="true">
        ·
      </span>
      <span>
        artifact <b>v{version}</b>
      </span>
      {children}
    </p>
  )
}

export function EmptyHubState({ projectSlug }: { projectSlug: string }) {
  return (
    <div className="ds-listcard" data-testid="hub-empty-state">
      <Empty
        title="No roadmap pushed yet"
        body={
          <>
            <code className="ds-mono">{projectSlug}</code> has never pushed a roadmap artifact, so there is
            nothing to show — this is an unplanted plot, not a broken page and not a zero. Push one from a
            checkout of that roadmap with <code className="ds-mono">node scripts/roadmap-push.mjs</code>, and
            this page renders it automatically. No redeploy needed.
          </>
        }
      />
    </div>
  )
}
