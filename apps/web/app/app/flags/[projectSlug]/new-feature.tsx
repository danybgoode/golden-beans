'use client'
// console-ia-overhaul · Sprint 3, Story 3.3 — the replacement, landed in the same commit as the
// deletion it replaces.
//
// ⚠️ **This control is why Story 3.3 is allowed to delete anything.** Before it, the product had
// exactly TWO surfaces that could create a feature key that does not yet exist, both on the features
// list and both deleted by this story: the raw-JSON `<form onSubmit={onCreate}>` in
// `flag-manager.tsx` and the `RuleBuilder`'s free-text "Flag key" input (epic README, A3 and A21 —
// A3 said "the only surface" and was wrong about the count, which is recorded rather than quietly
// fixed because a reader who believed it could conclude that deleting one of the two is safe).
// `[flagKey]/page.tsx` renders `<FlagAuthoring flagKey={flag.key} />` with the key fixed from the
// route, so it versions a feature you can already click and can create nothing.
//
// Land the replacement and retire the original in the SAME story (Roadmap/LEARNINGS.md). With the
// console LIVE in production since Sprint 2 (A19), that rule is load-bearing rather than prudent:
// there is no dark period in which a missing control would go unnoticed.
//
// ── One write path, one validator ─────────────────────────────────────────────────────────────
// It posts through `createFlagDefinitionVersionAction` — the same server action both deleted
// surfaces used (`flags-visual-rule-builder` A1). That action re-resolves ownership server-side via
// `requireProjectOwnership`, validates the key with the SDK's `validateFlagKey` and the definition
// with `parseFlagDefinition`. This component adds a SURFACE. It adds no authority and no second
// validator: everything in `lib/new-feature-draft.ts` COMPOSES a payload those two accept, and a
// bug there produces a server rejection rather than an unvalidated write.
//
// ── Where the logic is, and why it is not here ────────────────────────────────────────────────
// `/app/flags/<slug>` is credential-gated, so anything asserted only from inside this file is
// asserted only in a browser with a real session — which this repo's blocking gate has neither of.
// So composition, normalisation and per-step completeness live in `lib/new-feature-draft.ts` where
// `npm run test:unit` reaches them, and this file is keystrokes and markup.
//
// ── Deviation from the prototype, stated rather than discovered (A23) ─────────────────────────
// The approved wizard's third step is "Where should it exist?", which activates the new feature in
// the chosen environments. That is a SECOND write — `activateFlagAction`, per environment, each
// carrying an optimistic snapshot revision and each gated on `FLAG_SERVING_ENABLED` — and a
// create-then-activate sequence has a partial-failure state (the feature exists, the activations
// did not happen) that this control would have to explain. Story 3.3's locked contract is "posting
// through the SAME `createFlagDefinitionVersionAction` — one write path, one validator", so step 3
// is the review instead, and the new feature arrives switched on nowhere. Turning it on is one
// click from the row's own switch, which this story also lands.

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import {
  EMPTY_NEW_FEATURE_DRAFT,
  NEW_FEATURE_KEY_SUFFIX,
  NEW_FEATURE_STEPS,
  NO_FEATURE_AREA,
  buildNewFeatureDefinition,
  composeFeatureKey,
  describeNewFeatureArrival,
  newFeatureReason,
  normaliseFeatureName,
  previewFeatureKey,
  stepProblem,
  takenKeyProblem,
  type NewFeatureDraft,
  type NewFeatureRisk,
} from '@/lib/new-feature-draft'
import { CRITICALITY_LABEL, TYPE_LABEL } from './flag-vocabulary'
import { createFlagDefinitionVersionAction } from './actions'

const STEP_LABEL: Record<(typeof NEW_FEATURE_STEPS)[number], string> = {
  name: 'Name',
  kind: 'Kind',
  check: 'Check',
}

const RISKS: NewFeatureRisk[] = ['high', 'medium', 'low']

