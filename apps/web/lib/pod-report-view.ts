// pod-report · Sprint 2, Story 2.3 — the read/derive seam for the Pod Report surface.
//
// No `server-only` or `next/*` imports, so the presentation decisions below are unit-testable
// without a server (Roadmap/LEARNINGS.md). The Supabase read reuses `lib/report-artifacts.ts`,
// which already returns `payload` and nothing derived.
//
// ── The one rule this file exists to enforce ──────────────────────────────────────────────────
// Speed is NEVER rendered without stability and honesty beside it. DORA-2025's own finding, and
// the epic's Decision 4: "the report that only shows speed is the vendor-ware our audience smells."
// So `buildPodReportView` returns metrics and gaps from the SAME call — a renderer physically
// cannot map over the numbers while forgetting the caveats, because they arrive together.

export type MetricRow = {
  key: string
  label: string
  /** Formatted for display, or null when there is no data. Null renders as "not measured", never 0. */
  value: string | null
  /** The honest reading — what the number does and does not mean. Always present when value is. */
  interpretation?: string
  /** Set when the figure is a stand-in for something we cannot measure directly. */
  isProxy?: boolean
  /** A published benchmark id this row may legitimately be read against, if any. */
  benchmarkId?: string
}

export type NotInstrumentedRow = {
  key: string
  label: string
  reason: string
  guardrail: string
}

/** One criterion on the published Steps-of-AI-Adoption ladder, as the page renders it. */
export type MaturityRow = {
  id: string
  criterion: string
  ladderStep: number
  status: 'met' | 'not_met' | 'not_instrumented'
  isProxy?: boolean
  /** Why this row is a proxy rather than proof. Survives every lens (lib/pod-report-lens.ts). */
  proxyNote?: string
  /** A pointer to a real, checkable object. Required for `met`; null when a lens withheld it. */
  evidence: { pointerType: string; ref: string | number; detail: string } | null
  /** True when the lens removed the pointer, so the page says so instead of implying none exists. */
  evidenceWithheld?: boolean
  reason?: string | null
}

export type MaturitySection = {
  ladder: { title?: string; author?: string; date?: string; source?: string } | null
  verdict: {
    step: number
    stepLabel: string
    metCriteria: number
    totalCriteria: number
    notInstrumentedCount: number
  } | null
  rows: MaturityRow[]
  notInstrumented: NotInstrumentedRow[]
}

export type PodReportView = {
  generatedAt: string | null
  source: { repo?: string; commits?: number; epics?: number; mergedPrs?: number; windowDays?: number }
  speed: MetricRow[]
  composition: MetricRow[]
  notInstrumented: NotInstrumentedRow[]
  benchmarks: Array<{ id: string; label: string; url: string; note: string }>
  caveats: string[]
  /**
   * Story 2.4's output. Null when the artifact predates the lens — an OLD artifact is immutable and
   * genuinely has no maturity section, which is a different fact from a lens that scored nothing.
   */
  maturity: MaturitySection | null
  /** True when the artifact is missing or unreadable — the page renders an empty state, not zeros. */
  empty: boolean
}

function hours(n: number | null | undefined): string | null {
  if (n === null || n === undefined) return null
  return n < 1 ? `${Math.round(n * 60)} min` : `${n} h`
}

function days(n: number | null | undefined): string | null {
  return n === null || n === undefined ? null : `${n} d`
}

/**
 * Shape a stored Pod Report artifact for rendering.
 *
 * Every caveat the computation attached travels through unchanged. This function is allowed to
 * FORMAT (0.16 → "10 min") and to GROUP, and is not allowed to drop an interpretation, a proxy flag
 * or a not-instrumented row — those are the parts that keep the artifact honest, and a renderer
 * that could omit them would make the computation's care pointless.
 */
/**
 * A loosely-typed JSON bag. The payload comes from an immutable artifact that may have been written
 * by an OLDER build, so its exact shape is genuinely not knowable at compile time — `unknown` with
 * narrowing at each read is the honest type, not `any`, which would silently disable checking for
 * every access below.
 */
type Json = Record<string, unknown>

const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {})
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

