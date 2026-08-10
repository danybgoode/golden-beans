'use client'
// flags-visual-rule-builder · Sprint 3, Stories 3.1, 3.2 and 3.3 — preview as a user.
//
// ── D4 is the whole sprint, and this file is where it could have been broken ───────────────────
// Evaluation happens in `previewFlagEvaluationAction`, server-side, through the SDK's own evaluator,
// against the version actually activated in the chosen environment. **There is no matching logic
// here.** No clause comparison, no rollout arithmetic, no re-derivation of what matched — grep the
// diff and there is none to find. Everything below renders an answer it was given.
//
// ── D1: the six fields are IMPORTED ───────────────────────────────────────────────────────────
// The same closed enum the builder renders. A preview offering a field the grammar does not have
// would be answering a question the evaluator cannot be asked.
//
// ── Story 3.3: where the question is asked ────────────────────────────────────────────────────
// This renders inside the flag's own article, next to its versions and its bars — not on a separate
// page — because a preview a PM has to navigate to is a preview they will not use.

import { useState, useTransition } from 'react'
import { FormSection, Field } from '@/components/ui/FormSection'
import { FLAG_CONTEXT_FIELDS, FLAG_ENVIRONMENTS, type FlagEnvironment } from '@golden-beans/sdk'
import type { FlagEvaluationExplanation } from '@/lib/flag-definition'
import {
  describeEvaluationOutcome,
  describeRuleConditions,
  describeRuleOutcome,
} from '@/lib/flag-explanation-prose'
import { previewFlagEvaluationAction } from './actions'

type ContextDraft = Partial<Record<(typeof FLAG_CONTEXT_FIELDS)[number], string>>

export function FlagPreview({ slug, flagId }: { slug: string; flagId: string }) {
  const [environment, setEnvironment] = useState<FlagEnvironment>('production')
  const [draft, setDraft] = useState<ContextDraft>({})
  const [result, setResult] = useState<{ version: number; explanation: FlagEvaluationExplanation } | null>(
    null
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onEvaluate() {
    setError(null)
    startTransition(async () => {
      try {
        const answer = await previewFlagEvaluationAction(slug, flagId, environment, draft)
        if (answer.ok) {
          setResult({ version: answer.version, explanation: answer.explanation })
        } else {
          setResult(null)
          setError(answer.error)
        }
      } catch {
        setResult(null)
        setError('The preview could not be evaluated. Try again.')
      }
    })
  }

  return (
    <section className="flag-preview">
      <FormSection
        title="Preview as a user"
        description="Ask what a given context would see. This reads the version activated in the chosen environment and evaluates it with the same code that serves production — it creates nothing and changes nothing."
      >
        <Field label="Environment">
          {(control) => (
            <select
              {...control}
              disabled={pending}
              value={environment}
              onChange={(event) => setEnvironment(event.target.value as FlagEnvironment)}
            >
              {/* D5 — three, from the constant. */}
              {FLAG_ENVIRONMENTS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          )}
        </Field>

        {/* D1 — the closed six-value enum, the same one the builder's field select renders. */}
        {FLAG_CONTEXT_FIELDS.map((field) => (
          <Field
            key={field}
            label={field}
            hint={
              field === 'targetingKey'
                ? 'Leave blank and any rule with a rollout is excluded outright — a rollout has nothing to bucket without it.'
                : undefined
            }
          >
            {(control) => (
              <input
                {...control}
                disabled={pending}
                // The same bound `parseEvaluationContext` enforces server-side, and the same one
                // the evaluator's `validScalar` applies to a context value. Narrowing what can be
                // TYPED to what the server will accept is D2's shape: the form pre-empts the error,
                // the server still decides (cross-review, Agy).
                maxLength={256}
                value={draft[field] ?? ''}
                onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}
              />
            )}
          </Field>
        ))}

        <button type="button" disabled={pending} onClick={onEvaluate}>
          {pending ? 'Evaluating…' : 'Evaluate'}
        </button>

        {error && <p role="alert">{error}</p>}

        {result === null && !error && (
          // CODE-QUALITY rule 8 — Story 3.3's honest empty state. A blank result panel reads as a
          // broken evaluation; this says what to do instead.
          <p className="flag-preview__empty">
            Fill in whichever fields you want to test — every one is optional — and evaluate. Blank means the
            context does not carry that field at all.
          </p>
        )}

        {result && (
          <div role="status" className="flag-preview__result">
            <p className="flag-preview__verdict">{describeEvaluationOutcome(result.explanation)}</p>
            <p className="note">
              Evaluated against v{result.version}, the version activated in {environment}.
            </p>

            {/* The conditions that held, or — for a rule that has none — the fact that it has none.
                A matched rule with no clauses matches EVERY context, which is the thing a reader
                most needs told about it; an empty `<ul>` said nothing at all (cross-review, Agy). */}
            {result.explanation.matched &&
              (describeRuleConditions(result.explanation.matched).length > 0 ? (
                <ul className="flag-preview__conditions">
                  {describeRuleConditions(result.explanation.matched).map((condition) => (
                    <li key={condition}>{condition}</li>
                  ))}
                </ul>
              ) : (
                <p className="flag-preview__conditions">
                  This rule has no conditions, so it matches every context.
                </p>
              ))}

            {result.explanation.rules.length > 0 && (
              <ol className="flag-preview__rules">
                {result.explanation.rules.map((rule) => (
                  <li key={rule.priority} data-outcome={rule.outcome}>
                    {describeRuleOutcome(rule)}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </FormSection>
    </section>
  )
}
