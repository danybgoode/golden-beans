import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

// app-shell-and-agent-rail · Sprint 3, Story 3.1 — the headline-figure tile.
//
// ── Why `value` is `string | null` and not `number` ───────────────────────────────────────────
// The whole point of this component is CODE-QUALITY rule 8: a zero and a broken read are
// indistinguishable to a reader, and a zero pages nobody. This repo has shipped that bug to
// production. So a card can be in one of three states, and the type makes the third one
// unavoidable rather than optional:
//
//   • a real figure          → the value, large
//   • a genuine, measured 0  → still a real figure. Pass "0". It is a reading.
//   • unreadable / unrecorded → pass `null` AND a `caveat` saying which. The card renders the
//                              sentence in the value's place; it never renders a placeholder
//                              number, a dash that could be mistaken for a value, or "0".
//
// The caveat is REQUIRED alongside a null value at the type level (see the union below), because
// "we don't know" without "why" is the state that gets read as zero anyway.

type StatCardBase = {
  label: string
  icon?: IconName
  /** Where the number came from, so a reader can go and check it. Optional but strongly preferred. */
  provenance?: ReactNode
  /** A link to the surface this figure is a summary of. */
  href?: string
}

export type StatCardProps = StatCardBase &
  (
    | {
        /** A real reading, already formatted. "0" is a legitimate value, not an empty state. */
        value: string
        /** A qualification that applies even though the figure IS readable (e.g. registry-declared). */
        caveat?: ReactNode
      }
    | {
        value: null
        /** Required: a null figure must say WHICH kind of nothing it is. */
        caveat: ReactNode
      }
  )

export function StatCard({ label, value, caveat, icon, provenance, href }: StatCardProps) {
  const body = (
    <>
      <span className="stat-card__label">
        {icon ? <Icon name={icon} size={13} /> : null}
        {label}
      </span>
      {value === null ? (
        <span className="stat-card__unreadable">{caveat}</span>
      ) : (
        <>
          <span className="stat-card__value">{value}</span>
          {caveat ? <span className="stat-card__caveat">{caveat}</span> : null}
        </>
      )}
      {provenance ? <span className="stat-card__provenance">{provenance}</span> : null}
    </>
  )

  return href ? (
    <a className="stat-card" href={href} data-unreadable={value === null ? 'true' : undefined}>
      {body}
    </a>
  ) : (
    <div className="stat-card" data-unreadable={value === null ? 'true' : undefined}>
      {body}
    </div>
  )
}
