// flags-visual-rule-builder · Sprint 2, Stories 2.1 and 2.2 — where a flag is, in one glance.
//
// ── No charting dependency, and this is the circuit breaker ────────────────────────────────────
// `apps/web/package.json` gains nothing. Three proportion bars are not a charting problem, and
// `FunnelBars` already proved the approach in app-shell-and-agent-rail: token colours, a computed
// width, and the number written next to the bar so the picture is never the only evidence. If a
// visual here ever seems to need a library, that is the signal to stop — `#14` owns that decision.
//
// ── D5: the environments come from the constant ───────────────────────────────────────────────
// This component iterates `FLAG_ENVIRONMENTS` and looks each one up in a record the type system
// requires to be total. There is no list of environment names in this file, and a caller cannot
// hand it two environments and quietly get a two-bar page.
//
// ── Why an inline width is allowed here ───────────────────────────────────────────────────────
// `scripts/check-design-drift.mjs` bans inline styles in `components/landing` only, deliberately: a
// bar's length is computed geometry, not a colour drifting away from the tokens. Every colour below
// is a token, and the drift guard sweeps this directory for raw hex.

import { FLAG_ENVIRONMENTS, type FlagEnvironment } from '@golden-beans/sdk'
import type { FlagEnvironmentSummary } from '@/lib/flag-environment-view'

/**
 * One bar per environment, with production set apart.
 *
 * Story 2.2 asks for production to be visually distinguishable, and the reason is not decoration: a
 * rollout change in production is the consequential one, and a row that looks identical to the
 * development row invites the glance that misreads which is which.
 *
 * Every number and every word beside a bar comes from `summariseFlagEnvironments` — including the
 * variant, which is `evaluateFlag`'s own answer. This component formats nothing.
 */
export function RolloutBar({
  summaries,
  caption,
}: {
  summaries: Record<FlagEnvironment, FlagEnvironmentSummary>
  caption?: string
}) {
  return (
    <figure className="rollout-bar">
      <ul className="rollout-bar__rows">
        {FLAG_ENVIRONMENTS.map((environment) => {
          const summary = summaries[environment]
          return (
            <li
              key={environment}
              className="rollout-bar__row"
              data-production={environment === 'production'}
              data-active={summary.active}
            >
              <span className="rollout-bar__environment">{environment}</span>
              <span className="rollout-bar__track">
                {/* The bar is decoration; the two spans beside it carry the same facts as text, so
                    nothing here is available only to a sighted reader. */}
                {summary.fillPercent === null ? null : (
                  <span
                    className="rollout-bar__fill"
                    style={{ width: `${summary.fillPercent}%` }}
                    aria-hidden="true"
                  />
                )}
              </span>
              <span className="rollout-bar__label">{summary.label}</span>
              <span className="rollout-bar__detail">{summary.detail}</span>
            </li>
          )
        })}
      </ul>
      {caption ? <figcaption className="note">{caption}</figcaption> : null}
    </figure>
  )
}
