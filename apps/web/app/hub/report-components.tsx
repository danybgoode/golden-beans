/** @jsxImportSource react */
// Pragma: a no-op under Next (react/jsx-runtime is its default) and required by the test rail —
// Playwright's transform pins its own jsx runtime, whose elements react-dom/server refuses to
// render. Same line, same reason, in app/hub/hub-components.tsx.
import { isHonest, type MetricRow, type NotInstrumentedRow, type PodReportView } from '@/lib/pod-report-view'
import { lensPolicy, type PodReportLens } from '@/lib/pod-report-lens'
import type { OutcomeSection } from '@/lib/pod-outcome'
import type { Freshness } from '@/lib/hub-freshness'
import { FreshnessStamp } from './hub-components'
import styles from './hub.module.css'

// pod-report · Sprint 2.5c — everything the Pod Report surface renders, kept OUT of page.tsx.
//
// Same reason hub-components.tsx exists, one step further: page.tsx has to import
// `requireDashboardAccess` and `getPodReport`, both of which pull in `server-only` and a Supabase
// client, so a spec can never import it. This file imports only pure modules, which is what lets
// e2e/pod-report-surface.spec.tsx render the real components with react-dom/server and assert on
// the real markup — instead of asserting over HTTP against a shared tenant whose latest artifact
// any other spec (or any developer's `--push`) can change underneath it. Report artifacts are
// append-only and latest-wins, so an HTTP-only suite here would be permanently racy.
//
// ── The rule the whole file is arranged around ────────────────────────────────────────────────
// Decision 4 of the epic: speed is never rendered alone. `PodReportBody` owns the `isHonest` guard
// AND the speed/gaps pairing, so there is exactly one component that can put numbers on a screen
// and it physically cannot do it without the gaps beside them. A page that forgot to check would
// have to reimplement this file to render anything at all.

/**
 * Where an evidence pointer resolves to a real, openable object.
 *
 * Keyed by the artifact's own `source.repo`, and deliberately a closed map: a repo we have no
 * mapping for renders its pointer as TEXT rather than as a guessed URL. A link that 404s is worse
 * than no link on a page whose entire claim is "follow the pointer and check it yourself".
 */
const REPO_PR_BASE: Record<string, string> = {
  // The dogfood dataset. `source.repo` is the checkout's directory name; the GitHub remote behind
  // it is danybgoode/miyagi-product-management (medusa-bonsai is the working name).
  'medusa-bonsai': 'https://github.com/danybgoode/miyagi-product-management/pull/',
}

/**
 * A URL for an evidence pointer, or null when it does not resolve to one.
 *
 * Only `pr` pointers with a whole-number ref resolve. The computation legitimately emits `pr` rows
 * whose ref is a COMPOSITE ("6+7", for two overlapping PR lifetimes) — those describe a
 * relationship between two objects and there is no single page to open, so they stay text.
 */
export function evidenceHref(
  pointerType: string,
  ref: string | number,
  repo: string | undefined
): string | null {
  if (pointerType !== 'pr') return null
  const base = repo ? REPO_PR_BASE[repo] : undefined
  if (!base) return null
  const n = typeof ref === 'number' ? ref : Number(ref)
  if (!Number.isInteger(n) || n <= 0 || String(ref).trim() !== String(n)) return null
  return `${base}${n}`
}

const STATUS_LABEL = {
  met: '✅ met',
  not_met: '✕ not met',
  not_instrumented: '◻ not instrumented',
} as const

const STATUS_CLASS = {
  met: styles.statusMet,
  not_met: styles.statusNotMet,
  not_instrumented: styles.statusNotInstrumented,
} as const

// ── Empty + refusal states ────────────────────────────────────────────────────────────────────

