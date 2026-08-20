import { CopyPromptCard } from '@/components/landing/CopyPromptCard'
import {
  WORK_LABELS,
  type MethodologyBlock,
  type WorkBlock,
  type WorkBodyBlock,
} from '@/lib/methodology-chapters'

// methodology-experience · Sprint 2, Story 2.3 — renders a chapter's `blocks[]`.
//
// Lives under `components/methodology`, not inline in the route file (epic README A4): the route
// stays a thin params -> module lookup -> composition, and this is the surface
// `scripts/check-design-drift.mjs`'s `VOICE_AND_STYLE_ROOTS` sweep actually reaches. It is also
// the home Sprint 3's work-block styling pass (Story 3.2) extends rather than invents.
//
// ── `WorkBodyBlock` renders through the SAME function as the top-level prose/list/blockquote ────
// `lib/methodology-chapters.ts` deliberately makes `WorkBodyBlock` a strict subset of
// `MethodologyBlock`'s own prose/list/blockquote arms — same shape, narrower context. Rendering
// them through one function (`BodyBlock`) rather than two copies is CODE-QUALITY #2: two things
// that must agree get one implementation, not two that currently match.
function BodyBlock({ block, keyPrefix }: { block: WorkBodyBlock; keyPrefix: string }) {
  switch (block.kind) {
    case 'prose':
      // `lead` marks the one sentence per work card that states the point rather than explaining
      // it (every "What you just learned" card's opening line) — the same role `.takeaway` plays
      // on the landing page, scoped to a work card instead of a whole section.
      return <p className={block.lead ? 'methodology-lead-line' : undefined}>{block.text}</p>
    case 'list':
      return (
        <ul>
          {block.items.map((item, index) => (
            <li key={`${keyPrefix}-${index}`}>{item}</li>
          ))}
        </ul>
      )
    case 'blockquote':
      return <blockquote>{block.text}</blockquote>
  }
}

/**
 * One `work` block — the four-way taxonomy the epic README's substitution table keeps AS-IS
 * because it is the pedagogy, not the skin.
 *
 * The `agent` arm renders `CopyPromptCard` and NOTHING else (epic D8): no wrapper paragraph, no
 * label text folded into the card, because `CopyPromptCard` copies from its OWN rendered `<pre>`
 * — anything this component put around the prompt would be text the reader never saw but their
 * agent would receive. `WorkBlock`'s own union (lib/methodology-chapters.ts) makes this true by
 * construction: the `agent` arm carries a `prompt` string and has no `body` field to put one in.
 */
function WorkBlockView({ block, keyPrefix }: { block: WorkBlock; keyPrefix: string }) {
  const label = WORK_LABELS[block.variant]

  if (block.variant === 'agent') {
    return (
      <div className="work work--agent">
        <CopyPromptCard label={label} prompt={block.prompt} />
      </div>
    )
  }

  return (
    <div className={`work work--${block.variant}`}>
      <p className="work__label">{label}</p>
      {block.body.map((bodyBlock, index) => (
        <BodyBlock key={`${keyPrefix}-${index}`} block={bodyBlock} keyPrefix={`${keyPrefix}-${index}`} />
      ))}
    </div>
  )
}

/** A chapter's full `blocks[]`, in order. The only export a route file should need. */
export function MethodologyBlocks({ blocks }: { blocks: MethodologyBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        const key = `block-${index}`
        if (block.kind === 'heading') return <h2 key={key}>{block.text}</h2>
        if (block.kind === 'work') return <WorkBlockView key={key} block={block} keyPrefix={key} />
        return <BodyBlock key={key} block={block} keyPrefix={key} />
      })}
    </>
  )
}
