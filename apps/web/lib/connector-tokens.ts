import 'server-only'
import { randomBytes } from 'node:crypto'
import { getSupabaseServiceClient } from './supabase'

// Story 2.1 (commercial-shell/sprint-2.md) — the MCP connector's per-project credential.
// Plaintext by design (see the migration's header comment): the value is meant to be openly
// re-displayed on the public install page, not kept secret.

const TOKEN_PREFIX = 'gb_connector_'
// Cheap, pre-DB shape check — matches the prefix + a base64url body, mirroring mb's
// `^[A-Za-z0-9_-]{16,64}$` shape check (rejects garbage before it ever reaches a query).
export const TOKEN_FORMAT = /^gb_connector_[A-Za-z0-9_-]{32,64}$/

export function generateConnectorToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(24).toString('base64url')}`
}

export type ResolvedConnectorToken =
  | { ok: true; projectId: string; projectSlug: string }
  | { ok: false }

// Same 401 for "malformed", "unknown", and "revoked" — no oracle on which reason, matching the
// mb pattern this is lifted from.
export async function resolveConnectorToken(token: string): Promise<ResolvedConnectorToken> {
  if (!TOKEN_FORMAT.test(token)) return { ok: false }

  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('connector_tokens')
    .select('project_id, revoked_at, projects(slug)')
    .eq('token', token)
    .is('revoked_at', null)
    .maybeSingle()
  if (error) {
    console.error('[connector-tokens] lookup failed:', error)
    return { ok: false }
  }
  if (!data) return { ok: false }

  // supabase-js types a to-one joined relation loosely without a generated Database type —
  // same workaround lib/tars-query.ts/lib/north-star-query.ts already use.
  const project = data.projects as unknown as { slug: string } | null
  if (!project) return { ok: false }

  return { ok: true, projectId: data.project_id, projectSlug: project.slug }
}

// Upserts (and returns) a live, non-revoked connector token for a project — used only by
// scripts/seed-demo-project.mjs, never by request-time code (v1 has no self-serve token minting).
export async function getOrCreateConnectorToken(
  projectId: string,
  fixedToken?: string,
): Promise<string> {
  const supabase = getSupabaseServiceClient()
  const { data: existing, error: existingError } = await supabase
    .from('connector_tokens')
    .select('token')
    .eq('project_id', projectId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existingError) throw new Error(`[connector-tokens] existing-token lookup failed: ${existingError.message}`)
  if (existing) return existing.token

  const token = fixedToken?.trim() || generateConnectorToken()
  const { error: insertError } = await supabase.from('connector_tokens').insert({ project_id: projectId, token })
  if (insertError) throw new Error(`[connector-tokens] insert failed: ${insertError.message}`)
  return token
}
