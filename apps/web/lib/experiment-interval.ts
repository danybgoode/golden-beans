// A 95% confidence interval on the RELATIVE LIFT between two variants — pure, and zero-import.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ **THIS EXISTS BECAUSE DANIEL DECIDED IT SHOULD, 2026-09-01 (epic DA2 / sprint L3).**
//
// The approved `experiment-ready` state draws an interval bar — *"How sure we are, and it does not
// cross zero"*. The engine computed no such thing: `MetricResult` carried conversion rate, absolute
// delta, relative lift and a directional status, and the only χ²/p in the product was the SRM
// check, which is a test of the ALLOCATION and not of the metric. The shipped page said so in its
// own footnote: *"Basic lift only — no statistical-significance engine (that's a later epic)."*
//
// Drawing that bar from what the engine had would have meant inventing numbers, and amending an
// approved design is a product-owner call, so it went to Daniel with three options and a
// recommendation. The recommendation — ship the card in an honest "no interval computed" state —
// was NOT taken. So the statistic is real.
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// ── The five constraints the lock put on it, and where each one lives ─────────────────────────
//
// 1. **The interval is on the SAME quantity as the headline number** — the relative lift — or the
//    picture and the number disagree, which is the defect class this epic exists to kill. That
//    fixes the method: a ratio of two proportions, not a difference.
// 2. **It lives in its own pure, zero-import module.** This one. `experiment-analysis.ts` imports
//    it; it imports nothing, so it is testable with `node --test` against hand-computed values.
// 3. **Every degenerate input returns a NAMED not-computable reason, never a number.** A ratio
//    interval is undefined at a zero denominator, and "undefined" must not reach a screen as `NaN%`
//    or as a bar of width zero.
// 4. **`decisionReady` and the decision ledger are NOT changed.** They are a shipped governance
//    boundary with an append-only immutable ledger behind them, and re-gating them on a new
//    statistic is a governance change this sprint did not bet on. The interval is REPORTED.
// 5. **The answer sentence is computed from the three facts it names.** It must never say "so the
//    difference is real" while the interval crosses zero — which is what a sentence copied from the
//    prototype would do. That lives on the page; `crossesZero` below is what it reads.
//
// ── The method, and why this one ──────────────────────────────────────────────────────────────
// **Katz's log method** on the risk ratio:
//
//     ln(RR) ± z · √( (1−p₁)/(p₁n₁) + (1−p₂)/(p₂n₂) )    exponentiated, then reported as RR − 1
//
// It is the standard closed form for the ratio of two independent proportions, needs no special
// function (no gamma, no inverse-normal — the one constant below is `z` for 95%, written out), and
// is the interval that matches the quantity the page already leads with. The alternative families
// were considered and rejected for concrete reasons: a Wald interval on the DIFFERENCE answers a
// different question from the headline "+18.1%"; Newcombe's hybrid score is better-behaved but is
// also on the difference; and a bootstrap needs the raw assignments, which this layer does not have.
//
// ⚠️ **What this method is bad at, stated rather than discovered.** The variance term is a
// large-sample approximation, and it degrades when a converted count is small — at `c ≤ 5` the
// interval is wide and its coverage is poor. It is not wrong there, it is uninformative, and the
// page's OTHER guardrail already covers that case: an experiment below its declared minimum sample
// is `sampleStatus: 'below'` and reads as *not ready to decide* whatever this says. The two are
// independent on purpose.
//
// A note on the variance form: `(1−p)/(p·n)` simplifies to `(1−p)/c`, since `c = p·n`. That is the
// form used below, and it is why the zero-conversion cases are visible rather than hidden inside a
// division that silently produces `Infinity`.

/** The two-sided 95% normal quantile. Written out rather than derived — there is no inverse-normal
 *  in this codebase and adding one to produce a constant would be more code to be wrong in. */
const Z_95 = 1.959963984540054

/** One arm of the comparison. `converted` is a subset of `exposed`; nothing here assumes it. */
export type IntervalArm = {
  exposedSubjects: number
  convertedSubjects: number
}