/** Mirrors EmptyHubState, for the Pod Report's own rail. Friendly, and it hands over the command. */
export function EmptyPodReportState({ projectSlug }: { projectSlug: string }) {
  return (
    <div className={styles.emptyState} data-testid="pod-report-empty-state">
      <p className={styles.emptyStateKicker}>No pod report pushed yet</p>
      <h2>Beans in the hopper, nothing roasted.</h2>
      <p>
        <code>{projectSlug}</code> has never pushed a <code>pod_report</code> artifact, so there is nothing
        to render — an empty hopper, not a broken page and not a row of zeros.
      </p>
      <p>Compute and push one from a checkout of the repo being measured:</p>
      <pre className={styles.emptyStateCmd}>
        <code>node scripts/pod-report.mjs --repo ~/dobby/medusa-bonsai --push</code>
      </pre>
      <p className="note">Once a push lands, this page renders it automatically — no redeploy needed.</p>
    </div>
  )
}

/**
 * The refusal.
 *
 * `isHonest()` returned false: the artifact carries numbers but lost its not-instrumented rows, its
 * caveats, or (for a ladder verdict) its version-pinned citation. Rendering the numbers anyway would
 * produce precisely the speed-only vendor-ware the epic exists to rule out, so the surface declines
 * and says which part is missing. Naming the missing part matters — "something is wrong" sends the
 * reader to a screenshot; this sends them to the artifact.
 */
export function RefusedPodReport({ view, projectSlug }: { view: PodReportView; projectSlug: string }) {
  const missing: string[] = []
  if (view.notInstrumented.length === 0) missing.push('the not-instrumented rows')
  if (view.caveats.length === 0) missing.push('the caveats')
  if (view.maturity?.verdict) {
    const l = view.maturity.ladder
    if (!l?.title || !l?.author || !l?.date) missing.push('the version-pinned ladder citation')
  }

  return (
    <div className={styles.refuseCard} data-testid="pod-report-refused">
      <p className={styles.refuseKicker}>Refusing to render</p>
      <h2>This artifact’s caveats did not survive — refusing to render it as a report.</h2>
      <p>
        The latest <code>pod_report</code> artifact for <code>{projectSlug}</code> carries numbers but is
        missing {missing.length > 0 ? missing.join(' and ') : 'part of its honesty layer'}. A report that
        shows speed without what is <em>not</em> measured beside it is the thing this surface was built
        not to produce, so no number from this artifact is shown at all.
      </p>
      <p className="note">
        This is a data-integrity fault, not an empty state. Re-run the computation and push again — the
        stored artifact is immutable, so the fix is a new version, never an edit.
      </p>
    </div>
  )
}

// ── Metrics ───────────────────────────────────────────────────────────────────────────────────

function BenchmarkLink({
  benchmarkId,
  benchmarks,
}: {
  benchmarkId?: string
  benchmarks: PodReportView['benchmarks']
}) {
  const bench = benchmarkId ? benchmarks.find((b) => b.id === benchmarkId) : undefined
  if (!bench) return null
  return (
    <a className={styles.benchLink} href={bench.url} target="_blank" rel="noreferrer">
      read against: {bench.label} ↗
    </a>
  )
}

/**
 * A metrics table — a real `<table>`, with a column header per column and a row header per metric.
 *
 * The third column is not optional and is not a tooltip. Story 2.3's acceptance is that the reading
 * arrives WITH the number; a hover would make the qualification something a reader can decline, and
 * a skeptical PM skimming a shared link never hovers anything.
 */
