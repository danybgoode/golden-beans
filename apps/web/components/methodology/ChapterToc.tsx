import Link from 'next/link'
import { METHODOLOGY_PHASES, chaptersInPhase } from '@/lib/methodology-chapters'

// methodology-experience · Sprint 3, Story 3.1 — the contents rail beside a chapter.
//
// ── The active state comes from the ROUTE, not from a click ───────────────────────────────────
// `currentId` is a prop passed by the server component that already resolved the route segment, so
// "which chapter am I on" is answered by the URL and nothing else. This is mockup defect 4 stated
// as a positive: its `openChapter(1); showHome();` runs on load and leaves chapter 1 marked active
// regardless of what the reader is actually looking at, because the state lived in a click handler.
// Here there is no state to be wrong — no `useState`, no `usePathname`, no client component at all.
// A reader who lands on chapter 5 from a search result sees chapter 5 active, which the mockup
// cannot do at any price.
//
// ── A real landmark, and real links ───────────────────────────────────────────────────────────
// A `<nav>` with an accessible name, holding `<a>`s. The mockup uses `<button class="toc">`, which
// is unnavigable (no href to open in a new tab, nothing for a crawler or an agent to follow) and
// announces as a button that does something unspecified. `aria-current="page"` is what tells a
// screen-reader user which one they are on — the visual active state alone says nothing to them.
//
// ── It is never `display: none` ───────────────────────────────────────────────────────────────
// The mockup hides the whole TOC below 700px, which strands a phone reader inside a chapter with no
// way sideways except the browser's back button. Below the shell's breakpoint this becomes a
// horizontally scrollable strip pinned above the article (see `globals.css`) — one row, always
// usable, and with NO disclosure state, deliberately: a `<details>` that a reader collapses on a
// narrow window and then widens is a control that has hidden itself with no way back.
export function ChapterToc({ currentId }: { currentId: string }) {
  return (
    <nav className="methodology-toc" aria-label="Chapters">
      {METHODOLOGY_PHASES.map((phase) => (
        <div className="methodology-toc__group" key={phase.id}>
          <p className="methodology-toc__phase">{phase.title}</p>
          <ul className="methodology-toc__list">
            {chaptersInPhase(phase.id).map((chapter) => {
              const isCurrent = chapter.id === currentId
              return (
                <li key={chapter.id}>
                  <Link
                    href={`/methodology/${chapter.id}`}
                    className={`methodology-toc__link${isCurrent ? ' is-current' : ''}`}
                    // The semantic half of the active state. Without it a screen-reader user hears
                    // six identical links and no answer to "where am I".
                    aria-current={isCurrent ? 'page' : undefined}
                  >
                    <span className="methodology-toc__n">{String(chapter.number).padStart(2, '0')}</span>
                    {chapter.title}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
