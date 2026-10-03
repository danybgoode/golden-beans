'use server'
import { revalidatePath } from 'next/cache'
import { notFound, redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase-auth'
import { getMembershipByProjectId } from '@/lib/membership'
import { loopStageWriteDecision, parseLoopStage } from '@/lib/loop-stage'
import { writeLoopStage } from '@/lib/loop-stage-store'
import { getSupabaseServiceClient } from '@/lib/supabase'
import { LOOP_OUTCOME_PARAM, PORTFOLIO_HREF, portfolioHrefFor } from '@/lib/portfolio-workspace'

// portfolio-view · Sprint 2, Story 2.3 (Roadmap/02-commercial/portfolio-view — the Architecture lock, D3, D11, C4).
//
// The ONLY write path for `projects.loop_stage`. A Server Action, not a route: it is reachable only with a signed-in
// session (no API key, connector token or share link resolves to it), and Next checks the request's Origin on every
// action — the CSRF guard a cookie-authed POST route would have had to grow by hand.
//
// The project id arrives in the form, so it is a SELECTOR and nothing more: `getMembershipByProjectId` re-reads the
// caller's membership — workspace re-check included — and `loopStageWriteDecision` turns that into ok / forbidden /
// not found. A non-member gets the same 404 as a project that does not exist (AGENTS § The tenancy invariant).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function setLoopStageAction(formData: FormData): Promise<void> {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const projectId = formData.get('projectId')
  if (typeof projectId !== 'string' || !UUID_RE.test(projectId)) notFound()
  // Decide on the CALLER before reading anything else they sent, so a non-owner learns nothing from validation.
  const decision = loopStageWriteDecision(await getMembershipByProjectId(user.id, projectId))
  if (decision === 'not_found') notFound()

  // Where to come back to: the workspace the form was on, if it is a well-formed id — the page re-matches it against
  // the viewer's own workspaces, so this selects a view and nothing else.
  const workspace = formData.get('workspace')
  const back =
    typeof workspace === 'string' && UUID_RE.test(workspace) ? portfolioHrefFor(workspace) : PORTFOLIO_HREF
  const sep = back.includes('?') ? '&' : '?'

  // ⚠️ Every refusal and failure comes BACK TO THE ROW'S PAGE with a named outcome, never a throw: a thrown action error
  // lands in this route's error boundary, which says "Couldn't load your workspace" — a failed SAVE reported as a
  // failed READ — and Next redacts action error messages in production anyway (fresh reviewer, PR #235).
  if (decision === 'forbidden') redirect(`${back}${sep}${LOOP_OUTCOME_PARAM}=forbidden`)

  // "clear" un-places it; anything that is not one of the three stages is refused rather than stored as null.
  const raw = formData.get('stage')
  const stage = raw === 'clear' ? null : parseLoopStage(raw)
  if (stage === null && raw !== 'clear') redirect(`${back}${sep}${LOOP_OUTCOME_PARAM}=failed`)

  const saved = await writeLoopStage(getSupabaseServiceClient(), projectId, stage)
  revalidatePath(PORTFOLIO_HREF)
  if (!saved) redirect(`${back}${sep}${LOOP_OUTCOME_PARAM}=failed`)
  redirect(back)
}
