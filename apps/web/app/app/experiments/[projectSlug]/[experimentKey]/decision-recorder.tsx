'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useRouter } from 'next/navigation'
import type { ExperimentDecisionOutcome } from '@/lib/experiment-decision-contract'
import { recordExperimentDecisionAction } from '../actions'

/**
 * The five outcomes, in the approved order, with the approved words.
 *
 * Declared once beside the component that draws them so the labels the design specifies and the
 * values `parseExperimentDecisionCommand` accepts cannot drift into two lists.
 */
const OUTCOMES: [ExperimentDecisionOutcome, string][] = [
  ['ship_treatment', 'Ship the treatment'],
  ['keep_control', 'Keep control'],
  ['iterate', 'Change it and run again'],
  ['inconclusive', 'Call it inconclusive'],
  ['invalid', 'Mark it invalid'],
]

export function DecisionRecorder({
  slug,
  experimentKey,
  definitionVersion,
  lifecycle,
  controlVariantKey,
  treatmentVariantKeys,
  currentDecisionId,
}: {
  slug: string
  experimentKey: string
  definitionVersion: number
  lifecycle: 'running' | 'stopped' | 'decided'
  controlVariantKey: string
  treatmentVariantKeys: string[]
  currentDecisionId: string | null
}) {
  const router = useRouter()
  const [outcome, setOutcome] = useState<ExperimentDecisionOutcome>('inconclusive')
  const [treatment, setTreatment] = useState(treatmentVariantKeys[0] ?? '')
  const [rationale, setRationale] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // app-component-kit-adoption · Sprint 3 — the ledger is APPEND-ONLY and immutable. There is no
  // edit and no delete: a mistake is corrected by appending a correction, and both records stay in
  // history forever with the author's name on them. That makes this the most irreversible control
  // in the product, which is why it is confirmed even though its route was not converted in Sprint
  // 2 — a confirmation is not a conversion, so the D3 finding that kept that route out does not
  // apply here.
  const [confirming, setConfirming] = useState(false)

  const recordKind = currentDecisionId === null ? 'decision' : 'correction'
  const eligible = lifecycle === 'stopped' || (lifecycle === 'decided' && currentDecisionId !== null)

  // The submit no longer records — it opens the question. Recording happens only in `record()`,
  // which nothing but the dialog's confirm button reaches.
  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    setConfirming(true)
  }

  function record() {
    setError(null)
    setNotice(null)
    const chosenVariantKey =
      outcome === 'ship_treatment' ? treatment : outcome === 'keep_control' ? controlVariantKey : null
    startTransition(async () => {
      try {
        const result = await recordExperimentDecisionAction(
          slug,
          experimentKey,
          definitionVersion,
          recordKind,
          currentDecisionId,
          outcome,
          chosenVariantKey,
          rationale,
          crypto.randomUUID()
        )
        if (result.ok) {
          setNotice(
            recordKind === 'decision'
              ? 'Decision recorded. This is evidence only; no product flag changed.'
              : 'Correction appended. The earlier record remains in history.'
          )
          setRationale('')
          router.refresh()
        } else {
          setError(result.error)
        }
      } catch {
        setError('Could not record this experiment decision. Try again.')
      }
      setConfirming(false)
    })
  }

  return (
    <form onSubmit={onSubmit}>
      {/* ⚠️ **The five outcomes are BUTTONS, because that is what the approved state draws** —
          `console-prototype.html:3089` (`.outcomes`), five side-by-side controls greyed until the
          blockers clear, not a `<select>`. mockups-as-built Story 2.3.

          ⚠️ **And an ineligible experiment draws them DISABLED rather than replacing the whole
          panel with a sentence.** This used to `return <p>…</p>` before the form existed, so on a
          running experiment the approved state's sixth block had no controls in it at all — the
          page told you the decision surface was absent instead of showing you the decision you
          cannot make yet. The sentence stays; it moves under the buttons it explains.

          The gate itself is UNCHANGED and is not this component's: `parseExperimentDecisionCommand`
          refuses a decision unless the version is stopped and undecided (`:175`), on the server,
          from the governed analysis rather than from anything the browser sent. `disabled` here is
          presentation. */}
      <div className="ds-outcomes" role="group" aria-label="Decision outcome">
        {OUTCOMES.map(([value, words]) => (
          <button
            key={value}
            type="button"
            className="ds-outcome"
            // ⚠️ Not `outcome === value` alone: a DISABLED button announced as pressed tells a
            // screen reader that a decision has been made on an experiment where none can be. The
            // stylesheet carries the same `:not([disabled])` guard, so the two cues say one thing.
            aria-pressed={eligible && outcome === value}
            disabled={!eligible}
            onClick={() => setOutcome(value)}
          >
            {words}
          </button>
        ))}
      </div>
      {!eligible ? (
        <p className="ds-chart-note">
          Greyed out until this version is stopped and undecided. Recording a decision on numbers that cannot
          support one is the thing this page exists to prevent.
        </p>
      ) : null}
      {eligible && outcome === 'ship_treatment' && (
        <label>
          Chosen treatment
          <select value={treatment} onChange={(event) => setTreatment(event.target.value)}>
            {treatmentVariantKeys.map((variant) => (
              <option key={variant} value={variant}>
                {variant}
              </option>
            ))}
          </select>
        </label>
      )}
      {eligible && outcome === 'keep_control' && (
        <p>
          Declared control: <code>{controlVariantKey}</code>
        </p>
      )}
      {eligible ? (
        <>
          <label>
            Human rationale
            <textarea
              value={rationale}
              onChange={(event) => setRationale(event.target.value)}
              rows={5}
              maxLength={2_000}
              required
              style={{ display: 'block', width: '100%' }}
            />
          </label>
          <button type="submit" disabled={pending || (outcome === 'ship_treatment' && !treatment)}>
            {pending ? 'Recording…' : recordKind === 'decision' ? 'Record decision' : 'Append correction'}
          </button>
        </>
      ) : null}

      <ConfirmDialog
        open={confirming}
        verb={recordKind === 'decision' ? 'Record decision' : 'Append correction'}
        noun="for"
        subject={`${experimentKey} v${definitionVersion}`}
        consequence={
          recordKind === 'decision'
            ? 'The decision ledger is append-only: this record can never be edited or deleted, and it carries your name permanently. A mistake is fixed by appending a correction, which leaves this record visible in history alongside it. No product flag changes either way — this is evidence, not a rollout.'
            : 'The correction is appended, not applied over the top: the earlier record stays visible in history forever, and so will this one. Neither can be edited or deleted afterwards.'
        }
        pending={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={record}
      />
      <p>
        <em>
          This writes an append-only evidence record. It never declares a statistical winner, rolls out a
          variant, or changes a product flag.
        </em>
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </form>
  )
}
