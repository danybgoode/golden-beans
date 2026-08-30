'use client'

// The specimen's one interactive island: the confirmation dialog.
//
// ── Why a dialog needs a client component and the rest of the specimen does not ───────────────
// Every other primitive on the specimen is a static render of a state. A dialog is the one whose
// POSITION is the thing under test, and position only exists once `showModal()` has run — so it
// needs a button, a ref and an effect. That is the whole reason this file exists.
//
// ⚠️ **What is actually being asserted here is WHERE the dialog is.** A universal `* { margin: 0 }`
// reset defeats the UA's `margin: auto` on `dialog:modal`, turning `inset: 0` into the top-left
// CORNER — and every confirmation dialog in this product sat at `x: 0, y: 0` from the day the
// component shipped until `console-ia-overhaul` S3.3, because no spec looked at where a dialog was.
// The fix has landed; this is the specimen that lets the gate keep it landed.

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/design-system/primitives'

export function SpecimenDialog() {
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    // `showModal()`, not `open` — a non-modal dialog is not centred by the UA at all, does not get a
    // backdrop, and does not make the page behind it inert. The bug this asserts against only
    // exists in the modal case.
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  return (
    <>
      <Button variant="secondary" icon="warning" onClick={() => setOpen(true)}>
        Open the confirmation dialog
      </Button>
      <dialog
        ref={dialog}
        className="ds-dialog"
        data-specimen-dialog=""
        aria-labelledby="ds-specimen-dialog-title"
        onClose={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      >
        <p className="ds-dialog-title" id="ds-specimen-dialog-title">
          Revoke key &ldquo;Miyagi Cloud Run&rdquo;?
        </p>
        <p className="ds-dialog-body">
          Anything using it starts getting 401 immediately. This cannot be undone — you would mint a new one.
        </p>
        <div className="ds-dialog-actions">
          {/* The destructive control is NOT the one focused on open. A modal that opens with the
              irreversible button under the return key is a one-keystroke accident. */}
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => setOpen(false)}>
            Revoke
          </Button>
        </div>
      </dialog>
    </>
  )
}
