import type { ReactNode } from 'react'

// landing-frijoles-rebrand · Sprint 2, Story 2.1 — what Golden Frijoles contributed to the
// conversation.
//
// The card is the whole point of the illustrated threads, and it is deliberately NOT a chat bubble:
// the reader is being shown that a third thing is present in a conversation they already have, and
// giving it a bubble would make it look like a second assistant talking. It reads as an inline
// artefact the agent was handed — gold left edge, its contents legible at a glance.
//
// It carries no illustration caveat of its own, and that was always deliberate: the FRAME around
// it carried one (`SurfaceNote`, landing-redesign-v2 epic D4), because per-element caveats are how
// a page ends up with caveats nobody reads.
//
// That arrangement no longer exists. `SurfaceNote` was deleted when agentic-pm-public-surface
// Sprint 2 removed the last landing illustration (epic A12), and this card has no call site today.
// The rule it depended on still holds and is now the caller's to honour: if this card returns to a
// public page, whatever frames it must say whether the figures inside are real.
//
// The `source`/`meta` header ("GOLDEN FRIJOLES · YOUR PRODUCT CONTEXT" / "READY TO PLACE") was
// removed with the rest of the hero's frame chrome: two lines of uppercase mono above three lines
// of content, saying who is speaking on a card whose gold edge already says it.
export function ContextCard({ children }: { children: ReactNode }) {
  return (
    <div className="context-card">
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
