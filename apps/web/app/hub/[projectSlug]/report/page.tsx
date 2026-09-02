import { notFound } from 'next/navigation'
import { after } from 'next/server'
import { cookies } from 'next/headers'
import { requireDashboardAccess } from '@/lib/dashboard-auth'
import { trackSelfEvent, REPORT_VIEWED_EVENT, VISITOR_COOKIE } from '@/lib/self-track'
import { getPodReport } from '@/lib/pod-report-query'
import { formatFreshness } from '@/lib/hub-freshness'
import { EmptyPodReportState, PodReportBody } from '../../report-components'
import { HubFrame } from '../../hub-frame'
import { PageHead } from '@/design-system/primitives'

export const dynamic = 'force-dynamic'

// pod-report · Sprint 2.5c — the Pod Report surface, the third hub view beside the journey and the
// horizon. Sprint 2 computed every number and nothing rendered any of it; this is the half that
// makes it a sales artifact instead of a row in `report_artifacts`.
//
// Same gate as its siblings (`requireDashboardAccess` → the demo project reads anonymously via the
// AGENTS rule #2 allow-list, every other slug needs a signed-in member), same freshness stamp.
//
// design-system-rails · Sprint 6, Story 6.3 — reference state `hub-report`. The page is the hub's
// third tab now rather than a link back to the first, and every rendering decision still lives in
// `PodReportBody`, including the `isHonest()` refusal. Read that file's header for what moved onto
// the design system and what is deliberately still on `hub.module.css`.
//
// ── Why the lens is hardcoded to 'team' and not read from anything ────────────────────────────
// lib/pod-report-lens.ts: "always resolved server-side from a credential — never from a URL". This
// route's credential IS a dashboard session, and a dashboard session means the team. Sprint 3's
// share routes resolve `client`/`investor` from a share token and call the same getPodReport();
// accepting a `?lens=` here would hand any reader the widest view by typing it.
export default async function HubPodReportPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params
  await requireDashboardAccess(projectSlug)

  const result = await getPodReport(projectSlug, 'team')

  if (!result.ok) {
    // A broken database must never render like "nothing pushed yet" — that turns an outage into a
    // page that quietly claims a tenant has no report (Roadmap/LEARNINGS.md, the zero that pages
    // nobody). Throwing here surfaces it as a 500, which is what it is.
    if (result.reason === 'query_failed') throw new Error('Pod report artifact lookup failed')
    if (result.reason === 'project_not_found') notFound()

    return (
      <HubFrame projectSlug={projectSlug} tab="report">
        <PageHead title="Pod report" lede={`What the ${projectSlug} pod shipped, and whether it mattered.`} />
        <EmptyPodReportState projectSlug={projectSlug} />
      </HubFrame>
    )
  }

  // Story 3.2 — the engine measures its own reporting surface. Via `after()`, never inline-awaited:
  // this is a real network round-trip (the app calling its own public API through the SDK) and
  // awaiting it would put a tracking call in front of the page's own response.
  //
  // Fired ONLY when a visitor cookie already exists. Minting an id here would be wrong twice over:
  // a Server Component cannot set a cookie, so the id would never persist, and TARS counts DISTINCT
  // users — a fresh id per view turns a page-view counter into a fabricated audience size.
  const visitorId = (await cookies()).get(VISITOR_COOKIE)?.value
  if (visitorId) after(() => trackSelfEvent(REPORT_VIEWED_EVENT, visitorId))

  const { artifact, view, outcome, lens } = result
  const freshness = formatFreshness(artifact.generatedAt, new Date(), artifact.sourceCommit)

  return (
    <HubFrame projectSlug={projectSlug} tab="report">
      {/* Every rendering decision lives in PodReportBody, including the isHonest() refusal. This
          page deliberately holds no branch that could put a number on screen — see
          app/hub/report-components.tsx for why that is the arrangement. */}
      <PodReportBody
        projectSlug={projectSlug}
        view={view}
        outcome={outcome}
        lens={lens}
        artifactVersion={artifact.version}
        freshness={freshness}
      />
    </HubFrame>
  )
}
