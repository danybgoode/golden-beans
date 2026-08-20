// methodology-experience · Sprint 4, Story 4.2 — the downloadable edition, GENERATED.
//
// ── ZERO imports, and its content arrives as an ARGUMENT ──────────────────────────────────────
// The first draft imported `./methodology-chapters` directly and could not be tested: the app's
// tsconfig forbids a `.ts` extension on an import, and Node's test runner cannot resolve an
// extensionless relative specifier inside a `.ts` file — so the source either type-checks or is
// loadable by the runner, never both.
//
// Taking the content as a parameter removes the dilemma rather than working around it, and it is
// the shape this codebase already uses where a pure rule needs data it must not import
// (`parseProgress(raw, validIds)` in `lib/methodology-progress.ts`). The route passes the real
// module; the test passes the real module too, imported with the extension a test file may use.
// Nothing here can drift from the content module, because nothing here holds content.
//
// ── Epic D5, which is the whole reason this file exists ───────────────────────────────────────
// "Once `lib/methodology-chapters.ts` exists, a hand-maintained field-guide markdown is a second
// copy of the same prose — precisely the drift class `lib/landing-sections.ts` exists to prevent,
// and the class this repo has now been bitten by three times. The TS module is authoritative; the
// downloadable edition is GENERATED, never maintained in parallel."
//
// So this is a pure function from the module to markdown. There is no second source to fall out of
// step, and a chapter added to the module appears here with no edit at all. If generation had NOT
// been built, the story's instruction was to CUT the download rather than point it at a file that
// would silently diverge — it is built, so the button ships.
//
// ── It is also the fix for the agent-readability gap (amendment A6) ───────────────────────────
// Measured against production before this: a chapter page is ~29-41 KB of HTML carrying ~2-3 KB of
// method, a signal ratio of 5.8-8.1%. An agent handed the whole guide as markdown spends its
// context on the method instead of on chrome. That is what this is for, as much as the download.
//
// ── Zero imports beyond the content module ────────────────────────────────────────────────────
// No `server-only`, no framework: it is unit-testable directly, and the route that serves it is a
// thin wrapper. The same rule Story 4.1 had to learn the hard way.

/**
 * The shape this generator needs, declared structurally rather than imported.
 *
 * `lib/methodology-chapters.ts`'s real exports satisfy it, and the route and the test both pass
 * exactly those — so a chapter added there flows through with no edit here, which is the property
 * D5 asks for. Declaring it structurally is what keeps this file import-free; the compiler still
 * rejects a caller whose data does not fit.
 */
export interface EditionSource {
  chapters: readonly {
    id: string
    phase: string
    number: number
    title: string
    lede: string
    blocks: readonly MethodologyBlock[]
  }[]
  phases: readonly { id: string; title: string; summary: string }[]
  preflight: MethodologySection
  checkpoint: MethodologySection
  workLabels: Readonly<Record<string, string>>
}

type MethodologySection = { title: string; blocks: readonly MethodologyBlock[] }

type MethodologyBlock =
  | { kind: 'prose'; text: string; lead?: true }
  | { kind: 'heading'; text: string }
  | { kind: 'list'; items: readonly string[] }
  | { kind: 'blockquote'; text: string }
  // The agent arm is discriminated by `variant: 'agent'` and the other by an explicit union of the
  // remaining names — NOT by `variant: string`, which does not narrow and left `block.body`
  // unreachable to the compiler. The real module's `WorkVariant` is this same closed set; keeping
  // it closed here is what makes the switch below exhaustive rather than defensive.
  | { kind: 'work'; variant: 'agent'; prompt: string }
  | {
      kind: 'work'
      variant: 'do' | 'look' | 'yours' | 'learned'
      body: readonly MethodologyBlock[]
    }

/** Escape nothing, wrap nothing. The content module holds plain prose; markdown is its natural form. */
function renderBlock(
  block: MethodologyBlock,
  depth: number,
  workLabels: Readonly<Record<string, string>>
): string[] {
  switch (block.kind) {
    case 'heading':
      // One level deeper than the chapter's own `##`, so the document has a real outline an agent
      // (or a table-of-contents generator) can walk.
      return [`${'#'.repeat(depth)} ${block.text}`, '']
    case 'prose':
      return [block.lead ? `**${block.text}**` : block.text, '']
    case 'list':
      return [...block.items.map((item) => `- ${item}`), '']
    case 'blockquote':
      return [`> ${block.text}`, '']
    case 'work': {
      const label = workLabels[block.variant] ?? block.variant
      if (block.variant === 'agent') {
        // The prompt goes in a fenced block: it is meant to be copied verbatim into another agent,
        // and fencing is what stops a reader — human or machine — from taking the surrounding prose
        // along with it. `text` and not a language hint, because it is a prompt, not code.
        return [`**${label}**`, '', '```text', block.prompt, '```', '']
      }
      return [`**${label}**`, '', ...block.body.flatMap((inner) => renderBlock(inner, depth + 1, workLabels))]
    }
  }
}

function renderSection(section: MethodologySection, workLabels: Readonly<Record<string, string>>): string[] {
  return [`## ${section.title}`, '', ...section.blocks.flatMap((block) => renderBlock(block, 3, workLabels))]
}

/**
 * The whole methodology as one markdown document.
 *
 * `siteUrl` is passed in rather than read from the environment so this stays pure and testable —
 * the same reason `lib/landing-prompts.ts` takes it as an argument, and the reason its spec can
 * fetch every URL the document names.
 */
export function renderMethodologyEdition(siteUrl: string, source: EditionSource): string {
  const lines: string[] = [
    '# Golden Frijoles — the methodology',
    '',
    '> Make something real. Bring your own project, use your own agents, and learn the method while',
    '> you make.',
    '',
    `Read it online at ${siteUrl}/methodology — every chapter has its own URL.`,
    '',
    // Stated in the artifact itself, not only in this file's header: whoever holds a copy of this
    // document needs to know it is a snapshot and where the live one is.
    'This edition is generated from the same source the website renders. It is a snapshot; the site',
    'is the living version.',
    '',
    '## The loop',
    '',
  ]

  for (const phase of source.phases) {
    lines.push(`- **${phase.title}** — ${phase.summary}`)
  }
  lines.push('')

  lines.push(...renderSection(source.preflight, source.workLabels))

  for (const chapter of source.chapters) {
    lines.push(
      `## ${String(chapter.number).padStart(2, '0')}. ${chapter.title}`,
      '',
      `*${source.phases.find((p) => p.id === chapter.phase)?.title ?? chapter.phase}*`,
      '',
      chapter.lede,
      '',
      `Online: ${siteUrl}/methodology/${chapter.id}`,
      '',
      ...chapter.blocks.flatMap((block) => renderBlock(block, 3, source.workLabels))
    )
  }

  lines.push(...renderSection(source.checkpoint, source.workLabels))

  // Collapse runs of blank lines rather than trying to emit them perfectly above: the renderers
  // each end with their own separator, and reasoning about who owns the gap at every boundary is
  // how a generator grows conditionals that are wrong at exactly one join.
  return (
    lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n'
  )
}
