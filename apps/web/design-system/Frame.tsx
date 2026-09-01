import type { ReactNode } from 'react'
import { GoldenFrijolMark } from '@/components/brand/GoldenFrijolMark'

// design-system-rails · Sprint 6, Story 6.1 — SEAM B.
//
// ── What this is, and what it is deliberately NOT ─────────────────────────────────────────────
// `ProductShell` is seam A: the console's three tiers, wrapped round the twenty-one signed-in
// routes. This is seam B, and it is the chrome for the other nine — `/login`, `/signup`,
// `/install`, `/s/[token]`, `/talk` and the four `/hub` routes. Before it, those nine shared **no**
// wrapper at all: `.auth-shell` painted two of them, the landing's `Nav`/`Footer` painted two more,
// `hub.module.css` painted four, and `/s/[token]` borrowed `../../hub/report-components`. Four
// answers to one question is how a product ends up looking like four products.
//
// ⚠️ **It is shared CHROME, not a gate, and it has nothing to ask** (epic README, **D6**, Daniel,
// 2026-08-31). The scaffolded plan had this component calling `isDesignV2Enabled()`. There is no
// such predicate and there is no flag: the redesign ships straight to production. A frame that
// reads a switch is a frame with two designs behind it, and the whole saving of D6 is that there is
// only one.
//
// ⚠️ **Root `layout.tsx` was considered and REJECTED at the architecture lock.** It also wraps `/`
// and `/methodology`, which `landing-maker-ops` and `methodology-experience` own and ship on the
// brand system. This epic's frame has no business wrapping them, and `OUT_OF_SCOPE_PAGES` in
// `route-manifest.ts` says so by name.
//
// ── The three frames are DD3, not a taste ─────────────────────────────────────────────────────
// *Chrome appears when there is something to navigate.* Signed out there is no project, no
// environment and no sections, so the console's three tiers would be four rows of controls that do
// nothing:
//
//   door    — one centred column, no nav at all. `/login`, `/signup`.
//   public  — a slim bar: the mark, and the actions a stranger may take. `/install`, `/s/[token]`,
//             `/talk`, and the designed 404 every dead share link lands on.
//   hub     — the console's peer (DD2): the same bar, plus its own tier 2. The four `/hub` routes.
//
// Same tokens, same type, same buttons, same honest empty and error states in all three. Only the
// frame changes, and it changes for a reason that fits in one sentence.

/** Which of DD3's frames this page wears. `console` is `ProductShell`'s, and is not reachable here. */
export type FrameVariant = 'door' | 'public' | 'hub'

/**
 * The brand, as this design system draws it.
 *
 * ⚠️ **A deliberate, recorded deviation from the approved prototype.** The prototype draws a
 * gold-gradient `GB` tile, because it is a `file://` document with no access to the product's
 * components. The product has shipped a real mark since `landing-frijoles-rebrand` —
 * `GoldenFrijolMark` — and the epic's own rule is *extend what exists, never rewrite it*. Porting
 * the placeholder over the real thing would have been a redesign shipped as a port.
 */
function Brand({ href }: { href?: string }) {
  const inner = (
    <>
      <GoldenFrijolMark size={26} />
      <b>Golden Frijoles</b>
    </>
  )
  // A link when there is somewhere to go, plain text when there is not. `/s/[token]` is read by
  // somebody with no account, and a share link that quietly offers a way in is a share link that
  // leaks a map of the account (`public-share`'s own callout says exactly this).
  return href === undefined ? (
    <span className="ds-brand">{inner}</span>
  ) : (
    <a className="ds-brand" href={href}>
      {inner}
    </a>
  )
}

export function Frame({
  variant,
  children,
  /** The bar's controls, right-aligned. `public` and `hub` only — the door frame has no nav. */
  actions,
  /** Tier 2. `hub` only: the roadmap / horizon / report strip, supplied by the page that knows it. */
  nav,
  /** What the bar names as the thing you are looking at. `hub` only. */
  scope,
  /** Where the mark points. Omitted means the mark is not a link (see `Brand`). */
  brandHref,
  /** `public` only: the 1080px measure the approved `public-talk` state uses. */
  wide = false,
}: {
  variant: FrameVariant
  children: ReactNode
  actions?: ReactNode
  nav?: ReactNode
  scope?: ReactNode
  brandHref?: string
  wide?: boolean
}) {
  if (variant === 'door') {
    return (
      // `ds` is what makes the design system PAINT — `tokens.css` is scoped to it and every rule in
      // `system.css` is `.ds .ds-…`. Without it these pages would render correct markup with the
      // landing's palette resolved underneath, which is the failure ProductShell's own comment
      // records from the other direction.
      <div className="ds ds-door">
        <main className="ds-doorcard">
          <div className="ds-doorbrand">
            <Brand href={brandHref} />
          </div>
          {children}
        </main>
      </div>
    )
  }

  return (
    <div className={`ds ds-public${variant === 'hub' ? ' ds-public--hub' : ''}`}>
      <header className="ds-pubbar">
        <Brand href={brandHref} />
        {scope === undefined ? null : <span className="ds-pubbar-scope">{scope}</span>}
        <span className="ds-pubbar-spacer" />
        {actions}
      </header>
      {nav === undefined ? null : (
        <nav className="ds-pubnav" aria-label="Hub sections">
          {nav}
        </nav>
      )}
      <main className={`ds-pubwrap${wide ? ' ds-pubwrap--wide' : ''}`}>{children}</main>
    </div>
  )
}

/**
 * A link that looks like a button.
 *
 * The design system's `Button` is a `<button>` — it takes an `onClick`, and these pages are Server
 * Components whose controls are NAVIGATION. An anchor styled as a button keeps middle-click, "open
 * in new tab" and the status bar working; a button with an `onClick` that pushes a route breaks all
 * three and needs a client island to do it.
 */
export function FrameLink({
  href,
  children,
  variant = 'secondary',
  ...rest
}: {
  href: string
  children: ReactNode
  variant?: 'primary' | 'secondary'
  target?: string
  rel?: string
}) {
  return (
    <a className={`ds-btn ds-btn--${variant} ds-btn--sm`} href={href} {...rest}>
      {children}
    </a>
  )
}
