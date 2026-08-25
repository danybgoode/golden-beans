'use client'
// flags-console-parity · Sprint 2, Story 2.2 — one control that says what it will do.
//
// ⚠️ THIS IS THE MONEY PATH. Turning `checkout.stripe_enabled` off in production removes the Stripe
// card rail from a live marketplace's checkout. Everything below is shaped by that.
//
// ── What this replaces, and why one control instead of many ──────────────────────────────────
// The legacy surface renders a button at every (version × environment) intersection — for 42 flags
// with N versions each, that is hundreds of buttons all labelled "Activate v3" or "Deactivate". The
// audit's §1 finding is that they say what the SYSTEM does ("Activate"), never what CHANGES. Here
// there is exactly one control per environment, it names the environment, and the destructive
// direction says what stops before it happens.
//
// ── Asymmetry is deliberate: only the destructive direction confirms ─────────────────────────
// Enabling is reversible in one click and its blast radius is "a feature appears". Disabling a
// kill-switch on a live checkout is neither. Confirming both would train the reader to click
// through the dialog, which is how a confirmation stops being read — so the dialog is spent only
// where it buys something.
//
// ── The write path is UNCHANGED (D1) ─────────────────────────────────────────────────────────
// It posts through `activateFlagAction` / `deactivateFlagAction` — the same two server actions the
// legacy stack uses, which re-resolve ownership server-side via `requireProjectOwnership`, check
// `isFlagServingEnabled()` before anything else, and carry the optimistic `expectedSnapshotVersion`
// so a concurrent change fails loudly rather than silently overwriting. This component adds a
// SURFACE. It adds no authority, no validation of its own, and no second way in.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { FlagEnvironment } from '@/lib/flag-definition'
import type { FlagActivationState } from '@/lib/flag-list-view'
import { activateFlagAction, deactivateFlagAction } from '../actions'
import { describeActivationSurprise, describeTurnOffConsequence } from '@/lib/flag-console-copy'

export type FlagSwitchEnvironment = {
  environment: FlagEnvironment
  state: FlagActivationState
  /** The environment's snapshot revision, for optimistic concurrency. */
  snapshotVersion: number
}

