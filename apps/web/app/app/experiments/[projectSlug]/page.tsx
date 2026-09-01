import { notFound } from 'next/navigation'
import { requireProjectMembership } from '@/lib/dashboard-auth'
import { listExperimentRegistries } from '@/lib/experiments'
import { listExperimentFlagBindings } from '@/lib/experiment-flag-bindings'
import { getFlagRegistryView } from '@/lib/flag-registry'
import { getExperimentAnalysisByProjectId } from '@/lib/experiment-analysis-query'
import { parseExperimentAnalysisRequest } from '@/lib/experiment-analysis-request'
import { isExperimentGovernanceEnabled } from '@/lib/flags'
import { isOwner } from '@/lib/roles'
import {
  experimentAnswer,
  projectExperimentRows,
  readinessCandidates,
  type ExperimentListInput,
} from '@/lib/experiment-list-view'
import { ExperimentManager } from './experiment-manager'
import { ExperimentRows } from './experiment-rows'
import { ProductShell } from '@/components/product/ProductShell'
import { Answer, PageHead } from '@/design-system/primitives'

// design-system-rails · Sprint 5, Story 5.4 — reference state `ship-experiments`.
//
// ── What changed, and what deliberately did not ───────────────────────────────────────────────
// The page was an authoring form above a `<table>` of versions, headed "Experiment governance". It
// is now the approved list — one row per experiment, with its state and its primary metric — and
// **the authoring surface is kept, in full, behind a disclosure**. Creating a draft, binding a flag
// version and transitioning a version are real capabilities with no other home, and deleting one to
// satisfy a geometry assertion is not what "render from the design system" asks for (the same call
// Sprint 4 recorded for Destinations' operational logs).
//
// ⚠️ **Readiness is resolved for RUNNING versions only, and it is CAPPED** — see
// `lib/experiment-list-view.ts`. "Ready to decide" is a property of the ANALYSIS, and the analysis
// is a full fact scan per experiment; a list page must not silently become N of them. Past the cap a
// row reads `unresolved` and the answer line says so, because "we did not look" and "it is not
// ready" are different sentences and only one of them is a measurement.
//
// On production `miyagisanchez` both experiments are `decided`, so this page runs **zero** analyses.
export const dynamic = 'force-dynamic'

export default async function ExperimentsPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  // New governance management is nonexistent while dark. The nested legacy comparison page remains.
  if (!isExperimentGovernanceEnabled()) notFound()
  const { projectSlug } = await params
  const membership = await requireProjectMembership(projectSlug)
  const [experiments, flagRegistry, bindings] = await Promise.all([
    listExperimentRegistries(membership.projectId),
    getFlagRegistryView(membership.projectId),
    listExperimentFlagBindings(membership.projectId),
  ])

  // The NEWEST version is the one the list describes — an experiment's identity is its key, and its
  // current state is its latest plan. `listExperimentRegistries` orders versions ascending.
  const inputs: ExperimentListInput[] = experiments.map((experiment) => {
    const version = experiment.versions.at(-1) ?? null
    return {
      key: experiment.key,
      version:
        version === null
          ? null
          : {
              version: version.version,
              status: version.status,
              startedAt: version.startedAt,
              hypothesis: version.definition.hypothesis,
              primaryMetricEvent: version.definition.primaryMetric.event,
            },
    }
  })

  const readiness = await resolveReadiness(membership.projectId, projectSlug, inputs)
  const rows = projectExperimentRows(inputs, readiness)

  return (
    <ProductShell projectSlug={projectSlug} section="ship" railActive={'experiments'}>
      <main>
        <PageHead
          title="Experiments"
          lede="A change shown to some people and not others, so the difference is the change and not the week."
        />
        <Answer>{experimentAnswer(rows)}</Answer>
        <ExperimentRows slug={projectSlug} rows={rows} />

        {/* ⚠️ An AUTHORING surface, which the approved design does not draw — the same class as the
            feature page's Targeting, History and Settings tabs, recorded as such in Sprint 4. It is
            behind a disclosure so the list is what the page opens with, and it is complete: nothing
            an owner could do here before, they cannot do here now. */}
        <details className="ds-gaps">
          <summary>
            {canManageExperiments(membership) ? 'Manage plans and versions' : 'Plans and versions'}
          </summary>
          <div className="ds-disclosure-body">
            <ExperimentManager
              slug={projectSlug}
              experiments={experiments}
              flags={flagRegistry.flags}
              bindings={bindings}
              canManage={canManageExperiments(membership)}
            />
          </div>
        </details>
      </main>
    </ProductShell>
  )
}

function canManageExperiments(membership: { projectId: string; role: string }): boolean {
  return isOwner({ projectId: membership.projectId, role: membership.role })
}

/**
 * Run the analysis for the rows that need one, bounded by the cap.
 *
 * ⚠️ **A failed or unavailable analysis leaves its key ABSENT from the map**, which
 * `projectExperimentRows` renders as `unresolved` rather than as "not ready". A read that did not
 * answer must never look like an answer — the same rule `getProjectOutcome` follows for its
 * `unavailable` flag, and the reason this returns a `Map` rather than a `Record<string, boolean>`
 * with a default.
 */
async function resolveReadiness(
  projectId: string,
  projectSlug: string,
  inputs: ExperimentListInput[]
): Promise<Map<string, boolean>> {
  const candidates = readinessCandidates(inputs)
  const versionOf = new Map(inputs.map((input) => [input.key, input.version?.version ?? null]))
  const resolved = await Promise.all(
    candidates.map(async (key): Promise<[string, boolean] | null> => {
      const version = versionOf.get(key)
      if (!version) return null
      const parsed = parseExperimentAnalysisRequest({ version })
      if (!parsed.ok) return null
      const result = await getExperimentAnalysisByProjectId(
        projectId,
        projectSlug,
        key,
        parsed.request
      ).catch(() => null)
      if (!result || !result.ok) return null
      return [key, result.analysis.decisionReady]
    })
  )
  return new Map(resolved.filter((entry): entry is [string, boolean] => entry !== null))
}
