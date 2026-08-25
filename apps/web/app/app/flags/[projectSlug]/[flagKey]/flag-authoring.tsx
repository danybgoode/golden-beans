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

  return (
    <>
      {notice && <p role="status">{notice}</p>}
      <RuleBuilder
        disabled={pending}
        serverError={error}
        initialFlagKey={flagKey}
        onSubmit={(builtKey, builtDefinition, builtReason) => {
          setError(null)
          setNotice(null)
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
                router.refresh()
              } else {
                setError(result.error ?? 'The change could not be applied.')
              }
            } catch {
              // The same shape `flag-manager.tsx` uses: a thrown action becomes a rendered failure,
              // never a silent one. A builder that looks like it saved and did not is worse than an
              // error message.
              setError('The change could not be applied. Try again.')
            }
          })
        }}
      />
    </>
  )
}
