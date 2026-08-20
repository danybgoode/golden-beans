import { notFound } from 'next/navigation'
import { Nav } from '@/components/landing/Nav'
import { Footer } from '@/components/landing/Footer'
import { PhaseLabel } from '@/components/methodology/PhaseLabel'
import { MethodologyBlocks } from '@/components/methodology/MethodologyBlocks'
import { ChapterNav } from '@/components/methodology/ChapterNav'
import { ChapterToc } from '@/components/methodology/ChapterToc'
import { ReadProgressRail } from '@/components/methodology/ReadProgressRail'
import { METHODOLOGY_CHAPTERS, getChapter, chapterNeighbours } from '@/lib/methodology-chapters'

// methodology-experience · Sprint 2, Story 2.3 — one chapter, at its own URL (epic D7).
//
// `generateStaticParams` enumerates the module's ids, so every legitimate request that reaches
// this component carries an id `getChapter` will find. No flag, no DB read, no `force-dynamic`
// (same reasoning as the index route's header comment) — this is content, and it is prerendered.
export function generateStaticParams() {
  return METHODOLOGY_CHAPTERS.map((chapter) => ({ chapter: chapter.id }))
}

export default async function MethodologyChapterPage({ params }: { params: Promise<{ chapter: string }> }) {
  const { chapter: chapterId } = await params

  // ── The existence check comes BEFORE the throwing lookup, on purpose ────────────────────────
  // `getChapter` THROWS on an unknown id by design (lib/methodology-chapters.ts, epic D7) — that
  // is what turns a typo inside this module into a build-time failure instead of a silently
  // missing page. A route segment is reader input, not a typo: a stale bookmark, a guessed slug,
  // a crawler off an old link all reach this component with an id that was never in the array
  // `generateStaticParams` enumerated. Letting the throw reach the render path would render
  // Next's generic 500; the sprint spec asserts a real 404 (sprint-2.md Story 2.3), so membership
  // is checked against the SAME array `generateStaticParams` used — no second list to fall out of
  // step with it — and only a known id ever reaches `getChapter`, making its throw unreachable
  // here by construction rather than by convention.
  const isKnownChapter = METHODOLOGY_CHAPTERS.some((entry) => entry.id === chapterId)
  if (!isKnownChapter) notFound()

  const chapter = getChapter(chapterId)
  const { previous, next } = chapterNeighbours(chapterId)

  return (
    <>
      <Nav />
      {/* ── Sprint 3, Story 3.1 — the reading shell ───────────────────────────────────────────
          Three tracks at wide widths: the contents rail, the article at a real reading measure,
          and a reserved right column. The third track is EMPTY today and that is deliberate — its
          content is Story 3.4's read progress, or nothing at all if 3.4 decides the honest answer
          is nothing (epic D6: no fake state). Reserving it now is not a placeholder for its own
          sake: it is what keeps the article optically centred on the page instead of shoved right
          by the rail, which is a real benefit whether or not anything ever fills it.

          Below the shell's breakpoint the grid collapses to one column and the rail becomes a
          scrollable strip above the article — never `display: none` (see `ChapterToc`). */}
      <main className="methodology-shell">
        <ChapterToc currentId={chapter.id} />
        <article className="methodology-article methodology-prose">
          <PhaseLabel phase={chapter.phase} chapterNumber={chapter.number} />
          {/* Exactly one <h1> per route (sprint-2.md Story 2.3). Chapter titles already carry no
              terminal full stop (lib/methodology-chapters.ts's own header note) — decided once,
              there, not special-cased here. */}
          <h1 className="display">{chapter.title}</h1>
          {/* Each chapter's OWN lede (mockup defect 1 — the mockup rendered the raw
              `{1:"…",2:"…"}[n]` object literal as body text on all six chapters). */}
          <p className="methodology-lede">{chapter.lede}</p>

          <MethodologyBlocks blocks={chapter.blocks} />

          <ChapterNav previous={previous} next={next} />
        </article>
        {/* The reserved third track, now Story 3.4's read progress. It renders NOTHING when there
            is nothing honest to say — storage unavailable, or nothing opened yet — so this column
            is often empty, which is the intended state rather than a missing feature (epic D6).
            No `aria-hidden` any more: what is in here is now real content when it appears. */}
        <div className="methodology-shell__aside">
          <ReadProgressRail chapterId={chapter.id} chapterIds={METHODOLOGY_CHAPTERS.map((c) => c.id)} />
        </div>
      </main>
      <Footer />
    </>
  )
}
