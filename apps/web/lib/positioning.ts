// agentic-pm-public-surface · Sprint 1, Story 1.1 (epic D2) — the category, stated once.
//
// ── Why a module for two strings ──────────────────────────────────────────────────────────────
// Because this repo has now paid for the alternative three times, and the bill was always the same
// shape: two things that had to agree, kept as two copies that currently matched. `MakerHero`'s
// hand-written bag rows against `MAKER_OPS_SURFACES` cost three review rounds in one epic — one
// finding per surface, because fixing one list never reached the other. `lib/landing-sections.ts`
// exists to stop the page and its registry drifting apart. `lib/methodology-chapters.ts` exists so
// the chapter list has one author rather than six.
//
// A category name and its definition retyped across five outward surfaces is that defect with a
// longer fuse. Nobody would notice the fifth copy going stale — it is prose, and prose has no type.
//
// ── Who imports this ──────────────────────────────────────────────────────────────────────────
// Five outward surfaces, each of which a stranger may hit first:
//   - `app/northstar-self-serve.md/route.ts`  — the workshop's header       (Story 1.2)
//   - `components/landing/MakerHero.tsx`      — §hero, once, where it cannot be missed (Story 3.1)
//   - `app/layout.tsx`                        — the link preview            (Story 3.2)
//   - `app/llms.txt/route.ts`                 — the agent-facing brief      (Story 3.3)
//   - `lib/methodology-chapters.ts`'s intro   — /methodology's opening      (Story 3.4)
// `e2e/positioning-surfaces.spec.ts` asserts the string appears identically on each of them, so a
// sixth surface that retypes it is a failing test rather than a slow divergence.
//
// ── Why the definition exists at all, rather than using the term bare ─────────────────────────
// "Agentic product management" is an emerging term with no owner, and today's dominant usage means
// product management *of* agentic AI products — i.e. building agents. That is not what we mean, and
// it is close enough to be mistaken for it. An agent summarising a page that uses the term bare
// repeats it with the market's meaning and files us as an agent-building tool. So the term is
// defined once, near the top of whatever surface uses it, and used bare thereafter.
//
// ── The constraint on the definition, inherited from `app/layout.tsx` ─────────────────────────
// It names NO capability. That rule took three review rounds to settle on the link preview and the
// reasoning generalises to every string in this file: these travel WITHOUT the qualification the
// page carries, while gate state is per-deployment and this text is per-build. Any capability named
// here is a claim a flag flip can falsify and the reader cannot see qualified. Describe the shape;
// let the page describe the capabilities, where it can read the gates. `positioning.test.ts` pins
// it rather than leaving it to this paragraph.
//
// No `import 'server-only'`, no environment reads, no imports at all. `MakerHero` is a server
// component and `CopyPromptCard` is a client one; this module has to be legitimately reachable from
// both sides of that boundary, and being pure is what makes it unit-testable rather than observable
// only second-hand through rendered HTML.

/** The category we are claiming. Used bare only AFTER `CATEGORY_DEFINITION` has been stated. */
export const CATEGORY = 'agentic product management'

/**
 * The category, defined. One sentence, locked by epic D2 — changing it is one edit in one file,
 * which is the entire point of this module existing.
 */
export const CATEGORY_DEFINITION =
  'Agentic product management: the whole product discipline — decide, build, prove, grow — run by one person and their agents, on rails that keep the evidence honest.'
