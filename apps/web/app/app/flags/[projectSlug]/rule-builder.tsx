'use client'
// flags-visual-rule-builder · Sprint 1, Stories 1.2, 1.3 and 1.4 — the authoring surface.
//
// ── D7: a new component from the first commit ─────────────────────────────────────────────────
// `flag-manager.tsx` was 548 lines before this epic (the README said 483; #13 grew it). It gains
// about a dozen lines to mount this and nothing else. The builder is where all the new state lives.
//
// ── D1: every option below is IMPORTED ────────────────────────────────────────────────────────
// There is no list of field names in this file, and no list of operators. Two selects fed by the
// SDK's own enums cannot offer a clause the parser rejects — that single fact is why this epic is
// an M. If a future edit starts typing 'plan' or 'one_of' here, it has taken the wrong turn.
//
// ── D2: this form is not a validator ──────────────────────────────────────────────────────────
// It narrows what can be TYPED and reports what `definitionFromDraft` can see locally, so a PM gets
// feedback without a round trip. `parseFlagDefinition` still decides what is VALID, server-side, on
// every submission, and its rejection is rendered verbatim (see `serverError`) rather than
// swallowed. Two validators drift, and the one that drifts permissive is the one in the browser.

import { useMemo, useState } from 'react'
import { FormSection, Field } from '@/components/ui/FormSection'
import { FLAG_CONTEXT_FIELDS, MAX_FLAG_CLAUSES, MAX_FLAG_RULES } from '@golden-beans/sdk'
import {
  canAddClause,
  canAddRule,
  definitionFromDraft,
  emptyClauseDraft,
  emptyRuleDraft,
  FLAG_CLAUSE_OPERATORS,
  type ClauseDraft,
  type DefinitionDraft,
  type RuleDraft,
} from '@/lib/flag-rule-draft'

/** The variants a new boolean flag starts with. Editing variants is out of this epic's appetite. */
const BOOLEAN_VARIANTS = [
  { key: 'off', value: false },
  { key: 'on', value: true },
]

function newDraft(): DefinitionDraft {
  return {
    valueType: 'boolean',
    description: '',
    defaultVariantKey: 'off',
    variants: BOOLEAN_VARIANTS,
    rules: [],
  }
}

/**
 * One clause: a field, an operator, and a value control whose shape follows the operator.
 *
 * Story 1.2. `equals` takes one value; `one_of` takes a list. The list is edited as comma-separated
 * text rather than as N inputs — the parser caps it at 20 values and a PM listing regions wants to
 * paste them, not click "add" twenty times. `flag-rule-draft` trims and de-duplicates, and names the
 * duplicate if there is one.
 */
