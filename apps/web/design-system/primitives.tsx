// The primitives, as components — so a page is assembled rather than hand-drawn in CSS.
//
// ── Why these exist when `components/ui/` already has primitives ──────────────────────────────
// They do not replace it. Audit §2.2 is explicit — *"the primitives already exist and are
// reasonably built. The work is mostly adoption and a handful of new primitives"* — and Story 2.3
// says existing ones are adopted and extended, never re-authored. What is here is the handful the
// approved design needs and `components/ui/` has no equivalent for: the three-state switch, the
// rail item as a raised card, the environment control, the numbered step card, the wizard.
//
// The rest are thin: a component exists for each so that a page never types `ds-btn` by hand, which
// is what keeps the namespace enforceable and the states reachable. A class typed into a route is a
// class no primitive owns.
//
// ── The states are DATA, not variants of a name ───────────────────────────────────────────────
// Every stateful primitive takes `state` from one closed union, and the CSS keys off
// `[data-state]`. That is deliberate: a `loading` prop and an `isError` prop and a `disabled`
// attribute are three ways to say one thing, and they can disagree. One field cannot.

import { Fragment, type ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'
import type { IconName } from '@/components/ui/icon-names'

/**
 * The ten states of `references/ux-guidelines.md`.
 *
 * ⚠️ TEN, not the nine `sprint-2.md` listed. `disabled` and `unbuilt` are different states and the
 * guidelines say they "must look different": one is *you cannot do this right now* and it comes
 * back, the other is *this is not built yet* and it does not. Collapsing them is the defect that
 * document was written about. See the sprint's finding F2.1.
 *
 * `idle`, `hover`, `focus` and `pressed` are not in this union because they are not something a
 * caller sets — they are what the browser is doing, and the stylesheet answers them with `:hover`,
 * `:focus-visible` and `:active`. A prop for them would be a second, disagreeing source of truth.
 */
export type ControlState = 'idle' | 'loading' | 'success' | 'error' | 'disabled' | 'unbuilt'

/**
 * States a CONTAINER of things can be in, as opposed to a control.
 *
 * ⚠️ Used by `TableEmpty` only, via the shape of its props rather than by name — a reviewer flagged
 * it as exported-and-unreferenced (grep: one hit, its own declaration). Kept and marked, because
 * Sprint 4's data tables need `loading` and `error` container states that no primitive expresses
 * yet, and deleting a union that is three weeks from having callers only to re-add it is churn. If
 * Sprint 4 lands without using it, delete it there rather than carrying it further.
 */
export type CollectionState = 'idle' | 'loading' | 'empty' | 'error'

function classes(...values: (string | false | undefined)[]): string {
  return values.filter(Boolean).join(' ')
}

// ── Button ────────────────────────────────────────────────────────────────────────────────────

export function Button({
  children,
  variant = 'secondary',
  state = 'idle',
  icon,
  onClick,
  type = 'button',
  className,
}: {
  children: ReactNode
  variant?: 'primary' | 'secondary'
  state?: ControlState
  icon?: IconName
  onClick?: () => void
  type?: 'button' | 'submit'
  className?: string
}) {
  // `disabled` covers the two states where a press must not register. `unbuilt` is NOT disabled in
  // the DOM sense on purpose — it is legible, focusable and announced, because "this isn't built
  // yet" is information, and hiding it from a screen reader tells that user less than it tells
  // everyone else.
  const inert = state === 'disabled' || state === 'loading'
  return (
    <button
      type={type}
      className={classes('ds-btn', `ds-btn--${variant}`, className)}
      data-state={state}
      disabled={inert}
      aria-busy={state === 'loading' || undefined}
      aria-disabled={state === 'unbuilt' || undefined}
      onClick={state === 'unbuilt' ? undefined : onClick}
    >
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </button>
  )
}

// ── State pill — dot plus WORD, never colour alone ────────────────────────────────────────────

export function Pill({ state, children }: { state: 'on' | 'off' | 'never'; children: ReactNode }) {
  return <span className={`ds-pill ds-pill--${state}`}>{children}</span>
}

// ── Three-state switch ────────────────────────────────────────────────────────────────────────

export function Switch({
  state,
  label,
  onToggle,
  disabled,
}: {
  /** ⚠️ `never` is not `off`. Nobody ever activated it, which has no actor and no audit row. */
  state: 'on' | 'off' | 'never'
  label: string
  onToggle?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className="ds-switch"
      data-state={state}
      role="switch"
      aria-checked={state === 'on'}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
    />
  )
}

// ── Rail item — one line, 36px, an icon, no description, no badge (Do-not #2) ──────────────────

export function RailItem({
  icon,
  children,
  current,
  href,
}: {
  icon: IconName
  children: ReactNode
  current?: boolean
  href: string
}) {
  return (
    <a
      className="ds-rail-item"
      href={href}
      // ⚠️ ONE attribute carries the cue. The raised card a sighted reader sees and the "current
      // page" a screen reader hears are the same `aria-current`, so they cannot disagree — which is
      // exactly what happened when the palette's cursor was styled off `li[aria-selected]` after
      // `role="option"` had moved onto the anchor.
      aria-current={current ? 'page' : undefined}
    >
      <span className="ds-rail-icon">
        <Icon name={icon} size={15} />
      </span>
      {children}
    </a>
  )
}

// ── Section tab ───────────────────────────────────────────────────────────────────────────────

export function Tab({ children, selected, href }: { children: ReactNode; selected?: boolean; href: string }) {
  return (
    <a className="ds-tab" href={href} role="tab" aria-selected={selected ? 'true' : 'false'}>
      {children}
    </a>
  )
}

// ── Stat tile — tabular figures, so a column of numbers lines up ──────────────────────────────

export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="ds-stat">
      <span className="ds-stat-value">{value}</span>
      <span className="ds-stat-label">{label}</span>
    </div>
  )
}