export function NewFeature({
  slug,
  areas,
  existingKeys,
}: {
  slug: string
  /** The namespaces this project already uses, derived from its own keys server-side. */
  areas: readonly string[]
  /** Every key on the list, so the wizard can refuse one that is already taken (advisory). */
  existingKeys: readonly string[]
}) {
  const [open, setOpen] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [draft, setDraft] = useState<NewFeatureDraft>(EMPTY_NEW_FEATURE_DRAFT)
  const [error, setError] = useState<string | null>(null)
  // ── `useTransition`'s isPending does NOT span an async action (React 18) ─────────────────────
  // Same hazard, same fix, and the same reasoning as `[flagKey]/flag-switch.tsx`: react-dom 18.3.1
  // clears `isPending` before awaiting, so the create button would stay enabled while the write is
  // in flight and a second click would create a SECOND version. Our own flag is set synchronously.
  const [busy, setBusy] = useState(false)
  const [pending, startTransition] = useTransition()
  const inFlight = busy || pending
  /**
   * The key that was just created, once the write has landed.
   *
   * ⚠️ **This exists because of what cross-review (vibe) found and what its FIX would have broken.**
   * The finding: `create()` returned before `setBusy(false)` on success, so a create that wrote the
   * row and then failed to navigate left the dialog locked — with Escape refusing, because Escape
   * refuses while in flight. Real, and the bite is that there is no way out.
   *
   * Its suggested fix — clear `busy` in a `finally` — reintroduces the defect the in-flight lock
   * exists to prevent: the Create button would come back live while the browser is leaving the
   * page, and the registry is append-only, so a second click writes a permanent duplicate version.
   *
   * So neither the instance nor "no change". The write SUCCEEDED; the only open question is whether
   * the navigation did. Recording the key retires the Create button (it cannot be pressed twice),
   * unlocks the dialog (Escape works again) and leaves the reader a LINK to the thing that now
   * exists. If the navigation happens, none of this is ever seen.
   */
  const [created, setCreated] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)

  const step = NEW_FEATURE_STEPS[stepIndex]
  const key = composeFeatureKey(draft.area, draft.name)
  // ⚠️ The taken-key check is folded in at EVERY step, not only at the one that owns the name
  // field. A reader can walk back from `check`, retype the name into one that exists, and walk
  // forward again — a guard that only ran on the way past step 1 would miss exactly that path.
  const blocked = stepProblem(draft, step) ?? takenKeyProblem(key, existingKeys)

  const close = useCallback(() => {
    setOpen(false)
    setStepIndex(0)
    setDraft(EMPTY_NEW_FEATURE_DRAFT)
    setError(null)
    setCreated(null)
  }, [])

  // ── A native <dialog>, driven by an effect — the pattern `ConfirmDialog` already proves here ──
  //
  // ⚠️ The first version was a `<div role="dialog" aria-modal="true">` over a scrim, and
  // `aria-modal="true"` on a container that does not trap focus is a claim the markup cannot keep:
  // Tab walked straight out of the wizard onto the page behind it, and closing restored focus
  // nowhere. `showModal()` gives the trap, the inert background, the top layer and — the part that
  // matters most for a keyboard user — focus RESTORATION to the "+ New feature" button.
  //
  // It is rendered ALWAYS, never `{open && …}`, for the reason `ConfirmDialog`'s own comment
  // records: unmounting removes the node before the effect can call `close()`, so the browser never
  // performs that restoration and the user is left on `<body>` with no way back to the control they
  // came from.
  useEffect(() => {
    const element = dialogRef.current
    if (!element) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  // The field a step is about gets focus when that step arrives, so the wizard is usable without
  // reaching for the mouse between steps.
  useEffect(() => {
    if (open && step === 'name') nameRef.current?.focus()
  }, [open, step])

  function create() {
    setError(null)
    setBusy(true)
    startTransition(async () => {
      try {
        const result = await createFlagDefinitionVersionAction(
          slug,
          key,
          JSON.stringify(buildNewFeatureDefinition(draft)),
          newFeatureReason(key)
        )
        if (result.ok) {
          // Recorded BEFORE the navigation, so the dialog has something true to say if the
          // navigation never happens. See `created`'s own note.
          setCreated(key)
          setBusy(false)
          // A full navigation rather than a router push, for the same reason every link in the
          // console is a plain `<a>`: the destination is a server-rendered route whose guards run on
          // the request. Landing ON the new feature is also the answer to "what now" — it is where
          // its switch is, and this wizard deliberately turns nothing on.
          window.location.assign(`/app/flags/${slug}/${encodeURIComponent(key)}`)
          return
        }
        // The server's verbatim rejection, rendered rather than swallowed.
        setError(result.error ?? 'The feature could not be created.')
      } catch {
        setError('The feature could not be created. Try again.')
      }
      setBusy(false)
    })
  }

  return (
    <>
      {/* ⚠️ The TRIGGER is on the design system; the MODAL below is not, and that is a stated
          deviation rather than an oversight (design-system-rails S4.1). This button sits in the
          page head beside "Compare environments", so a `console.css` `.btn` next to a `.ds-btn`
          would be two buttons of different heights in one row — visible on the screen Story 4.1 is
          measured against. The wizard itself is a seven-field overlay with its own approved state
          that no story in this sprint cites, and porting it here would be an unreviewed screen
          smuggled into a story about a list. */}
      <button type="button" className="ds-btn ds-btn--primary" onClick={() => setOpen(true)}>
        + New feature
      </button>

      <dialog
        ref={dialogRef}
        className="modal"
        aria-labelledby="new-feature-title"
        // `Esc` fires `cancel` before `close`. Routing it through the same handler as the ✕ button
        // is what makes "Esc dismisses without acting" true by construction rather than by review —
        // there is no second path that could grow an action later (`ConfirmDialog`'s rule).
        //
        // ⚠️ It refuses while a write is in flight: closing mid-create would drop the surface that
        // is about to report whether the write succeeded, and the write itself does not stop.
        // `preventDefault()` runs either way, so the browser cannot close the dialog behind React's
        // back and leave `open` saying otherwise.
        onCancel={(event) => {
          event.preventDefault()
          if (!inFlight) close()
        }}
      >
        {open && (
          <>
            <div className="modal-head">
              <div>
                <h2 id="new-feature-title">New feature</h2>
                <div className="sub">Three steps. One word to type.</div>
              </div>
              <button type="button" className="x" onClick={close} disabled={inFlight} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="modal-body">
              {/* The step rail. `aria-current` rather than colour alone — the same rule the section
                  tabs and the summary cards follow. */}
              <ol className="steps">
                {NEW_FEATURE_STEPS.map((candidate, index) => (
                  <li
                    key={candidate}
                    className="step"
                    data-on={String(index === stepIndex)}
                    data-done={String(index < stepIndex)}
                    aria-current={index === stepIndex ? 'step' : undefined}
                  >
                    <span className="n">{index + 1}</span>
                    {STEP_LABEL[candidate]}
                    <span className="line" />
                  </li>
                ))}
              </ol>

              {step === 'name' && (
                <>
                  <div className="field">
                    <span className="lab" id="new-feature-key-label">
                      Name it
                    </span>
                    <div className="keyfield">
                      {/* ⚠️ The areas are DERIVED from this project's own keys, not a hardcoded
                          list. The prototype hardcodes sixteen, which are exactly this tenant's —
                          a mock's fixture. See `featureAreas`. */}
                      {areas.length > 0 && (
                        <span className="sel">
                          <select
                            aria-label="Area"
                            value={draft.area}
                            onChange={(event) => setDraft({ ...draft, area: event.target.value })}
                          >
                            <option value={NO_FEATURE_AREA}>no area</option>
                            {areas.map((area) => (
                              <option key={area} value={area}>
                                {area}
                              </option>
                            ))}
                          </select>
                        </span>
                      )}
                      <input
                        ref={nameRef}
                        aria-label="Feature name"
                        aria-describedby="new-feature-preview"
                        placeholder="what_it_controls"
                        value={draft.name}
                        // Normalised on the way IN, so the reader watches the correction happen
                        // rather than being told about it after three steps.
                        onChange={(event) =>
                          setDraft({ ...draft, name: normaliseFeatureName(event.target.value) })
                        }
                      />
                      <span className="suffix">{NEW_FEATURE_KEY_SUFFIX}</span>
                    </div>
                    <p className="hint">
                      The area comes from a list and the ending is fixed — the middle is the only thing anyone
                      types in this console, because it is the word the code will import.
                    </p>
                    <div className="note-box" id="new-feature-preview">
                      <span className="lab2">Code will import</span>
                      <span className="mono key-preview">{previewFeatureKey(draft.area, draft.name)}</span>
                    </div>
                  </div>

                  {/* Required, and the words are the approved design's own — the Settings pane calls
                      this "What this controls" and says it is the line the list shows. It is also
                      not optional at the seam: `parseFlagDefinition` rejects a blank description,
                      so a wizard without this field would compose a payload the server refuses. */}
                  <div className="field">
                    <span className="lab">What this controls</span>
                    <input
                      className="text-input"
                      aria-label="What this controls"
                      maxLength={500}
                      value={draft.description}
                      onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                    />
                    <p className="hint">
                      One sentence, in the words a person would use. This is the line the list shows.
                    </p>
                  </div>
                </>
              )}

              {step === 'kind' && (
                <>
                  <div className="field">
                    <span className="lab">What kind of switch is it?</span>
                    <div className="cardpick">
                      <button
                        type="button"
                        className="pick"
                        aria-pressed={draft.kind === 'killswitch'}
                        onClick={() => setDraft({ ...draft, kind: 'killswitch' })}
                      >
                        {/* The words come from `flag-vocabulary.ts`, which owns every user-facing
                            flag term (D7 of flags-console-parity). `killswitch` is the STORED
                            spelling; "Kill switch" is what a person reads. */}
                        <span className="t">{TYPE_LABEL.killswitch}</span>
                        <span className="d">On by default. You turn it off when something breaks.</span>
                      </button>
                      <button
                        type="button"
                        className="pick"
                        aria-pressed={draft.kind === 'enablement'}
                        onClick={() => setDraft({ ...draft, kind: 'enablement' })}
                      >
                        <span className="t">{TYPE_LABEL.enablement}</span>
                        <span className="d">Off by default. You turn it on when you ship.</span>
                      </button>
                    </div>
                  </div>
                  <div className="field">
                    <span className="lab">If it goes the wrong way, how bad is it?</span>
                    <div className="chips">
                      {RISKS.map((risk) => (
                        <button
                          key={risk}
                          type="button"
                          className="chip"
                          aria-pressed={draft.risk === risk}
                          onClick={() => setDraft({ ...draft, risk })}
                        >
                          {CRITICALITY_LABEL[risk]}
                        </button>
                      ))}
                    </div>
                    {/* The label is COMPOSED, not retyped — `flag-vocabulary-surfaces.test.ts`
                        caught the sentence hardcoding "High risk" and it was right to: a hint that
                        names a label by hand goes stale the day the label is reworded, which is
                        exactly what A22 just did to this one. */}
                    <p className="hint">
                      {CRITICALITY_LABEL.high} means this screen spells out the consequence before letting
                      anyone turn it off in production.
                    </p>
                  </div>
                </>
              )}

              {step === 'check' && (
                <div className="field">
                  <span className="lab">Check it over</span>
                  <div className="review">
                    <div>
                      <span className="k">Name</span>
                      <span className="mono">{key}</span>
                    </div>
                    <div>
                      <span className="k">Controls</span>
                      <span>{draft.description.trim()}</span>
                    </div>
                    <div>
                      <span className="k">Kind</span>
                      <span>{draft.kind === null ? '—' : TYPE_LABEL[draft.kind]}</span>
                    </div>
                    <div>
                      <span className="k">Risk</span>
                      <span>{draft.risk === null ? '—' : CRITICALITY_LABEL[draft.risk]}</span>
                    </div>
                  </div>
                  {/* ⚠️ Says what does NOT happen. "Activated is not on" is this console's
                      most-repeated lesson — 34 of 42 live definitions default to `off` — and a
                      creation control that left the reader to guess whether it had switched
                      anything on would be manufacturing the next instance of it. */}
                  <div className="callout info">
                    <span className="ico" aria-hidden="true">
                      ◆
                    </span>
                    <span>{describeNewFeatureArrival()}</span>
                  </div>
                </div>
              )}

              {error !== null && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
            </div>

            {/* ── The terminal state, which normally nobody sees ──────────────────────────────
                The write has landed and the browser is leaving for the new feature's page. If that
                navigation happens, this frame is never painted. If it does NOT, the reader is
                looking at a dialog whose Create button is gone — so it cannot write twice — with a
                link to the thing that now exists and a sentence saying it exists. That is the whole
                answer to the finding: the failure mode used to be a locked dialog with no exit. */}
            <div className="modal-foot">
              {created !== null ? (
                <>
                  <span className="note">
                    Created. Opening <span className="mono">{created}</span>…
                  </span>
                  <button type="button" className="btn btn-ghost" onClick={close}>
                    Close
                  </button>
                  <a className="btn btn-primary" href={`/app/flags/${slug}/${encodeURIComponent(created)}`}>
                    Open it
                  </a>
                </>
              ) : (
                <>
                  {/* The note carries the step's own reason when there is one, so a disabled
                      Continue always says why. A dead control with no explanation is the interface
                      version of a guard that cannot fail. */}
                  <span className="note">{blocked ?? 'Nothing exists until you finish step 3.'}</span>
                  {stepIndex > 0 && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={inFlight}
                      onClick={() => setStepIndex(stepIndex - 1)}
                    >
                      Back
                    </button>
                  )}
                  {step === 'check' ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={blocked !== null || inFlight}
                      onClick={create}
                    >
                      {inFlight ? 'Working…' : 'Create feature'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={blocked !== null}
                      onClick={() => setStepIndex(stepIndex + 1)}
                    >
                      Continue
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </dialog>
    </>
  )
}
