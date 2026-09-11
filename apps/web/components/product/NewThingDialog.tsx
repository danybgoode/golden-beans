'use client'

// mockups-as-built · Sprint 2 — THE MODAL SEAM. One shape, six surfaces (epic D8).
//
// ── Why this exists, and why it is an approval rather than a design decision ──────────────────
// Every primary authoring action in the approved design is a STUB. `+ New journey` (prototype
// :2503), `+ New experiment` (:2953), `▸ Run a drill` (:2618), `+ New destination` (:3111),
// `+ New key` (:2313) and `+ New share link` (:3163) each fire a `toast()` describing what would
// happen, and each one says the same thing: *"the same wizard shape as New feature"*. That wizard
// is `wizardModal()` at `console-prototype.html:1992` — and it was NOT one of the 32 approved
// states, so the approved design drew six doors with no room behind any of them.
//
// Meanwhile the `<details>` disclosures this sprint deletes were the ONLY implementation of journey
// create/activate, experiment create/transition/bind, scenario launch/stop and delivery replay —
// traced from every `actions.ts` export to its single consumer. Building the screens exactly as
// drawn would have deleted four working capabilities and left six buttons that do nothing.
//
// Daniel approved the wizard as the **33rd state** on 2026-09-09, verbatim: *"Every + New … and
// ▸ Run a drill opens that shape, as a modal, wrapping the existing manager component underneath.
// … Two hard rules: no capability is lost, and no `<details>` survives. If those two ever conflict
// again, the answer is a modal, not a disclosure."*
//
// ── What this component is, precisely ─────────────────────────────────────────────────────────
// A `<dialog>` carrying the three blocks the approved state draws — `.ds-dialog-head`,
// `.ds-dialog-body`, `.ds-dialog-actions` — around WHATEVER IS PASSED TO IT. It renders no form of
// its own. The managers (`journey-manager.tsx`, `experiment-manager.tsx`, `scenario-workspace.tsx`,
// `destination-manager.tsx`) are MOVED into it unchanged, because the capability IS the component
// and rewriting one is how a capability quietly changes shape.
//
// ⚠️ **The trigger lives here too, and that is deliberate.** A caller that rendered its own button
// beside this dialog would be two places that have to agree about a label the structural gate
// asserts (`state-contract.mjs` reads the head's primary action). One component, one label, one
// thing to keep in step with the design.

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/design-system/primitives'