export function buildPodReportView(payload: unknown): PodReportView {
  const p = obj(payload)
  const delivery = obj(p.delivery)
  // Empty when `delivery` is absent OR is not an object. Cross-review caught the difference:
  // `{ delivery: "invalid" }` is truthy, so a plain `!p.delivery` reported the view as non-empty
  // while every metric resolved to null — a malformed payload slipping past the empty state and
  // rendering as a report with nothing in it.
  const empty = Object.keys(delivery).length === 0

  const cycle = obj(delivery.cycleTime)
  const lead = obj(delivery.epicLeadTime)
  const freq = obj(delivery.deployFrequency)
  const through = obj(delivery.epicThroughput)

  const speed: MetricRow[] = [
    {
      key: 'review_latency',
      label: 'Pull-request review latency (median)',
      value: hours(num(cycle.medianHours)),
      // Carried verbatim from the computation. This row's whole reason for existing honestly is
      // that it is NOT a delivery speed, and the computation is where that was established.
      interpretation: str(cycle.interpretation),
      // No benchmarkId: the computation marks it `comparableToDora: false`, so offering a benchmark
      // to read it against would re-introduce exactly the comparison that was ruled out.
    },
    {
      key: 'epic_lead_time',
      label: 'Epic lead time (median)',
      value: days(num(lead.medianDays)),
      interpretation: str(lead.interpretation),
      benchmarkId: 'dora-2025',
    },
    {
      key: 'deploy_frequency',
      label: 'Deploy frequency',
      value: num(freq.perWeek) === null ? null : `${num(freq.perWeek)} / week`,
      interpretation: str(freq.proxyNote),
      isProxy: freq.isProxy === true,
      benchmarkId: 'dora-2025',
    },
    {
      key: 'epic_throughput',
      label: 'Epic throughput',
      value: num(through.perWeek) === null ? null : `${num(through.perWeek)} / week`,
      benchmarkId: 'linearb-2026',
    },
  ]

  const authorship = Array.isArray(delivery.authorship) ? delivery.authorship : []
  const composition: MetricRow[] = authorship.map((raw: unknown) => {
    const row = obj(raw)
    const share = num(row.agentShare)
    return {
      key: `authorship_${String(row.month ?? 'unknown')}`,
      label: `Agent-co-authored commits — ${String(row.month ?? 'unknown')}`,
      value: share === null ? null : `${Math.round(share * 100)}%`,
      // A composition fact, never a productivity claim. The trailer records who co-authored; it does
      // not record who wrote the value, and the page must not let a reader slide from one to the other.
      interpretation:
        'Share of commits carrying an agent co-author trailer. A composition fact about how the work was ' +
        'produced — not a measure of how much value the agents contributed.',
    }
  })

  return {
    generatedAt: str(p.generatedAt) ?? null,
    source: obj(p.source) as PodReportView['source'],
    speed,
    composition,
    notInstrumented: (Array.isArray(delivery.notInstrumented)
      ? delivery.notInstrumented
      : []) as NotInstrumentedRow[],
    benchmarks: (Array.isArray(p.benchmarks) ? p.benchmarks : []) as PodReportView['benchmarks'],
    caveats: (Array.isArray(p.caveats) ? p.caveats : []).filter((c): c is string => typeof c === 'string'),
    maturity: buildMaturitySection(p.maturity),
    empty,
  }
}

/**
 * Shape the artifact's `maturity` section for rendering.
 *
 * ── The one rule ──────────────────────────────────────────────────────────────────────────────
 * A row whose status is `met` but whose evidence pointer is missing or malformed is DOWNGRADED to
 * `not_instrumented`, not rendered as a met claim without a pointer. Story 2.4's acceptance says
 * the renderer must be "structurally incapable of an unevidenced claim" — the computation enforces
 * that on the way in, and this enforces it again on the way out, because an artifact is immutable
 * and may have been written by an older, less careful build than the one rendering it.
 *
 * The downgrade is deliberately toward the LESS flattering answer. Dropping the row entirely would
 * quietly shrink the denominator and inflate the coverage the verdict reports.
 */
