'use client'
// flags-console-parity · Sprint 2 — choosing WHICH version an environment serves. Rollback.
//
// ── Why this exists, and why the sprint could not end without it ─────────────────────────────
// Story 2.2 gives each environment ONE on/off control, and "on" means the newest version. That is
// the right primary control and it is what the story asked for — but it is NOT a superset of what
// the legacy per-flag stack does. That stack has a button at every (version × environment)
// intersection, and those buttons are the only way to serve a version other than the newest.
//
// Retiring the stack without this would have removed rollback with nothing replacing it: the exact
// class of defect Sprint 1 hit (hiding the stack before the destination existed) and Story 2.1
// avoided. Rollback is also the thing an operator reaches for at the worst possible moment, so
// "it's gone, use the API" is not an answer.
//
// ── Why it lives on History rather than Value ────────────────────────────────────────────────
// Value answers "is this on, and what does it serve". History answers "what were the versions, and
// what changed between them" — which is the question you are already asking when you decide to go
// back to one. The control belongs beside the evidence for the decision, not beside the on/off
// switch it would visually compete with.
//
// ── One write path, still (D1/A1) ────────────────────────────────────────────────────────────
// `activateFlagAction` — the same action Story 2.2's switch and the legacy stack both post to. It
// already takes an arbitrary `versionId`, so rollback needs no new action, no new RPC and no new
// validation. This is a surface over a capability that already existed.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { FlagEnvironment } from '@/lib/flag-definition'
import { describeRollback } from '@/lib/flag-console-copy'
import { activateFlagAction } from '../actions'

export type ServeTarget = {
  environment: FlagEnvironment
  /** The version id this environment currently serves, or `null` when it serves nothing. */
  servingVersionId: string | null
  /**
   * The version NUMBER this environment serves, or null when it serves nothing.
   *
   * Carried alongside the id because the confirmation's direction ("going back" vs "rolling
   * forward") is relative to what this environment RUNS, not to where the flag's history ends —
   * see `describeRollback`.
   */
  servingVersion: number | null
  snapshotVersion: number
}

export function FlagVersionServe({
  slug,
  flagKey,
  flagId,
  versionId,
  version,
  latestVersion,
  targets,
  servingEnabled,
}: {
  slug: string
  flagKey: string
  flagId: string
  versionId: string
  version: number
  latestVersion: number
  targets: ServeTarget[]
  servingEnabled: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<ServeTarget | null>(null)

  const serve = (target: ServeTarget) => {
    setError(null)
    startTransition(async () => {
      try {
        const result = await activateFlagAction(
          slug,
          target.environment,
          flagId,
          versionId,
          target.snapshotVersion,
          `Served v${version} of ${flagKey} in ${target.environment} from the flag console.`
        )
        if (!result.ok) setError(result.error ?? 'The change could not be applied.')
        else router.refresh()
      } catch {
        setError('The change could not be applied. Try again.')
      }
      setConfirming(null)
    })
  }

  return (
    <>
      {error && <p role="alert">{error}</p>}
      <span className="row-wrap">
        {targets.map((target) => {
          const alreadyServing = target.servingVersionId === versionId
          if (alreadyServing) {
            return (
              <span key={target.environment} className="data-table__count">
                serving in {target.environment}
              </span>
            )
          }
          return (
            <button
              key={target.environment}
              type="button"
              className="btn btn-ghost btn-mini"
              disabled={pending || !servingEnabled}
              // Going BACKWARDS confirms, going forwards does not — and "backwards" is relative to
              // what THIS environment serves, not to the newest version that exists. Comparing
              // against `latestVersion` asked for confirmation when production was on v1 and moving
              // forward to v3, and the dialog then described a rollback that was not happening
              // (cross-review, Agy, PR #120). Serving an older version than the one running is the
              // move most likely to be a mistake and it discards what the newer one fixed; rolling
              // forward is the same act "turn on" performs without a dialog.
              onClick={() =>
                target.servingVersion !== null && version < target.servingVersion
                  ? setConfirming(target)
                  : serve(target)
              }
            >
              Serve in {target.environment}
            </button>
          )
        })}
      </span>

      <ConfirmDialog
        open={confirming !== null}
        verb="Serve"
        noun="version"
        subject={confirming ? `v${version} of ${flagKey} in ${confirming.environment}` : ''}
        consequence={
          confirming
            ? describeRollback({
                flagKey,
                environment: confirming.environment,
                version,
                currentVersion: confirming.servingVersion,
              })
            : ''
        }
        pending={pending}
        onCancel={() => setConfirming(null)}
        onConfirm={() => confirming && serve(confirming)}
      />
    </>
  )
}
