// methodology-experience · Sprint 2, Story 2.1 — the methodology, as one typed module.
//
// ── This file is the SOURCE, not a copy of one (epic D5) ──────────────────────────────────────
// The page, the index cards, the TOC, the route metadata and any downloadable edition all derive
// from here. A hand-maintained markdown twin of this prose would be the exact drift class
// `lib/landing-sections.ts` exists to prevent, and the class this repo has been bitten by three
// times. If you are about to write the methodology down somewhere else, generate it from this.
//
// ── Where the prose came from, and what was WRONG with it ─────────────────────────────────────
// Derived from `references/golden-frijoles-methodology-experience-v0.3.html`, the mockup, which is
// itself a pandoc conversion of the Minimum Viable Field Guide. The conversion left five defects
// that the epic README lists and that a faithful port would have shipped. Four of them are fixed
// here, in the content, because this is where they live:
//
//   1. THE LEDE WAS A RENDERED JAVASCRIPT OBJECT. All six chapters displayed the raw
//      `{1:"…",2:"…",…}[n]` literal as body text — a templating step that never ran. The six real
//      strings were inside that literal all along; each is now its chapter's own `lede`. The unit
//      test asserts no lede contains `{`, because this can only ever regress silently.
//   2. PANDOC HORIZONTAL RULES. Every "What you just learned" block ended with a literal
//      `------------------------------------------------------------------------` paragraph. Gone.
//   3. PANDOC EM-DASHES. The source renders every em-dash as a literal `---` ("Opportunity --- what
//      possibility are we considering?"). Restored to `—`. This one is not in the README's list of
//      five; it is the same conversion failure and it is on every definition line in chapters 2, 5
//      and 6, so it is fixed with them rather than left for a reader to notice.
//   4. A COLLAPSED BULLET LIST. Chapter 3's "Ask: - Does the Opportunity matter? - Is the Outcome a
//      change in reality…" is a real list flattened into one hyphenated paragraph. It is a `list`
//      block again. Chapter 6's Continue/Change/Reduce/Increase/Exit judgments had the same shape.
//
// The fifth defect (the mockup is a `display:none` SPA with no URLs) is not a content problem and
// is fixed by Stories 2.2 and 2.3.
//
// ── Chapter 2 is "Design it" (epic D3) ────────────────────────────────────────────────────────
// The rename reaches this content and the public landing, and stops there — `AGENTS.md`,
// `Roadmap/WAYS-OF-WORKING.md` and the `groom` skill keep *Shape* as our internal operating
// vocabulary. It is a copy pass, not a `sed`. Four lines needed real rewriting rather than a swap,
// and each is marked at its call site below with what it used to say.
//
// ── Titles carry no full stop, and that is a decision (Story 2.3) ─────────────────────────────
// The mockup writes them as sentences ("Bring an idea."). They are rendered as the `<h1>` of a
// route, and `scripts/check-design-drift.mjs`'s `heading-period` rule reads the final character of
// heading text — so the stop had to go from the title or the title had to stop being a heading.
// The stop goes. Headings here are titles, not sentences, which is the same rule `MakerHero`'s
// display headline already follows, and the guard is not special-cased.

export type MethodologyPhase = 'consider' | 'operate' | 'exit'

/**
 * The four-way work-block taxonomy, kept from the mockup because it is the pedagogy: gold "do
 * this", dark "use your agent", green "look for", and the two plain cards.
 */
export type WorkVariant = 'do' | 'agent' | 'look' | 'yours' | 'learned'

/** Blocks that can appear inside a work block. Deliberately narrower than a chapter's own set. */
export type WorkBodyBlock =
  | { kind: 'prose'; text: string; lead?: true }
  | { kind: 'list'; items: string[] }
  | { kind: 'blockquote'; text: string }

/**
 * A work block.
 *
 * The `agent` variant carries a PROMPT STRING AND NOTHING ELSE (epic D8), and the union is written
 * so that is true by construction rather than by convention: there is no `body` on the agent arm to
 * put a stray sentence in. `CopyPromptCard` copies from its own rendered `<pre>`, so anything the
 * render side adds is text the reader's agent receives and the reader never saw.
 */
