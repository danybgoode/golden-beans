import type { ReactNode } from 'react'

// The signature frame device: an agent conversation, framed.
//
// ── The bar carries no text, and that is the whole of it now ──────────────────────────────────
// It used to carry a title, plus EITHER a liveness chip ("connected", "revocable") or a row of
// platform pills (Claude / ChatGPT / your agent). All three are gone: they were chrome describing
// the frame rather than content inside it, and the page's honesty label was never in the bar in the
// first place. Removing the bar's text removes a second, weaker answer to "is this real", which is
// the reason the props are deleted rather than defaulted to empty: an empty chip still renders a
// bordered pill, and a nullable title is a branch nothing exercises.
//
// ── This component currently has NO call site (epic A12) ──────────────────────────────────────
// The honesty label used to be a `SurfaceNote` rendered above every frame, enforced by a browser
// guard. agentic-pm-public-surface Sprint 2 removed the last three frames from the landing, so
// `SurfaceNote` and that guard were both deleted and this frame kept — it is a kit primitive, and
// an unused primitive is inventory rather than dead code.
//
// **If a frame returns to a public page, the label comes back with it.** The failure that guard
// prevented is one this site has actually shipped: an invented conversation presented in the same
// chrome as a live read, with a note saying only where the conversation happened. Do not re-render
// this component on a public surface without an accompanying, committed "real or illustrated"
// label — the frame alone cannot tell a reader which it is looking at.
export function AgentWindow({
  layout = 'feed',
  children,
  className = '',
}: {
  /** `feed` is the tool-call log; `thread` is the chat shape, which owns its own padding. */
  layout?: 'feed' | 'thread'
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`agent-win ${className}`.trim()}>
      <div className="agent-bar">
        <span className="agent-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </div>
      {layout === 'thread' ? children : <div className="agent-body">{children}</div>}
    </div>
  )
}
