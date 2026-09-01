import { ProductShell } from '@/components/product/ProductShell'
import { requireProjectMembership } from '@/lib/dashboard-auth'
import {
  isResilienceScenariosEnabled,
  isScenarioAuthoringEnabled,
  isSecuritySimulationsEnabled,
} from '@/lib/flags'
import { getScenarioDashboardView } from '@/lib/scenario-dashboard'
import {
  projectScenarioRows,
  scenarioAnswer,
  summariseScenarios,
  type ScenarioDefinitionInput,
} from '@/lib/scenario-list-view'
import { ScenarioWorkspace } from './scenario-workspace'
import { ScenarioRows } from './scenario-rows'
import { Answer, PageHead, Tile } from '@/design-system/primitives'

// design-system-rails · Sprint 5, Story 5.6 — reference state `measure-scenarios`.
//
// ── Audit §6.4 is the finding this closes, and §7 P1 is why it is here ────────────────────────
// *"Today this is a read-only log where the PRD describes a tool."* The page opened on a workspace
// of every run, every security result, every impact snapshot, every breaker policy and every trip —
// nine tables, chronological, with no answer at the top. It now opens on the question a person
// arrives with: what held, what failed, and what has never been run.
//
// ⚠️ **An untested control is an assumption**, and that is the one figure this page adds that the
// old one could not show: `neverRun` has its own tile and its own row state, because a drill nobody
// has run is not a passing drill. `splitGeometry` refuses to draw its 0/0 split for the same
// reason — "everything held" over nothing sent is unrepresentable here, not merely avoided.
//
// The workspace is kept in full behind a disclosure. It is the operating surface for a live drill —
// evidence, breaker policies, trips — and it has no other home.
export const dynamic = 'force-dynamic'

export default async function ScenariosPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params
  const membership = await requireProjectMembership(projectSlug)
  const view = await getScenarioDashboardView(membership.projectId)
  const capabilities = {
    resilience: isResilienceScenariosEnabled(),
    security: isSecuritySimulationsEnabled(),
  }
  const canAuthor =
    membership.role === 'owner' &&
    isScenarioAuthoringEnabled() &&
    (capabilities.resilience || capabilities.security)

  const definitions: ScenarioDefinitionInput[] = view.definitions.map((entry) => ({
    scenarioKey: entry.scenarioKey,
    version: entry.version,
    kind: entry.definition.kind,
    targetKey: entry.definition.targetKey,
    cohort: entry.definition.cohort,
    environment: entry.definition.environment,
  }))
  const rows = projectScenarioRows(definitions, view.runs)
  const summary = summariseScenarios(rows)

  return (
    <ProductShell projectSlug={projectSlug} section="measure" railActive={'scenarios'}>
      <main>
        <PageHead
          title="Scenarios &amp; drills"
          lede="Break something on purpose, in a controlled way, and keep the evidence of what held."
        />
        <Answer>{scenarioAnswer(rows)}</Answer>

        {rows.length === 0 ? null : (
          <div className="ds-tiles">
            <Tile
              label="Drills defined"
              value={String(summary.defined)}
              detail={`${summary.resilience} resilience · ${summary.security} security`}
            />
            <Tile
              label="Never run"
              value={String(summary.neverRun)}
              detail="no evidence either way"
              tone={summary.neverRun > 0 ? 'warn' : undefined}
            />
            <Tile
              label="Requests replayed"
              value={summary.requestsReplayed.toLocaleString('en-US')}
              detail="across the last run of each drill"
            />
            {/* ⚠️ `heldRate` is `null` when nothing was sent, and the tile renders the SENTENCE
                rather than 100%. A green "100% held" over a project that has tested nothing is the
                most dangerous reading this page could produce. */}
            <Tile
              label="Held"
              value={summary.heldRate === null ? null : `${(summary.heldRate * 100).toFixed(1)}%`}
              absent="Nothing has been replayed, so there is no rate to compute — not a 100% pass."
              // ⚠️ The detail is omitted in the absent case, or the tile reads
              // "…not a 100% pass. of everything sent" — a caption for a figure that is not there.
              detail={summary.heldRate === null ? undefined : 'of everything sent'}
              tone={summary.heldRate === 1 ? 'up' : undefined}
            />
          </div>
        )}

        <ScenarioRows rows={rows} />

        {/* The operating surface — evidence, security results, impact snapshots, breaker policies
            and trips. The approved state draws none of it and it has no other home, so it is one
            keystroke below the answer rather than above it. */}
        <details className="ds-gaps">
          <summary>Evidence, breakers and the full run history</summary>
          <div className="ds-disclosure-body">
            <ScenarioWorkspace
              projectSlug={projectSlug}
              view={view}
              canAuthor={canAuthor}
              capabilities={capabilities}
            />
          </div>
        </details>
      </main>
    </ProductShell>
  )
}
