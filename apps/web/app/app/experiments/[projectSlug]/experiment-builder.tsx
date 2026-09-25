'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { FlagScalar } from '@golden-frijoles/sdk'
import { Button } from '@/design-system/primitives'
import { Icon } from '@/components/ui/Icon'
import {
  buildExperimentPlan,
  entityPlural,
  eventWords,
  metricCandidates,
  predicateValueAllowed,
  versionWeights,
  whoWords,
  type ExperimentCheck,
  type ExperimentPlan,
} from '@/lib/experiment-builder-plan'
import {
  CONTROL_NAMES,
  EXPERIMENT_REASONS,
  EXPERIMENT_TEMPLATE_KEYS,
  EXPERIMENT_TEMPLATES,
  TREATMENT_NAMES,
  WEEK_OPTIONS,
  type ExperimentConditionField,
} from '@/lib/experiment-templates'
import type { BuilderFeature, BuilderPageData } from '@/lib/experiment-builder-io'
import {
  builderReducer,
  builderStorageKey,
  deserializeBuilderState,
  initialBuilderState,
  serializeBuilderState,
  type BuilderAction,
  type BuilderDefaultsContext,
  type BuilderState,
} from '@/lib/experiment-builder-state'
import {
  retryExperimentServingAction,
  saveExperimentDraftAction,
  startExperimentAction,
} from './builder-actions'
import '@/design-system/experiments.css'

const STEPS = ['What & why', "Who's in it", 'What they see', "How you'll know", 'How long', 'Review'] as const
const FIELDS: ExperimentConditionField[] = ['region', 'channel', 'plan', 'source', 'campaign']
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 })
const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

function servedFor(feature: BuilderFeature | undefined) {
  return feature
    ? {
        flagKey: feature.flagKey,
        definition: feature.definition,
        activeInProduction: feature.activeInProduction,
      }
    : null
}
function contextFor(data: BuilderPageData, flagKey: string | null): BuilderDefaultsContext {
  return {
    catalog: data.catalog,
    served: servedFor(data.features.find((feature) => feature.flagKey === flagKey)),
  }
}
/**
 * The feature a new plan starts on: the busiest one live in Production with no other test on it —
 * the approved template names a real, live feature, never "a new feature". `null` only when the
 * project has none, which is honest: the builder then plans a new feature and check 1 says why.
 */
function defaultFeatureKey(data: BuilderPageData): string | null {
  const live = data.features
    .filter((feature) => feature.activeInProduction && feature.runningExperiment === null)
    .sort((a, b) => b.evaluations24h - a.evaluations24h || a.flagKey.localeCompare(b.flagKey))
  return live[0]?.flagKey ?? null
}

function readStored(projectId: string, data: BuilderPageData) {
  try {
    return deserializeBuilderState(
      sessionStorage.getItem(builderStorageKey(projectId)),
      contextFor(data, null)
    )
  } catch {
    return null
  }
}
function writeStored(projectId: string, state: BuilderState) {
  try {
    sessionStorage.setItem(builderStorageKey(projectId), serializeBuilderState(state))
    return true
  } catch {
    return false
  }
}