export function MetricTable({
  caption,
  rows,
  benchmarks,
}: {
  caption: string
  rows: MetricRow[]
  benchmarks: PodReportView['benchmarks']
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.metricTable}>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col">Reading</th>
            <th scope="col">What it means</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} data-metric={row.key}>
              <th scope="row" className={styles.metricName}>
                {row.label}
                {row.isProxy && <span className={styles.proxyTag}>proxy</span>}
              </th>
              <td className={row.value === null ? styles.metricNull : styles.metricValue}>
                {row.value ?? 'not measured'}
              </td>
              <td className={styles.metricRead}>
                {row.interpretation ? (
                  row.interpretation
                ) : row.value !== null ? (
                  // A number with no reading attached is the one thing this page must never print
                  // bare. The computation owns interpretations and did not supply one for this row
                  // (epic throughput, at the time of writing), so the renderer states THAT rather
                  // than inventing a sentence the computation never stood behind.
                  <span className={styles.uninterpreted}>
                    The computation attached no reading to this number. Take it as a raw count over the
                    measurement window — read it against the caveats and the not-instrumented rows on
                    this page, never on its own.
                  </span>
                ) : null}
                <BenchmarkLink benchmarkId={row.benchmarkId} benchmarks={benchmarks} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The not-instrumented panel — the tasting-note treatment, never fine print.
 *
 * Every row names the guardrail that would close it, which is the epic's whole thesis: the gaps are
 * the upsell. Styled as a deliberate section beside the numbers (see hub.module.css `.pairing`), so
 * a reader who never scrolls past the first screen has still seen what is not measured.
 */
export function NotInstrumentedPanel({
  heading,
  intro,
  rows,
  testId,
}: {
  heading: string
  intro: string
  rows: NotInstrumentedRow[]
  testId: string
}) {
  if (rows.length === 0) return null
  return (
    <aside className={styles.gapPanel} data-testid={testId} aria-label={heading}>
      <h3 className={styles.gapHeading}>{heading}</h3>
      <p className={styles.gapIntro}>{intro}</p>
      <ul className={styles.gapList}>
        {rows.map((row) => (
          <li key={row.key} className={styles.gapItem} data-gap={row.key}>
            <p className={styles.gapLabel}>
              {row.label}
              <span className={styles.gapStamp}>not instrumented</span>
            </p>
            <p className={styles.gapReason}>{row.reason}</p>
            <p className={styles.gapGuardrail}>
              <b>What would close it:</b> {row.guardrail}
            </p>
          </li>
        ))}
      </ul>
    </aside>
  )
}

// ── The maturity ladder ───────────────────────────────────────────────────────────────────────

type MaturityRowT = NonNullable<PodReportView['maturity']>['rows'][number]

function EvidenceCell({ row, repo }: { row: MaturityRowT; repo?: string }) {
  if (row.evidenceWithheld) {
    return (
      <span className={styles.evidenceWithheld} data-evidence="withheld">
        Withheld by this view’s lens. A pointer <strong>does</strong> exist for this row — this audience
        does not receive it. That is not the same as no evidence.
      </span>
    )
  }
  if (!row.evidence) {
    return (
      <span className={styles.evidenceNone} data-evidence="none">
        {row.reason ?? 'No evidence pointer — nothing is claimed for this criterion.'}
      </span>
    )
  }

  const href = evidenceHref(row.evidence.pointerType, row.evidence.ref, repo)
  const label = `${row.evidence.pointerType} ${row.evidence.ref}`
  return (
    <span data-evidence={href ? 'link' : 'text'}>
      {href ? (
        <a className={styles.evidencePointer} href={href} target="_blank" rel="noreferrer">
          PR #{row.evidence.ref} ↗
        </a>
      ) : (
        <span className={styles.evidencePointer}>{label}</span>
      )}
      {row.evidence.detail && <span className={styles.evidenceDetail}>{row.evidence.detail}</span>}
    </span>
  )
}

/**
 * The ladder.
 *
 * The verdict card renders the step AND the not-instrumented count inside one element, at the same
 * type size, with a sentence saying why they belong together. Story 2.4's acceptance ("the
 * not-instrumented count is visible wherever the verdict is, including the investor lens") is met
 * by there being no markup path that emits one without the other.
 */