/**
 * Why an interval could not be computed.
 *
 * Each is a real, reachable state on a live experiment, and each reads differently to a person —
 * which is the whole reason this is a union and not `null`. "Nobody has been exposed yet" and
 * "the control converted nobody" are both "no interval", and only one of them means the experiment
 * is broken.
 */
export type IntervalUnavailable =
  'no_exposure' | 'control_never_converted' | 'treatment_never_converted' | 'not_a_number'

export type LiftInterval =
  | {
      ok: true
      /** The point estimate: `RR − 1`, the same number the page's headline shows. */
      lift: number
      low: number
      high: number
      /** Whether the range includes "no difference". Read off the VALUES, never off any geometry. */
      crossesZero: boolean
      confidence: 0.95
    }
  | { ok: false; reason: IntervalUnavailable }

/**
 * A 95% interval on the relative lift of `treatment` over `control`.
 *
 * ⚠️ Returns a NAMED reason rather than a number for every degenerate input. A ratio interval is
 * genuinely undefined when either arm converted nobody — `ln(0)` — and rendering that as a bar
 * pinned at one end would be a picture of a fact nobody measured.
 */
export function relativeLiftInterval(control: IntervalArm, treatment: IntervalArm): LiftInterval {
  const values = [
    control.exposedSubjects,
    control.convertedSubjects,
    treatment.exposedSubjects,
    treatment.convertedSubjects,
  ]
  if (!values.every((value) => Number.isFinite(value) && value >= 0)) {
    return { ok: false, reason: 'not_a_number' }
  }
  if (control.exposedSubjects === 0 || treatment.exposedSubjects === 0) {
    return { ok: false, reason: 'no_exposure' }
  }
  // ⚠️ The two zero-conversion cases are SEPARATE reasons because they are separate situations. A
  // control that converted nobody makes any lift infinite; a treatment that converted nobody makes
  // it −100% with no bound. Both are "no interval", and a reader needs to know which.
  if (control.convertedSubjects === 0) return { ok: false, reason: 'control_never_converted' }
  if (treatment.convertedSubjects === 0) return { ok: false, reason: 'treatment_never_converted' }

  const controlRate = control.convertedSubjects / control.exposedSubjects
  const treatmentRate = treatment.convertedSubjects / treatment.exposedSubjects
  const riskRatio = treatmentRate / controlRate

  // `(1 − p) / c`, which is `(1 − p) / (p·n)`. Both denominators are nonzero by the guards above.
  const variance =
    (1 - controlRate) / control.convertedSubjects + (1 - treatmentRate) / treatment.convertedSubjects
  const halfWidth = Z_95 * Math.sqrt(variance)
  const logRatio = Math.log(riskRatio)
  const low = Math.exp(logRatio - halfWidth) - 1
  const high = Math.exp(logRatio + halfWidth) - 1

  // Belt and braces. Every path above is guarded, so this is unreachable — and a non-finite bound
  // reaching a renderer would paint a bar of undefined width, which is the one output this module
  // exists to make impossible. An unreachable guard that FAILS CLOSED costs nothing.
  if (![riskRatio, low, high].every((value) => Number.isFinite(value))) {
    return { ok: false, reason: 'not_a_number' }
  }

  return {
    ok: true,
    lift: riskRatio - 1,
    low,
    high,
    // Inclusive: an interval whose bound is exactly zero DOES include no-difference.
    crossesZero: low <= 0 && high >= 0,
    confidence: 0.95,
  }
}

/** What a page says when there is no interval. One sentence per reason, in the reader's terms. */
export const INTERVAL_UNAVAILABLE_WORDS: Record<IntervalUnavailable, string> = {
  no_exposure: 'Nobody has been put in one of these groups yet, so there is nothing to compare.',
  control_never_converted:
    'Nobody in the control group has converted, so there is no baseline to measure a difference against — any lift would be infinite.',
  treatment_never_converted:
    'Nobody in the treatment group has converted. That is a real result, and it has no upper bound: the range cannot be drawn.',
  not_a_number: 'The counts behind this comparison could not be read, so no range was computed.',
}