export type WorkBlock =
  | { kind: 'work'; variant: 'agent'; prompt: string }
  | { kind: 'work'; variant: Exclude<WorkVariant, 'agent'>; body: WorkBodyBlock[] }

export type MethodologyBlock =
  | { kind: 'prose'; text: string; lead?: true }
  | { kind: 'heading'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'blockquote'; text: string }
  | WorkBlock

export interface MethodologyChapter {
  /** Kebab route segment AND TOC target. One id, one chapter, one URL (epic D7). */
  id: string
  phase: MethodologyPhase
  /** 1-based reading order. Rendered zero-padded; stored as a number so it can be compared. */
  number: number
  /** No terminal full stop — see the note at the top of this file. */
  title: string
  /** One line for the index card. Shorter than the lede and written for someone choosing. */
  summary: string
  /** The chapter's own opening line. Never the `{1:"…"}[n]` literal the mockup rendered. */
  lede: string
  blocks: MethodologyBlock[]
}

/**
 * The label above each work block.
 *
 * Computed from the variant rather than stored per block, so a block cannot be styled as one thing
 * and labelled as another — the two-lists-that-must-agree defect, at its smallest scale
 * (CODE-QUALITY #2).
 */
export const WORK_LABELS: Record<WorkVariant, string> = {
  do: 'Do this on your project',
  agent: 'Use your agent',
  look: 'Look for',
  yours: 'This part is yours',
  learned: 'What you just learned',
}

/** The three phases, in loop order, with the one-line summary the index renders. */
export const METHODOLOGY_PHASES: { id: MethodologyPhase; title: string; summary: string }[] = [
  { id: 'consider', title: 'Consider', summary: 'Bring an idea → Design it → Place the Bet' },
  { id: 'operate', title: 'Operate', summary: 'Build ↔ Prove' },
  { id: 'exit', title: 'Exit', summary: 'Reconsider → Learn' },
]