export function ExperimentBuilder({
  slug,
  projectId,
  data,
  continueDraft,
}: {
  slug: string
  projectId: string
  data: BuilderPageData
  continueDraft?: string | null
}) {
  const router = useRouter()
  const titleId = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const reported = useRef(false)
  const initial = useMemo(() => {
    const draft = continueDraft ? data.drafts.find((item) => item.experimentKey === continueDraft) : undefined
    return draft
      ? { step: 6 as const, answers: draft.answers, continuing: draft.experimentKey }
      : initialBuilderState('copy', contextFor(data, defaultFeatureKey(data)))
  }, [continueDraft, data])
  const [state, setState] = useState<BuilderState | null>(initial)
  const [open, setOpen] = useState(false)
  const [stored, setStored] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [returnedChecks, setReturnedChecks] = useState<ExperimentCheck[] | null>(null)
  const [pending, setPending] = useState(false)
  const [retryKey, setRetryKey] = useState<string | null>(null)

  useEffect(() => {
    if (continueDraft) return
    const restored = readStored(projectId, data)
    if (restored) {
      setState(restored)
      setStored(true)
    }
  }, [continueDraft, data, projectId])
  useEffect(() => {
    // Only a builder somebody opened is "in progress"; the defaults a page load computes are not.
    // A draft being CONTINUED is already saved; storing it would overwrite a new plan in progress.
    if (!continueDraft && open && state && writeStored(projectId, state)) setStored(true)
  }, [continueDraft, open, projectId, state])
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])
  if (!state) {
    // No usable event in 14 days: there is nothing to measure, and a template must not invent a
    // metric (D5). The door stays visible, blocked, with the reason — never silently gone.
    return (
      <span className="ds-x-door-blocked">
        <Button variant="primary" state="disabled">
          + New experiment
        </Button>
        <span className="ds-x-hint">
          Your product hasn&rsquo;t sent any events in the last 14 days, so there is nothing to measure yet.
        </span>
      </span>
    )
  }

  const draft = state.continuing
    ? data.drafts.find((item) => item.experimentKey === state.continuing)
    : undefined
  const planning = buildExperimentPlan(state.answers, {
    catalog: data.catalog,
    served: contextFor(data, state.answers.flagKey).served,
    now: new Date(),
    nextVersion: draft ? draft.version + 1 : 1,
    takenExperimentKeys: data.takenExperimentKeys,
    takenFlagKeys: data.takenFlagKeys,
    ...(draft?.flagKey ? { draft: { experimentKey: draft.experimentKey, flagKey: draft.flagKey } } : {}),
  })
  const plan = planning.ok ? planning.plan : null
  const dispatch = (action: BuilderAction) => {
    setState((current) => (current ? builderReducer(current, action) : current))
    setError(null)
    setReturnedChecks(null)
  }
  const change = (next: boolean) => {
    if (reported.current === next) return
    reported.current = next
    setOpen(next)
  }
  async function save(closeAfterSave = true): Promise<string | null> {
    setPending(true)
    setError(null)
    const current = state
    if (!current) {
      setPending(false)
      return null
    }
    const answers = current.answers
    const continuing = current.continuing
    const response = await saveExperimentDraftAction(slug, answers, continuing)
    setPending(false)
    if (!response.ok) {
      setError(response.error)
      setReturnedChecks(response.checks ?? null)
      return null
    }
    setState((current) => (current ? { ...current, continuing: response.experimentKey } : current))
    setNotice(`${response.experimentKey} saved as a draft`)
    if (closeAfterSave) change(false)
    router.refresh()
    return response.experimentKey
  }
  async function start() {
    const key = await save(false)
    if (!key) return
    setPending(true)
    const response = await startExperimentAction(slug, key)
    setPending(false)
    if (!response.ok) {
      setError(response.error)
      setReturnedChecks(response.checks ?? null)
      return
    }
    if (!response.serving) {
      setRetryKey(key)
      setNotice("Running, but the split isn't serving yet.")
      return
    }
    setNotice(`${key} started · ${response.flagKey} is splitting ${response.weights.join(' / ')}`)
    try {
      sessionStorage.removeItem(builderStorageKey(projectId))
    } catch {
      /* successful Production writes must still navigate */
    }
    router.push(`/app/experiments/${slug}/${encodeURIComponent(key)}`)
  }
  async function retry() {
    if (!retryKey) return
    setPending(true)
    const response = await retryExperimentServingAction(slug, retryKey)
    setPending(false)
    if (!response.ok) {
      setError(response.error)
      return
    }
    if (!response.serving) {
      setError('Still not serving. Try again in a moment.')
      return
    }
    try {
      sessionStorage.removeItem(builderStorageKey(projectId))
    } catch {
      // storage unavailable — nothing to clear
    }
    router.push(`/app/experiments/${slug}/${encodeURIComponent(retryKey)}`)
  }
  const primary = state.step < 5 ? 'Continue' : state.step === 5 ? 'Review' : 'Start experiment'
  const footer =
    state.step === 6 && plan?.failing
      ? `Fix ${plan.failing} thing${plan.failing === 1 ? '' : 's'} to start. You can save a draft now.`
      : 'Nothing runs until you press Start.'

  return (
    <>
      <Button
        variant={continueDraft ? 'secondary' : 'primary'}
        className={continueDraft ? 'ds-btn--sm' : undefined}
        onClick={() => change(true)}
      >
        {continueDraft ? 'Continue' : stored ? 'Continue new experiment' : '+ New experiment'}
      </Button>
      {notice ? (
        <p className="ds-visually-hidden" role="status">
          {notice}
        </p>
      ) : null}
      <dialog
        ref={dialog}
        className="ds-dialog ds-dialog--wide ds-x-builder"
        aria-labelledby={titleId}
        onClose={(event) => {
          if (event.target === dialog.current) change(false)
        }}
        onCancel={(event) => {
          if (event.target === dialog.current) change(false)
        }}
        onClick={(event) => {
          if (event.target === dialog.current) change(false)
        }}
      >
        <div className="ds-dialog-head">
          <div>
            <p className="ds-dialog-title" id={titleId}>
              New experiment
            </p>
            <p className="ds-dialog-sub">
              Five questions, already answered from the template. Change whatever is different.
            </p>
            <p className="ds-x-head-key">
              Named for you <span className="ds-mono">{plan?.experimentKey ?? '—'}</span>
            </p>
          </div>
          <button
            type="button"
            className="ds-dialog-x"
            aria-label="Close. Your choices are kept."
            onClick={() => change(false)}
          >
            ✕
          </button>
        </div>
        <nav className="ds-x-steps" aria-label="Steps">
          {STEPS.map((label, index) => (
            <button
              key={label}
              type="button"
              className="ds-x-step"
              aria-current={state.step === index + 1 ? 'step' : undefined}
              onClick={() => dispatch({ type: 'step', step: (index + 1) as BuilderState['step'] })}
            >
              <span className="ds-n">{index + 1}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className={`ds-x-panes${state.step === 6 ? '' : ' ds-x-split'}`}>
          <section className="ds-x-main">
            {state.step === 1 ? <What state={state} data={data} dispatch={dispatch} /> : null}
            {state.step === 2 ? <Who state={state} data={data} dispatch={dispatch} /> : null}
            {state.step === 3 ? <See state={state} dispatch={dispatch} /> : null}
            {state.step === 4 ? <Know state={state} data={data} dispatch={dispatch} /> : null}
            {state.step === 5 ? <Long state={state} plan={plan} dispatch={dispatch} /> : null}
            {state.step === 6 ? <Review state={state} plan={plan} dispatch={dispatch} /> : null}
          </section>
          {state.step === 6 ? null : <PlanPanel plan={plan} weeks={state.answers.weeks} />}
        </div>
        <div className="ds-dialog-actions">
          <span className="ds-dialog-note">{footer}</span>
          <Button variant="secondary" state={pending ? 'disabled' : undefined} onClick={() => void save()}>
            Save draft
          </Button>
          {state.step > 1 ? (
            <Button
              variant="secondary"
              state={pending ? 'disabled' : undefined}
              onClick={() => dispatch({ type: 'step', step: (state.step - 1) as BuilderState['step'] })}
            >
              Back
            </Button>
          ) : null}
          <Button
            state={pending || (state.step === 6 && (!plan || plan.failing > 0)) ? 'disabled' : undefined}
            onClick={() =>
              state.step === 6
                ? void start()
                : dispatch({ type: 'step', step: (state.step + 1) as BuilderState['step'] })
            }
          >
            {primary}
          </Button>
          {error ? (
            <p className="ds-x-message" role="alert">
              {error}
            </p>
          ) : null}
          {retryKey ? (
            <p className="ds-x-message">
              Running, but the split isn&apos;t serving yet.{' '}
              <button type="button" className="ds-fix" onClick={() => void retry()}>
                Retry
              </button>
            </p>
          ) : null}
          {returnedChecks ? <CheckList checks={returnedChecks} dispatch={dispatch} /> : null}
        </div>
      </dialog>
    </>
  )
}

function Filled({ state }: { state: BuilderState }) {
  return (
    <p className="ds-x-filled">
      Pre-filled by the <b>{EXPERIMENT_TEMPLATES[state.answers.template].name}</b> template. Change anything
      that does not fit.
    </p>
  )
}
function What({
  state,
  data,
  dispatch,
}: {
  state: BuilderState
  data: BuilderPageData
  dispatch: (action: BuilderAction) => void
}) {
  const areas = new Map<string, BuilderFeature[]>()
  data.features.forEach((item) => {
    const area = item.flagKey.split('.')[0] ?? item.flagKey
    areas.set(area, [...(areas.get(area) ?? []), item])
  })
  return (
    <>
      <h3>What are you changing, and why?</h3>
      <p className="ds-x-lede">
        Pick the kind of test and the feature it changes. The template answers the other four questions for
        you.
      </p>
      <div className="ds-x-tpls">
        {EXPERIMENT_TEMPLATE_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className="ds-x-tpl"
            aria-pressed={state.answers.template === key}
            onClick={() =>
              dispatch({ type: 'template', template: key, context: contextFor(data, state.answers.flagKey) })
            }
          >
            <span className="ds-t">{EXPERIMENT_TEMPLATES[key].name}</span>
            <span className="ds-d">{EXPERIMENT_TEMPLATES[key].description}</span>
          </button>
        ))}
      </div>
      <label className="ds-x-sel">
        The feature it changes
        <select
          value={state.answers.flagKey ?? '__new'}
          onChange={(event) => {
            const flagKey = event.target.value === '__new' ? null : event.target.value
            dispatch({ type: 'feature', flagKey, context: contextFor(data, flagKey) })
          }}
        >
          {[...areas.entries()].map(([area, features]) => (
            <optgroup key={area} label={area}>
              {features.map((item) => (
                <option key={item.flagKey} value={item.flagKey}>
                  {item.description} · {item.flagKey}
                </option>
              ))}
            </optgroup>
          ))}
          <optgroup label="Not built yet">
            <option value="__new">A new feature just for this test</option>
          </optgroup>
        </select>
      </label>
      <p className="ds-x-hint">
        {state.answers.flagKey === null
          ? 'It is created with this test. You can save a draft, but it cannot start until code checks it.'
          : 'Its values become the versions in step 3. You never bind anything by hand.'}
      </p>
      <p className="ds-x-sentence">
        We believe showing{' '}
        <span className="ds-x-inl">
          <select
            aria-label="The new version"
            value={state.answers.versions[1]}
            onChange={(event) => dispatch({ type: 'version-rename', index: 1, name: event.target.value })}
          >
            {[...new Set([state.answers.versions[1], ...TREATMENT_NAMES])].map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </span>{' '}
        to{' '}
        <button type="button" className="ds-x-link-tok" onClick={() => dispatch({ type: 'step', step: 2 })}>
          {whoWords(state.answers)}
          <small>step 2</small>
        </button>{' '}
        {EXPERIMENT_TEMPLATES[state.answers.template].guarded ? (
          <b>won&rsquo;t lower</b>
        ) : (
          <span className="ds-x-inl">
            <select
              aria-label="Direction"
              value={state.answers.direction}
              onChange={(event) =>
                dispatch({ type: 'direction', direction: event.target.value as 'increase' | 'decrease' })
              }
            >
              <option value="increase">will raise</option>
              <option value="decrease">will lower</option>
            </select>
          </span>
        )}{' '}
        <span className="ds-x-inl">
          <select
            value={state.answers.metric}
            onChange={(event) => dispatch({ type: 'metric', metric: event.target.value })}
          >
            {metricCandidates(data.catalog).map((event) => (
              <option key={event} value={event}>
                {eventWords(event)}
              </option>
            ))}
          </select>
        </span>{' '}
        because{' '}
        <span className="ds-x-inl">
          <select
            value={state.answers.why}
            onChange={(event) =>
              dispatch({ type: 'why', why: event.target.value as keyof typeof EXPERIMENT_REASONS })
            }
          >
            {Object.entries(EXPERIMENT_REASONS).map(([key, reason]) => (
              <option key={key} value={key}>
                {reason}
              </option>
            ))}
          </select>
        </span>
        .
      </p>
    </>
  )
}
function Who({
  state,
  data,
  dispatch,
}: {
  state: BuilderState
  data: BuilderPageData
  dispatch: (action: BuilderAction) => void
}) {
  const free = FIELDS.filter(
    (field) => !state.answers.who.conditions.some((condition) => condition.field === field)
  )
  return (
    <>
      <h3>Who’s in it?</h3>
      <p className="ds-x-lede">
        The same conditions features use. Every value below is one your events already carry, with how common
        it is.
      </p>
      <Filled state={state} />
      <div className="ds-x-segmented" role="group">
        <button
          type="button"
          aria-pressed={state.answers.who.mode === 'everyone'}
          onClick={() => dispatch({ type: 'who-mode', mode: 'everyone' })}
        >
          Everyone who reaches it
        </button>
        <button
          type="button"
          aria-pressed={state.answers.who.mode === 'some'}
          onClick={() => dispatch({ type: 'who-mode', mode: 'some' })}
        >
          Only some people
        </button>
      </div>
      {state.answers.who.mode === 'some'
        ? state.answers.who.conditions.map((condition, index) => {
            const segment = data.catalog.segments.find((item) => item.field === condition.field)
            return (
              <div className="ds-x-rule" key={`${condition.field}-${index}`}>
                <div className="ds-x-rule-top">
                  <span>{index ? 'and' : 'Only'}</span>
                  <select
                    aria-label={`Condition ${index + 1} field`}
                    value={condition.field}
                    onChange={(event) =>
                      dispatch({
                        type: 'condition-field',
                        index,
                        field: event.target.value as ExperimentConditionField,
                      })
                    }
                  >
                    {[condition.field, ...free]
                      .filter((field, position, values) => values.indexOf(field) === position)
                      .map((field) => (
                        <option key={field} value={field}>
                          {field}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    className="ds-rm"
                    onClick={() => dispatch({ type: 'condition-remove', field: condition.field })}
                  >
                    Remove
                  </button>
                </div>
                <div className="ds-x-vals">
                  {segment?.values
                    .filter((value) => predicateValueAllowed(value.value))
                    .map((value) => (
                      <button
                        type="button"
                        className="ds-chip"
                        key={`${typeof value.value}:${String(value.value)}`}
                        aria-pressed={condition.values.some(
                          (selected) => typeof selected === typeof value.value && selected === value.value
                        )}
                        onClick={() =>
                          dispatch({ type: 'condition-value', index, value: value.value as FlagScalar })
                        }
                      >
                        {String(value.value)} <span className="ds-pc">{percent.format(value.share)}</span>
                      </button>
                    ))}
                </div>
                <p className="ds-x-cov">
                  {segment
                    ? `${percent.format(segment.coverage)} of recent events carry this tag.`
                    : 'No recent events carry this tag.'}
                </p>
              </div>
            )
          })
        : null}
      {state.answers.who.mode === 'some' ? (
        <button
          type="button"
          className="ds-x-add"
          disabled={free.length === 0}
          onClick={() => dispatch({ type: 'condition-add', field: free[0] ?? 'region' })}
        >
          + Add a condition
        </button>
      ) : null}
      <p className="ds-x-label">How many of them</p>
      <div className="ds-chips">
        {[10, 25, 50, 100].map((value) => (
          <button
            key={value}
            type="button"
            className="ds-chip"
            aria-pressed={state.answers.who.allocation === value}
            onClick={() => dispatch({ type: 'allocation', allocation: value })}
          >
            {value}%
          </button>
        ))}
      </div>
      <input
        type="range"
        className="ds-x-range"
        min="5"
        max="100"
        step="5"
        value={state.answers.who.allocation}
        aria-label="How many people are in the test"
        onChange={(event) => dispatch({ type: 'allocation', allocation: Number(event.target.value) })}
      />
      <p className="ds-x-label">Count each</p>
      <div className="ds-x-picklist">
        {data.catalog.entities.map((entity) => (
          <button
            key={entity.type}
            type="button"
            className="ds-x-pick"
            aria-pressed={state.answers.entity === entity.type}
            onClick={() => dispatch({ type: 'entity', entity: entity.type })}
          >
            <span className="ds-radio" />
            <span>
              <b>{entityPlural(entity.type)}</b>
              <small>{whole.format(entity.subjects14d)} seen · 14 days</small>
            </span>
          </button>
        ))}
      </div>
    </>
  )
}
function See({ state, dispatch }: { state: BuilderState; dispatch: (action: BuilderAction) => void }) {
  // The planner's own split — never a second formula (and never "equal%": agy, PR #170).
  const weights = versionWeights(state.answers.versions.length, state.answers.split)
  return (
    <>
      <h3>What they see</h3>
      <p className="ds-x-lede">The current version and the new one, side by side.</p>
      <Filled state={state} />
      <div className="ds-x-vers">
        {state.answers.versions.map((name, index) => (
          <article className="ds-x-ver" key={`${name}-${index}`}>
            <header className="ds-x-ver-head">
              <span className={`ds-x-tag ${index ? 'ds-treat' : 'ds-control'}`}>
                {index ? `Version ${String.fromCharCode(65 + index)}` : 'Control'}
              </span>
              <select
                value={name}
                aria-label={`Name for ${index ? `version ${String.fromCharCode(65 + index)}` : 'control'}`}
                onChange={(event) => dispatch({ type: 'version-rename', index, name: event.target.value })}
              >
                {[...(index ? TREATMENT_NAMES : CONTROL_NAMES), ...state.answers.versions]
                  .filter((option, position, options) => options.indexOf(option) === position)
                  .map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
              </select>
            </header>
            <div className="ds-x-ver-body">
              <span className="ds-mono">value: {name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}</span>
            </div>
            <footer className="ds-x-ver-foot">
              <span>{index ? 'What the change looks like' : 'What they see today'}</span>
              {state.answers.flagKey === null && index > 1 ? (
                <button
                  type="button"
                  className="ds-rm"
                  onClick={() => dispatch({ type: 'version-remove', index })}
                >
                  Remove
                </button>
              ) : null}
              <span className="ds-pct">{weights[index]}%</span>
            </footer>
          </article>
        ))}
        {state.answers.flagKey === null && state.answers.versions.length < 4 ? (
          <button
            type="button"
            className="ds-x-ver ds-x-ver-add"
            onClick={() => dispatch({ type: 'version-add' })}
          >
            + Add a version<small>Up to four. Each one needs more people.</small>
          </button>
        ) : null}
      </div>
      {state.answers.versions.length === 2 ? (
        <>
          <p className="ds-x-label">How to split them</p>
          <div className="ds-chips">
            {[
              [50, 'Even · 50 / 50'],
              [20, 'Mostly current · 80 / 20'],
              [10, 'Cautious · 90 / 10'],
            ].map(([split, label]) => (
              <button
                type="button"
                className="ds-chip"
                key={split}
                aria-pressed={state.answers.split === split}
                onClick={() => dispatch({ type: 'split', split: Number(split) })}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            type="range"
            className="ds-x-range"
            min="5"
            max="95"
            step="5"
            value={state.answers.split}
            aria-label={`Share that sees ${state.answers.versions[1]}`}
            onChange={(event) => dispatch({ type: 'split', split: Number(event.target.value) })}
          />
        </>
      ) : (
        <p className="ds-x-hint">Versions split evenly.</p>
      )}
    </>
  )
}
function Sparkline({ daily }: { daily: number[] }) {
  const top = Math.max(...daily, 1)
  return (
    <svg className="ds-spark" viewBox="0 0 100 24" aria-label="Last 14 days">
      <polyline
        fill="none"
        points={daily
          .map(
            (value, index) => `${index * (100 / Math.max(daily.length - 1, 1))},${24 - (value / top) * 20}`
          )
          .join(' ')}
      />
    </svg>
  )
}
function Know({
  state,
  data,
  dispatch,
}: {
  state: BuilderState
  data: BuilderPageData
  dispatch: (action: BuilderAction) => void
}) {
  const metrics = data.catalog.events.filter((event) => !event.reserved)
  const suggested = EXPERIMENT_TEMPLATES[state.answers.template].metricPattern
  const row = (
    event: (typeof metrics)[number],
    selected: boolean,
    guardrail: boolean,
    action: BuilderAction
  ) => (
    <button
      type="button"
      className={`ds-x-metric${guardrail ? ' ds-cb' : ''}`}
      key={event.event}
      aria-pressed={selected}
      onClick={() => dispatch(action)}
    >
      <span className="ds-radio" />
      <span>
        <span className="ds-nm">
          {eventWords(event.event)}{' '}
          {!guardrail && suggested.test(event.event) ? <small className="ds-sug">suggested</small> : null}
          {event.count24h === 0 ? <small className="ds-stale">quiet for 24h</small> : null}
        </span>
        <span className="ds-ev">{event.event}</span>
      </span>
      <span className="ds-num">
        <Sparkline daily={event.daily} />
        <span>
          <b>{whole.format(event.count14d)}</b>
          <small>
            {percent.format(
              data.catalog.baselines.find(
                (baseline) => baseline.event === event.event && baseline.type === state.answers.entity
              )?.baseline ?? 0
            )}
          </small>
        </span>
      </span>
    </button>
  )
  return (
    <>
      <h3>How will you know?</h3>
      <p className="ds-x-lede">
        Pick from events your product already sends. Each shows its last 14 days and how often people do it
        today.
      </p>
      <Filled state={state} />
      <p className="ds-x-label">The one number that decides it</p>
      <div className="ds-x-metrics">
        {metrics.map((event) =>
          row(event, state.answers.metric === event.event, false, { type: 'metric', metric: event.event })
        )}
      </div>
      <p className="ds-x-label">It should</p>
      <div className="ds-x-segmented">
        <button
          type="button"
          aria-pressed={state.answers.direction === 'increase'}
          onClick={() => dispatch({ type: 'direction', direction: 'increase' })}
        >
          Go up
        </button>
        <button
          type="button"
          aria-pressed={state.answers.direction === 'decrease'}
          onClick={() => dispatch({ type: 'direction', direction: 'decrease' })}
        >
          Go down
        </button>
      </div>
      <p className="ds-x-label">Must not get worse</p>
      <div className="ds-x-metrics">
        {metrics
          .filter((event) => event.event !== state.answers.metric)
          .map((event) =>
            row(event, state.answers.guardrails.includes(event.event), true, {
              type: 'guardrail',
              event: event.event,
            })
          )}
      </div>
      <p className="ds-x-label">Break results down by</p>
      <div className="ds-chips">
        {FIELDS.map((field) => (
          <button
            type="button"
            className="ds-chip"
            key={field}
            aria-pressed={state.answers.breakdowns.includes(field)}
            onClick={() => dispatch({ type: 'breakdown', field })}
          >
            {field}
          </button>
        ))}
      </div>
    </>
  )
}
function Long({
  state,
  plan,
  dispatch,
}: {
  state: BuilderState
  plan: ExperimentPlan | null
  dispatch: (action: BuilderAction) => void
}) {
  const estimate = plan?.estimate
  return (
    <>
      <h3>How long?</h3>
      <p className="ds-x-lede">
        Pick the smallest change you would act on. We turn it into days using your real traffic.
      </p>
      <Filled state={state} />
      <div className="ds-x-mde">
        <strong>{state.answers.mde}%</strong>
        <span>smallest change worth knowing about</span>
      </div>
      <input
        type="range"
        className="ds-x-range"
        min="5"
        max="30"
        step="1"
        value={state.answers.mde}
        onChange={(event) => dispatch({ type: 'mde', mde: Number(event.target.value) })}
      />
      <div className="ds-x-trade">
        {[5, 10, 20].map((mde) => (
          <button
            type="button"
            key={mde}
            aria-pressed={state.answers.mde === mde}
            onClick={() => dispatch({ type: 'mde', mde })}
          >
            <b>{mde}%</b>
            <small>
              {mde === 5 ? 'Only small wins matter' : mde === 10 ? 'A clear improvement' : 'Only a big swing'}
            </small>
          </button>
        ))}
      </div>
      <div className="ds-x-est">
        <strong>{estimate?.days === null || !estimate ? '—' : `≈ ${estimate.days} days`}</strong>
        <span>
          {estimate?.needPerVersion === null || !estimate
            ? 'No baseline yet.'
            : `at your current traffic; ${whole.format(estimate.needPerVersion)} per version.`}
        </span>
      </div>
      <p className="ds-x-label">Run it for</p>
      <div className="ds-chips">
        {WEEK_OPTIONS.map((weeks) => (
          <button
            key={weeks}
            type="button"
            className="ds-chip"
            aria-pressed={state.answers.weeks === weeks}
            onClick={() => dispatch({ type: 'weeks', weeks })}
          >
            {weeks} week{weeks === 1 ? '' : 's'}
            {estimate?.recommendedWeeks === weeks ? ' · recommended' : ''}
          </button>
        ))}
      </div>
      <p className="ds-x-label">Start</p>
      <div className="ds-chips">
        <button type="button" className="ds-chip" aria-pressed>
          When I press Start
        </button>
      </div>
    </>
  )
}
function Sentence({ parts }: { parts: ExperimentPlan['sentence'] }) {
  return (
    <>
      {parts.map((part, index) =>
        part.emphasis ? <em key={index}>{part.text}</em> : <span key={index}>{part.text}</span>
      )}
    </>
  )
}
function Review({
  state,
  plan,
  dispatch,
}: {
  state: BuilderState
  plan: ExperimentPlan | null
  dispatch: (action: BuilderAction) => void
}) {
  if (!plan)
    return (
      <p className="ds-x-message">
        Plan unavailable. Choose a feature and metric from this project to continue.
      </p>
    )
  const rows: Array<[string, string, BuilderState['step']]> = [
    ['Feature', plan.flagKey, 1],
    ['Why', EXPERIMENT_REASONS[state.answers.why], 1],
    ['Who', `${state.answers.who.allocation}% of ${entityPlural(state.answers.entity)}`, 2],
    [
      'Split',
      state.answers.versions.map((version, index) => `${version} ${plan.weights[index]}%`).join(' · '),
      3,
    ],
    [
      'Decides it',
      `${eventWords(state.answers.metric)} should ${state.answers.direction === 'increase' ? 'go up' : 'go down'}`,
      4,
    ],
    [
      'Guardrails',
      state.answers.guardrails.length ? state.answers.guardrails.map(eventWords).join(' · ') : 'None',
      4,
    ],
    [
      'Runs',
      `${state.answers.weeks} weeks; ${plan.estimate.days === null ? 'an estimate is not available' : `about ${plan.estimate.days} days needed`}`,
      5,
    ],
  ]
  return (
    <>
      <h3>Check it over</h3>
      <p className="ds-x-lede">One sentence for the whole plan, then the checks we ran on your real data.</p>
      <p className="ds-x-big-sentence">
        <Sentence parts={plan.sentence} />
      </p>
      <div className="ds-x-rev-grid">
        <div>
          <div className="ds-x-mini-vers">
            {state.answers.versions.map((version, index) => (
              <div key={`${version}-${index}`}>
                <span className={`ds-x-tag ${index ? 'ds-treat' : 'ds-control'}`}>
                  {index ? `Version ${String.fromCharCode(65 + index)}` : 'Control'}
                </span>
                <span>{version}</span>
                <span className="ds-mono">{plan.weights[index]}%</span>
              </div>
            ))}
          </div>
          <div className="ds-review">
            {rows.map(([key, value, step]) => (
              <div key={key}>
                <span>{key}</span>
                <span>{value}</span>
                <button type="button" className="ds-edit" onClick={() => dispatch({ type: 'step', step })}>
                  Edit
                </button>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="ds-label">
            Before it starts · {plan.checks.length - plan.failing} of {plan.checks.length} pass
          </p>
          <CheckList checks={plan.checks} dispatch={dispatch} />
          <p className="ds-x-hint">
            Nothing here is ticked by hand. Each check runs against what your events and features did in the
            last day.
          </p>
        </div>
      </div>
    </>
  )
}
function CheckList({
  checks,
  dispatch,
}: {
  checks: ExperimentCheck[]
  dispatch: (action: BuilderAction) => void
}) {
  return (
    <div className="ds-x-checks" aria-live="polite">
      {checks.map((check) => (
        <div className={`ds-x-check ds-${check.status}`} key={check.id}>
          <span className={`ds-mk ds-mk--${check.status}`} aria-hidden="true">
            <Icon
              name={
                check.status === 'ok' ? 'check' : check.status === 'warn' ? 'warning' : 'warning-triangle'
              }
              size={10}
            />
          </span>
          <span className="ds-visually-hidden">
            {check.status === 'ok' ? 'Passes' : check.status === 'warn' ? 'Look at this' : 'Fix this'}:{' '}
          </span>
          <div>
            <b>{check.title}</b>
            <p>{check.detail}</p>
            {check.fix ? (
              <button
                type="button"
                className="ds-fix"
                onClick={() => dispatch({ type: 'check-fix', fix: check.fix! })}
              >
                {check.fix.label} →
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}
function PlanPanel({ plan, weeks }: { plan: ExperimentPlan | null; weeks: number }) {
  return (
    <aside className="ds-x-side" aria-label="The plan so far">
      <p className="ds-label">The plan so far</p>
      {plan ? (
        <>
          <p className="ds-x-plan-sentence">
            <Sentence parts={plan.sentence} />
          </p>
          <div className="ds-x-days">
            <strong>{plan.estimate.days === null ? '—' : `≈ ${plan.estimate.days}`}</strong>
            <span>{plan.estimate.days === null ? 'nobody matches yet' : 'days at your traffic'}</span>
          </div>
          <div className="ds-x-kv">
            <div>
              <span>In the test</span>
              <b>{whole.format(plan.estimate.inTestPerDay)}/day</b>
            </div>
            <div>
              <span>Needs</span>
              <b>
                {plan.estimate.needPerVersion === null
                  ? '—'
                  : `${whole.format(plan.estimate.needPerVersion)} per version`}
              </b>
            </div>
            <div>
              <span>Planned</span>
              <b>{weeks} weeks</b>
            </div>
          </div>
          <p className="ds-x-checksum">
            <b>
              {plan.checks.length - plan.failing} of {plan.checks.length} checks pass
            </b>
          </p>
        </>
      ) : (
        <p>Choose a valid plan to see its estimate.</p>
      )}
    </aside>
  )
}
