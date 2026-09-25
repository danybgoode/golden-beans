'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Toast } from '@/design-system/primitives'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { ExperimentDecisionOutcome } from '@/lib/experiment-decision-contract'
import type { ReadoutAction } from '@/lib/experiment-readout'
import {
  DECISION_REASONS,
  canRollOut,
  defaultReason,
  planDecision,
  type DecisionChoice,
} from '@/lib/experiment-decide-plan'
import { recordExperimentDecisionAction, transitionExperimentVersionAction } from '../actions'
import { rolloutExperimentAction, undoRolloutAction } from '../builder-actions'

// experiments-for-humans · Story 4.2 (D8) — the verdict card's actions: stop → decide (chips) → roll
// out, each its own write with its own result, and a 10-second undo. Built by the architect; the
// Results tab renders this INSIDE the verdict card and passes it the readout's actions.
//
// The order and the variants each write names come from `planDecision` (unit-tested). This file only
// runs the plan's steps in order and says honestly how far it got: a failed step stops the flow and
// names what already happened, because every earlier write is real and none of them is undone here.
export type DecideFlowProps = {
  slug: string
  experimentKey: string
  experimentId: string
  versionId: string
  version: number
  lifecycle: 'running' | 'stopped' | 'decided'
  controlKey: string
  /** Every version of the test, in definition order, with its human label. */
  variants: Array<{ key: string; label: string }>
  currentDecisionId: string | null
  /** The decided outcome and chosen variant, when decided (for the roll-out after a decision). */
  decision: { outcome: string; chosenVariantKey: string | null } | null
  actions: ReadoutAction[]
  /**
   * Can this deployment roll out (the builder gate — the roll-out's kill switch)? When it cannot, no
   * roll-out is drawn or ticked: a button that can only fail is not a button (fresh reviewer, #172).
   */
  canRollOut: boolean
  /** The treatment the readout leads with — what "Roll out ‹it›" and a fresh "Ship" pre-select. */
  leadTreatmentKey: string
}

const UNDO_MS = 10_000
const UNREACHED = 'That didn’t reach the server.'

type Done = { tone: 'success' | 'error'; text: string; undo?: { previous: string; rollout: string } }
type Modal = { choice: DecisionChoice; reason: string; rollOut: boolean; idempotencyKey: string }

function failure(result: unknown): string {
  return typeof result === 'object' &&
    result !== null &&
    'error' in result &&
    typeof result.error === 'string'
    ? result.error
    : UNREACHED
}