export const METHODOLOGY_CHAPTERS: MethodologyChapter[] = [
  {
    id: 'bring-an-idea',
    phase: 'consider',
    number: 1,
    title: 'Bring an idea',
    summary:
      'Start with something you genuinely want to make, fix, change, or learn. An idea is not yet a commitment.',
    lede: 'Start with one real thing you want to make. The methodology begins in your project, not in a workbook.',
    blocks: [
      { kind: 'heading', text: 'Understand' },
      { kind: 'prose', text: 'Start with the thing you want to make.' },
      {
        kind: 'prose',
        text: 'Do not turn it into tickets. Do not write acceptance criteria. Do not solve it before understanding it.',
      },
      { kind: 'blockquote', text: 'An idea is not commitment.' },
      {
        kind: 'prose',
        text: 'A possibility worth understanding is an Opportunity. That does not mean it deserves investment.',
      },
      {
        kind: 'work',
        variant: 'do',
        body: [
          { kind: 'prose', text: 'Write one real thing you want to make, fix, change, or learn.' },
          {
            kind: 'blockquote',
            text: 'I want shops to see which customers look likely to return, without building another giant analytics dashboard.',
          },
          { kind: 'prose', text: 'Your ask can be messier.' },
        ],
      },
      {
        kind: 'work',
        variant: 'agent',
        // D3, rewritten rather than swapped: "Before shaping it, read the project agents…".
        prompt: `Help me groom this ask:

[DESCRIBE WHAT YOU WANT TO MAKE, CHANGE, FIX, OR EXPLORE]

Before designing it, read the project agents and ways of working, review relevant learnings, and skim team memory so you understand the context first.`,
      },
      {
        kind: 'work',
        variant: 'look',
        body: [
          {
            kind: 'prose',
            text: 'The agent should understand the project before producing a solution. Useful orientation may surface what already exists, architecture, current behavior, prior decisions, constraints, relevant learnings, contradictions, and missing information.',
          },
          {
            kind: 'prose',
            text: 'If the first response is merely a confident implementation plan, orientation failed.',
          },
        ],
      },
      {
        kind: 'work',
        variant: 'learned',
        body: [
          { kind: 'prose', text: 'Before creating, orient.', lead: true },
          {
            kind: 'prose',
            text: 'Agents make plausible implementation cheap. Golden Frijoles makes context and coherence part of the work so makers can build more without multiplying avoidable mistakes.',
          },
        ],
      },
    ],
  },
  {
    id: 'design-it',
    phase: 'consider',
    number: 2,
    title: 'Design it',
    summary:
      'Orient to reality, establish the Outcome and Baseline, fix the Appetite, and find a plausible bounded approach.',
    lede: 'Turn a rough idea into a plausible investment without pretending you already know the solution.',
    blocks: [
      { kind: 'heading', text: 'Understand' },
      // D3: "Shaping asks:" — a mechanical swap gives "Designing asks:", which reads like a typo.
      { kind: 'prose', text: 'Design begins with one question.' },
      { kind: 'blockquote', text: 'How much is this Opportunity worth to us?' },
      { kind: 'prose', text: 'The answer is the Appetite.' },
      {
        kind: 'prose',
        text: 'Appetite constrains the solution. The imagined solution does not dictate the investment.',
      },
      {
        kind: 'prose',
        text: 'A useful Appetite is exhaustible. When it is consumed, the operation must reconsider rather than silently expand.',
      },
      {
        kind: 'work',
        variant: 'do',
        body: [
          { kind: 'prose', text: 'Continue grooming. Work through the questions that require judgment.' },
          {
            kind: 'prose',
            text: 'By the end, the Bet candidate should make these things legible.',
          },
          {
            kind: 'list',
            items: [
              'Opportunity — what possibility are we considering?',
              'Outcome — what meaningful change in reality do we intend to cause?',
              'Baseline — what is true before the change?',
              'Appetite — how much attention, elapsed time, execution, compute, money, review burden, operational risk, or disruption is this worth?',
              'Approach — what plausible path fits inside the investment?',
              'Boundaries — what are we deliberately not solving?',
              'Evidence — what would justify the claims we expect to make?',
              'Displacement — what receives less investment because we choose this?',
              'Risk and Authority — what consequences matter, and who may authorize them?',
            ],
          },
          {
            kind: 'prose',
            text: 'Do not fill fields merely because they exist. The point is the investment decision.',
          },
        ],
      },
      {
        kind: 'work',
        variant: 'yours',
        body: [
          {
            kind: 'prose',
            text: 'Your agent can orient, research, synthesize, challenge, propose, and model tradeoffs.',
          },
          {
            kind: 'prose',
            text: 'It cannot own consequential judgment merely because it can produce an answer.',
          },
          { kind: 'blockquote', text: 'Capability does not imply Authority.' },
          { kind: 'prose', text: 'You decide what the Opportunity is worth.' },
        ],
      },
      {
        kind: 'work',
        variant: 'look',
        body: [
          {
            // D3: "A shaped Bet should be bounded enough…" — "a designed Bet" reads badly, so the
            // sentence is rebuilt around the property rather than around the participle.
            kind: 'prose',
            text: 'A well-designed Bet is bounded enough to operate and open enough to discover implementation.',
          },
          {
            kind: 'prose',
            text: 'Avoid both "Improve retention" and a giant implementation specification produced before discovery.',
          },
        ],
      },
      {
        kind: 'work',
        variant: 'learned',
        body: [
          // D3, and the one line where the rename created a collision with itself: the source read
          // "Fix the investment before designing the solution", which now uses the move's own name
          // for the thing the move is NOT. Rebuilt to keep the meaning and lose the clash.
          { kind: 'prose', text: 'Fix the investment before you pick the solution.', lead: true },
          {
            kind: 'prose',
            text: 'Design creates a plausible bounded investment decision; it does not predict the future.',
          },
        ],
      },
    ],
  },
  {
    id: 'place-the-bet',
    phase: 'consider',
    number: 3,
    title: 'Place the Bet',
    summary:
      'Make the investment decision explicit: Evidence, Displacement, Boundaries, Authority, and whether this is actually worth doing.',
    lede: 'Make the investment decision explicit. A scaffold is not commitment until the right Authority places the Bet.',
    blocks: [
      { kind: 'heading', text: 'Understand' },
      {
        kind: 'prose',
        text: 'A scaffold is not commitment. A well-designed idea can still deserve a no.',
      },
      { kind: 'prose', text: 'The Bet is the unit of strategic commitment.' },
      {
        kind: 'work',
        variant: 'do',
        body: [
          { kind: 'prose', text: 'Review the Bet. Ask:' },
          {
            // Mockup defect 3: this was one hyphenated paragraph. It is a list, and always was.
            kind: 'list',
            items: [
              'Does the Opportunity matter?',
              'Is the Outcome a change in reality rather than merely an Output?',
              'Is the Appetite explicit and exhaustible?',
              'Could the Evidence actually justify the claim?',
              'What is displaced?',
              'What Authority are we granting?',
              'Where must autonomous action stop?',
            ],
          },
          { kind: 'blockquote', text: 'Nothing is prioritized until something else is displaced.' },
        ],
      },
      {
        kind: 'work',
        variant: 'yours',
        body: [
          { kind: 'prose', text: 'Place the Bet only if the investment is justified.' },
          {
            // D3: "…can be the correct result of shaping."
            kind: 'prose',
            text: '"Do not build this" can be the correct result of Design. Preventing unjustified investment is progress.',
          },
        ],
      },
      {
        kind: 'work',
        variant: 'look',
        body: [
          {
            kind: 'prose',
            text: 'The placed Bet should carry enough coherence for decentralized execution without constant central coordination.',
          },
        ],
      },
      {
        kind: 'work',
        variant: 'learned',
        body: [
          { kind: 'prose', text: 'Bounded bets over endless backlogs.', lead: true },
          {
            kind: 'prose',
            text: 'A Bet is not a promise that the thesis is right. It is a bounded commitment to find out.',
          },
        ],
      },
    ],
  },
  {
    id: 'build-it',
    phase: 'operate',
    number: 4,
    title: 'Build it',
    summary:
      'Route the work, Slice for coherent behavior, and Bound autonomy so humans and agents can operate without losing control.',
    lede: 'Turn the Bet into real behavior through bounded human-agent operation.',
    blocks: [
      { kind: 'heading', text: 'Understand' },
      { kind: 'prose', text: 'Once the Bet is placed, the question changes.' },
      { kind: 'prose', text: 'You are deploying the investment against reality.' },
      { kind: 'prose', text: 'The learner-facing rule is:' },
      { kind: 'blockquote', text: 'Build one coherent piece at a time.' },
      {
        kind: 'prose',
        text: 'Three deeper practices sit inside Build: Route, Slice and Bound. They are practices, not ceremonies.',
      },
      { kind: 'heading', text: 'Route' },
      { kind: 'blockquote', text: 'Route uncertainty upward. Route certainty outward.' },
      {
        kind: 'prose',
        text: 'High-uncertainty or consequential work may require human judgment, a reasoning or coordinating agent, adversarial review, or explicit Authority.',
      },
      {
        kind: 'prose',
        text: 'Well-understood reversible execution can move outward to bounded execution agents or deterministic systems.',
      },
      { kind: 'prose', text: 'Assign work according to cognition and Authority, not job title.' },
      { kind: 'heading', text: 'Slice' },
      {
        kind: 'prose',
        text: 'Do not default to frontend, backend and database decomposition when none of them can independently demonstrate useful behavior.',
      },
      { kind: 'blockquote', text: 'Slice for coherent behavior.' },
      {
        kind: 'prose',
        text: 'A Slice is a coherent piece of the Bet that can be independently owned, integrated, and verified.',
      },
      {
        kind: 'work',
        variant: 'do',
        body: [
          {
            kind: 'prose',
            text: 'Ask the project agent to identify the smallest coherent Slice that materially reduces uncertainty or creates usable behavior.',
          },
          {
            kind: 'prose',
            text: 'Build it. Integrate it. Prove what can already be proved. Then choose the next Slice.',
          },
        ],
      },
      { kind: 'heading', text: 'Bound' },
      { kind: 'prose', text: 'A Boundary answers:' },
      { kind: 'blockquote', text: 'Where must autonomous action stop or escalate?' },
      {
        kind: 'prose',
        text: 'It may cover Appetite, solution limits, work in progress, merge and release behavior, flags, production access, spend, security consequences, irreversible actions, and human authorization.',
      },
      { kind: 'blockquote', text: 'Autonomy expands with reversibility and contracts with consequence.' },
      {
        kind: 'work',
        variant: 'yours',
        body: [
          {
            kind: 'prose',
            text: 'Do not micromanage reversible execution merely to feel in control.',
          },
          {
            kind: 'prose',
            text: 'Do not grant consequential Authority merely because an agent is capable of exercising it.',
          },
        ],
      },
      {
        kind: 'work',
        variant: 'look',
        body: [
          {
            kind: 'prose',
            text: 'Healthy operation makes visible what is being attempted, what remains uncertain, what has been integrated, what Evidence exists, what boundary was reached, and what decision needs a human.',
          },
        ],
      },
      {
        kind: 'work',
        variant: 'learned',
        body: [
          { kind: 'prose', text: 'Centralize coherence. Decentralize execution.', lead: true },
          {
            kind: 'prose',
            text: 'The Bet carries coherence. Bounded agents carry execution. Humans concentrate on decisions that actually require them.',
          },
        ],
      },
    ],
  },
  {
    id: 'prove-it',
    phase: 'operate',
    number: 5,
    title: 'Prove it',
    summary:
      'Separate deterministic verification, independent judgment, and Evidence from reality. Shipping is not proof of Outcome.',
    lede: 'Establish Evidence continuously. Shipping proves something changed; it does not prove the Outcome.',
    blocks: [
      { kind: 'heading', text: 'Understand' },
      { kind: 'prose', text: 'Prove is not "after Build". It happens throughout Build.' },
      { kind: 'blockquote', text: 'Claims require Evidence proportional to their consequences.' },
      { kind: 'prose', text: 'Use three questions.' },
      { kind: 'heading', text: 'Did we build it correctly?' },
      {
        kind: 'prose',
        text: 'Use deterministic verification where the fact is knowable: tests, type checks, linting, schema validation, build checks, reproducible assertions.',
      },
      { kind: 'blockquote', text: 'Never ask judgment to do the work of determinism.' },
      { kind: 'heading', text: 'Is it good enough?' },
      {
        kind: 'prose',
        text: 'Some claims require judgment: UX quality, coherence, architectural fitness, copy quality, whether the result solves the problem you designed for.',
      },
      { kind: 'prose', text: 'Use genuinely independent review where independence matters.' },
      {
        kind: 'prose',
        text: "Another agent repeating the author's reasoning is not automatically independent Evidence.",
      },
      { kind: 'blockquote', text: 'Confidence comes from independent Evidence, not repeated agreement.' },
      { kind: 'heading', text: 'Did it work in reality?' },
      {
        kind: 'prose',
        text: 'Shipping proves something became real. It does not prove the Outcome occurred.',
      },
      {
        kind: 'prose',
        text: 'Look for Evidence where the claim lives: customer behavior, runtime behavior, production telemetry, business results, observed workflow changes, or direct experiential verification.',
      },
      {
        kind: 'work',
        variant: 'do',
        body: [
          {
            kind: 'prose',
            text: 'Write down the claims you expect to make about the current Slice or Bet. For each one, ask:',
          },
          { kind: 'blockquote', text: 'What Evidence would actually justify saying this is true?' },
          { kind: 'prose', text: 'Then obtain it.' },
        ],
      },
      {
        kind: 'work',
        variant: 'yours',
        body: [
          {
            kind: 'prose',
            text: 'Where consequence requires human authorization, an agent cannot turn Evidence into permission by itself. Risk acceptance and accountability remain Authority decisions.',
          },
        ],
      },
      {
        kind: 'work',
        variant: 'look',
        body: [
          { kind: 'prose', text: 'Keep these distinct.' },
          {
            kind: 'list',
            items: [
              'Output — what changed.',
              'Evidence — what we observed.',
              'Outcome — the change in reality we hoped to cause.',
            ],
          },
        ],
      },
      {
        kind: 'work',
        variant: 'learned',
        body: [
          { kind: 'prose', text: 'Done means shipped and verified, not merged.', lead: true },
          {
            kind: 'prose',
            text: 'Progress is reduction of meaningful uncertainty through Evidence. Conclusive Evidence that tells you to stop is progress.',
          },
        ],
      },
    ],
  },
  {
    id: 'decide-what-happens-next',
    phase: 'exit',
    number: 6,
    title: 'Decide what happens next',
    summary:
      'Reconsider the Bet from Evidence, then turn Learning into an actual change in how the system behaves.',
    lede: 'Use Evidence to decide what the Bet deserves now, then change the system based on what reality taught you.',
    blocks: [
      { kind: 'heading', text: 'Understand' },
      {
        kind: 'prose',
        text: 'A Bet does not earn continued investment because you already placed it.',
      },
      {
        kind: 'prose',
        text: 'Exit means ending the current investment decision, not deleting the capability produced by it.',
      },
      { kind: 'prose', text: 'Begin with Evidence:' },
      {
        kind: 'blockquote',
        text: 'Knowing what we know now, would we still make this Bet with the Appetite remaining?',
      },
      {
        kind: 'work',
        variant: 'do',
        body: [
          { kind: 'prose', text: 'Make one explicit judgment.' },
          {
            kind: 'list',
            items: [
              'Continue — the thesis holds and the remaining Appetite justifies continuing.',
              'Change — the Opportunity matters, but the approach or the Boundaries should change.',
              'Reduce — the remaining value justifies a smaller investment.',
              'Increase — new Evidence justifies deliberately increasing Appetite. This is a new investment judgment, not silent expansion.',
              'Exit — stop the current investment.',
            ],
          },
          {
            kind: 'prose',
            text: 'Success, failure, and conclusive negative Evidence can all justify Exit.',
          },
        ],
      },
      { kind: 'heading', text: 'Learn' },
      { kind: 'prose', text: 'Ask what reality taught you. Then ask:' },
      { kind: 'blockquote', text: 'What changes because of it?' },
      {
        kind: 'prose',
        text: 'A Learning can change project instructions, guardrails, an agent skill, architecture, verification requirements, operating heuristics, Direction, a future Bet, or something the organization stops doing.',
      },
      { kind: 'prose', text: 'If nothing changes, you recorded an observation.' },
      {
        kind: 'work',
        variant: 'look',
        body: [
          { kind: 'prose', text: 'The system should behave differently next time.' },
          {
            kind: 'prose',
            text: 'That is Evidence that the lesson survived the conversation in which it was discovered.',
          },
        ],
      },
      {
        kind: 'work',
        variant: 'learned',
        body: [
          {
            kind: 'prose',
            text: 'A lesson is not learned until the system behaves differently.',
            lead: true,
          },
          {
            kind: 'prose',
            text: 'Golden Frijoles compounds when each completed Bet improves the system that will operate the next one.',
          },
        ],
      },
    ],
  },
]

