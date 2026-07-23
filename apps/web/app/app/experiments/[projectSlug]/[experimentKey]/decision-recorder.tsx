'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { ExperimentDecisionOutcome } from '@/lib/experiment-decision-contract'
import { recordExperimentDecisionAction } from '../actions'

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

  const recordKind = currentDecisionId === null ? 'decision' : 'correction'
  const eligible = lifecycle === 'stopped' || (lifecycle === 'decided' && currentDecisionId !== null)

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    const chosenVariantKey = outcome === 'ship_treatment'
      ? treatment
      : outcome === 'keep_control'
        ? controlVariantKey
        : null
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
          crypto.randomUUID(),
        )
        if (result.ok) {
          setNotice(
            recordKind === 'decision'
              ? 'Decision recorded. This is evidence only; no product flag changed.'
              : 'Correction appended. The earlier record remains in history.',
          )
          setRationale('')
          router.refresh()
        } else {
          setError(result.error)
        }
      } catch {
        setError('Could not record this experiment decision. Try again.')
      }
    })
  }

  if (!eligible) {
    return (
      <p>
        Decision recording becomes available to project owners after the experiment is stopped.
      </p>
    )
  }

  return (
    <form onSubmit={onSubmit}>
      <h3>{recordKind === 'decision' ? 'Record human decision' : 'Append correction'}</h3>
      <label>
        Outcome
        <select
          value={outcome}
          onChange={(event) => setOutcome(event.target.value as ExperimentDecisionOutcome)}
        >
          <option value="ship_treatment">Ship a treatment</option>
          <option value="keep_control">Keep control</option>
          <option value="iterate">Iterate</option>
          <option value="inconclusive">Inconclusive</option>
          <option value="invalid">Invalid evidence</option>
        </select>
      </label>
      {outcome === 'ship_treatment' && (
        <label>
          Chosen treatment
          <select value={treatment} onChange={(event) => setTreatment(event.target.value)}>
            {treatmentVariantKeys.map((variant) => (
              <option key={variant} value={variant}>{variant}</option>
            ))}
          </select>
        </label>
      )}
      {outcome === 'keep_control' && (
        <p>Declared control: <code>{controlVariantKey}</code></p>
      )}
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
      <p>
        <em>
          This writes an append-only evidence record. It never declares a statistical winner,
          rolls out a variant, or changes a product flag.
        </em>
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </form>
  )
}
