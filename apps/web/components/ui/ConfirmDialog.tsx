'use client'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Icon } from './Icon'

// app-component-kit-adoption · Sprint 1, Story 1.2 — the one confirmation in the product.
//
// `references/ux-guidelines.md` has required this since the design handoff: "Destructive or
// hard-to-reverse actions get a second, explicit confirmation naming what's about to happen and
// that it can't be undone — never a bare 'Are you sure?'". The requirement was written down and
// never built. This is it. (The guidelines name the BEHAVIOUR — they never named a component; the
// epic README's reuse table said otherwise and was corrected at kickoff.)
//
// ── Why a native <dialog> and not a hand-rolled overlay ───────────────────────────────────────
// Focus trapping, `Esc` to dismiss, inerting the page behind, and the top layer are all things the
// platform does correctly and a hand-rolled version gets subtly wrong — usually by trapping focus
// everywhere except the browser chrome, or by leaving the background scrollable. `showModal()`
// gives all of it. What is left for us is the part the platform has no opinion about: which control
// is focused when it opens, and whether dismissing counts as acting.
//
// ── Why NOT window.confirm ────────────────────────────────────────────────────────────────────
// It blocks the page and the automation harness — recorded in destination-manager.tsx when the
// two-click confirm was added there (Codex cross-review round 12), and it is why this epic can spec
// the cancel path at all.
//
// ── D5 (corrected at kickoff): this is never wired to the agent rail ──────────────────────────
// `components/product/AgentRail.tsx` renders a read-only list of STAGED AGENT PROPOSALS. Those are
// a different mechanism answering a different question: a `task_write_confirmations` row is a
// durable authorization that the AGENT spends later via `consume_write_confirmation`, under the
// credential it was bound to, possibly in another session. This component is a transient question
// asked of the HUMAN at click time, and it authorizes nothing beyond the click. Different actor,
// different lifetime. They are not two implementations of one idea and must not be merged.
// (The grooming docs claimed the rail "already confirms". It has no interactive controls at all.)

export function ConfirmDialog({
  open,
  verb,
  noun,
  subject,
  consequence,
  onConfirm,
  onCancel,
  pending = false,
}: {
  open: boolean
  /**
   * The verb from the trigger that opened this, unchanged. "Revoke", "Remove".
   *
   * ux-guidelines: "A control's name doesn't change mid-flow." A button that says Revoke opening a
   * dialog that asks about "deleting" is two names for one act, and the reader has to decide which
   * one is true.
   */
  verb: string
  /** What kind of thing: "key", "destination", "experiment". */
  noun: string
  /**
   * The SPECIFIC object — its label, key or slug.
   *
   * Required, and required as a non-empty string, because this is the whole acceptance criterion of
   * the story: "Revoke key `flag_sync_prod`?", never "Are you sure?". Making it optional would make
   * the anonymous dialog expressible, and anything expressible eventually ships.
   */
  subject: string
  /**
   * One line, plain language: what stops working if this goes ahead.
   *
   * Also required — the same reasoning as `StatCard`'s caveat. Sprint 3, Story 3.3 is entirely
   * about this sentence being real ("catalog publishes using this credential will start failing")
   * rather than a restatement of the verb, and a required prop is what stops a call site from
   * quietly skipping it.
   */
  consequence: ReactNode
  onConfirm: () => void
  onCancel: () => void
  pending?: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  // Not a fixed string: a converted route can mount more than one manager, and two dialogs sharing
  // an id would point every label at whichever rendered first.
  const questionId = useId()

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) element.showModal()
    // Closing must go through the native `close()`, which is why this component does NOT unmount
    // itself when `open` goes false.
    //
    // It used to: `if (!open) return null` sat right here. React then removed the <dialog> node
    // before this effect could run, so `close()` was never called and the browser never performed
    // its focus restoration — the user was left on <body> with no way back to the control they came
    // from, which is worst for exactly the keyboard and screen-reader users this component exists
    // to serve. Found by cross-review (Agy, PR #82, Blocking); the focus-trap spec did not catch it
    // because it only looked at focus WHILE the dialog was open. There is now a spec for the
    // restoration too.
    if (!open && element.open) element.close()
  }, [open])

  return (
    <dialog
      ref={dialog}
      className="confirm-dialog"
      // `Esc` fires `cancel` before `close`. Routing it through the SAME handler as the Cancel
      // button is what makes "Esc dismisses without acting" true by construction rather than by
      // review: there is no second path that could grow an action later.
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
      aria-labelledby={questionId}
    >
      <p className="confirm-dialog__question" id={questionId}>
        {verb} {noun} <strong>{subject}</strong>?
      </p>
      <p className="confirm-dialog__consequence">
        <Icon name="warning" size={14} />
        {consequence}
      </p>
      <div className="confirm-dialog__actions">
        {/*
          Cancel is FIRST in the DOM and carries `autoFocus`, so the destructive control is never
          the one focused when the dialog opens. A modal that opens with Destroy under the return
          key is a one-keystroke accident wearing the costume of a safety feature — and the muscle
          memory of dismissing a dialog with Enter is universal.
        */}
        <button
          type="button"
          className="btn btn-ghost"
          autoFocus
          disabled={pending}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-gold confirm-dialog__confirm"
          disabled={pending}
          onClick={onConfirm}
        >
          {pending ? 'Working…' : verb}
        </button>
      </div>
    </dialog>
  )
}
