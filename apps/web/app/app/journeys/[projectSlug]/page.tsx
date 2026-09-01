import { notFound } from 'next/navigation'
import { requireProjectMembership } from '@/lib/dashboard-auth'
import { isJourneyProjectionsEnabled } from '@/lib/flags'
import { isOwner } from '@/lib/roles'
import { listJourneyRegistries } from '@/lib/journeys'
import { newestVersion } from '@/lib/experiment-list-view'
import {
  journeyAnswer,
  projectJourneyRows,
  summariseJourneys,
  type JourneyListInput,
} from '@/lib/journey-list-view'
import { JourneyManager } from './journey-manager'
import { JourneyRows } from './journey-rows'
import { ProductShell } from '@/components/product/ProductShell'
import { Answer, PageHead } from '@/design-system/primitives'

// design-system-rails · Sprint 5, Story 5.5 — reference state `measure-journeys`.
//
// The page was an authoring form above a table of versions, headed "Journey definitions". It is now
// the approved list, and the authoring surface is kept in full behind a disclosure — creating a
// draft and activating a version have no other home, and deleting a capability to satisfy a
// geometry assertion is not what "render from the design system" asks for.
//
// ⚠️ **The subject counts are NOT read here, and that is deliberate.** A journey's population comes
// from `getJourneyCohortByProjectId`, which is a bounded fact scan per journey per window — the same
// cost shape as an experiment analysis. Running one per row would make a list page N of them, and
// the number is on each journey's own page where the whole cohort is being computed anyway. So the
// People column renders a dash with a sentence rather than a figure this page did not read: "we did
// not read how many" and "nobody" are different, and `projectJourneyRows` keeps them apart.
export const dynamic = 'force-dynamic'

export default async function JourneysPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  // Dark means nonexistent, before auth or project lookup. Old surfaces remain untouched.
  if (!isJourneyProjectionsEnabled()) notFound()
  const { projectSlug } = await params
  const membership = await requireProjectMembership(projectSlug)
  const journeys = await listJourneyRegistries(membership.projectId)

  const inputs: JourneyListInput[] = journeys.map((journey) => ({
    key: journey.key,
    // The DESCRIPTION lives on the definition, and the active version's is the current one. Falling
    // back to the newest version's means a journey with only drafts still says what it is for.
    //
    // ⚠️ **`newestVersion`, NOT `.at(-1)`** — `mapJourneyRegistryRows` sorts DESCENDING too, so the
    // fallback was picking the OLDEST draft. Same defect as the experiments list, same fix: compute
    // the maximum, so a mapper's ordering cannot reach it.
    description:
      (
        journey.versions.find((version) => version.id === journey.activeVersionId) ??
        newestVersion(journey.versions)
      )?.definition.description ?? '',
    activeVersionId: journey.activeVersionId,
    versions: journey.versions.map((version) => ({
      id: version.id,
      version: version.version,
      state: version.state,
    })),
  }))
  const rows = projectJourneyRows(inputs, new Map())
  const summary = summariseJourneys(rows)

  return (
    <ProductShell projectSlug={projectSlug} section="measure" railActive={'journeys'}>
      <main>
        <PageHead
          title="Journeys"
          lede="A journey is the path you want somebody to walk. Each one counts how far people actually get."
        />
        <Answer>{journeyAnswer(rows)}</Answer>

        {rows.length === 0 ? null : (
          <div className="ds-tiles">
            <Tile label="Active" value={summary.active} detail="definitions counting people" />
            <Tile
              label="Drafts waiting"
              value={summary.draftsWaiting}
              detail="not counting anyone yet"
              tone={summary.draftsWaiting > 0 ? 'warn' : undefined}
            />
            <Tile label="Defined" value={rows.length} detail="including drafts and superseded" />
          </div>
        )}

        <JourneyRows slug={projectSlug} rows={rows} />

        {/* An AUTHORING surface, which the approved design does not draw — the same class as the
            feature page's Targeting tab and Experiments' plan editor. Complete, and one keystroke
            below the list rather than above it. */}
        <details className="ds-gaps">
          <summary>Define a journey, and activate a version</summary>
          <div className="ds-disclosure-body">
            <JourneyManager
              slug={projectSlug}
              journeys={journeys}
              canManage={isOwner({ projectId: membership.projectId, role: membership.role })}
            />
          </div>
        </details>
      </main>
    </ProductShell>
  )
}

/** A summary tile. Numeric only — every figure here is a count this page genuinely read. */
function Tile({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: number
  detail: string
  tone?: 'up' | 'warn'
}) {
  return (
    <div className="ds-tile">
      <p className="ds-tile-label">{label}</p>
      <p className="ds-tile-value" data-tone={tone}>
        {value}
      </p>
      <p className="ds-tile-detail">{detail}</p>
    </div>
  )
}
