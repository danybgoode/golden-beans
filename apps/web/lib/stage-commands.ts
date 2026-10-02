import type { BoardCard } from './hub-board'

// board-sinks-and-scrumban · Sprint 2, Story 2.3 — the commands a card offers, by stage.
//
// ONE map keyed by stage, in the house vocabulary: the verbs of `Roadmap/SESSION-KICKOFFS.md` → *Command shorthands*
// (Groom, Bet, Build epic, Resume, Wrap S<N>, Review PR #<N>, Close epic) and the generator they point at
// (`emit-epic-kickoff`). The Hub only SHOWS them to copy — it runs nothing (D8; no LLM and no repo access in the
// engine). Pure and import-free at runtime (a type import is erased), so `node --test` loads it directly.

export type StageCommand = { label: string; text: string }

/** `Roadmap/<macro>/<slug>/README.md` → `<macro>/<slug>`, the key `epic-dod` takes. */
function epicKey(card: BoardCard): string | null {
  const m = (card.links.readme ?? '').match(/^Roadmap\/([^/]+\/[^/]+)\/README\.md$/)
  return m ? m[1] : null
}

/** The first sprint that is not done — the one a Resume or a Wrap is about. */
function currentSprint(card: BoardCard): number | null {
  const open = card.sprints.find((s) => s.total === 0 || s.done < s.total)
  return open ? open.n : card.sprints.length ? card.sprints[card.sprints.length - 1].n : null
}

const COMMANDS: Record<BoardCard['stage'], (card: BoardCard) => StageCommand[]> = {
  'To groom': (card) => [{ label: 'Groom it', text: `Groom: ${card.name}` }],
  Grooming: (card) => [
    { label: 'Resume the groom at its approval gate', text: `Groom: ${card.slug}` },
    { label: 'Bet it at the wave boundary', text: 'Bet the wave' },
  ],
  'Ready to build': (card) =>
    card.grain === 'Epic'
      ? [
          { label: 'Build it', text: `Build epic ${card.slug}` },
          {
            label: 'Regenerate the kickoff',
            text: `node skills/groom/emit-epic-kickoff.mjs --epic ${card.slug}`,
          },
        ]
      : [{ label: 'Build it (fixed scope)', text: `Build: ${card.slug}` }],
  Building: (card) => {
    const n = currentSprint(card)
    return [
      { label: 'Resume a session that died', text: 'Resume' },
      { label: 'Read the trail it left', text: 'node scripts/session-trail.mjs --resume' },
      ...(card.grain === 'Epic' && n !== null ? [{ label: 'Wrap the sprint', text: `Wrap S${n}` }] : []),
    ]
  },
  QA: (card) => {
    const key = epicKey(card)
    const open = card.pr && card.pr.state === 'OPEN'
    return [
      ...(open
        ? [
            { label: 'Review it', text: `Review PR #${card.pr!.number}` },
            {
              label: 'Route the review',
              text: `node scripts/review-route.mjs --builder <who-wrote-it> ${card.pr!.number}`,
            },
          ]
        : []),
      ...(card.grain === 'Epic'
        ? [
            { label: 'Close it', text: `Close epic ${card.slug}` },
            ...(key
              ? [{ label: 'Check the Definition of Done', text: `node scripts/epic-dod.mjs --check ${key}` }]
              : []),
          ]
        : []),
    ]
  },
  Shipped: () => [],
}

/** The commands for this card's stage, in the order the drawer lists them. Empty for Shipped: nothing is owed. */
export function stageCommands(card: BoardCard): StageCommand[] {
  return COMMANDS[card.stage](card)
}
