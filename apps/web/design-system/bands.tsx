// The task bands — Today's three, and `/app/tasks`' four. ONE implementation (DD1, DD5).
//
// ── Why these live in `design-system/` and not on either page ─────────────────────────────────
// DD5: *"one design, two mounts. A standalone route is a mount, never a fifth place to look."* Two
// copies of this markup would satisfy every structural check and drift the first time one of them
// was touched — which is the mechanism this whole epic is named after. `/app` and `/app/tasks`
// import the same components; the only thing that differs is what goes in the `actions` slot.
//
// ── No `server-only` import, deliberately ─────────────────────────────────────────────────────
// `/app/tasks` renders its rows from a CLIENT component, because claiming and resolving a task are
// interactive. A `server-only` import here would make the shared row unusable from exactly the
// mount that needs it most, and the two would fork within a sprint.

import type { ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'

/**
 * A band: a heading, the badge that says whose job this is, a sentence, and a list.
 *
 * The badge is the honest half of the design's actor treatment. `who` is a fact about the BAND —
 * `open` means nothing has picked this up, `claimed` means something has — unlike the per-row
 * agent/human distinction, which this product cannot derive from a task row (see
 * `lib/today-bands.ts`' note on `taskHolder`).
 */
export function Band({
  title,
  who,
  count,
  sub,
  children,
}: {
  title: string
  who: 'you' | 'agent' | 'done'
  /** Rendered inside the badge on the standalone mount, where the design shows counts. */
  count?: number
  sub: string
  children: ReactNode
}) {
  return (
    <section className="ds-band">
      <h3 className="ds-band-title">
        {title}{' '}
        <span className="ds-band-who" data-who={who}>
          {count === undefined ? BADGE[who] : count}
        </span>
      </h3>
      <p className="ds-band-sub">{sub}</p>
      {children}
    </section>
  )
}

const BADGE = { you: 'only you can', agent: 'not you', done: 'already done' } as const

/**
 * One task, in the row shape both mounts use.
 *
 * ⚠️ **The holder is one treatment, whoever holds it.** The approved design paints an agent blue
 * and a person gold; this product cannot tell them apart from a task row, and `claimed_by` is
 * caller-supplied free text — so painting it would let a tenant choose what the product says about
 * them. The reasoning is in `lib/today-bands.ts`, where two existing modules already wrote it down.
 */
export function TaskLine({
  title,
  kind,
  meta,
  holder,
  when,
  actions,
  children,
}: {
  title: ReactNode
  /** `null` when the evidence names no kind — then no dot is drawn at all. */
  kind: 'error' | 'friction' | null
  meta: ReactNode
  holder: { name: string; held: boolean }
  when?: string
  actions?: ReactNode
  /** The evidence drawer, when a mount offers one. */
  children?: ReactNode
}) {
  return (
    <div className="ds-task">
      <div className="ds-task-row">
        {kind === null ? (
          <span className="ds-task-sig" data-kind="unknown" aria-hidden="true" />
        ) : (
          <span className="ds-task-sig" data-kind={kind} aria-hidden="true" />
        )}
        <div className="ds-task-body">
          <p className="ds-task-title">{title}</p>
          <p className="ds-task-meta">
            {/* The kind IN WORDS beside the dot. DD4's status rule: never colour alone. */}
            <span>{kind === null ? 'Unclassified' : kind === 'error' ? 'Error' : 'Friction'}</span>
            {meta}
          </p>
        </div>
        <p className="ds-task-by" data-held={holder.held}>
          <b>{holder.name}</b>
          {when ? <span>{when}</span> : null}
        </p>
        {actions ? <div className="ds-task-act">{actions}</div> : null}
      </div>
      {children}
    </div>
  )
}

/**
 * The line above the claimed band — what an agent has in hand, and through which credential.
 *
 * ⚠️ Its counts come from `getTaskLifecycleFacts`, which reads `metadata.via === 'connector'`. That
 * is the one honest agent/human signal this product has, and it is a band-level fact rather than a
 * per-row one — which is exactly the shape this line needs and the rows do not.
 */
export function AgentLine({ children, when }: { children: ReactNode; when?: string }) {
  return (
    <p className="ds-agentline">
      <span className="ds-agentline-pulse" aria-hidden="true" />
      <span>{children}</span>
      {when ? <span className="ds-agentline-when">{when}</span> : null}
    </p>
  )
}

/**
 * A band with nothing in it.
 *
 * ⚠️ **An empty band is a deliverable, not a fallback** (epic D10). On the walkthrough tenant every
 * band on `/app` is empty, so this is the state a real person actually meets — and an empty queue
 * and a broken queue look identical unless the page says which it is. `body` is required for that
 * reason, and `action` is what makes it a prompt rather than a blank.
 */
export function BandEmpty({ head, body, action }: { head: string; body: ReactNode; action?: ReactNode }) {
  return (
    <div className="ds-band-empty">
      <p className="ds-band-empty-head">
        <Icon name="check-circle" size={14} />
        {head}
      </p>
      <p className="ds-band-empty-body">{body}</p>
      {action ? <p className="ds-band-empty-action">{action}</p> : null}
    </div>
  )
}

/** The list card the rows sit in — the same container the feature list uses, one level thinner. */
export function TaskList({ children }: { children: ReactNode }) {
  return <div className="ds-tasklist">{children}</div>
}
