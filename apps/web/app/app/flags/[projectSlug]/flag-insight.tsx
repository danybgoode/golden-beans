'use client'
// flags-visual-rule-builder · Sprint 2 — the flag, read rather than inspected.
//
// ── D7, still ─────────────────────────────────────────────────────────────────────────────────
// `flag-manager.tsx` gains a mount and nothing else. Sprint 1 put the authoring surface in its own
// component for this reason; the reading surface gets the same treatment rather than pushing a
// 583-line file past 700.
//
// ── A4: this component adds no query ──────────────────────────────────────────────────────────
// Everything it renders is derived from the `FlagRegistryRow` the page already passes — every
// version with its full definition, plus the per-environment activations. Nothing is fetched.
//
// ── What is deliberately NOT here ─────────────────────────────────────────────────────────────
// No formatting, no arithmetic, no diffing. The prose comes from `flag-definition-diff` and the
// numbers from `flag-environment-view`, both pure and both unit-tested against the real parser and
// the real evaluator. This file chooses which two versions to compare and where the JSON goes.

import { useMemo, useState } from 'react'
import { RolloutBar } from '@/components/ui/RolloutBar'
import { diffFlagDefinitions, UNEXPLAINED_DIFF_TEXT } from '@/lib/flag-definition-diff'
import { summariseFlagEnvironments } from '@/lib/flag-environment-view'
import type { FlagRegistryRow } from '@/lib/flag-registry'

export function FlagInsight({ flag }: { flag: FlagRegistryRow }) {
  const summaries = useMemo(() => summariseFlagEnvironments(flag), [flag])

  // The two most recent versions, which is the comparison a PM wants nine times out of ten: what
  // did the change I just made do. `versions` arrives ordered ascending by version number.
  const versions = flag.versions
  const latest = versions[versions.length - 1]
  const previous = versions[versions.length - 2]
  const [fromId, setFromId] = useState(previous?.id ?? latest?.id ?? '')
  const [toId, setToId] = useState(latest?.id ?? '')

  const from = versions.find((version) => version.id === fromId)
  const to = versions.find((version) => version.id === toId)
  const diff = useMemo(
    () => (from && to && from.id !== to.id ? diffFlagDefinitions(from.definition, to.definition) : null),
    [from, to]
  )

  return (
    <div className="flag-insight">
      <RolloutBar
        summaries={summaries}
        caption="Rollout reach is the share of the contexts a rule already matches — not a share of your users."
      />

      {versions.length < 2 ? (
        // CODE-QUALITY rule 8 — an honest empty state. One version is not a shortcoming; it means
        // nothing has changed yet, and saying that beats an empty pair of selects.
        <p className="flag-insight__empty">
          There is one version of this flag, so there is nothing to compare yet. Create another and the change
          will be described here.
        </p>
      ) : (
        <div className="flag-insight__diff">
          <label>
            Compare
            <select value={fromId} onChange={(event) => setFromId(event.target.value)}>
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  v{version.version}
                </option>
              ))}
            </select>
          </label>
          <label>
            with
            <select value={toId} onChange={(event) => setToId(event.target.value)}>
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  v{version.version}
                </option>
              ))}
            </select>
          </label>

          {diff === null ? (
            <p role="status">Choose two different versions.</p>
          ) : (
            <div role="status">
              {diff.changes.length > 0 && (
                <ul className="flag-insight__changes">
                  {diff.changes.map((change, index) => (
                    <li key={index}>{change}</li>
                  ))}
                </ul>
              )}
              {/* D8's bound, rendered. The fallback appears ALONGSIDE whatever was describable, so a
                  version that changed both a rollout and its description shows both facts — the
                  story's "never guesses, never silently omits", as two separate obligations. */}
              {diff.unexplained && <p className="flag-insight__unexplained">{UNEXPLAINED_DIFF_TEXT}</p>}
              {diff.changes.length === 0 && !diff.unexplained && <p>These two versions are identical.</p>}
            </div>
          )}

          {/* The JSON, one click away — required by Story 2.3 whenever the diff falls back, and
              harmless when it does not. Both sides, because a fallback that shows only the new
              version leaves the reader diffing against memory. */}
          {from && to && (
            <details className="flag-insight__json">
              <summary>Show JSON</summary>
              <pre>
                {`v${from.version}\n${JSON.stringify(from.definition, null, 2)}\n\nv${to.version}\n${JSON.stringify(to.definition, null, 2)}`}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
