import { renderMethodologyEdition } from '@/lib/methodology-edition'
import {
  METHODOLOGY_CHAPTERS,
  METHODOLOGY_CHECKPOINT,
  METHODOLOGY_PHASES,
  METHODOLOGY_PREFLIGHT,
  WORK_LABELS,
} from '@/lib/methodology-chapters'
import { getSiteUrl } from '@/lib/site-url'

// GET /methodology/edition.md — methodology-experience · Sprint 4, Story 4.2.
//
// The downloadable edition, GENERATED from `lib/methodology-chapters.ts` (epic D5). There is no
// second copy of this prose anywhere: a chapter added to the module appears here with no edit.
//
// ── Why a route and not a checked-in file ─────────────────────────────────────────────────────
// Same reasoning as `app/llms.txt/route.ts`. A checked-in `.md` would be the hand-maintained twin
// D5 forbids, and it would bake in whatever `SITE_URL` the CI build happened to have — this repo's
// `typecheck-build` job runs `npm run build` with no env vars at all. Generating per request means
// the URLs inside the document are always this deployment's.
//
// ── Why `force-dynamic` ───────────────────────────────────────────────────────────────────────
// `getSiteUrl()` reads `SITE_URL`, and Vercel snapshots env vars into a deployment at BUILD time.
// A statically generated response would freeze the build's value into every future request — the
// same reason `app/page.tsx` and `app/llms.txt` carry this. The content itself is static; the URLs
// in it are not.
export const dynamic = 'force-dynamic'

export async function GET() {
  // The generator holds no content of its own (see its header); the real module is passed in.
  const markdown = renderMethodologyEdition(getSiteUrl(), {
    chapters: METHODOLOGY_CHAPTERS,
    phases: METHODOLOGY_PHASES,
    preflight: METHODOLOGY_PREFLIGHT,
    checkpoint: METHODOLOGY_CHECKPOINT,
    workLabels: WORK_LABELS,
  })

  return new Response(markdown, {
    headers: {
      // `text/markdown` with an explicit charset, and NOT an attachment: the point is that an agent
      // fetching this URL gets the method as text it can read directly. A `Content-Disposition:
      // attachment` would make a browser download it instead of showing it, which serves the
      // "download" half and breaks the half that matters more (amendment A6).
      'Content-Type': 'text/markdown; charset=utf-8',
      // Short, and revalidating: the document changes only when the module does, i.e. on deploy.
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  })
}