/**
 * Look up a chapter by id, THROWING on an unknown one.
 *
 * Same mechanism and the same reason as `lib/landing-sections.ts`'s `getSection` (epic D7): the ids
 * are route segments and TOC targets, so a typo must become a build-time failure rather than a
 * page that silently is not there. `generateStaticParams` enumerates these ids, which is what makes
 * the throw unreachable for a legitimate route and loud for anything else.
 */
export function getChapter(id: string): MethodologyChapter {
  const chapter = METHODOLOGY_CHAPTERS.find((entry) => entry.id === id)
  if (!chapter) throw new Error(`Unknown methodology chapter id: ${id}`)
  return chapter
}

/**
 * The chapters either side of `id`, for prev/next navigation.
 *
 * `null` at both ends rather than wrapping. Chapter 6's "next" is the index, and the route says so
 * — a guide that silently loops back to chapter 1 tells a reader they have not finished when they
 * have.
 */
export function chapterNeighbours(id: string): {
  previous: MethodologyChapter | null
  next: MethodologyChapter | null
} {
  const index = METHODOLOGY_CHAPTERS.findIndex((entry) => entry.id === id)
  if (index === -1) throw new Error(`Unknown methodology chapter id: ${id}`)
  return {
    previous: METHODOLOGY_CHAPTERS[index - 1] ?? null,
    next: METHODOLOGY_CHAPTERS[index + 1] ?? null,
  }
}

/** The chapters of one phase, in reading order. The TOC and the index both group by this. */
export function chaptersInPhase(phase: MethodologyPhase): MethodologyChapter[] {
  return METHODOLOGY_CHAPTERS.filter((chapter) => chapter.phase === phase)
}