export function FlagSwitch({
  slug,
  flagId,
  flagKey,
  environments,
  latestVersionId,
  latestVersion,
  latestDefaultValue,
  latestReadable,
  canManage,
  servingEnabled,
}: {
  slug: string
  flagId: string
  flagKey: string
  environments: FlagSwitchEnvironment[]
  /** The newest immutable version — what "turn on" serves. `null` when the flag has none. */
  latestVersionId: string | null
  latestVersion: number | null
  /**
   * What the version "turn on" would activate evaluates to for an attribute-free context, and
   * whether it could be evaluated at all.
   *
   * Carried because ACTIVATED IS NOT ON: a version whose `defaultVariantKey` names a falsey variant
   * serves `false` while the console reports the feature as on. Live that is the latest version of
   * 34 of 42 flags, so it is the common case, not the corner (fresh reviewer, PR #120).
   */
  latestDefaultValue: unknown
  latestReadable: boolean
  canManage: boolean
  servingEnabled: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  // ── `useTransition`'s isPending does NOT span an async action (React 18) ─────────────────────
  // react-dom 18.3.1 calls `setPending(false)` BEFORE invoking the transition callback
  // (react-dom.development.js:16512-16513), so for an `async` callback everything after the first
  // await happens outside the transition. `isPending` is a flicker, not a duration.
  //
  // On this control that is a real hazard, not a cosmetic one: the ConfirmDialog's confirm button
  // is `disabled={inFlight}`, so during the ~400ms the server action is in flight it stays ENABLED
  // and still reads "Turn off" rather than "Working…". An operator who sees nothing happen clicks
  // again, the second call carries a now-stale expectedSnapshotVersion, and the P0001 conflict
  // renders as an error AFTER the kill actually succeeded. Mid-incident that reads as "the kill
  // didn't work" and invites a second, worse lever — the exact failure the copy module exists to
  // prevent. (Fresh HIGH-tier reviewer, PR #120.)
  //
  // So the in-flight flag is our own, set synchronously before the transition and cleared when the
  // work genuinely finishes. `isPending` is still ORed in — it is not wrong, only insufficient.
  //
  // NOTE: this is a repo-wide pattern (27 `startTransition(async` call sites). Fixed here because
  // this is the first one guarding a money path; the rest are logged in sprint-2.md, not silently
  // left as if they were fine.
  const [busy, setBusy] = useState(false)
  const inFlight = busy || pending

  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<{
    row: FlagSwitchEnvironment
    direction: 'off' | 'on'
    message: string
  } | null>(null)

  // Not a free-text box. Every write to this control plane requires a non-blank reason (the RPC
  // rejects an empty one), and asking for prose mid-incident is how a kill switch gets slower to
  // pull. The audit trail still gets a sentence naming the surface that did it.
  const reasonFor = (environment: FlagEnvironment, turningOn: boolean) =>
    `${turningOn ? 'Enabled' : 'Disabled'} ${flagKey} in ${environment} from the flag console.`

  const run = (work: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    setError(null)
    setNotice(null)
    setBusy(true)
    startTransition(async () => {
      try {
        const result = await work()
        if (result.ok) {
          setNotice(success)
          router.refresh()
        } else {
          // The server's verbatim rejection, rendered rather than swallowed. A snapshot-version
          // conflict ("someone else changed this") must reach the operator as itself, not as a
          // generic failure — it is the one error whose correct response is "reload and look again".
          setError(result.error ?? 'The change could not be applied.')
        }
      } catch {
        setError('The change could not be applied. Try again.')
      }
      setBusy(false)
      setConfirming(null)
    })
  }

  const activate = (row: FlagSwitchEnvironment) => {
    if (latestVersionId === null) {
      setError('This feature has no definition version to serve yet.')
      return
    }
    run(
      () =>
        activateFlagAction(
          slug,
          row.environment,
          flagId,
          latestVersionId,
          row.snapshotVersion,
          reasonFor(row.environment, true)
        ),
      // Says what it is SERVING, not merely that it is "on" — the whole point of the surprise
      // check above. A notice reading "is on" over a false-valued version is the same lie the
      // button used to tell, one step later.
      `${flagKey} in ${row.environment} is now serving v${latestVersion}.`
    )
  }

  /**
   * Turning on confirms ONLY when "on" would not mean what it says — i.e. when the version being
   * activated serves `false`, or cannot be evaluated. In the ordinary case it stays a single click,
   * because a dialog on every enable is how a dialog stops being read (which is why the destructive
   * direction gets one and the safe direction does not).
   */
  const turnOn = (row: FlagSwitchEnvironment) => {
    if (latestVersionId === null) {
      setError('This feature has no definition version to serve yet.')
      return
    }
    const surprise = describeActivationSurprise({
      flagKey,
      environment: row.environment,
      version: latestVersion ?? 0,
      defaultValue: latestDefaultValue,
      readable: latestReadable,
    })
    if (surprise === null) activate(row)
    else setConfirming({ row, direction: 'on', message: surprise })
  }

  const turnOff = (row: FlagSwitchEnvironment) =>
    run(
      () =>
        deactivateFlagAction(
          slug,
          row.environment,
          flagId,
          row.snapshotVersion,
          reasonFor(row.environment, false)
        ),
      `${flagKey} is off in ${row.environment}.`
    )

  if (!canManage) {
    return (
      <p>
        <strong>Read-only access.</strong> A project owner turns this feature on and off.
      </p>
    )
  }

  return (
    <div className="stack-sm">
      {/* Preserved verbatim from the legacy surface, and deliberately NOT reworded: with serving
          dark, the controls below are disabled and this sentence is the only thing that explains
          why. Story 2.2 must not become a second serving gate — it reads the same flag the actions
          themselves check. */}
      {!servingEnabled && (
        <p role="status">
          <strong>Flag serving is currently switched off.</strong> Definitions can be prepared, but turning
          features on and off is unavailable until <code>FLAG_SERVING_ENABLED</code> is enabled in a new
          deployment.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}

      {environments.map((row) => {
        const isOn = row.state === 'on'
        return (
          <p key={row.environment} className="row-wrap">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={inFlight || !servingEnabled || (!isOn && latestVersionId === null)}
              onClick={() =>
                isOn
                  ? setConfirming({
                      row,
                      direction: 'off',
                      message: describeTurnOffConsequence(flagKey, row.environment),
                    })
                  : turnOn(row)
              }
            >
              {/* The control names the environment, so a reader who has scrolled past the heading
                  still knows which one they are about to change. "Turn off"/"Turn on" rather than
                  "Deactivate"/"Activate": D7 retires the storage vocabulary. */}
              {isOn ? `Turn off in ${row.environment}` : `Turn on in ${row.environment}`}
            </button>
            {!isOn && latestVersionId === null && (
              <span className="data-table__count">no version to serve yet</span>
            )}
          </p>
        )
      })}

      <ConfirmDialog
        open={confirming !== null}
        // The verb matches the button that opened it — ux-guidelines: a control's name does not
        // change mid-flow.
        verb={confirming?.direction === 'on' ? 'Turn on' : 'Turn off'}
        noun="feature"
        // The dialog names the SPECIFIC feature and environment — never "Are you sure?".
        subject={confirming ? `${flagKey} in ${confirming.row.environment}` : ''}
        consequence={confirming?.message ?? ''}
        pending={inFlight}
        onCancel={() => setConfirming(null)}
        onConfirm={() =>
          confirming && (confirming.direction === 'on' ? activate(confirming.row) : turnOff(confirming.row))
        }
      />
    </div>
  )
}