export function MaturityLadder({
  maturity,
  repo,
  showRows,
}: {
  maturity: NonNullable<PodReportView['maturity']>
  repo?: string
  showRows: boolean
}) {
  const { verdict, ladder, rows, notInstrumented } = maturity

  return (
    <section className={styles.reportSection} aria-labelledby="maturity-heading">
      <h2 className={styles.reportHeading} id="maturity-heading">
        Where this pod sits on the ladder
      </h2>
      <p className={styles.reportLede}>
        Scored criterion by criterion against a published external scale, from this repository’s own git
        and pull-request history. No self-declared answers: what cannot be derived is marked not
        instrumented rather than assumed.
      </p>

      {verdict && (
        <div className={styles.verdictCard} data-testid="maturity-verdict">
          <div className={styles.verdictRow}>
            <span className={styles.verdictCell}>
              <b className={styles.verdictBig}>
                Step {verdict.step} — {verdict.stepLabel}
              </b>
              <span className={styles.verdictCellLabel}>the verdict</span>
            </span>
            <span className={styles.verdictCell}>
              <b className={styles.verdictBig}>
                {verdict.metCriteria} of {verdict.totalCriteria}
              </b>
              <span className={styles.verdictCellLabel}>criteria met with evidence</span>
            </span>
            <span className={styles.verdictCell}>
              <b className={`${styles.verdictBig} ${styles.verdictBigGap}`} data-testid="verdict-gaps">
                {verdict.notInstrumentedCount} not instrumented
              </b>
              <span className={styles.verdictCellLabel}>things this scale asks about that we cannot measure</span>
            </span>
          </div>
          <p className={styles.verdictPairNote}>
            These two numbers are inseparable by design. A step is only as meaningful as the share of the
            ladder we could actually observe, so the coverage gap is rendered beside the score — for every
            audience, including the investor view.
          </p>
          {ladder?.title && (
            <p className={styles.ladderCite} data-testid="ladder-citation">
              Scored against <b>{ladder.title}</b> — {ladder.author}, {ladder.date}
              {ladder.source ? <> · source: {ladder.source}</> : null}
              <br />
              Version-pinned on purpose: an old report stays interpretable against the ladder it was
              scored on. Cited and linked, never republished wholesale.
            </p>
          )}
        </div>
      )}

      {showRows && rows.length > 0 && (
        <div className={styles.tableWrap} style={{ marginTop: 20 }}>
          <table className={styles.ladderTable}>
            <caption>Criterion by criterion, with the object you can go and check</caption>
            <thead>
              <tr>
                <th scope="col">Criterion</th>
                <th scope="col">Step</th>
                <th scope="col">Status</th>
                <th scope="col">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} data-criterion={row.id}>
                  <th scope="row" className={styles.critName}>
                    {row.criterion}
                    {row.isProxy && <span className={styles.proxyTag}>proxy</span>}
                    {row.proxyNote && <span className={styles.critProxy}>{row.proxyNote}</span>}
                  </th>
                  <td className={styles.critStep}>{row.ladderStep}</td>
                  <td className={`${styles.critStatus} ${STATUS_CLASS[row.status]}`} data-status={row.status}>
                    {STATUS_LABEL[row.status]}
                  </td>
                  <td className={styles.evidenceCell}>
                    <EvidenceCell row={row} repo={repo} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!showRows && rows.length === 0 && (
        <p className={styles.emptyStateInline} style={{ marginTop: 14 }}>
          Criterion-by-criterion detail is not part of this view. The verdict and its coverage gap above
          are shown in full.
        </p>
      )}

      <div style={{ marginTop: 20 }}>
        <NotInstrumentedPanel
          testId="maturity-not-instrumented"
          heading="What this ladder asks about that git cannot answer"
          intro="Each of these is a real question on the published scale that leaves no trace in commits or pull requests. Named rather than skipped — and each names the guardrail that would make it measurable."
          rows={notInstrumented}
        />
      </div>
    </section>
  )
}

// ── The outcome layer ─────────────────────────────────────────────────────────────────────────

function pct(v: number | null): string {
  return v === null ? '—' : `${Math.round(v * 100)}%`
}

