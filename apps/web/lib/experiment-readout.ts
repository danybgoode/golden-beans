import type { ExperimentAnalysisResult } from './experiment-analysis'
import type { ExperimentDefinition } from './experiment-definition'
import { blockerWords } from './experiment-blocker-words'
import { eventWords, entityPlural, type SentencePart } from './experiment-builder-plan'

// experiments-for-humans · Story 4.1 (epic README D10) — the decision-first readout, as DATA.
//
// Everything the Results tab SAYS comes from here, computed from the one governed analysis the page
// already loaded (`computeExperimentAnalysis` via the analysis query) — never a second statistic. The
// component renders what it is handed, so every sentence is testable without a browser.
//
// ⚠️ The cumulative chart is NOT drawn (the story names it as the first cut): it would need a per-day
// pass over the facts inside the governed analysis, and this epic does not change that module. The
// lift card keeps its number, its legend and the honest "one point a day" empty state; the interval
// and the who-saw-what bars stay, as the story requires.

export type ReadoutState =
  'not_serving' | 'waiting' | 'gathering' | 'blocked' | 'ready' | 'stopped' | 'decided'

export type ReadoutAction = 'rollout' | 'keep' | 'iterate' | 'invalid' | 'stop' | 'retry-serving'

export type Readout = {
  state: ReadoutState
  /** The page's first line, as runs (`emphasis` is bold). */
  answer: SentencePart[]
  control: { key: string; label: string; exposed: number; rate: number | null }
  treatment: { key: string; label: string; exposed: number; rate: number | null }
  /** The primary metric's relative lift and its 95 % range, as percentages; `null` when not computable. */
  lift: { value: number; low: number; high: number; crossesZero: boolean } | null
  verdict: { label: string; title: string; body: string; actions: ReadoutAction[] }
  progress: { fraction: number; needPerVersion: number; day: number; plannedDays: number }
  srm: 'clear' | 'detected' | 'not_evaluable'
  guardrails: Array<{
    event: string
    label: string
    delta: number | null
    status: 'fine' | 'worse' | 'unknown'
  }>
}

export type ReadoutInput = {
  definition: ExperimentDefinition
  analysis: ExperimentAnalysisResult
  lifecycle: 'running' | 'stopped' | 'decided'
  /** The current decision record's outcome, when decided. */
  decision: { outcome: string; chosenVariantKey: string | null; rationale: string } | null
  /** Is the experiment's bound flag version the one Production serves? */
  serving: boolean
  now: Date
}

const DAY_MS = 86_400_000

function label(definition: ExperimentDefinition, key: string): string {
  return definition.variants.find((variant) => variant.key === key)?.label ?? key
}

function signed(percent: number): string {
  return `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`
}

