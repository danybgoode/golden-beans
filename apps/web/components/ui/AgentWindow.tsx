import type { ReactNode } from 'react'

// The signature frame device: an agent conversation, framed.
//
// ── The bar carries no text, and that is the whole of it now ──────────────────────────────────
// It used to carry a title, plus EITHER a liveness chip ("connected", "revocable") or a row of
// platform pills (Claude / ChatGPT / your agent). All three are gone: they were chrome describing
// the frame rather than content inside it, and the page's honesty label was never in the bar in the
// first place — it is the `SurfaceNote` above every frame, which is what `e2e/landing.browser.
// spec.ts` asserts. Removing the bar's text removes a second, weaker answer to "is this real",
// which is the reason the props are deleted rather than defaulted to empty: an empty chip still
// renders a bordered pill, and a nullable title is a branch nothing exercises.
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
