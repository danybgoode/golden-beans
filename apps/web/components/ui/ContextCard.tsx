import type { ReactNode } from 'react'

// landing-frijoles-rebrand · Sprint 2, Story 2.1 — what Golden Frijoles contributed to the
// conversation.
//
// The card is the whole point of the illustrated threads, and it is deliberately NOT a chat bubble:
// the reader is being shown that a third thing is present in a conversation they already have, and
// giving it a bubble would make it look like a second assistant talking. It reads as an inline
// artefact the agent was handed — gold left edge, its own header naming the source and the one
// number that matters.
//
// It carries no illustration caveat of its own. The frame above it does (`SurfaceNote`, epic D4 of
// landing-redesign-v2), and per-element caveats are how a page ends up with caveats nobody reads.
export function ContextCard({
  source,
  meta,
  children,
}: {
  /** Who supplied this — always Golden Frijoles here, spelled out so the reader can attribute it. */
  source: string
  /** The single figure or goal the card is answering against. */
  meta: string
  children: ReactNode
}) {
  return (
    <div className="context-card">
      <div className="context-head">
        <span>{source}</span>
        <span>{meta}</span>
      </div>
      <div className="context-body">{children}</div>
    </div>
  )
}

export function ContextOption({
  title,
  detail,
  verdict,
}: {
  title: string
  detail: string
  /** The comparative call. Optional: a card may report a finding rather than rank options. */
  verdict?: ReactNode
}) {
  return (
    <div className="context-option">
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      {verdict}
    </div>
  )
}
