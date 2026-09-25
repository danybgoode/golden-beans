import type { ExperimentDecisionOutcome } from './experiment-decision-contract'

// experiments-for-humans · Story 4.2 (epic README D8) — what "Record the decision" WRITES, as data.
//
// Three separate writes, each its own action with its own result: stop (only while running) → record
// (the existing recorder, unchanged — it cannot touch a flag) → roll out (only for ship / keep, only
// when asked — it cannot touch the record). The modal renders this plan; nothing here reaches a
// database, so the order and the variant each write names are unit-tested without a browser.

/** The approved reasons, in the approved order (`approved-prototype.html`, DECISION_REASONS). */
export const DECISION_REASONS = [
  'The main number improved and guardrails held',
  'It’s no worse and simpler to keep',
  'A guardrail cost more than the win',
  'Something outside the test decided it',
] as const

export type DecisionStep = 'stop' | 'record' | 'rollout'

export type DecisionChoice = {
  outcome: ExperimentDecisionOutcome
  /** The treatment a `ship_treatment` ships; ignored for every other outcome. */
  treatmentKey: string | null
}

export type DecisionPlan = {
  steps: DecisionStep[]
  recordKind: 'decision' | 'correction'
  /** What the record names (the contract: a treatment for ship, the control for keep, else null). */
  chosenVariantKey: string | null
  /** What Production is set to for everyone, when the plan rolls out. */
  rolloutVariantKey: string | null
}

/** The reason chip a fresh modal starts on, per the prototype's `openDecide`. */
export function defaultReason(outcome: ExperimentDecisionOutcome): string {
  if (outcome === 'ship_treatment') return DECISION_REASONS[0]
  if (outcome === 'keep_control') return DECISION_REASONS[1]
  return DECISION_REASONS[3]
}

/** Only ship and keep name a version everyone can be set to. */
export function canRollOut(outcome: ExperimentDecisionOutcome): boolean {
  return outcome === 'ship_treatment' || outcome === 'keep_control'
}

export function planDecision(input: {
  lifecycle: 'running' | 'stopped' | 'decided'
  choice: DecisionChoice
  controlKey: string
  /** "And then: set ‹version› for everyone in Production". */
  rollOut: boolean
}): DecisionPlan {
  const { outcome } = input.choice
  const chosenVariantKey =
    outcome === 'ship_treatment'
      ? input.choice.treatmentKey
      : outcome === 'keep_control'
        ? input.controlKey
        : null
  const rolls = input.rollOut && canRollOut(outcome) && chosenVariantKey !== null
  const steps: DecisionStep[] = []
  if (input.lifecycle === 'running') steps.push('stop')
  steps.push('record')
  if (rolls) steps.push('rollout')
  return {
    steps,
    recordKind: input.lifecycle === 'decided' ? 'correction' : 'decision',
    chosenVariantKey,
    rolloutVariantKey: rolls ? chosenVariantKey : null,
  }
}