/** "Shipped AND it mattered" — or the honest admission that we cannot tell yet. */
export function OutcomeSectionView({ outcome }: { outcome: OutcomeSection }) {
  return (
    <section className={styles.reportSection} aria-labelledby="outcome-heading">
      <h2 className={styles.reportHeading} id="outcome-heading">
        Shipped — and did it matter?
      </h2>
      <p className={styles.reportLede}>
        Delivery metrics say “shipped fast”. This half says whether anything moved, read live from the
        engine’s own funnel and North-Star queries at the moment you loaded this page — not frozen into
        the artifact at computation time.
      </p>

      {/* THREE states, not two — cross-review (Agy, PR #33). "Could not read" is not "nothing to
          read": the first is an incident, the second is a truthful sales answer about a pod that has
          not wired the engine to its product yet. Rendering an outage as the second is how a broken
          dashboard reassures you (Roadmap/LEARNINGS.md, the zero that pages nobody). */}
      {outcome.unavailable ? (
        <p className={styles.emptyStateInline} data-testid="outcome-unavailable">
          <strong>The outcome layer could not be read just now.</strong> This is a failure to reach the
          engine’s own funnel queries — <em>not</em> a report of zero adoption, and not “not
          instrumented” either. The delivery half above is unaffected and still accurate; this half is
          simply missing, and says so rather than showing you a zero.
        </p>
      ) : outcome.rows.length === 0 ? (
        <p className={styles.emptyStateInline} data-testid="outcome-empty">
          No features are registered for <code>{outcome.tenant}</code>, so there is no adoption to read.
          That is “not instrumented”, not zero adoption — the two look nothing alike and must not render
          alike.
        </p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.metricTable}>
            <caption>Registry-declared funnel per feature (TARS)</caption>
            <thead>
              <tr>
                <th scope="col">Feature</th>
                <th scope="col">Targeted</th>
                <th scope="col">Adopted</th>
                <th scope="col">Retained</th>
                <th scope="col">Rates &amp; caveat</th>
              </tr>
            </thead>
            <tbody>
              {outcome.rows.map((row) => (
                <tr key={row.featureKey} data-feature={row.featureKey}>
                  <th scope="row" className={styles.metricName}>
                    {row.featureKey}
                  </th>
                  <td className={row.tars ? styles.metricValue : styles.metricNull}>
                    {row.tars ? row.tars.targeted : 'unavailable'}
                  </td>
                  <td className={row.tars ? styles.metricValue : styles.metricNull}>
                    {row.tars ? row.tars.adopted : 'unavailable'}
                  </td>
                  <td className={row.tars ? styles.metricValue : styles.metricNull}>
                    {row.tars ? row.tars.retained : 'unavailable'}
                  </td>
                  <td className={styles.metricRead}>
                    adoption {pct(row.adoptionRate)} · retention {pct(row.retentionRate)}
                    {row.caveat && <span className={styles.outcomeCaveat}>{row.caveat}</span>}
                    <span className={styles.outcomeCaveat}>Read via {row.provenance}.</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {outcome.northStar && (
        <div className={styles.northStarCard} data-testid="outcome-north-star">
          <h3>
            North Star —{' '}
            {outcome.northStar.unavailable
              ? 'could not be read'
              : (outcome.northStar.metric ?? 'not registered')}
          </h3>
          <p>
            {/* A null count means the count QUERY failed, which must not print as "0 leading inputs
                registered" — that asserts an absence on the strength of an answer we never got. */}
            {outcome.northStar.inputCount === null ? (
              <span className={styles.metricNull}>input count unavailable</span>
            ) : (
              <>
                <b className="data">{outcome.northStar.inputCount}</b> leading input
                {outcome.northStar.inputCount === 1 ? '' : 's'} registered
              </>
            )}{' '}
            ·{' '}
            {outcome.northStar.latestValue === null ? (
              <span className={styles.metricNull}>no value recorded</span>
            ) : (
              <b className="data">{outcome.northStar.latestValue}</b>
            )}
          </p>
          {outcome.northStar.caveat && <p className="note">{outcome.northStar.caveat}</p>}
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <NotInstrumentedPanel
          testId="outcome-not-instrumented"
          heading="Outcome questions this engine cannot answer yet"
          intro="The commercially interesting half, and the honest state of it. Each line is a guardrail a pods engagement installs, not a shortfall to hide."
          rows={outcome.notInstrumented}
        />
      </div>
    </section>
  )
}

// ── The whole surface ─────────────────────────────────────────────────────────────────────────

/**
 * The Pod Report body — the single component allowed to put a number on this surface.
 *
 * Order is load-bearing, not aesthetic:
 *   1. the agent window (the frame device — an agent asking the engine, getting the real answer)
 *   2. the caveats, ABOVE every number
 *   3. speed and the not-instrumented rows, side by side in one section
 *   4. composition · the ladder · the outcome half
 *   5. the benchmarks, each cited and linked
 * A reader who stops after the first screen has seen the frame, the caveats, and the gaps.
 */
export function PodReportBody({
  projectSlug,
  view,
  outcome,
  lens,
  artifactVersion,
  freshness,
}: {
  projectSlug: string
  view: PodReportView
  outcome: OutcomeSection
  lens: PodReportLens
  artifactVersion: number
  freshness: Freshness
}) {
  // FIRST, before anything else can render a number. isHonest() returns true for an empty view, so
  // an empty artifact still reaches its own (harmless) empty state below rather than the refusal.
  if (!isHonest(view)) return <RefusedPodReport view={view} projectSlug={projectSlug} />

  const policy = lensPolicy(lens)
  const verdict = view.maturity?.verdict ?? null

  return (
    <>
      {/* The agent-window frame device (references/design-direction.md), same mechanic as the
          journey and horizon views: an agent asks the engine for the pod's numbers and the real,
          current answer comes back. The headline it prints is deliberately the verdict AND its
          coverage gap — the pairing starts at the top of the page, not in the ladder section. */}
      <div className="agent-win">
        <div className="agent-bar">
          <span className="agent-dots">
            <span></span>
            <span></span>
            <span></span>
          </span>
          <span>growth-engine · pod report</span>
          <span className="agent-chip">{freshness.tone === 'stale' ? '● stale' : '● live'}</span>
        </div>
        <div className="agent-body">
          <p className="you">
            <b>you ▸</b> how is the {projectSlug} pod actually performing?
          </p>
          <div className="tool">
            <b>⚙ getPodReport</b> report_artifacts · kind=pod_report · v{artifactVersion} · lens={lens}
          </div>
          {verdict ? (
            <p data-testid="agent-headline">
              Operates at <b className="data">step {verdict.step}</b> — {verdict.stepLabel} ·{' '}
              <b className="data">{verdict.metCriteria}</b>/<b className="data">{verdict.totalCriteria}</b>{' '}
              criteria met with evidence · <b className="data">{verdict.notInstrumentedCount}</b> not
              instrumented
            </p>
          ) : (
            <p data-testid="agent-headline">
              This artifact carries no ladder verdict — the delivery numbers below stand on their own.
            </p>
          )}
          {policy.showSourceCounts && Object.keys(view.source).length > 0 && (
            <ul className={styles.sourceStrip} aria-label="Measurement window">
              {view.source.repo && (
                <li className={styles.sourceItem}>
                  repo <b>{view.source.repo}</b>
                </li>
              )}
              {view.source.commits !== undefined && (
                <li className={styles.sourceItem}>
                  <b>{view.source.commits}</b> commits
                </li>
              )}
              {view.source.epics !== undefined && (
                <li className={styles.sourceItem}>
                  <b>{view.source.epics}</b> epics
                </li>
              )}
              {view.source.mergedPrs !== undefined && (
                <li className={styles.sourceItem}>
                  <b>{view.source.mergedPrs}</b> merged PRs
                </li>
              )}
              {view.source.windowDays !== undefined && (
                <li className={styles.sourceItem}>
                  over <b>{view.source.windowDays}</b> days
                </li>
              )}
            </ul>
          )}
          <FreshnessStamp freshness={freshness} />
          <p className="note">{policy.audienceNote}</p>
        </div>
      </div>

      {/* Caveats sit ABOVE the numbers. Sprint 2.5c's acceptance is that they are on the page and
          not in a footnote; putting them first makes that true for a reader who never scrolls. */}
      {view.caveats.length > 0 && (
        <div className={styles.caveatBand} data-testid="pod-report-caveats">
          <p className={styles.caveatBandTitle}>Read these first</p>
          <ul className={styles.caveatList}>
            {view.caveats.map((caveat) => (
              <li key={caveat} className={styles.caveatItem}>
                {caveat}
              </li>
            ))}
          </ul>
        </div>
      )}

      {view.empty ? (
        <p className={styles.emptyStateInline} data-testid="pod-report-no-delivery" style={{ marginTop: 24 }}>
          The latest pushed artifact carries no delivery section, so there are no delivery numbers to
          render. Re-run <code>scripts/pod-report.mjs</code> against a real checkout and push again.
        </p>
      ) : (
        <>
          {/* ── Decision 4, as layout ──────────────────────────────────────────────────────────
              The gaps are a COLUMN of the speed section, not a block underneath it. Two grid
              children in one <section>: the table cannot be scrolled past without the panel that
              qualifies it entering the viewport at the same time. */}
          <section className={styles.reportSection} aria-labelledby="speed-heading">
            <h2 className={styles.reportHeading} id="speed-heading">
              How fast — and what that does <em>not</em> tell you
            </h2>
            <p className={styles.reportLede}>
              Every number here is computed from this repository’s own git and pull-request history.
              Nothing is estimated, and nothing on the right-hand side is an apology: those are the
              questions this dataset cannot answer, each with the guardrail that would close it.
            </p>
            <div className={styles.pairing}>
              <MetricTable
                caption="Delivery — computed, not claimed"
                rows={view.speed}
                benchmarks={view.benchmarks}
              />
              <NotInstrumentedPanel
                testId="delivery-not-instrumented"
                heading="Not instrumented"
                intro="Absent because the data cannot support them — never because they are zero. A change-failure rate computed here would read 0% and mean “not measured”, which is the exact dishonesty this report exists to avoid."
                rows={view.notInstrumented}
              />
            </div>
          </section>

          {policy.showComposition && view.composition.length > 0 && (
            <section className={styles.reportSection} aria-labelledby="composition-heading">
              <h2 className={styles.reportHeading} id="composition-heading">
                Who wrote it
              </h2>
              <p className={styles.reportLede}>
                A composition fact about how the work was produced. It is not a productivity claim and
                cannot be read as one — a co-author trailer records participation, never contribution.
              </p>
              <MetricTable
                caption="Agent co-authorship by month"
                rows={view.composition}
                benchmarks={view.benchmarks}
              />
            </section>
          )}
        </>
      )}

      {view.maturity && (
        <MaturityLadder
          maturity={view.maturity}
          repo={view.source.repo}
          showRows={policy.showMaturityRows}
        />
      )}

      <OutcomeSectionView outcome={outcome} />

      {view.benchmarks.length > 0 && (
        <section className={styles.reportSection} aria-labelledby="benchmarks-heading">
          <h2 className={styles.reportHeading} id="benchmarks-heading">
            The benchmarks these numbers are read against
          </h2>
          <p className={styles.reportLede}>
            Our side is computed, not claimed. Their side is cited and linked, never republished
            wholesale — follow the link for the published figures.
          </p>
          <ul className={styles.benchList} data-testid="pod-report-benchmarks">
            {view.benchmarks.map((b) => (
              <li key={b.id} className={styles.benchItem}>
                <a href={b.url} target="_blank" rel="noreferrer">
                  {b.label} ↗
                </a>
                <p className={styles.benchNote}>{b.note}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
