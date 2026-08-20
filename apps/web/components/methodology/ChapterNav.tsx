import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { phaseTitle } from '@/components/methodology/PhaseLabel'
import type { MethodologyChapter } from '@/lib/methodology-chapters'

// methodology-experience · Sprint 2, Story 2.3 — prev/next, from `chapterNeighbours` (epic D7).
//
// Chapter 6's `next` is `null` — `chapterNeighbours`'s own comment says why: `null` at both ends
// rather than wrapping, because a guide that loops back to chapter 1 tells a reader they have not
// finished when they have. So the "next" slot falls back to the index and the copy says so
// explicitly ("YOU COMPLETED THE LOOP") rather than silently disabling the control, per the
// sprint's acceptance ("Chapter 6's next is the index, and it says so").
export function ChapterNav({
  previous,
  next,
}: {
  previous: MethodologyChapter | null
  next: MethodologyChapter | null
}) {
  return (
    <nav className="methodology-next" aria-label="Chapter navigation">
      {previous && (
        <Link href={`/methodology/${previous.id}`} className="methodology-prev-link">
          <Icon name="arrow-right" size={12} className="methodology-prev-link__icon" />
          Chapter {previous.number} · {previous.title}
        </Link>
      )}

      <div className="methodology-next__inner">
        <div>
          <span className="methodology-next__label">
            {next ? `Next · ${phaseTitle(next.phase)}` : 'You completed the loop'}
          </span>
          <strong>{next ? next.title : 'Back to the methodology index'}</strong>
        </div>
        <Button href={next ? `/methodology/${next.id}` : '/methodology'}>
          {next ? 'Continue' : 'Back to methodology'}
          <Icon name="arrow-right" size={14} />
        </Button>
      </div>
    </nav>
  )
}
