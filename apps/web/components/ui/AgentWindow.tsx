import type { ReactNode } from 'react'

export function AgentWindow({
  title = 'claude',
  status = 'connected',
  // landing-frijoles-rebrand · Sprint 2, Story 2.1 — the platform pills.
  //
  // When supplied they REPLACE the status chip rather than sitting beside it, and that is a
  // deliberate constraint rather than a layout convenience: the chip is where a reader looks to
  // decide whether a frame is live (which is why landing-redesign-v2 had to stop it reading "via
  // MCP" over an invented conversation), and a bar carrying both a liveness chip and a set of
  // platform tabs gives them two answers to one question. The window's honesty label is the
  // `SurfaceNote` above it, in both shapes.
  platforms,
  layout = 'feed',
  children,
  className = '',
}: {
  title?: string
  status?: string
  /** First entry renders as the active tab. Omit for the status-chip form. */
  platforms?: readonly string[]
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
        {title}
        {platforms ? (
          <span className="agent-platforms">
            {platforms.map((platform, index) => (
              <span key={platform} className={`platform-pill${index === 0 ? ' platform-pill--active' : ''}`}>
                {platform}
              </span>
            ))}
          </span>
        ) : (
          <span className="agent-chip">{status}</span>
        )}
      </div>
      {layout === 'thread' ? children : <div className="agent-body">{children}</div>}
    </div>
  )
}
