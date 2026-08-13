import type { ReactNode } from 'react'

// landing-frijoles-rebrand · Sprint 2, Story 2.1 — the conversation shape.
//
// ── Why this exists alongside ActivityFeedItem rather than replacing it ───────────────────────
// `ActivityFeedItem` renders a LOG: "you ▸ …" and "⚙ tool_name · …" lines, the vocabulary the
// signed-in agent rail uses for audit rows. That is the right device for a record of what an agent
// did. It is the wrong device for the landing's illustrated conversations, which are trying to show
// a reader what talking to their own agent feels like — and nobody's ChatGPT looks like a log.
//
// So the two coexist on purpose and are not one component with a mode flag: the rail's row has a
// timestamp and a tool name, this has an author and a shape, and collapsing them would give the
// audit trail a chat bubble the first time someone reused the wrong prop. Both still render inside
// the same `AgentWindow` frame, which is the part that is genuinely one device.
export function ChatThread({ children }: { children: ReactNode }) {
  return <div className="chat-thread">{children}</div>
}

export function ChatBubble({
  actor,
  /** The agent's avatar initial. Ignored for `actor="user"`, which has no avatar in this design. */
  avatar = 'A',
  children,
}: {
  actor: 'user' | 'agent'
  avatar?: string
  children: ReactNode
}) {
  return (
    <div className={`chat-row chat-row--${actor}`}>
      {actor === 'agent' && (
        // Decorative: the bubble's side already carries who is speaking, and a screen reader
        // announcing "A" before every agent line is noise. The visible label for the whole frame
        // is its SurfaceNote.
        <span className="chat-avatar" aria-hidden="true">
          {avatar}
        </span>
      )}
      <div className="chat-bubble">{children}</div>
    </div>
  )
}
