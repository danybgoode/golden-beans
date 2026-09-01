/** @jsxImportSource react */
// Pragma: a no-op under Next (react/jsx-runtime is its default) and required by the test rail —
// Playwright's transform pins its own jsx runtime, whose elements react-dom/server refuses to
// render. Same line, same reason, in app/hub/hub-components.tsx.
import { isHonest, type MetricRow, type NotInstrumentedRow, type PodReportView } from '@/lib/pod-report-view'
import { lensPolicy, type PodReportLens } from '@/lib/pod-report-lens'
import type { OutcomeSection } from '@/lib/pod-outcome'
import type { Freshness } from '@/lib/hub-freshness'
import { HubProvenance } from './hub-components'
import { Answer, Callout, Empty, PageHead } from '@/design-system/primitives'
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
// ── design-system-rails · Sprint 6, Story 6.3 — HOW MUCH OF THIS MOVED, AND WHAT DID NOT ──────
//
// The report's SHELL is on the design system: the page head, the provenance stamp, the headline
// answer, the caveats band, every section's heading and lede, the empty state, the refusal, and the
// benchmark list. `hub.module.css` shrinks to the EVIDENCE TABLES — delivery metrics, the maturity
// ladder, the not-instrumented panels and the outcome funnel — and that residue is **kept
// deliberately**, which Story 6.3's acceptance allows in as many words ("retired into the system or
// explicitly kept with a written reason").
//
// The reason, stated once so nobody has to re-derive it:
//
//   **The approved design has no state for any of it.** `hub-report` in
//   `console-prototype.html` is PROSE — a provenance stamp, a `.doc` block and a callout. The real
//   report is a dense evidence surface the prototype never drew, so porting its tables would mean
//   inventing roughly forty visual decisions nobody approved, deep inside the sprint that closes an
//   epic. That is the exact shape the epic amended itself to forbid: *"a builder shows twenty-three
//   unreviewed screens deep into an expensive run, and the answer is no."*
//
// It is recorded where a number can see it, not only here: both `/hub/[projectSlug]/report` and
// `/s/[token]` carry a `deferred` entry in `route-manifest.ts` with an owner and a decay date, and
// `route-manifest.test.ts` fails once that date passes.
//
// ⚠️ **`hub.module.css` is a CSS MODULE, which is why the residue is safe rather than merely
// tolerated.** Its class names are hashed per file, so the collision hazard D3 exists to prevent —
// landing rules reaching the console through a shared `.tag` or `.note` — cannot happen here in
// either direction. What remains is a second set of visual DECISIONS, not a second cascade.
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
  met: 'met',
  not_met: 'not met',
  not_instrumented: 'not instrumented',
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
    <div className="ds-listcard" data-testid="pod-report-empty-state">
      <Empty
        title="No pod report pushed yet"
        body={
          <>
            <code className="ds-mono">{projectSlug}</code> has never pushed a{' '}
            <code className="ds-mono">pod_report</code> artifact, so there is nothing to render — an unplanted
            plot, not a broken page and not a row of zeros. Compute and push one from a checkout of the repo
            being measured with{' '}
            <code className="ds-mono">node scripts/pod-report.mjs --repo &lt;checkout&gt; --push</code>, and
            this page renders it automatically. No redeploy needed.
          </>
        }
      />
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
    <div className="ds-card" data-testid="pod-report-refused">
      <span className="ds-label">Refusing to render</span>
      <h2 className="ds-refuse-title">
        This artifact’s caveats did not survive — refusing to render it as a report.
      </h2>
      <p className="ds-lede">
        The latest <code>pod_report</code> artifact for <code>{projectSlug}</code> carries numbers but is
        missing {missing.length > 0 ? missing.join(' and ') : 'part of its honesty layer'}. A report that
        shows speed without what is <em>not</em> measured beside it is the thing this surface was built not to
        produce, so no number from this artifact is shown at all.
      </p>
      <Callout tone="warn">
        This is a data-integrity fault, not an empty state. Re-run the computation and push again — the stored
        artifact is immutable, so the fix is a new version, never an edit.
      </Callout>
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
      read against: {bench.label}
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
                    measurement window — read it against the caveats and the not-instrumented rows on this
                    page, never on its own.
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
        Withheld by this view’s lens. A pointer <strong>does</strong> exist for this row — this audience does
        not receive it. That is not the same as no evidence.
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
          PR #{row.evidence.ref}
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
    <section className="ds-report-section" aria-labelledby="maturity-heading">
      <h2 className="ds-report-heading" id="maturity-heading">
        Where this pod sits on the ladder
      </h2>
      <p className="ds-lede">
        Scored criterion by criterion against a published external scale, from this repository’s own git and
        pull-request history. No self-declared answers: what cannot be derived is marked not instrumented
        rather than assumed.
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
              <span className={styles.verdictCellLabel}>
                things this scale asks about that we cannot measure
              </span>
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
              Version-pinned on purpose: an old report stays interpretable against the ladder it was scored
              on. Cited and linked, never republished wholesale.
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
        <p className="ds-hint">
          Criterion-by-criterion detail is not part of this view. The verdict and its coverage gap above are
          shown in full.
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
    <section className="ds-report-section" aria-labelledby="outcome-heading">
      <h2 className="ds-report-heading" id="outcome-heading">
        Shipped — and did it matter?
      </h2>
      <p className="ds-lede">
        Delivery metrics say “shipped fast”. This half says whether anything moved, read live from the
        engine’s own funnel and North-Star queries at the moment you loaded this page — not frozen into the
        artifact at computation time.
      </p>

      {/* THREE states, not two — cross-review (Agy, PR #33). "Could not read" is not "nothing to
          read": the first is an incident, the second is a truthful sales answer about a pod that has
          not wired the engine to its product yet. Rendering an outage as the second is how a broken
          dashboard reassures you (Roadmap/LEARNINGS.md, the zero that pages nobody). */}
      {outcome.unavailable ? (
        <p className="ds-hint" data-testid="outcome-unavailable">
          <strong>The outcome layer could not be read just now.</strong> This is a failure to reach the
          engine’s own funnel queries — <em>not</em> a report of zero adoption, and not “not instrumented”
          either. The delivery half above is unaffected and still accurate; this half is simply missing, and
          says so rather than showing you a zero.
        </p>
      ) : outcome.rows.length === 0 ? (
        <p className="ds-hint" data-testid="outcome-empty">
          No features are registered for <code>{outcome.tenant}</code>, so there is no adoption to read. That
          is “not instrumented”, not zero adoption — the two look nothing alike and must not render alike.
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
        <div className="ds-card" data-testid="outcome-north-star">
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
 * What the artifact was computed FROM, as one sentence for the provenance stamp.
 *
 * ⚠️ Lens-aware, and that is not cosmetic. `showSourceCounts` is false for the investor lens, which
 * is the policy `pod-report-lens.ts` owns — so this returns the honest generic phrase rather than a
 * count that lens is not entitled to. It replaced a `.sourceStrip` list that rendered the same
 * fields under the same condition; folding it into the stamp means one line says where the numbers
 * came from instead of two elements saying halves of it.
 */
function sourceSummary(view: PodReportView, policy: ReturnType<typeof lensPolicy>): string {
  if (!policy.showSourceCounts) return "the measured repository's own history"
  const parts: string[] = []
  if (view.source.repo) parts.push(view.source.repo)
  if (view.source.commits !== undefined) parts.push(`${view.source.commits} commits`)
  if (view.source.mergedPrs !== undefined) parts.push(`${view.source.mergedPrs} merged PRs`)
  if (view.source.epics !== undefined) parts.push(`${view.source.epics} epics`)
  if (view.source.windowDays !== undefined) parts.push(`${view.source.windowDays} days`)
  // An artifact whose source block is empty says so rather than rendering "from ." — the same rule
  // every absence on this page follows: name which nothing it is.
  return parts.length === 0 ? 'an artifact carrying no source block' : parts.join(' · ')
}

/**
 * The Pod Report body — the single component allowed to put a number on this surface.
 *
 * Order is load-bearing, not aesthetic:
 *   1. the page head, the provenance stamp and the one-sentence answer
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
      {/* ── The head, the stamp and the ANSWER ────────────────────────────────────────────────
          The `agent-win` device is gone with the rest of the hub's private chrome. What replaces it
          is the approved shape every hub surface now opens with: a page head, one provenance line
          saying how stale this is and what it came from, and a single-sentence answer.

          The answer is deliberately the verdict AND its coverage gap. The pairing starts at the TOP
          of the page, not down in the ladder section — a reader who never scrolls has still been
          told what is not measured. */}
      <PageHead
        title="Pod report"
        lede={`How the ${projectSlug} pod is actually performing, read from its own git and pull-request history.`}
      />
      <HubProvenance freshness={freshness} from={sourceSummary(view, policy)} version={artifactVersion}>
        <span className="ds-prov-sep" aria-hidden="true">
          ·
        </span>
        <span>
          lens <b>{lens}</b>
        </span>
      </HubProvenance>

      <Answer>
        <span data-testid="agent-headline">
          {verdict ? (
            <>
              Operates at <b>step {verdict.step}</b> — {verdict.stepLabel} · <b>{verdict.metCriteria}</b>/
              <b>{verdict.totalCriteria}</b> criteria met with evidence ·{' '}
              <b>{verdict.notInstrumentedCount}</b> not instrumented.
            </>
          ) : (
            <>This artifact carries no ladder verdict — the delivery numbers below stand on their own.</>
          )}
        </span>{' '}
        {policy.audienceNote}
      </Answer>

      {/* Caveats sit ABOVE the numbers. Sprint 2.5c's acceptance is that they are on the page and
          not in a footnote; putting them first makes that true for a reader who never scrolls. */}
      {view.caveats.length > 0 && (
        <div className="ds-caveats" data-testid="pod-report-caveats" role="note">
          <span className="ds-label">Read these first</span>
          <ul className="ds-doc-list">
            {view.caveats.map((caveat) => (
              <li key={caveat}>{caveat}</li>
            ))}
          </ul>
        </div>
      )}

      {view.empty ? (
        <p className="ds-hint" data-testid="pod-report-no-delivery">
          The latest pushed artifact carries no delivery section, so there are no delivery numbers to render.
          Re-run <code>scripts/pod-report.mjs</code> against a real checkout and push again.
        </p>
      ) : (
        <>
          {/* ── Decision 4, as layout ──────────────────────────────────────────────────────────
              The gaps are a COLUMN of the speed section, not a block underneath it. Two grid
              children in one <section>: the table cannot be scrolled past without the panel that
              qualifies it entering the viewport at the same time. */}
          <section className="ds-report-section" aria-labelledby="speed-heading">
            <h2 className="ds-report-heading" id="speed-heading">
              How fast — and what that does <em>not</em> tell you
            </h2>
            <p className="ds-lede">
              Every number here is computed from this repository’s own git and pull-request history. Nothing
              is estimated, and nothing on the right-hand side is an apology: those are the questions this
              dataset cannot answer, each with the guardrail that would close it.
            </p>
            <div className="ds-pairing">
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
            <section className="ds-report-section" aria-labelledby="composition-heading">
              <h2 className="ds-report-heading" id="composition-heading">
                Who wrote it
              </h2>
              <p className="ds-lede">
                A composition fact about how the work was produced. It is not a productivity claim and cannot
                be read as one — a co-author trailer records participation, never contribution.
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
        <MaturityLadder maturity={view.maturity} repo={view.source.repo} showRows={policy.showMaturityRows} />
      )}

      <OutcomeSectionView outcome={outcome} />

      {view.benchmarks.length > 0 && (
        <section className="ds-report-section" aria-labelledby="benchmarks-heading">
          <h2 className="ds-report-heading" id="benchmarks-heading">
            The benchmarks these numbers are read against
          </h2>
          <p className="ds-lede">
            Our side is computed, not claimed. Their side is cited and linked, never republished wholesale —
            follow the link for the published figures.
          </p>
          <ul className="ds-benchlist" data-testid="pod-report-benchmarks">
            {view.benchmarks.map((b) => (
              <li key={b.id} className="ds-benchitem">
                <a href={b.url} target="_blank" rel="noreferrer">
                  {b.label}
                </a>
                <p className="ds-hint">{b.note}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