export function DecideFlow(props: DecideFlowProps) {
  const router = useRouter()
  const titleId = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const label = (key: string | null) =>
    props.variants.find((variant) => variant.key === key)?.label ?? key ?? ''
  const treatments = props.variants.filter((variant) => variant.key !== props.controlKey)
  const control = label(props.controlKey)

  const [modal, setModal] = useState<Modal | null>(null)
  const [confirm, setConfirm] = useState<'stop' | 'rollout' | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Done | null>(null)

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (modal && !element.open) element.showModal()
    if (!modal && element.open) element.close()
  }, [modal])
  // The undo is offered for exactly as long as the toast says; then it is gone, not stale.
  useEffect(() => {
    if (!done) return
    const timer = setTimeout(() => setDone(null), done.undo ? UNDO_MS : 4_000)
    return () => clearTimeout(timer)
  }, [done])

  function open(outcome: ExperimentDecisionOutcome) {
    setError(null)
    // A correction starts from what the record SAYS (general pass, #172): re-recording only the reason
    // must never silently move "ship C" to "ship B".
    const recorded =
      props.lifecycle === 'decided' && props.decision?.outcome === outcome
        ? props.decision.chosenVariantKey
        : null
    setModal({
      choice: {
        outcome,
        treatmentKey: outcome === 'ship_treatment' ? (recorded ?? props.leadTreatmentKey) : null,
      },
      reason: defaultReason(outcome),
      // A correction re-records the reason; it never pre-ticks a Production write.
      rollOut: props.canRollOut && props.lifecycle !== 'decided',
      idempotencyKey: crypto.randomUUID(),
    })
  }

  async function guarded<T>(action: () => Promise<T>): Promise<T | { ok: false; error: string }> {
    try {
      return await action()
    } catch {
      return { ok: false, error: UNREACHED }
    }
  }

  async function rollOut(variantKey: string, prefix = '') {
    const result = await guarded(() =>
      rolloutExperimentAction(props.slug, props.experimentKey, props.version, variantKey)
    )
    if (!result.ok) {
      setDone({ tone: 'error', text: `${prefix}The roll-out didn’t happen: ${failure(result)}` })
    } else if (!result.serving) {
      setDone({
        tone: 'error',
        text: `${prefix}The roll-out was written but Production isn’t serving it yet.`,
      })
    } else {
      setDone({
        tone: 'success',
        text: `${prefix}${label(variantKey)} is on for everyone in Production.`,
        undo: { previous: result.previousVersionId, rollout: result.rolloutVersionId },
      })
    }
    router.refresh()
  }

  /** Runs the plan's steps in order; the first failure ends it and says what already happened. */
  async function record() {
    if (!modal) return
    const plan = planDecision({
      lifecycle: props.lifecycle,
      choice: modal.choice,
      controlKey: props.controlKey,
      rollOut: modal.rollOut,
    })
    setPending(true)
    setError(null)
    try {
      if (plan.steps.includes('stop')) {
        const stopped = await guarded(() =>
          transitionExperimentVersionAction(props.slug, props.experimentId, props.versionId, 'stopped')
        )
        if (!stopped.ok) {
          setError(`It could not be stopped, so nothing was recorded. ${failure(stopped)}`)
          return
        }
      }
      const recorded = await guarded(() =>
        recordExperimentDecisionAction(
          props.slug,
          props.experimentKey,
          props.version,
          plan.recordKind,
          plan.recordKind === 'correction' ? props.currentDecisionId : null,
          modal.choice.outcome,
          plan.chosenVariantKey,
          modal.reason,
          modal.idempotencyKey
        )
      )
      if (!recorded.ok) {
        const lead = plan.steps.includes('stop') ? 'It is stopped, but the' : 'The'
        setError(`${lead} decision was not recorded. ${failure(recorded)}`)
        router.refresh()
        return
      }
      setModal(null)
      if (plan.rolloutVariantKey) {
        await rollOut(plan.rolloutVariantKey, 'Decision recorded. ')
      } else {
        setDone({
          tone: 'success',
          text: plan.recordKind === 'correction' ? 'Correction recorded' : 'Decision recorded',
        })
        router.refresh()
      }
    } finally {
      setPending(false)
    }
  }

  async function undo() {
    const target = done?.undo
    if (!target) return
    setPending(true)
    try {
      const result = await guarded(() =>
        undoRolloutAction(props.slug, props.experimentKey, target.previous, target.rollout)
      )
      setDone(
        result.ok
          ? { tone: 'success', text: 'Undone. Production serves what it served before the roll-out.' }
          : { tone: 'error', text: `The undo didn’t happen: ${failure(result)}` }
      )
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  async function stopOnly() {
    setPending(true)
    try {
      const result = await guarded(() =>
        transitionExperimentVersionAction(props.slug, props.experimentId, props.versionId, 'stopped')
      )
      setConfirm(null)
      setDone(
        result.ok
          ? { tone: 'success', text: 'Stopped. This version never runs again; record the decision next.' }
          : { tone: 'error', text: `It could not be stopped: ${failure(result)}` }
      )
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  // The decided version's own roll-out: the variant the record already names, nothing else.
  const decidedRollout =
    props.lifecycle === 'decided' && props.decision
      ? props.decision.outcome === 'ship_treatment'
        ? props.decision.chosenVariantKey
        : props.decision.outcome === 'keep_control'
          ? props.controlKey
          : null
      : null
  const plan = modal
    ? planDecision({
        lifecycle: props.lifecycle,
        choice: modal.choice,
        controlKey: props.controlKey,
        rollOut: modal.rollOut,
      })
    : null
  const rollTarget = modal
    ? modal.choice.outcome === 'ship_treatment'
      ? label(modal.choice.treatmentKey)
      : control
    : ''
  const choices: Array<{ choice: DecisionChoice; text: string }> = [
    ...treatments.map((treatment) => ({
      choice: { outcome: 'ship_treatment' as const, treatmentKey: treatment.key },
      text: `Ship ${treatment.label}`,
    })),
    { choice: { outcome: 'keep_control', treatmentKey: null }, text: `Keep ${control}` },
    { choice: { outcome: 'iterate', treatmentKey: null }, text: 'Change it and run again' },
    { choice: { outcome: 'inconclusive', treatmentKey: null }, text: 'Call it inconclusive' },
    { choice: { outcome: 'invalid', treatmentKey: null }, text: 'Mark it invalid' },
  ]

  return (
    <>
      <div className="ds-x-acts">
        {props.lifecycle === 'decided' ? (
          <>
            {props.actions.includes('rollout') && decidedRollout && props.canRollOut ? (
              <Button variant="primary" onClick={() => setConfirm('rollout')}>
                Set {label(decidedRollout)} for everyone in Production
              </Button>
            ) : null}
            {props.currentDecisionId ? (
              <Button
                variant="secondary"
                onClick={() => open((props.decision?.outcome as ExperimentDecisionOutcome) ?? 'inconclusive')}
              >
                Correct the decision
              </Button>
            ) : null}
          </>
        ) : (
          <>
            {props.actions.includes('rollout') ? (
              <Button variant="primary" onClick={() => open('ship_treatment')}>
                {props.canRollOut
                  ? `Roll out ${label(props.leadTreatmentKey)} to everyone`
                  : `Ship ${label(props.leadTreatmentKey)}`}
              </Button>
            ) : null}
            {props.actions.includes('keep') ? (
              <Button
                variant={props.actions.includes('rollout') ? 'secondary' : 'primary'}
                onClick={() => open('keep_control')}
              >
                Keep {control}
              </Button>
            ) : null}
            {props.actions.includes('iterate') ? (
              <Button variant="secondary" onClick={() => open('iterate')}>
                Change it and run again
              </Button>
            ) : null}
            {props.lifecycle === 'stopped' ? (
              <Button variant="secondary" onClick={() => open('inconclusive')}>
                Record the decision
              </Button>
            ) : props.actions.includes('stop') ? (
              <Button variant="secondary" className="ds-btn--sm" onClick={() => setConfirm('stop')}>
                Stop experiment
              </Button>
            ) : null}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirm === 'stop'}
        verb="Stop"
        noun="experiment"
        subject={`${props.experimentKey} v${props.version}`}
        consequence="It stops counting now and this version never runs again. Record the decision next."
        pending={pending}
        onConfirm={() => void stopOnly()}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'rollout'}
        verb="Set"
        noun="feature"
        subject={`${label(decidedRollout)} for everyone in Production`}
        consequence="Production serves this version to everyone. You can undo it for 10 seconds."
        pending={pending}
        onConfirm={() => {
          setConfirm(null)
          if (decidedRollout) void rollOut(decidedRollout)
        }}
        onCancel={() => setConfirm(null)}
      />

      <dialog
        ref={dialog}
        className="ds-dialog ds-x-decide"
        aria-labelledby={titleId}
        onClose={(event) => {
          if (event.target === dialog.current) setModal(null)
        }}
        onCancel={(event) => {
          if (event.target === dialog.current) setModal(null)
        }}
      >
        {modal && plan ? (
          <>
            <div className="ds-dialog-head">
              <div>
                <p className="ds-dialog-title" id={titleId}>
                  {plan.recordKind === 'correction' ? 'Correct the decision' : 'Record the decision'}
                </p>
                <p className="ds-dialog-sub">
                  <span className="ds-mono">{props.experimentKey}</span> · v{props.version}
                </p>
              </div>
              <button type="button" className="ds-dialog-x" aria-label="Close" onClick={() => setModal(null)}>
                ✕
              </button>
            </div>
            <div className="ds-dialog-body">
              <p className="ds-x-label">Outcome</p>
              <div className="ds-x-picklist">
                {choices.map((item) => (
                  <button
                    key={`${item.choice.outcome}-${item.choice.treatmentKey ?? ''}`}
                    type="button"
                    className="ds-x-pick"
                    aria-pressed={
                      modal.choice.outcome === item.choice.outcome &&
                      (item.choice.outcome !== 'ship_treatment' ||
                        modal.choice.treatmentKey === item.choice.treatmentKey)
                    }
                    onClick={() =>
                      setModal({
                        ...modal,
                        choice: item.choice,
                        reason:
                          modal.choice.outcome === item.choice.outcome
                            ? modal.reason
                            : defaultReason(item.choice.outcome),
                      })
                    }
                  >
                    <span className="ds-radio" />
                    <span>
                      <b>{item.text}</b>
                    </span>
                  </button>
                ))}
              </div>
              <p className="ds-x-label">Why</p>
              <div className="ds-chips">
                {DECISION_REASONS.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    className="ds-chip"
                    aria-pressed={modal.reason === reason}
                    onClick={() => setModal({ ...modal, reason })}
                  >
                    {reason}
                  </button>
                ))}
              </div>
              {props.canRollOut && canRollOut(modal.choice.outcome) ? (
                <>
                  <p className="ds-x-label">And then</p>
                  <button
                    type="button"
                    className="ds-x-metric ds-cb"
                    aria-pressed={modal.rollOut}
                    onClick={() => setModal({ ...modal, rollOut: !modal.rollOut })}
                  >
                    <span className="ds-radio" />
                    <span>
                      <span className="ds-nm">Set {rollTarget} for everyone in Production</span>
                      <span className="ds-ev">A separate write after the record, with a 10-second undo</span>
                    </span>
                  </button>
                </>
              ) : null}
              {error ? (
                <p className="ds-dialog-note" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
            <div className="ds-dialog-actions">
              <span className="ds-dialog-note">
                {plan.steps.includes('stop')
                  ? 'The experiment stops and this version never runs again.'
                  : 'The record is permanent; a mistake is corrected, never edited.'}
              </span>
              <Button variant="secondary" onClick={() => setModal(null)}>
                Cancel
              </Button>
              <Button variant="primary" state={pending ? 'loading' : 'idle'} onClick={() => void record()}>
                {plan.steps.includes('rollout')
                  ? 'Record and roll out'
                  : plan.recordKind === 'correction'
                    ? 'Record correction'
                    : 'Record decision'}
              </Button>
            </div>
          </>
        ) : null}
      </dialog>

      {done ? (
        <Toast state={done.tone}>
          {done.text}
          {done.undo ? (
            <>
              {' '}
              <button type="button" className="ds-toast-act" disabled={pending} onClick={() => void undo()}>
                Undo
              </button>
            </>
          ) : null}
        </Toast>
      ) : null}
    </>
  )
}