export function buildMaturitySection(raw: unknown): MaturitySection | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const m = obj(raw)

  const rows: MaturityRow[] = (Array.isArray(m.rows) ? m.rows : []).map((r: unknown) => {
    const row = obj(r)
    const ev = obj(row.evidence)
    const hasEvidence =
      typeof ev.pointerType === 'string' &&
      ev.pointerType.length > 0 &&
      (typeof ev.ref === 'string' || typeof ev.ref === 'number') &&
      String(ev.ref).length > 0

    const declared = String(row.status ?? '')
    const status: MaturityRow['status'] =
      declared === 'met' ? (hasEvidence ? 'met' : 'not_instrumented') : declared === 'not_met' ? 'not_met' : 'not_instrumented'

    return {
      id: str(row.id) ?? 'unknown',
      criterion: str(row.criterion) ?? 'Unnamed criterion',
      ladderStep: num(row.ladderStep) ?? 0,
      status,
      isProxy: row.isProxy === true,
      proxyNote: str(row.proxyNote),
      evidence: hasEvidence
        ? { pointerType: String(ev.pointerType), ref: ev.ref as string | number, detail: str(ev.detail) ?? '' }
        : null,
      // Set by lib/pod-report-lens.ts when a lens withheld a pointer that DOES exist. Untouched
      // here, so "withheld from you" and "never existed" stay distinguishable on the page.
      evidenceWithheld: row.evidenceWithheld === true,
      reason:
        str(row.reason) ??
        (declared === 'met' && !hasEvidence
          ? 'Reported as met by the computation but carrying no resolvable evidence pointer — shown as not instrumented rather than as an unevidenced claim.'
          : null),
    }
  })

  const v = obj(m.verdict)
  const verdict =
    num(v.step) === null
      ? null
      : {
          step: num(v.step)!,
          stepLabel: str(v.stepLabel) ?? '',
          metCriteria: num(v.metCriteria) ?? 0,
          totalCriteria: num(v.totalCriteria) ?? rows.length,
          // Recomputed from the rows AFTER the downgrade above, never copied from the artifact: a
          // stale count that disagrees with what the page actually shows is the one number on this
          // section a reader would never think to check.
          notInstrumentedCount: Math.max(
            num(v.notInstrumentedCount) ?? 0,
            rows.filter((r) => r.status === 'not_instrumented').length
          ),
        }

  return {
    ladder: (m.ladder && typeof m.ladder === 'object' ? m.ladder : null) as MaturitySection['ladder'],
    verdict,
    rows,
    notInstrumented: (Array.isArray(m.notInstrumented) ? m.notInstrumented : []) as NotInstrumentedRow[],
  }
}

/**
 * Whether the view is safe to present as a report.
 *
 * A view with metrics but NO not-instrumented rows means the caveats were lost somewhere between
 * computation and render — which produces exactly the speed-only vendor-ware the epic rules out.
 * Callers use this to refuse to render rather than to render something misleading.
 */
export function isHonest(view: PodReportView): boolean {
  if (view.empty) return true // an empty state claims nothing, so it cannot mislead
  // BOTH metric groups count. Checking only `speed` left a hole cross-review found: a view whose
  // speed rows are all null but whose composition rows carry real percentages would pass the guard
  // with its caveats stripped — and an agent-authorship share presented without context is exactly
  // the kind of number this guard exists to keep honest.
  const hasNumbers =
    view.speed.some((r) => r.value !== null) || view.composition.some((r) => r.value !== null)
  if (hasNumbers && !(view.notInstrumented.length > 0 && view.caveats.length > 0)) return false

  // ── The maturity section's own honesty condition (Story 2.4) ────────────────────────────────
  // A ladder VERDICT — "operates at step N" — is a claim on a named external scale, and it is only
  // interpretable against the version of that scale it was scored on. An artifact carrying a
  // verdict with no version-pinned citation is a score floating free of its rubric, which is the
  // failure the acceptance criterion ("cited + linked and version-pinned — title + author + date")
  // exists to prevent. A section with rows but no verdict is fine: it claims nothing.
  const verdict = view.maturity?.verdict
  if (verdict) {
    const ladder = view.maturity?.ladder
    if (!ladder?.title || !ladder?.author || !ladder?.date) return false
  }
  return true
}
