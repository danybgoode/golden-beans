import 'server-only'
import { getSupabaseServiceClient } from '@/lib/supabase'
import { getLatestArtifact } from '@/lib/report-artifacts'
import { AGENT_USAGE_EVENT, latestSnapshots, rollUp } from '@/lib/agent-usage'
import { epicFinopsFromArtifact } from '@/lib/roadmap-finops'
import { buildFinopsView, storiesDoneOf, type FinopsView } from '@/lib/finops-view'

// finops · Story 3.3 — the ONE read behind /app/finops. It takes a single `projectId`, already resolved server-side
// by `requireProjectMembership` (lib/membership.ts — AGENTS § The tenancy invariant): every query below is pinned to
// that one project, so this is a single-project read and never a workspace or cross-project one.
//
// A failure THROWS rather than returning an empty view: "nothing pushed yet" has its own designed state on the page,
// and a database error rendered as that state would be the honest-looking zero this repo keeps paying for.

/** Rows read per page, and the most this page will ever read: a usage push is one row per (session, epic, growth). */
const PAGE = 1000
export const AGENT_USAGE_ROW_CAP = 20_000

async function readAgentUsageMetadata(projectId: string): Promise<unknown[]> {
  const supabase = getSupabaseServiceClient()
  const out: unknown[] = []
  while (out.length < AGENT_USAGE_ROW_CAP) {
    const from = out.length
    const { data, error } = await supabase
      .from('events')
      .select('metadata')
      .eq('project_id', projectId)
      .eq('event', AGENT_USAGE_EVENT)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) {
      console.error('[finops-query] usage read failed:', error)
      throw new Error('could not read agent usage')
    }
    const page = (data ?? []).map((r) => (r as { metadata: unknown }).metadata)
    out.push(...page)
    if (page.length < PAGE) break
  }
  return out
}

export async function getFinopsView(projectId: string, now = new Date()): Promise<FinopsView> {
  const [artifact, metadatas] = await Promise.all([
    getLatestArtifact<{ items?: unknown }>(projectId, 'roadmap'),
    readAgentUsageMetadata(projectId),
  ])
  const items = Array.isArray(artifact?.payload?.items)
    ? (artifact.payload.items as Record<string, unknown>[])
    : []
  const progress = new Map(
    items.filter((i) => i.grain === 'Epic').map((i) => [String(i.slug), i.sprint_progress])
  )
  const epics = epicFinopsFromArtifact(artifact?.payload ?? null).map((e) => ({
    ...e,
    storiesDone: storiesDoneOf(progress.get(e.slug)),
  }))
  const snapshots = latestSnapshots(metadatas)
  const rollup = rollUp(snapshots)
  return buildFinopsView({
    epics,
    snapshots,
    byEpic: rollup.byEpic,
    bySkill: rollup.bySkill,
    byModel: rollup.byModel,
    lastAt: rollup.lastAt,
    now,
  })
}
