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
import { Callout, Pill } from '@/design-system/primitives'
import { FLAG_STATE_PRESENTATION } from '../flag-vocabulary'
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
  variant = 'panel',
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
  /**
   * How this renders. **Same component, same write path, same confirm — only the markup differs.**
   *
   * - `panel` (default): one labelled button per environment, on the feature's own page.
   * - `switch`: the approved design's 38 × 21 toggle, for ONE environment, in a feature list row
   *   (console-ia-overhaul, Story 3.3 — the `.row-act` cell and CONSOLE-CONTRACT.md's `Switch` row,
   *   which the visual gate carried as a deferred spec row until this landed).
   *
   * ⚠️ **A variant, not a second component, and that is the whole point.** The list is the second
   * place in the product where a live feature can be killed, and this file's own header records why
   * every line of it is shaped the way it is: the asymmetric confirm, the React-18 in-flight lock,
   * the verbatim server rejection, the optimistic snapshot revision. A compact copy would have had
   * to reproduce all four, and `app-shell-and-agent-rail`'s D5 already refused "two devices for one
   * promise" once. So the surface is new and the authority, the validation and the wording are not.
   */
  variant?: 'panel' | 'switch'
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

  // ⚠️ **ONE dialog, used by both variants.** It was written twice while the switch variant was
  // being added, which is two copies of the sentence that stands between an operator and a dead
  // checkout — and this repo's own rule is that the second copy drifts. The verb matches the control
  // that opened it (a control's name does not change mid-flow), and the subject names the SPECIFIC
  // feature and environment, never "Are you sure?".
  const dialog = (
    <ConfirmDialog
      open={confirming !== null}
      verb={confirming?.direction === 'on' ? 'Turn on' : 'Turn off'}
      noun="feature"
      subject={confirming ? `${flagKey} in ${confirming.row.environment}` : ''}
      consequence={confirming?.message ?? ''}
      pending={inFlight}
      onCancel={() => setConfirming(null)}
      onConfirm={() =>
        confirming && (confirming.direction === 'on' ? activate(confirming.row) : turnOff(confirming.row))
      }
    />
  )

  if (!canManage) {
    // In a list row there is nowhere to put a sentence, and repeating "read-only access" once per
    // row would be 42 copies of one fact. The list says it once, above the table.
    if (variant === 'switch') return null
    return (
      <p>
        <strong>Read-only access.</strong> A project owner turns this feature on and off.
      </p>
    )
  }

  if (variant === 'switch') {
    // Exactly one environment — the list has already resolved which one the reader is looking at,
    // and a row is not the place to offer three. `environments[0]` is what the caller passed.
    const row = environments[0]
    if (row === undefined) return null
    const isOn = row.state === 'on'
    const noVersion = !isOn && latestVersionId === null
    return (
      <>
        <button
          type="button"
          // `role="switch"` + `aria-checked` rather than a pressed button: this control has two
          // states and a screen reader should say which one it is in, not just that it exists.
          //
          // ⚠️ THREE visual states, TWO checked states. `never` and `off` are both `aria-checked
          // ="false"` because that is all the ARIA role can say — so the distinction this epic paid
          // to separate reaches assistive tech through the LABEL and the pill beside it, never
          // through the switch's colour or its border style alone.
          role="switch"
          aria-checked={isOn}
          // design-system-rails S4.1 — the design system's own switch. `data-state` rather than a
          // second class name: the CSS keys off `[data-state]` so the three visual states are one
          // field, and a `loading` prop beside an `isError` prop beside a class is three ways to say
          // one thing that can disagree.
          className="ds-switch"
          data-state={row.state}
          disabled={inFlight || !servingEnabled || noVersion}
          aria-label={
            noVersion
              ? `${flagKey} has no version to serve in ${row.environment}`
              : isOn
                ? `Turn ${flagKey} off in ${row.environment}`
                : `Turn ${flagKey} on in ${row.environment}`
          }
          onClick={() =>
            isOn
              ? setConfirming({
                  row,
                  direction: 'off',
                  message: describeTurnOffConsequence(flagKey, row.environment),
                })
              : turnOn(row)
          }
        />
        {/* A row is a flex line that wraps, so an alert takes the whole next line rather than
            squeezing into a 96px cell. It is rendered rather than swallowed for the reason this
            file's `run()` gives: a snapshot conflict must reach the operator as itself. */}
        {error !== null && (
          <span className="ds-row-alert" role="alert">
            {error}
          </span>
        )}
        {dialog}
      </>
    )
  }

  return (
    <div className="ds-envlist">
      {/* Preserved verbatim from the legacy surface, and deliberately NOT reworded: with serving
          dark, the controls below are disabled and this sentence is the only thing that explains
          why. This is not a second serving gate — it reads the same flag the actions themselves
          check. */}
      {!servingEnabled && (
        <Callout tone="warn">
          <b>Flag serving is currently switched off.</b> Features can be prepared, but turning them on and
          off is unavailable until <code>FLAG_SERVING_ENABLED</code> is enabled in a new deployment.
        </Callout>
      )}
      {error && (
        <p className="ds-row-alert" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="ds-hint" role="status">
          {notice}
        </p>
      )}

      {/* ── design-system-rails · Story 4.2 — the design's control, not three ghost buttons ─────
          This rendered three full-width `Turn on in <environment>` buttons stacked down the page.
          The approved `feature-value` state puts the decision on ONE line per environment: the
          environment named with its dot, the state said in words, and the 38 × 21 three-state
          switch — the same control the list's rows carry, so a reader learns it once.

          ⚠️ The `never` state is DASHED and empty, and that is the acceptance criterion this story
          names. A flag nobody ever activated is not one somebody deliberately switched off; the
          switch says so before any sentence does. */}
      {environments.map((row) => {
        const isOn = row.state === 'on'
        const noVersion = !isOn && latestVersionId === null
        return (
          <div className="ds-envrow" key={row.environment}>
            <span className="ds-envname">
              <span className="ds-env-dot" data-env={row.environment} />
              {row.environment}
            </span>
            <Pill state={row.state}>{FLAG_STATE_PRESENTATION[row.state].label}</Pill>
            {/* The reason a version can be missing is information, not an excuse for an inert
                control with no explanation beside it. */}
            {noVersion && <span className="ds-envwho">no version to serve yet</span>}
            <button
              type="button"
              // `role="switch"` + `aria-checked` rather than a pressed button: this control has two
              // states and a screen reader should say which one it is in.
              //
              // ⚠️ THREE visual states, TWO checked states. `never` and `off` are both
              // `aria-checked="false"` because that is all the role can say — so the distinction
              // reaches assistive tech through the LABEL and the pill beside it, never through the
              // switch's colour or its border style alone.
              role="switch"
              aria-checked={isOn}
              className="ds-switch"
              data-state={row.state}
              disabled={inFlight || !servingEnabled || noVersion}
              aria-label={
                noVersion
                  ? `${flagKey} has no version to serve in ${row.environment}`
                  : isOn
                    ? `Turn ${flagKey} off in ${row.environment}`
                    : `Turn ${flagKey} on in ${row.environment}`
              }
              onClick={() =>
                isOn
                  ? setConfirming({
                      row,
                      direction: 'off',
                      message: describeTurnOffConsequence(flagKey, row.environment),
                    })
                  : turnOn(row)
              }
            />
          </div>
        )
      })}

      {dialog}
    </div>
  )
}
