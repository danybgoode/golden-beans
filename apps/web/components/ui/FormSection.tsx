'use client'
// The directive is for `Field`'s sake: it calls `useId`, and a hook in a server component throws at
// render. `FormSection` alone would be fine either way — they stay in one file because they are one
// idea, and one boundary is easier to reason about than two.
import { useId, type ReactNode } from 'react'

// app-component-kit-adoption · Sprint 1, Story 1.3 — how every form in the product labels, groups
// and reports.
//
// Two components rather than one, because they answer different questions: `FormSection` is "what
// is this group of controls for", `Field` is "what is this one control, and what went wrong with
// it". Downstream, `flags-visual-rule-builder` and `scenarios-pm-operable` both build forms; they
// consume these from `main` rather than each inventing half a form system in a different shape.

export function FormSection({
  title,
  description,
  children,
}: {
  title: string
  /** Why this group exists / what the reader should know before filling it in. */
  description?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="form-section">
      <h2 className="form-section__title">{title}</h2>
      {description ? <p className="form-section__description">{description}</p> : null}
      <div className="form-section__fields">{children}</div>
    </section>
  )
}

/**
 * A labelled control with a hint and an error.
 *
 * ── Why `children` is a function ──────────────────────────────────────────────────────────────
 * The story's acceptance is that the error is announced *as belonging to this control* — which
 * means the control itself needs `id`, `aria-describedby` and `aria-invalid`. A component cannot
 * put those on a child it merely renders. The three ways out are: ask the caller to hand-write ids
 * that match a documented convention (works until someone typos one, and a typo here is silent);
 * `cloneElement` the child (breaks the moment a caller wraps the input in anything); or hand the
 * caller exactly the attributes it must spread. Only the third makes the criterion structural
 * instead of a review item, so `Field` is a render prop and nothing else.
 */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: ReactNode
  /** `null` when valid. The slot is rendered either way — see below. */
  error?: string | null
  children: (control: { id: string; 'aria-describedby': string; 'aria-invalid': boolean }) => ReactNode
}) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  return (
    <div className="field" data-invalid={error ? 'true' : undefined}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {hint ? (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}

      {children({
        id,
        // Both ids unconditionally: an id pointing at an element that is not currently in the DOM
        // is ignored by assistive technology, whereas recomputing this string as the error comes
        // and goes is a re-announcement of the hint every time someone fixes a typo.
        'aria-describedby': `${hintId} ${errorId}`,
        'aria-invalid': Boolean(error),
      })}

      {/*
        The error slot is ALWAYS in the DOM, and its height is reserved in CSS (`min-height`, one
        line). This is the "does not reflow" half of the acceptance: a slot that appears on
        validation pushes every field below it down, and on a short form that moves the submit
        button out from under a cursor already travelling towards it.

        `role="alert"` on a permanently-present empty element announces only when text arrives,
        which is the behaviour we want; `aria-live` on a node that gets inserted is the version that
        commonly announces nothing at all.
      */}
      <p className="field__error" id={errorId} role="alert">
        {error ?? ''}
      </p>
    </div>
  )
}