// ── The answer line — the sentence a page opens with ───────────────────────────────────────────

export function Answer({ children }: { children: ReactNode }) {
  return <p className="ds-answer">{children}</p>
}

// ── Data table ────────────────────────────────────────────────────────────────────────────────

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="ds-table">
      {/* Wide content scrolls inside ITS OWN container; the page never scrolls sideways
          (contract Do-not #6).
          ⚠️ `role="table"` is on the SCROLLER, not the outer box, and both are needed: `TableHead`
          and `TableRow` carry `role="row"`, and a `row` whose ancestor is a plain `<div>` is an
          orphaned role a screen reader reports as broken structure (cross-family review, agy).
          The scroller is the element that directly contains the rows, so it is the one that has to
          be the table. */}
      <div className="ds-table-scroll" role="table">
        {children}
      </div>
    </div>
  )
}

export function TableHead({ children }: { children: ReactNode }) {
  return (
    <div className="ds-table-head" role="row">
      {children}
    </div>
  )
}

export function TableRow({ children }: { children: ReactNode }) {
  return (
    <div className="ds-table-row" role="row">
      {children}
    </div>
  )
}

/**
 * The empty state — *"an invitation, not a dead end"* (ux-guidelines).
 *
 * `action` is optional but `title` and `body` are not: an empty state that says only "No results"
 * is the dead end the guidelines name. It has to say what would put something here.
 */
export function TableEmpty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="ds-table-empty">
      <span className="ds-table-empty-title">{title}</span>
      <span>{body}</span>
      {action}
    </div>
  )
}

// ── Toast ─────────────────────────────────────────────────────────────────────────────────────

export function Toast({ state, children }: { state: 'success' | 'error' | 'idle'; children: ReactNode }) {
  return (
    <div
      className="ds-toast"
      data-state={state}
      // An error has to reach a screen reader immediately; a success can wait for a pause.
      role={state === 'error' ? 'alert' : 'status'}
    >
      <span className="ds-toast-icon">
        <Icon name={state === 'error' ? 'warning' : 'check-circle'} size={15} />
      </span>
      <span>{children}</span>
    </div>
  )
}

// ── Numbered step card ────────────────────────────────────────────────────────────────────────

export function Steps({ children }: { children: ReactNode }) {
  return <ol className="ds-steps">{children}</ol>
}

export function Step({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <li className="ds-step">
      <span className="ds-step-body">
        <span>{children}</span>
        {note ? <span className="ds-step-note">{note}</span> : null}
      </span>
    </li>
  )
}

// ── Wizard ────────────────────────────────────────────────────────────────────────────────────

export function Wizard({ steps }: { steps: { label: string; state: 'done' | 'current' | 'todo' }[] }) {
  return (
    <div className="ds-wizard">
      {steps.map((step, index) => (
        // A Fragment, not a wrapper with `display: contents`. The wrapper would have been an
        // inline style in a directory whose whole premise is that values come from the system —
        // legal here (the guard's inline-style ban is landing-only) and still the wrong shape.
        // ⚠️ Keyed on the INDEX as well as the label: two steps may legitimately share a label
        // ("Review" twice in a longer flow), and a duplicate key is a React reconciliation bug that
        // shows up as the wrong step being marked done (cross-family review, agy).
        <Fragment key={`${step.label}-${index}`}>
          <span className="ds-wizard-step" data-state={step.state}>
            {step.state === 'done' ? <Icon name="check" size={13} /> : null}
            {step.label}
          </span>
          {index < steps.length - 1 ? <span className="ds-wizard-bar" /> : null}
        </Fragment>
      ))}
    </div>
  )
}

// ── Environment control — ONE button opening a menu, never three stacked links ─────────────────

export function EnvironmentControl({
  environment,
  onOpen,
}: {
  environment: 'development' | 'preview' | 'production'
  onOpen?: () => void
}) {
  // Title case, because the rail says where you ARE — `production` in lowercase reads like a value
  // in a config file, which is what it looked like when it was three stacked links.
  const label = environment.charAt(0).toUpperCase() + environment.slice(1)
  return (
    <button type="button" className="ds-env" onClick={onOpen} aria-haspopup="menu">
      <span className="ds-env-dot" data-env={environment} />
      <span>{label}</span>
      <Icon name="arrow-down" size={12} />
    </button>
  )
}

// ── Project switcher — ONE level. No organisation crumb; there is no organisation layer. ───────

export function Switcher({ project, onOpen }: { project: string; onOpen?: () => void }) {
  return (
    <button type="button" className="ds-switcher" onClick={onOpen} aria-haspopup="menu">
      <span>{project}</span>
      <span className="ds-switcher-chevron">
        <Icon name="arrow-down" size={12} />
      </span>
    </button>
  )
}

export function Menu({ children }: { children: ReactNode }) {
  return (
    <div className="ds-menu" role="menu">
      {children}
    </div>
  )
}

export function MenuItem({
  children,
  current,
  onSelect,
}: {
  children: ReactNode
  current?: boolean
  onSelect?: () => void
}) {
  return (
    <button
      type="button"
      className="ds-menu-item"
      role="menuitem"
      aria-current={current ? 'true' : undefined}
      onClick={onSelect}
    >
      {children}
    </button>
  )
}
