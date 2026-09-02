import { notFound } from 'next/navigation'
import { after } from 'next/server'
import { isReportSharesEnabled } from '@/lib/flags'
import { trackSelfEvent, SHARE_VIEWED_EVENT } from '@/lib/self-track'
import { resolveShareToken } from '@/lib/report-shares'
import { looksLikeShareToken } from '@/lib/share-token'
import { getPodReportByProjectId } from '@/lib/pod-report-query'
import { getHubRoadmapByProjectId } from '@/lib/hub-query'
import { lensPolicy } from '@/lib/pod-report-lens'
import { formatFreshness } from '@/lib/hub-freshness'
import { journeyMarkerIndex } from '@/lib/hub-journey'
import { PodReportBody, EmptyPodReportState } from '../../hub/report-components'
import { ShareJourneyStrip, ShareHorizonStrip, ShareFrame, ShareFooterNote } from './share-components'

// pod-report · Sprint 3, Story 3.1 — the share surface. One opaque token in the path, no account.
//
// ── Everything meaningful about this route is what it refuses to accept ───────────────────────
// The URL carries ONE segment and it is a bearer token. There is no project slug and no `?lens=`:
// both the tenant and the audience come from the stored row (lib/report-shares.ts), so "show me
// someone else's report" and "show me the wider lens" are not requests that can be expressed —
// which is a stronger property than validating them and saying no (AGENTS: no request-derived read
// path may cross projects).
//
// ── design-system-rails · Sprint 6, Story 6.2 — reference state `public-share` ────────────────
// The page renders inside DD3's PUBLIC frame, and the designed 404 every dead link lands on lives
// beside it in `not-found.tsx` — see that file for why there is exactly one of them.
//
// ── Two independent kill switches, same shape as the MCP connector (AGENTS rule #3) ───────────
// REPORT_SHARES_ENABLED must be on AND the row must be live. The flag is checked FIRST and without
// looking at the token at all, so while dark this route cannot be used as an oracle for whether a
// given token exists.
export const dynamic = 'force-dynamic'

// Not indexable, not previewable, not cached by an intermediary. A share link's audience is the one
// person it was sent to; a search engine following it out of a leaked referrer is a data leak with a
// URL attached.
export const metadata = {
  title: 'Pod Report',
  robots: { index: false, follow: false, nocache: true, noarchive: true, nosnippet: true },
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  // Gate first, token second. Reversing these would make a dark deployment answer "is this token
  // real?" through its timing and its logs.
  if (!isReportSharesEnabled()) notFound()

  const { token } = await params

  // ── Why every rejection below is 404 and not 401 ─────────────────────────────────────────────
  // sprint-3.md's acceptance line said "revoked token → 401". That line was written by analogy with
  // the MCP connector, an API route where 401 is the natural answer. On an HTML page it is the wrong
  // answer, and STRICTLY WEAKER: a 401 confirms "this token was real once", so revoking a leaked
  // link would still tell whoever holds it that they had something valid — an oracle, handed to the
  // exact person you just cut off.
  //
  // 404 for unknown, malformed, expired and revoked alike matches this repo's own established
  // doctrine: lib/dashboard-auth.ts returns 404 and never 403 for a foreign project, deliberately,
  // "so we don't confirm a foreign project's existence". Recorded as a dated amendment in
  // sprint-3.md — this is a comment explaining a decision, not a comment making one.
  if (!looksLikeShareToken(token)) notFound()

  const share = await resolveShareToken(token)
  if (!share.ok) {
    // A database outage is NOT a dead link. Throwing surfaces it as a 500, so an operator sees an
    // incident and the recipient is not told their link was revoked when it was not
    // (Roadmap/LEARNINGS.md — a broken read must never render as an honest-looking empty one).
    if (share.reason === 'query_failed') throw new Error('Share link lookup failed')
    notFound()
  }

  // ── Carry the token's own project_id. Never re-derive the tenant from the slug ───────────────
  // Cross-review's one Blocking finding (Codex, PR #33): this used `projectSlug` for both reads,
  // which discarded the immutable id the credential resolved and re-derived a tenant from a MUTABLE
  // natural key. A rename plus a slug reassignment between the two queries would have pointed a
  // live token at a DIFFERENT tenant's report. The slug below is used for display and for the
  // funnel queries' signatures only — nothing resolves tenancy from it.
  const { projectId, projectSlug, lens } = share
  const policy = lensPolicy(lens)

  // Story 3.2 — keyed on the SHARE ROW, not on a person. A bearer URL can be forwarded to a room
  // full of people from one email, so "distinct links opened" is the only unit this page can
  // honestly report; calling it a visitor count would be a number that reads as an audience and is
  // not one. Never the token itself: that would write a live credential into the event stream.
  after(() => trackSelfEvent(SHARE_VIEWED_EVENT, `share:${share.shareId}`))

  const report = await getPodReportByProjectId(projectId, projectSlug, lens)
  if (!report.ok) {
    if (report.reason === 'query_failed') throw new Error('Pod report lookup failed')
    // Cross-review round 2 (Agy): this fell through to the empty state, contradicting the contract
    // lib/pod-report-query.ts documents ('project_not_found' → notFound()). Nearly unreachable —
    // the token resolved through a view whose JOIN proves the project existed a moment ago — but
    // "nearly unreachable" is how the slug-renamed-mid-request case gets rendered as "this tenant
    // has not pushed a report yet", which is a statement about a tenant that no longer exists.
    if (report.reason === 'project_not_found') notFound()
  }

  // The roadmap half is best-effort: a share link whose Pod Report renders should not 500 because
  // the tenant never pushed a roadmap artifact. `getHubRoadmap` already distinguishes the two.
  const roadmap = policy.showJourney || policy.showHorizon ? await getHubRoadmapByProjectId(projectId) : null
  if (roadmap && !roadmap.ok && roadmap.reason === 'query_failed') throw new Error('Roadmap lookup failed')

  return (
    <ShareFrame lens={lens} audienceNote={policy.audienceNote} sharedBy={projectSlug}>
      {report.ok ? (
        <PodReportBody
          projectSlug={projectSlug}
          view={report.view}
          outcome={report.outcome}
          lens={lens}
          artifactVersion={report.artifact.version}
          freshness={formatFreshness(report.artifact.generatedAt, new Date(), report.artifact.sourceCommit)}
        />
      ) : (
        <EmptyPodReportState projectSlug={projectSlug} />
      )}

      {roadmap?.ok && policy.showJourney && (
        <ShareJourneyStrip
          epics={roadmap.summary.epics}
          markerIndex={journeyMarkerIndex(roadmap.summary.epics)}
          counts={roadmap.summary.counts}
        />
      )}

      {roadmap?.ok && policy.showHorizon && (
        <ShareHorizonStrip counts={roadmap.summary.counts} seeds={roadmap.summary.seeds.length} />
      )}

      <ShareFooterNote />
    </ShareFrame>
  )
}
