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

/**
 * A pill: a dot plus a WORD, never colour alone.
 *
 * ⚠️ **The two shapes are a UNION, so the meaningless combination cannot be typed** (cross-family
 * review, agy). It used to take a required `state` and an optional `label`, which meant a caption
 * pill had to pass a dummy `state="never"` that the component then ignored — a value with no meaning
 * at the call site, and a reader of that call site has no way to know it is ignored.
 *
 * A STATE pill says what something IS: on / off / never, which mean the same three things everywhere
 * in this console. A LABEL pill captions something that is not a lifecycle state at all — "what this
 * key may do" is a fact about a kind — and borrowing one of the three colours for it would say
 * something untrue. Solid border, neutral ink, no dashed "nothing has happened here" reading.
 */
export type PillProps =
  | { label: true; state?: never; children: ReactNode }
  | { label?: false; state: 'on' | 'off' | 'never'; children: ReactNode }

export function Pill(props: PillProps) {
  const className = props.label ? 'ds-pill--label' : `ds-pill--${props.state}`
  return <span className={classes('ds-pill', className)}>{props.children}</span>
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

export function Table({ children, empty }: { children: ReactNode; empty?: boolean }) {
  return (
    <div className="ds-table">
      {/* Wide content scrolls inside ITS OWN container; the page never scrolls sideways
          (contract Do-not #6).
          ⚠️ `role="table"` is on the SCROLLER, not the outer box, and both are needed: `TableHead`
          and `TableRow` carry `role="row"`, and a `row` whose ancestor is a plain `<div>` is an
          orphaned role a screen reader reports as broken structure (cross-family review, agy).
          The scroller is the element that directly contains the rows, so it is the one that has to
          be the table.

          ⚠️ …and `empty` exists because that fix was still one case short. `<Table><TableEmpty /></Table>`
          announced `role="table"` around a grid with no rows and no columns, which a screen reader
          reports as broken structure rather than as "nothing here yet" — the SAME orphaned-role
          defect a third time, one case along (fresh reviewer, round 2). An empty state is prose, so
          it is left as prose: the role is dropped rather than the container. */}
      <div className="ds-table-scroll" role={empty ? undefined : 'table'}>
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
 * One cell of a `TableRow`, and one column header of a `TableHead`.
 *
 * ⚠️ These exist because fixing the row's ancestor did not fix the row's CHILDREN. The previous
 * round put `role="table"` on the scroller so `role="row"` was no longer orphaned, and left every
 * column as a bare `<span>` — so a screen reader read rows containing no cells, which is the same
 * broken structure one level down (cross-family review, agy, twice).
 *
 * They are primitives rather than a `role` the specimen remembers to type, because "remember to add
 * the role" is what produced the defect the first time. `header` picks `columnheader` over `cell`,
 * and `wide` is the specimen's two-column span.
 */
export function TableCell({
  children,
  header,
  wide,
  className,
}: {
  children: ReactNode
  header?: boolean
  wide?: boolean
  className?: string
}) {
  const column = wide ? 'ds-specimen-col-wide' : 'ds-specimen-col'
  return (
    <span className={className ? `${column} ${className}` : column} role={header ? 'columnheader' : 'cell'}>
      {children}
    </span>
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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE PAGE LAYER — design-system-rails · Sprint 4
//
// Everything above is a control. Everything below is how a whole page is put together: the head,
// the summary strip, the list card and its rows.
//
// ── Why these are components and not just classes ────────────────────────────────────────────
// The rule at the top of this file — "a page never types `ds-btn` by hand, which is what keeps the
// namespace enforceable and the states reachable" — is the reason. There is a second, sharper one
// for the list: the header row and every body row share three fixed column widths, and a page that
// typed `ds-col-state` into one and forgot it in the other would render a header sitting over a
// column of a different width. `Col` owns that pairing, so the two cannot disagree.
//
// ── What is deliberately NOT a component ─────────────────────────────────────────────────────
// `ds-foot`, `ds-hint`, `ds-mono` and the like. They are one class on one element with no state, no
// variants and no structural partner; wrapping them would add a name to learn and remove nothing.
// The line is: a class a page can get WRONG gets a component; a class it can only get right does
// not.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The page head — a 23/700 title, one sentence under it, and any actions pushed to the right edge.
 *
 * `title` is a `ReactNode` because a feature's title is its key in mono (`<code>`), not a string.
 * `lede` is required: every approved state has one, and a head with no sentence under it is where
 * the 48px four-line heading came from.
 */
export function PageHead({
  title,
  lede,
  actions,
}: {
  title: ReactNode
  lede: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="ds-page-head">
      <div>
        <h1>{title}</h1>
        <p>{lede}</p>
      </div>
      {actions ? (
        <>
          <div className="ds-page-head-spacer" />
          {actions}
        </>
      ) : null}
    </div>
  )
}

/** The four-count summary strip. Each child is a `StatLink`. */
export function Summary({ children }: { children: ReactNode }) {
  return <div className="ds-summary">{children}</div>
}

/**
 * One count, as a link that filters the list to itself.
 *
 * ⚠️ `current` paints the tile AND is what a screen reader announces, carried on ONE attribute so
 * the two cues cannot drift apart — the same rule `RailItem` follows.
 *
 * ⚠️ `tone` colours the number, and the LABEL says the same thing in words: a green `12` beside
 * "On in production" is reinforcement, never the only carrier. A zero is dimmed whatever the tone,
 * because a green `0` beside "On in production" reads at a glance as a healthy number — which is
 * the opposite of what it means.
 */
export function StatLink({
  value,
  label,
  href,
  tone = 'all',
  current,
}: {
  value: number
  label: string
  href: string
  tone?: 'all' | 'on' | 'off' | 'never'
  current?: boolean
}) {
  return (
    <a
      className={`ds-stat ds-stat--${tone}`}
      href={href}
      data-nonzero={String(value > 0)}
      aria-current={current ? 'true' : undefined}
    >
      <span className="ds-stat-value">{value}</span>
      <span className="ds-stat-label">{label}</span>
    </a>
  )
}

/**
 * A chip that captions a value — a type, a risk, an environment, an expiry.
 *
 * `label` is how "Unclassified Unclassified" stopped being what a screen reader heard on a row
 * carrying both a type tag and a risk tag. It CAPTIONS the value ("Kill switch — Type") rather than
 * replacing it, which is the distinction that made the first attempt — an `aria-label` on the CELL —
 * announce a feature key as the word "Feature".
 *
 * ⚠️ **It is hidden TEXT, not an `aria-label`** (cross-family review, agy). This was an `aria-label`
 * on a bare `<span>`, and ARIA does not expose `aria-label` on an element with the `generic` role —
 * so the caption this component exists to add was being dropped by the assistive tech it was added
 * for, silently, while the markup looked correct. Hidden text is exposed everywhere, and it composes
 * with the visible value rather than replacing it.
 */
export function Tag({
  children,
  tone,
  label,
}: {
  children: ReactNode
  tone?: 'kill' | 'risk-high' | 'unclassified'
  label?: string
}) {
  return (
    <span className={classes('ds-tag', tone && `ds-tag--${tone}`)}>
      {children}
      {label === undefined ? null : <span className="ds-visually-hidden"> — {label}</span>}
    </span>
  )
}

/**
 * A standing note. Not a toast: a toast reports what just happened and leaves, this states
 * something that is true of the page every time you open it.
 *
 * `role="status"` for a note, `role="alert"` for a warning — the two are read differently by a
 * screen reader, and which one this is depends on whether the reader needs to know NOW.
 */
export function Callout({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <p className={`ds-callout ds-callout--${tone}`} role={tone === 'warn' ? 'alert' : 'status'}>
      <span className="ds-callout-icon">
        <Icon name={tone === 'warn' ? 'warning' : 'info'} size={14} />
      </span>
      <span>{children}</span>
    </p>
  )
}

/** The card a list lives in. Rows, a header row, or an empty state — never a page's prose. */
export function ListCard({
  children,
  label,
  wideActions,
}: {
  children: ReactNode
  label?: string
  /**
   * Widen the action column for a surface that genuinely needs more than a switch in it.
   *
   * Destinations carries Send test / Rotate secret / Remove beside its toggle. A flag rather than a
   * free width: two options a caller picks between cannot drift into forty, and the widths stay in
   * the stylesheet where the header and the cells read the same one.
   */
  wideActions?: boolean
}) {
  return (
    <div className="ds-listcard" data-actions={wideActions ? 'wide' : undefined}>
      {/* Wide content scrolls inside ITS OWN container; the page never scrolls sideways
          (Do-not #6). `role="table"` sits on the SCROLLER because that is the element that
          directly contains the rows — a `role="row"` whose ancestor is a plain `<div>` is an
          orphaned role a screen reader reports as broken structure. */}
      <div className="ds-listcard-scroll" role="table" aria-label={label}>
        {children}
      </div>
    </div>
  )
}

/** The 11/600 uppercase column header row. Never mono (Do-not #3). */
export function ListHead({ children }: { children: ReactNode }) {
  return (
    <div className="ds-listhead" role="row">
      {children}
    </div>
  )
}

/**
 * One column, in the header or in a row.
 *
 * ⚠️ The THREE FIXED WIDTHS live here and nowhere else. A header cell and the body cells beneath it
 * take the same `width`, so they cannot be given different ones — which is what happened when
 * `On / off` was added as a fourth column and two hardcoded column counts were left behind.
 */
export function Col({
  children,
  width = 'main',
  header,
  colSpan,
  title,
}: {
  children: ReactNode
  width?: 'main' | 'state' | 'meta' | 'act'
  header?: boolean
  /** Set only on a banner cell that spans the whole table — the value must be the column COUNT. */
  colSpan?: number
  title?: string
}) {
  // ⚠️ The `main` column is the SAME class in a header and in a row — it is the flexible one, so it
  // has no fixed width to switch between. This used to be a ternary with two identical branches
  // (cross-family review, agy): dead code that read like a decision somebody had made.
  const className =
    width === 'main'
      ? 'ds-row-main'
      : width === 'state'
        ? header
          ? 'ds-col-state'
          : 'ds-row-state'
        : width === 'meta'
          ? header
            ? 'ds-col-meta'
            : 'ds-row-meta'
          : 'ds-col-act'
  return (
    <span className={className} role={header ? 'columnheader' : 'cell'} aria-colspan={colSpan} title={title}>
      {children}
    </span>
  )
}

/** One row of a list card. */
export function Row({ children }: { children: ReactNode }) {
  return (
    <div className="ds-row" role="row">
      {children}
    </div>
  )
}

/**
 * The first cell of a row: what this row is about, and one line saying what it does.
 *
 * `mono` decides the typeface, and it is a real distinction rather than a style knob — a feature key
 * is an identifier and renders in mono; a credential's label is something a person typed and renders
 * in the sans face. `href` makes the title the row's link; without one it is plain text.
 */
export function RowMain({
  title,
  description,
  href,
  mono = true,
}: {
  title: ReactNode
  description?: ReactNode
  href?: string
  mono?: boolean
}) {
  const titleClass = classes('ds-row-key', !mono && 'ds-row-name')
  // ⚠️ A real `<code>` when the title is an identifier, not just a mono font-family. A feature key
  // IS code, and `<code>` is what a screen reader announces it as — the same reason the feature
  // page's `h1` wraps its key. The stylesheet makes the element inherit the row's size so the
  // browser's own `monospace` default cannot shrink it, which is the usual way a `<code>` inside
  // styled text ends up a step smaller than everything around it.
  const label = mono ? <code>{title}</code> : title
  return (
    <Col width="main">
      {href === undefined ? (
        <span className={titleClass}>{label}</span>
      ) : (
        <a className={titleClass} href={href}>
          {label}
        </a>
      )}
      {description === undefined ? null : <span className="ds-row-desc">{description}</span>}
    </Col>
  )
}

/**
 * The state cell: a pill, and one clipped line of detail under it.
 *
 * ⚠️ The detail is ONE LINE, clipped, with its full text on `title`. That is what holds the row at
 * the contract's 71px: the sentence separating "never turned on here" from "switched off" is long
 * on purpose, and in a 190px column it wrapped and made the row 90px — the state 39 of 42
 * production flags are in, so the gate ran against 90px rows and stayed green.
 */
export function RowState({
  state,
  label,
  detail,
}: {
  state: 'on' | 'off' | 'never'
  label: string
  detail?: string
}) {
  return (
    <Col width="state">
      <Pill state={state}>{label}</Pill>
      {detail === undefined ? null : (
        <span className="ds-state-detail" title={detail}>
          {detail}
        </span>
      )}
    </Col>
  )
}

/** A banner naming one run of rows and counting only its own. */
export function GroupBanner({
  state,
  children,
  count,
  columns,
}: {
  state: 'on' | 'off' | 'never'
  children: ReactNode
  count: number
  /** The table's column COUNT — `aria-colspan` is a number and must match what is rendered. */
  columns: number
}) {
  return (
    <div className={`ds-grp ds-grp--${state}`} role="row">
      <span className="ds-grp-bar" aria-hidden="true" />
      {/* `role="cell"`, never `columnheader`: this heads a RUN OF ROWS, and telling assistive tech
          it heads a COLUMN is a different and false claim. The count is READ, not hidden — how many
          rows a run holds is information, and hiding it to dodge a column-position problem withheld
          it from exactly the readers who cannot see the rows. */}
      <span role="cell" aria-colspan={columns}>
        {children} <span className="ds-grp-count">{count}</span>
      </span>
    </div>
  )
}

/**
 * The one line that stands for forty.
 *
 * ⚠️ The link is INSIDE the cell. A `role="row"` may own only cells, so an orphaned `<a>` is both an
 * invalid structure and an action with no column — a defect that survived three rounds on the
 * surface this replaces, once by having its comment corrected instead of its markup.
 */
export function DormantSummary({
  title,
  detail,
  action,
  href,
  columns,
}: {
  title: string
  detail: string
  action: string
  href: string
  columns: number
}) {
  return (
    <div className="ds-dormant" data-dormant-summary role="row">
      <span className="ds-dormant-text" role="cell" aria-colspan={columns}>
        <span className="ds-dormant-copy">
          <span className="ds-dormant-title">{title}</span>
          <span className="ds-dormant-detail">{detail}</span>
        </span>
        <a className="ds-dormant-go" href={href}>
          {action}
        </a>
      </span>
    </div>
  )
}

/**
 * A list card's empty state — an invitation, not a dead end.
 *
 * `title` and `body` are both required for the reason `TableEmpty`'s are: "No results" is the dead
 * end `references/ux-guidelines.md` names. It has to say what would put something here.
 *
 * ⚠️ It renders OUTSIDE any `role="row"`, and `ListCard`'s `role="table"` is dropped when a card
 * holds one — a grid with no rows and no columns is reported as broken structure rather than as
 * "nothing here yet". Callers use `EmptyCard` rather than `ListCard` + `Empty` for that reason.
 */
export function Empty({
  title,
  body,
  action,
  state = 'empty',
}: {
  title: string
  body: ReactNode
  action?: ReactNode
  /**
   * ⚠️ **`unbuilt` is not `empty`, and `references/ux-guidelines.md` says the two "must look
   * different".** An empty list means *nothing here yet* and a control exists that would fill it;
   * an unbuilt surface means *this does not exist* and no control does. Collapsing them sends a
   * reader hunting for a button nobody has written — which is exactly the risk the product owner
   * accepted when deciding to ship `/app/scheduled` as a designed empty-state route, on the
   * condition that it says so plainly (epic D13).
   */
  state?: 'empty' | 'unbuilt'
}) {
  return (
    <div className="ds-empty" data-state={state}>
      <span className="ds-empty-title">{title}</span>
      <span className="ds-empty-body">{body}</span>
      {action ? <span className="ds-empty-action">{action}</span> : null}
    </div>
  )
}

/** A list card holding nothing but an empty state — see `Empty` for why the table role is dropped. */
export function EmptyCard(props: {
  title: string
  body: ReactNode
  action?: ReactNode
  state?: 'empty' | 'unbuilt'
}) {
  return (
    <div className="ds-listcard">
      <Empty {...props} />
    </div>
  )
}

/** A padded card: the list card's surface, holding prose and fields instead of rows. */
export function Card({ children }: { children: ReactNode }) {
  return <div className="ds-card">{children}</div>
}

/**
 * A label, a control, the sentence that explains it, and the error when there is one.
 *
 * ── `error` is a render-prop field, and the shape is the point ────────────────────────────────
 * When `error` is used, `children` is called with the ARIA a control must carry: `aria-invalid`,
 * and an `aria-describedby` naming the hint and the error message. A caller that took a plain
 * `ReactNode` here would have to remember to wire those itself, and "remember to add the attribute"
 * is how a field ends up announcing an error only to people who can see it.
 *
 * ⚠️ **The error slot reserves its height whether or not it has text.** Without that, showing an
 * error moves the submit button a cursor is already travelling towards. That reflow was found and
 * fixed once on `components/ui/FormSection`; the design system's own field is not going to
 * rediscover it.
 *
 * ⚠️ **`aria-describedby` names only ids that EXIST.** Listing the hint's id unconditionally means a
 * field with no hint points at an element that was never rendered — and a dangling ARIA reference
 * reads to a screen reader as nothing at all, silently (cross-review, agy, PR #82, on the kit's
 * version of this component).
 */
export function Field({
  label,
  children,
  hint,
  error,
  controlId,
}: {
  label: string
  children: ReactNode | ((control: FieldControl) => ReactNode)
  hint?: ReactNode
  /** `null` when the field is valid. A STRING is what makes it invalid — never a boolean beside it. */
  error?: string | null
  /**
   * The control's id, supplied by the caller.
   *
   * Not `useId()`: this file is imported by server components, and a hook here would make every page
   * that renders a field a client tree. A caller that renders one field per kind already has a
   * stable name for it.
   */
  controlId?: string
}) {
  const hintId = hint === undefined || controlId === undefined ? undefined : `${controlId}-hint`
  const errorId = error == null || controlId === undefined ? undefined : `${controlId}-error`
  const describedBy = [hintId, errorId].filter(Boolean).join(' ')
  const control: FieldControl = {
    id: controlId,
    'aria-invalid': error == null ? 'false' : 'true',
    'aria-describedby': describedBy === '' ? undefined : describedBy,
  }
  return (
    <div className="ds-field">
      {/* ⚠️ **A REAL `<label htmlFor>`, and the first draft of this was a `<span>`.** It cost the
          whole browser run: `getByLabel('What to call it')` resolved to nothing on four surfaces,
          because a span beside an input associates them for a sighted reader and for nobody else. A
          control whose only name is its visual neighbour has no accessible name at all.
          The `<span>` fallback is for a field holding no single control — Setup › Connect's status
          block, a pick list of buttons — where a `<label>` with no `for` would be a promise of an
          association that does not exist. A field with a control passes `controlId`; one without
          does not, and the difference is visible in the markup rather than in a convention. */}
      {controlId === undefined ? (
        <span className="ds-label">{label}</span>
      ) : (
        <label className="ds-label" htmlFor={controlId}>
          {label}
        </label>
      )}
      {typeof children === 'function' ? children(control) : children}
      {hint === undefined ? null : (
        <p className="ds-hint" id={hintId}>
          {hint}
        </p>
      )}
      {/* ⚠️ **Rendered whenever the field CAN error — `undefined` means it cannot, `null` means it
          currently does not.** The slot's height is reserved for the second case, so showing a
          message moves nothing below it; reserving it for the FIRST case would be 24px of empty
          space under every read-only field in the product, which is what the first draft did and
          what pushed Setup › Connect past the fold.
          `role="alert"` only when there is something to announce: an empty live region that
          appears on every field is noise a screen reader has to wade through. */}
      {error !== undefined && (
        <p className="ds-field-error" id={errorId} role={error === null ? undefined : 'alert'}>
          {error ?? ''}
        </p>
      )}
    </div>
  )
}

/** What `Field` hands a render-prop control so the ARIA cannot be forgotten. */
export type FieldControl = {
  id?: string
  'aria-invalid': 'true' | 'false'
  'aria-describedby'?: string
}

/**
 * A value shown ONCE, on a screen of its own, that cannot be recovered by reloading.
 *
 * Sprint contract #7: *the key value is shown once, on a screen of its own, with a copy button.
 * Never a value read off a table.* This is that screen. It is gold-bordered because it is the only
 * thing on the page a reader cannot get back.
 */
export function ShownOnce({
  title,
  body,
  children,
}: {
  title: string
  body: ReactNode
  children: ReactNode
}) {
  return (
    <div className="ds-once" role="alert">
      <span className="ds-once-title">{title}</span>
      <span className="ds-once-body">{body}</span>
      {children}
    </div>
  )
}

/**
 * A page's own tab strip — the lid of the panel below it.
 *
 * ⚠️ A `<nav>` with `aria-current`, NOT `role="tablist"`. These are LINKS: activating one is a full
 * navigation to a URL, which is the whole point — a tab worth reading is a tab worth sending
 * someone. `role="tab"` would promise a JS widget with arrow-key movement between panels, and there
 * is no JS here at all. `Tab` above is the other half of that pair, for a real tablist; this is the
 * one a server-rendered page uses, and the stylesheet draws both the same so a page can pick the
 * honest markup rather than the styled one.
 */
export function PageTabs({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav className="ds-tabs ds-tabs--panel" aria-label={label}>
      {children}
    </nav>
  )
}

export function PageTab({
  children,
  current,
  href,
}: {
  children: ReactNode
  current?: boolean
  href: string
}) {
  return (
    <a className="ds-tab" href={href} aria-current={current ? 'page' : undefined}>
      {children}
    </a>
  )
}

/** The body a `PageTabs` strip reveals. */
export function Pane({ children }: { children: ReactNode }) {
  return <div className="ds-pane">{children}</div>
}
