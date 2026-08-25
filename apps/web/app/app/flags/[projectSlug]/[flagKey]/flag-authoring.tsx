'use client'
// flags-console-parity · Sprint 2, Story 2.1 — the client edge of the per-feature destination.
//
// This exists for one reason: `RuleBuilder` needs an `onSubmit` that calls a server action, and a
// server component cannot hand a function across that boundary. So this is the thinnest possible
// client wrapper — submit, pending, and the server's verbatim rejection. It holds no derivation, no
// formatting and no flag logic of its own.
//
// ── One write path, still (A1) ────────────────────────────────────────────────────────────────
// It posts through `createFlagDefinitionVersionAction`, the same action the textarea on the list
// page uses and the same one the builder used before it moved here. There is one validator and one
// RPC behind both. This file adds a SURFACE, never a second way in.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RuleBuilder } from '../rule-builder'
import { createFlagDefinitionVersionAction } from '../actions'

export function FlagAuthoring({ slug, flagKey }: { slug: string; flagKey: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // Same in-flight lock as `flag-switch.tsx` and `flag-version-serve.tsx`, and here for the same
  // reason: React 18.3.1 clears `isPending` BEFORE the async callback's first await resolves
  // (react-dom.development.js:16512-13), so `disabled={pending}` re-enables the submit button while
  // `createFlagDefinitionVersionAction` is still on the wire. A double-click then writes a SECOND
  // immutable version — the registry is append-only, so that duplicate is permanent.
  //
  // ⚠️ Worth naming: I fixed this class in the other two files of this PR and missed this one. That
  // is the "fix the CLASS, not the instance" rule failing on the very finding that established the
  // class, one round later (cross-review, Agy, PR #120). The sweep is now: every
  // `startTransition(async` in THIS epic's surfaces holds its own flag; the other 25 in the repo are
  // logged in sprint-2.md as a chore.
  const [busy, setBusy] = useState(false)
  const inFlight = busy || pending

  return (
    <>
      {notice && <p role="status">{notice}</p>}
      <RuleBuilder
        disabled={inFlight}
        serverError={error}
        initialFlagKey={flagKey}
        onSubmit={(builtKey, builtDefinition, builtReason) => {
          setError(null)
          setNotice(null)
          setBusy(true)
          startTransition(async () => {
            try {
              const result = await createFlagDefinitionVersionAction(
                slug,
                builtKey,
                builtDefinition,
                builtReason
              )
              if (result.ok) {
                setNotice(`Saved a new version of ${builtKey}.`)
                // ── Follow the key, because the key is editable ────────────────────────────────
                // This page is ABOUT one feature, but `RuleBuilder`'s key field stays editable (a
                // sync-created flag sometimes needs its key corrected). Change it and save, and the
                // write lands on a DIFFERENT feature — while `router.refresh()` would reload the
                // page for the old one, showing no trace of what was just written. The reader is
                // then looking at the wrong feature being told the save succeeded (cross-review,
                // Agy, PR #120).
                if (builtKey !== flagKey) {
                  router.push(`/app/flags/${slug}/${encodeURIComponent(builtKey)}`)
                } else {
                  router.refresh()
                }
              } else {
                setError(result.error ?? 'The change could not be applied.')
              }
            } catch {
              // The same shape `flag-manager.tsx` uses: a thrown action becomes a rendered failure,
              // never a silent one. A builder that looks like it saved and did not is worse than an
              // error message.
              setError('The change could not be applied. Try again.')
            }
            setBusy(false)
          })
        }}
      />
    </>
  )
}