function RuleBuilderRow({
  clause,
  index,
  disabled,
  onChange,
  onRemove,
}: {
  clause: ClauseDraft
  index: number
  disabled: boolean
  onChange: (next: ClauseDraft) => void
  onRemove: () => void
}) {
  return (
    <div className="rule-builder__clause">
      <Field label={`Condition ${index + 1} — field`}>
        {(control) => (
          <select
            {...control}
            disabled={disabled}
            value={clause.field}
            onChange={(event) => onChange({ ...clause, field: event.target.value as ClauseDraft['field'] })}
          >
            {/* D1 — the closed six-value enum, straight from the SDK. */}
            {FLAG_CONTEXT_FIELDS.map((field) => (
              <option key={field} value={field}>
                {field}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field label="Operator">
        {(control) => (
          <select
            {...control}
            disabled={disabled}
            value={clause.operator}
            onChange={(event) =>
              onChange({ ...clause, operator: event.target.value as ClauseDraft['operator'] })
            }
          >
            {/* D1 — exactly two, derived from FlagClause's union. */}
            {FLAG_CLAUSE_OPERATORS.map((operator) => (
              <option key={operator} value={operator}>
                {operator === 'equals' ? 'is' : 'is one of'}
              </option>
            ))}
          </select>
        )}
      </Field>

      {clause.operator === 'equals' ? (
        <Field label="Value">
          {(control) => (
            <input
              {...control}
              disabled={disabled}
              value={clause.value}
              onChange={(event) => onChange({ ...clause, value: event.target.value })}
            />
          )}
        </Field>
      ) : (
        <Field label="Values" hint="Separate with commas.">
          {(control) => (
            <input
              {...control}
              disabled={disabled}
              // `join(',')` with NO space, deliberately. Cross-review (Agy) caught the version that
              // joined with ', ': the split preserves each element's own leading space, so rejoining
              // with another one grew a space per keystroke and walked the cursor away from where
              // the reader was typing. Joining on the exact character we split on makes the round
              // trip through this control the identity function, so the field holds precisely what
              // was typed. Trimming and de-duplication happen once, at serialisation, in
              // flag-rule-draft.ts — not on every render.
              value={clause.values.join(',')}
              onChange={(event) => onChange({ ...clause, values: event.target.value.split(',') })}
            />
          )}
        </Field>
      )}

      <button type="button" disabled={disabled} onClick={onRemove}>
        Remove condition {index + 1}
      </button>
    </div>
  )
}

/**
 * One rule: its priority, its conditions, its rollout and the variant it serves.
 *
 * Story 1.3. **Priority is a visible, editable number** (D9). Drag-to-reorder that renumbers behind
 * the author's back produces definitions whose behaviour surprises the person who wrote them — the
 * SDK sorts ascending and serves the first match, so the number IS the behaviour, and hiding it
 * behind a gesture hides the thing that decides the outcome.
 */
function RuleCard({
  rule,
  index,
  variantKeys,
  disabled,
  onChange,
  onRemove,
}: {
  rule: RuleDraft
  index: number
  variantKeys: string[]
  disabled: boolean
  onChange: (next: RuleDraft) => void
  onRemove: () => void
}) {
  const clauseRoom = canAddClause(rule.clauses)
  return (
    <article className="rule-builder__rule">
      <h4>Rule {index + 1}</h4>

      <Field
        label="Priority"
        hint="Lowest number wins. The first rule whose conditions match decides the variant."
      >
        {(control) => (
          <input
            {...control}
            type="number"
            min={0}
            step={1}
            disabled={disabled}
            // An emptied field must stay empty while it is being retyped. `Number('')` is 0, so the
            // obvious version snapped the priority to zero on the first backspace and made the
            // control fight the reader (cross-review, Agy). NaN is carried instead: the input
            // renders blank and `definitionFromDraft` reports "priority must be a whole number",
            // which is the honest state of a rule whose priority has not been chosen yet.
            value={Number.isNaN(rule.priority) ? '' : rule.priority}
            onChange={(event) =>
              onChange({
                ...rule,
                priority: event.target.value === '' ? Number.NaN : Number(event.target.value),
              })
            }
          />
        )}
      </Field>

      {rule.clauses.map((clause, clauseIndex) => (
        <RuleBuilderRow
          key={clauseIndex}
          clause={clause}
          index={clauseIndex}
          disabled={disabled}
          onChange={(next) =>
            onChange({
              ...rule,
              clauses: rule.clauses.map((existing, i) => (i === clauseIndex ? next : existing)),
            })
          }
          onRemove={() => onChange({ ...rule, clauses: rule.clauses.filter((_, i) => i !== clauseIndex) })}
        />
      ))}

      <button
        type="button"
        disabled={disabled || !clauseRoom}
        onClick={() => onChange({ ...rule, clauses: [...rule.clauses, emptyClauseDraft()] })}
      >
        Add a condition
      </button>
      {/* The cap and its explanation come from the constant, so the sentence cannot drift from the
          rule it describes (D5). Smoke step 6 reads this line. */}
      {!clauseRoom && (
        <p role="status">A rule can have at most {MAX_FLAG_CLAUSES} conditions. Remove one to add another.</p>
      )}

      <Field
        label="Rollout (%)"
        hint="Leave empty to serve everyone who matches. A rollout needs a targeting key in context."
      >
        {(control) => (
          <input
            {...control}
            type="number"
            min={0}
            max={100}
            step="any"
            disabled={disabled}
            value={rule.rolloutPercent ?? ''}
            onChange={(event) =>
              onChange({
                ...rule,
                // Empty means "no rollout configured" — everyone who matches — which is NOT the
                // same as 0%. rollout-percent.ts keeps the two apart everywhere they are displayed.
                rolloutPercent: event.target.value === '' ? null : Number(event.target.value),
              })
            }
          />
        )}
      </Field>

      <Field label="Serves variant">
        {(control) => (
          <select
            {...control}
            disabled={disabled}
            value={rule.variantKey}
            onChange={(event) => onChange({ ...rule, variantKey: event.target.value })}
          >
            {variantKeys.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        )}
      </Field>

      <button type="button" disabled={disabled} onClick={onRemove}>
        Remove rule {index + 1}
      </button>
    </article>
  )
}

/**
 * The builder.
 *
 * Story 1.4. It owns the draft and hands the caller a definition STRING; `flag-manager` posts it
 * through the same `createFlagDefinitionVersionAction` the textarea already uses (A1). No new route,
 * no new action, no second write path — the builder is a different way to compose the same bytes.
 */
export function RuleBuilder({
  disabled,
  serverError,
  onSubmit,
}: {
  disabled: boolean
  /** The server's verbatim rejection, rendered rather than swallowed (D2). */
  serverError: string | null
  onSubmit: (flagKey: string, definitionJson: string, reason: string) => void
}) {
  const [flagKey, setFlagKey] = useState('')
  const [reason, setReason] = useState('')
  const [draft, setDraft] = useState<DefinitionDraft>(newDraft)
  const [showJson, setShowJson] = useState(false)

  const variantKeys = useMemo(() => draft.variants.map((variant) => variant.key), [draft.variants])
  const built = useMemo(() => definitionFromDraft(draft), [draft])
  const ruleRoom = canAddRule(draft.rules)

  // The flag key and the reason are NOT part of the definition — they are arguments to the version
  // that wraps it — so `definitionFromDraft` cannot see them and `built.ok` alone was letting the
  // submit button fire with either one blank (cross-review, Agy). The server action rejects both,
  // so nothing invalid could ever have been stored; what was wrong is that the reader had to make a
  // round trip to learn something this form already knew. Listed with the definition's own problems
  // so there is one place to look.
  const argumentProblems: string[] = []
  if (flagKey.trim().length === 0) argumentProblems.push('Give the flag a key.')
  if (reason.trim().length === 0) argumentProblems.push('Say why this version is being created.')
  const problems = [...(built.ok ? [] : built.errors), ...argumentProblems]

  // The JSON disclosure renders what WOULD be stored, formatted exactly as the action will send it.
  // Story 1.4 requires it to be read-only and byte-identical to what is stored — so it is derived
  // from the same value that gets submitted, never re-serialised separately.
  const definitionJson = built.ok ? JSON.stringify(built.definition, null, 2) : null

  return (
    <section className="rule-builder">
      <FormSection
        title="Build a rule"
        description="Compose a flag definition from controls. The same immutable version is created as if you had typed the JSON by hand."
      >
        <Field label="Flag key" hint="Lowercase letters, numbers, dots, dashes and underscores.">
          {(control) => (
            <input
              {...control}
              disabled={disabled}
              value={flagKey}
              onChange={(event) => setFlagKey(event.target.value)}
            />
          )}
        </Field>

        <Field label="Description">
          {(control) => (
            <input
              {...control}
              disabled={disabled}
              maxLength={500}
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          )}
        </Field>

        <Field
          label="Serves variant when no rule matches"
          hint="Every flag needs a default. A boolean flag starts with off and on."
        >
          {(control) => (
            <select
              {...control}
              disabled={disabled}
              value={draft.defaultVariantKey}
              onChange={(event) => setDraft({ ...draft, defaultVariantKey: event.target.value })}
            >
              {variantKeys.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          )}
        </Field>
      </FormSection>

      <FormSection
        title="Rules"
        description="Rules are evaluated from the lowest priority number upwards. The first one whose conditions all match decides the variant."
      >
        {draft.rules.length === 0 && (
          // CODE-QUALITY rule 8 — an honest empty state. A flag with no rules is valid and serves
          // its default to everyone; saying so beats an empty panel that reads as broken.
          <p>
            No rules yet. This flag will serve <code>{draft.defaultVariantKey}</code> to everyone. Add a rule
            to target a subset.
          </p>
        )}

        {draft.rules.map((rule, index) => (
          <RuleCard
            key={index}
            rule={rule}
            index={index}
            variantKeys={variantKeys}
            disabled={disabled}
            onChange={(next) =>
              setDraft({ ...draft, rules: draft.rules.map((r, i) => (i === index ? next : r)) })
            }
            onRemove={() => setDraft({ ...draft, rules: draft.rules.filter((_, i) => i !== index) })}
          />
        ))}

        <button
          type="button"
          disabled={disabled || !ruleRoom}
          onClick={() =>
            setDraft({
              ...draft,
              rules: [...draft.rules, emptyRuleDraft(draft.rules, draft.defaultVariantKey)],
            })
          }
        >
          Add a rule
        </button>
        {!ruleRoom && <p role="status">A flag can have at most {MAX_FLAG_RULES} rules.</p>}
      </FormSection>

      <FormSection title="Save">
        <Field label="Reason" hint="Recorded on the immutable version. 1–500 characters.">
          {(control) => (
            <input
              {...control}
              disabled={disabled}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          )}
        </Field>

        {/* Local problems, listed. These are the ones the form can see without a round trip; they
            are NOT the authority on validity (D2). */}
        {problems.length > 0 && (
          <ul role="status" className="rule-builder__problems">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}

        {/* The server's own words. Rendered whatever they say — a rejection a PM cannot read is a
            rejection they will re-submit unchanged. */}
        {serverError && <p role="alert">{serverError}</p>}

        <button
          type="button"
          disabled={disabled || problems.length > 0}
          onClick={() => definitionJson && onSubmit(flagKey.trim(), definitionJson, reason.trim())}
        >
          Create immutable version
        </button>

        <details open={showJson} onToggle={(event) => setShowJson(event.currentTarget.open)}>
          <summary>Show JSON</summary>
          {definitionJson ? (
            <pre>{definitionJson}</pre>
          ) : (
            <p>Fix the problems above to see the definition this builds.</p>
          )}
        </details>
      </FormSection>
    </section>
  )
}