export function NewThingDialog({
  /** The primary action's label, EXACTLY as the approved state draws it — "+ New journey". */
  label,
  /** The dialog's own heading. The prototype's is "New feature"; each surface names its own thing. */
  title,
  /** The one-line "Three steps. One word to type." under the title. */
  lede,
  /**
   * The trigger's weight. `primary` is the approved `+ New …` control in a page head; `secondary`
   * is a per-row action (Destinations' `Deliveries`, Story 2.4).
   *
   * ⚠️ A variant rather than a second component: the structural gate reads the head's PRIMARY
   * action, so a per-row trigger must NOT be one — and two components would be two places for the
   * dialog's own markup to drift apart.
   */
  variant = 'primary',
  /**
   * `sm` matches the row-action buttons a per-row trigger sits beside (fresh reviewer, Minor).
   * `Button` has no size prop and `.ds-btn--sm` is the design system's own modifier, so the trigger
   * would otherwise render visibly larger than Send test / Rotate secret / Remove next to it.
   */
  size,
  /**
   * Told whenever the dialog opens or closes, so a caller holding form state OUTSIDE the dialog can
   * clear it.
   *
   * ⚠️ **This exists because a mint form's state outlives the modal, and the modal is the only
   * thing that looks closed** (cross-agent review, agy, reported twice — once as a Nit on
   * Destinations and again as a Should-fix after the first fix). The wizard forms on Keys, Shares
   * and Destinations are hoisted into their manager so the page head can carry them, which means
   * `createError` / `mintError` / a half-typed label survive a dismissal: close a failed create,
   * reopen it, and last attempt's red callout is sitting in a form nobody has submitted yet.
   *
   * A `key` on the body would remount the children and fix the half that lives INSIDE them; it
   * cannot reach state the caller holds. So the dialog reports the transition and each surface
   * clears the slots it owns — which is also the only version that knows which state is stale and
   * which (an in-flight `pending`) must not be touched.
   */
  onOpenChange,
  children,
}: {
  label: string
  title: string
  lede?: ReactNode
  variant?: 'primary' | 'secondary'
  size?: 'sm'
  onOpenChange?: (open: boolean) => void
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  // ⚠️ **`useId`, not a slug of the title** (cross-family review, Codex). The id was
  // `title.replace(/\W+/g, '-')`, and this component now renders ONCE PER ROW on Destinations — so
  // two destinations named `A/B` and `A B` normalise to the same string, produce duplicate document
  // ids, and `aria-labelledby` resolves to whichever came first. A screen reader would announce the
  // wrong destination's dialog, which on a panel holding a replay control is worse than no label.
  const titleId = useId()

  // ⚠️ ONE setter, and every path below uses it — the trigger, the `✕`, `Done`, Escape and the
  // backdrop. A second bare `setOpen` would be a way out that the caller is never told about, which
  // is the same class of defect as two components disagreeing about one label.
  function change(next: boolean) {
    setOpen(next)
    onOpenChange?.(next)
  }

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    // `showModal()`, not the `open` attribute. A non-modal dialog is not centred by the UA, gets no
    // backdrop, and leaves the page behind it live — and the approved state is a modal over a
    // dimmed page. Same reasoning as `specimen-dialog.tsx`, which is where this pattern is pinned.
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  return (
    <>
      <Button
        variant={variant}
        className={size === 'sm' ? 'ds-btn--sm' : undefined}
        onClick={() => change(true)}
      >
        {label}
      </Button>
      <dialog
        ref={dialog}
        className="ds-dialog ds-dialog--wide"
        aria-labelledby={titleId}
        // Both, because they are different events: `onClose` fires however it closed, `onCancel`
        // is Escape specifically. Without the second, Escape closes the element and leaves React
        // believing it is still open, so the trigger stops working exactly once.
        //
        // ⚠️ **`event.target === dialog.current`, and WITHOUT it this seam closed itself on every
        // successful mutation, on all six surfaces.** `close` does not bubble in the DOM — but React
        // delegates it and replays it up the REACT tree, so a nested `<dialog>` closing fires this
        // handler too. Every manager mounted in here confirms its mutation with `ConfirmDialog`,
        // which is a `<dialog>` inside this one: confirming a launch, a stop, a journey activation,
        // an experiment transition or a delivery replay closed the confirmation and then, one React
        // event later, the modal around it. The work succeeded and the operator was returned to the
        // page without ever seeing "Scenario run stopped."
        //
        // Traced 2026-09-10 by patching `HTMLDialogElement.prototype.close` and reading the stack:
        // the call came from this component's own effect, during a commit, with React's `open`
        // already false — so the cause was `setOpen`, not the DOM. Same identity comparison the
        // backdrop handler below already uses, and for the same reason.
        onClose={(event) => {
          if (event.target === dialog.current) change(false)
        }}
        onCancel={(event) => {
          if (event.target === dialog.current) change(false)
        }}
        // ⚠️ **The backdrop closes it, and this handler is why** (cross-family review, Codex). The
        // comment below used to promise backdrop-dismiss and nothing implemented it — a native
        // `<dialog>` does NOT close on a backdrop click. That is CODE-QUALITY #3, and the fix is to
        // make the sentence true rather than to delete it: the approved prototype dismisses on its
        // scrim (`onclick="if(event.target===this)closeOverlay()"`), so the behaviour was the
        // design's, not an invention.
        //
        // `event.target === the dialog itself` IS the backdrop: the backdrop is painted by the
        // dialog element, so a click on the panel targets a child and a click outside targets the
        // dialog. Comparing identity is what keeps a click inside the body from closing it.
        onClick={(event) => {
          if (event.target === dialog.current) change(false)
        }}
      >
        <div className="ds-dialog-head">
          <div>
            <p className="ds-dialog-title" id={titleId}>
              {title}
            </p>
            {lede ? <p className="ds-dialog-sub">{lede}</p> : null}
          </div>
          {/* The prototype's `✕`. A close control that is not the only way out — Escape and the
              backdrop both work (see `onClick` above) — but the one a reader can see. */}
          <button type="button" className="ds-dialog-x" onClick={() => change(false)} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="ds-dialog-body">{children}</div>
        <div className="ds-dialog-actions">
          {/* ⚠️ The dialog owns NO submit control. Every manager moved in here brings its own —
              "Create draft", "Activate", "Run a drill" — wired to the server action it already
              called from inside the disclosure. A second submit here would be a second code path
              to the same mutation, which is how two buttons start disagreeing about what they do. */}
          <Button variant="secondary" onClick={() => change(false)}>
            Done
          </Button>
        </div>
      </dialog>
    </>
  )
}