export function buildReadout(input: ReadoutInput): Readout {
  const { definition, analysis } = input
  const controlKey = definition.controlVariantKey
  const metricRow = (key: string) => analysis.primaryMetric.variants.find((row) => row.key === key)
  // Which treatment the page leads with (general pass, PR #172): once decided, the one the RECORD
  // names; before that, the one furthest ahead in the wanted direction; the first only when no
  // treatment has a measurable lift yet. A three-version test must never read "B won" over "ship C".
  const treatments = definition.variants.filter((variant) => variant.key !== controlKey)
  const wanted = definition.primaryMetric.direction === 'increase' ? 1 : -1
  const recorded =
    input.lifecycle === 'decided' && input.decision?.outcome === 'ship_treatment'
      ? treatments.find((variant) => variant.key === input.decision?.chosenVariantKey)
      : undefined
  const measured = treatments
    .map((variant) => ({ key: variant.key, interval: metricRow(variant.key)?.liftInterval }))
    .filter((row) => row.interval?.ok)
    .sort((a, b) => wanted * ((b.interval as { lift: number }).lift - (a.interval as { lift: number }).lift))
  const treatmentKey = recorded?.key ?? measured[0]?.key ?? treatments[0]!.key
  const controlRow = metricRow(controlKey)
  const treatmentRow = metricRow(treatmentKey)
  const interval = treatmentRow?.liftInterval
  const lift =
    interval && interval.ok
      ? {
          value: interval.lift * 100,
          low: interval.low * 100,
          high: interval.high * 100,
          crossesZero: interval.crossesZero,
        }
      : null

  const start = Date.parse(definition.plannedWindow.startAt)
  const end = Date.parse(definition.plannedWindow.endAt)
  const plannedDays = Math.max(1, Math.round((end - start) / DAY_MS))
  const day = Math.min(plannedDays, Math.max(0, Math.floor((input.now.getTime() - start) / DAY_MS)))
  const smallest = Math.min(...analysis.variants.map((row) => row.observedSubjects))
  const need = definition.minimumSamplePerVariant
  const fraction = Math.min(1, smallest / need)
  const exposed = analysis.diagnostics.validExposureSubjects
  const perDay = day > 0 ? smallest / day : 0
  const remaining = fraction >= 1 || perDay <= 0 ? null : Math.ceil((need - smallest) / perDay)

  const A = label(definition, controlKey)
  const B = label(definition, treatmentKey)
  const metric = eventWords(definition.primaryMetric.event)
  const wantUp = definition.primaryMetric.direction === 'increase'
  const favourable = lift ? (wantUp ? lift.low > 0 : lift.high < 0) : false
  const unfavourable = lift ? (wantUp ? lift.high < 0 : lift.low > 0) : false
  const guardrails = analysis.guardrailMetrics.map((guard) => {
    const row = guard.variants.find((variant) => variant.key === treatmentKey)
    const delta =
      row?.liftFromControl === null || row?.liftFromControl === undefined ? null : row.liftFromControl * 100
    return {
      event: guard.event,
      label: eventWords(guard.event),
      delta,
      status:
        row?.directionalStatus === 'unfavorable'
          ? ('worse' as const)
          : delta === null
            ? ('unknown' as const)
            : ('fine' as const),
    }
  })
  const guardWords = guardrails.some((guard) => guard.status === 'worse')
    ? 'A guardrail moved the wrong way'
    : 'Guardrails fine'
  const srm = analysis.diagnostics.srm.status
  const srmWords =
    srm === 'clear'
      ? 'split checks out'
      : srm === 'detected'
        ? 'the split is off'
        : 'split can’t be checked yet'

  const common = {
    control: {
      key: controlKey,
      label: A,
      exposed: controlRow?.exposedSubjects ?? 0,
      rate: controlRow?.conversionRate ?? null,
    },
    treatment: {
      key: treatmentKey,
      label: B,
      exposed: treatmentRow?.exposedSubjects ?? 0,
      rate: treatmentRow?.conversionRate ?? null,
    },
    lift,
    progress: { fraction, needPerVersion: need, day, plannedDays },
    srm,
    guardrails,
  }
  const plain = (text: string): SentencePart => ({ text, emphasis: false })
  const bold = (text: string): SentencePart => ({ text, emphasis: true })

  // The blockers in words, never their storage codes (Sprint contract #9; general pass, #172 round 3).
  const blockerSentences = analysis.blockers
    .map((blocker) => blockerWords(blocker).what)
    .join(' ')
    .replace(/^./, (c) => c.toLowerCase())
  const lead: SentencePart[] = lift
    ? [
        bold(
          Math.abs(lift.value) < 0.5
            ? 'No difference yet'
            : `${B} is ${lift.value > 0 === wantUp ? 'ahead' : 'behind'}, ${signed(lift.value)}`
        ),
        plain(` (range ${signed(lift.low)} to ${signed(lift.high)}). ${guardWords}, ${srmWords}.`),
      ]
    : [bold(`No comparison on ${metric} yet`), plain(`. ${guardWords}, ${srmWords}.`)]
  if (input.lifecycle === 'decided' && input.decision) {
    const shipped = input.decision.outcome === 'ship_treatment'
    return {
      ...common,
      state: 'decided',
      answer: [
        bold(
          `Decided: ${shipped ? `ship ${B}` : input.decision.outcome === 'keep_control' ? `keep ${A}` : input.decision.outcome.replace(/_/g, ' ')}.`
        ),
        plain(' The decision and its reason are recorded.'),
      ],
      verdict: {
        label: 'Decision',
        title: shipped
          ? `${B} won.`
          : input.decision.outcome === 'keep_control'
            ? `${A} stays.`
            : input.decision.outcome === 'iterate'
              ? 'Change it and run again.'
              : input.decision.outcome === 'invalid'
                ? 'The result was marked invalid.'
                : 'No clear answer.',
        body: `${input.decision.rationale}.`,
        actions:
          input.decision.outcome === 'ship_treatment' || input.decision.outcome === 'keep_control'
            ? ['rollout']
            : [],
      },
    }
  }
  // Stopped, not yet decided (fresh reviewer, PR #172): nobody new is counted, so nothing here may say
  // "live" or "keep it running" — the one thing left to do is record the decision.
  if (input.lifecycle === 'stopped') {
    const ready = analysis.decisionReady
    // A blocker is not a short sample (fresh reviewer, #172 round 2): say the numbers can't be
    // trusted, and let "invalid" be the honest call — before any sentence about the sample.
    // Only with the sample met, like the running `blocked` state: a short sample raises
    // `srm_not_evaluable` on its own, and that is "not enough people", never "invalid" (round 3).
    if (exposed > 0 && analysis.blockers.length > 0 && analysis.sampleStatus === 'met') {
      return {
        ...common,
        state: 'stopped',
        answer: [
          bold('Stopped — nobody new is counted.'),
          plain(' '),
          ...lead,
          plain(` The numbers can’t be trusted: ${blockerSentences}`),
        ],
        verdict: {
          label: 'What happens next',
          title: 'Record the decision.',
          body: 'The checks found a problem, so no winner can be called from these numbers.',
          actions: ['invalid', 'iterate'],
        },
      }
    }
    return {
      ...common,
      state: 'stopped',
      answer: [
        bold('Stopped — nobody new is counted.'),
        plain(' '),
        ...(exposed === 0
          ? [plain('It stopped before anyone was counted.')]
          : [
              ...lead,
              plain(
                ready
                  ? ' Record the decision.'
                  : ` It stopped at ${Math.round(fraction * 100)}% of the planned sample, so the honest call may be inconclusive.`
              ),
            ]),
      ],
      verdict: {
        label: 'What happens next',
        title: 'Record the decision.',
        body: ready
          ? favourable
            ? `${B} came out ahead with enough people to trust it.`
            : unfavourable
              ? `${B} came out worse with enough people to trust it.`
              : 'There were enough people, and no real difference showed up.'
          : 'There weren’t enough people to trust a winner; say what you learned.',
        actions: ready ? (favourable ? ['rollout', 'keep'] : ['keep', 'iterate']) : ['iterate'],
      },
    }
  }
  if (input.lifecycle === 'running' && !input.serving) {
    return {
      ...common,
      state: 'not_serving',
      answer: [
        bold('Running, but the split isn’t serving yet.'),
        plain(' Nobody is being counted until Production serves this test’s version of the feature.'),
      ],
      verdict: {
        label: 'What happens next',
        title: 'Serve the split.',
        body: 'Retry turns this test’s version of the feature on in Production. Nothing else changes.',
        actions: ['retry-serving'],
      },
    }
  }
  if (exposed === 0) {
    return {
      ...common,
      state: 'waiting',
      answer: [
        bold('It’s live. Results start tomorrow.'),
        plain(
          ` ${entityPlural(definition.assignmentEntityType).replace(/^./, (c) => c.toUpperCase())} are being split ${definition.variants.map((v) => v.weight).join(' / ')} from now. It needs ${need.toLocaleString('en-US')} per version.`
        ),
      ],
      verdict: {
        label: 'What happens next',
        title: 'Let it run. Nothing to decide yet.',
        body: 'Until there are enough people, peeking at a number can only mislead you.',
        actions: ['stop'],
      },
    }
  }
  if (analysis.blockers.length > 0 && analysis.sampleStatus === 'met') {
    return {
      ...common,
      state: 'blocked',
      answer: [...lead, plain(` The numbers can’t be trusted yet: ${blockerSentences}`)],
      verdict: {
        label: 'What happens next',
        title: 'Fix what the checks found before calling it.',
        body: 'A blocked analysis is not a result, however good the number looks.',
        actions: ['stop'],
      },
    }
  }
  if (!analysis.decisionReady) {
    return {
      ...common,
      state: 'gathering',
      answer: [
        ...lead,
        plain(
          ` ${Math.round(fraction * 100)}% of the planned sample, so don’t call it yet.${remaining !== null ? ` About ${remaining} more day${remaining === 1 ? '' : 's'}.` : ''}`
        ),
      ],
      verdict: {
        label: 'What happens next',
        title:
          remaining !== null
            ? `Keep it running. About ${remaining} more day${remaining === 1 ? '' : 's'}.`
            : 'Keep it running.',
        body: 'The button to roll out appears once there are enough people to trust the result.',
        actions: ['stop'],
      },
    }
  }
  return {
    ...common,
    state: 'ready',
    answer: [
      ...lead,
      plain(
        favourable
          ? ' The whole range is on the right side of zero, so you can call it.'
          : ' The range still includes no difference, so the honest call is that it didn’t move.'
      ),
    ],
    verdict: favourable
      ? {
          label: 'Ready',
          title: `${B} is winning. Roll it out?`,
          body: `${metric.replace(/^./, (c) => c.toUpperCase())} moved the way you wanted and the split checks out.`,
          actions: ['rollout', 'keep'],
        }
      : unfavourable
        ? {
            label: 'Ready',
            title: `${B} is worse. Keep ${A}.`,
            body: 'There were enough people to see a change, and it went the wrong way.',
            actions: ['keep', 'iterate'],
          }
        : {
            label: 'Ready',
            title: `No real difference. Keep ${A}?`,
            body: 'There were enough people to see the change you planned for, and it didn’t show up.',
            actions: ['keep', 'iterate'],
          },
  }
}
