import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Client as PgClient } from 'pg'
import type { FlagDefinition } from '@golden-frijoles/sdk'
import {
  cleanupExperimentProjects,
  requireLocalSupabaseApiUrl,
  requireTestDatabaseUrl,
} from './test-db-cleanup'

// experiments-for-humans — a project of its OWN for an authed experiment spec, with the signed-in
// fixture user as its owner, one live feature and enough traffic for the planner.
//
// ⚠️ Why not the shared authed tenant: a builder save writes flag versions (and their audit reasons)
// into whatever project it runs in, and `flag-console.authed.spec.ts` asserts on that tenant's audit.
// A spec that only proves the builder must not change what a sibling spec reads (2026-09-26, found
// the first time the builder ran with its gate on in a full authed run).

export const FLAG_KEY = 'growth.results_copy'
export const SERVED: FlagDefinition = {
  valueType: 'boolean',
  description: 'Results fixture feature',
  defaultVariantKey: 'off',
  variants: [
    { key: 'off', value: false },
    { key: 'on', value: true },
  ],
  rules: [],
}

export type Fixture = { projectId: string; slug: string; owner: string }

export function db(): SupabaseClient {
  requireTestDatabaseUrl()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY must be set')
  return createClient(requireLocalSupabaseApiUrl(), key, { auth: { persistSession: false } })
}

export async function sql<T = unknown>(text: string, values: unknown[] = []): Promise<T[]> {
  const pg = new PgClient({ connectionString: requireTestDatabaseUrl() })
  await pg.connect()
  try {
    return (await pg.query(text, values)).rows as T[]
  } finally {
    await pg.end()
  }
}

export async function project(client: SupabaseClient, owner: string): Promise<Fixture> {
  const slug = `results-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const { data, error } = await client
    .from('projects')
    .insert({ slug, api_key_hash: `h-${crypto.randomUUID()}` })
    .select('id')
    .single()
  if (error || !data) throw new Error(`project fixture: ${error?.message}`)
  // From here on the row exists: a failure below removes it rather than leak it (Codex, #174).
  try {
    await provision(client, data.id as string, owner)
  } catch (setupError) {
    await cleanupExperimentProjects([data.id as string])
    throw setupError
  }
  return { projectId: data.id as string, slug, owner }
}

async function provision(client: SupabaseClient, projectId: string, owner: string): Promise<void> {
  const membership = await client
    .from('project_members')
    .insert({ project_id: projectId, user_id: owner, role: 'owner' })
  // Fail HERE, not later as a baffling 404 in the browser (Codex, #174).
  if (membership.error) throw new Error(`membership fixture: ${membership.error.message}`)
  const { data: version, error: flagError } = await client.rpc('create_flag_definition_version', {
    p_project_id: projectId,
    p_flag_key: FLAG_KEY,
    p_definition: SERVED,
    p_reason: 'fixture',
    p_actor_user_id: owner,
  })
  if (flagError) throw new Error(`flag fixture: ${flagError.message}`)
  const activation = await client.rpc('set_flag_activation', {
    p_project_id: projectId,
    p_environment: 'production',
    p_flag_id: version[0].flag_id,
    p_version_id: version[0].version_id,
    p_expected_snapshot_version: 0,
    p_reason: 'fixture',
    p_actor_user_id: owner,
  })
  if (activation.error) throw new Error(`activation fixture: ${activation.error.message}`)
  // Traffic the catalog can plan from: 2,000 merchants seen, 500 signed up, in the last few hours.
  await sql(
    `insert into events (project_id, user_id, event, context_version, subject_type, subject_id, created_at)
     select $1::uuid, 'u' || n, 'page_viewed', 1, 'merchant', 'm' || n, now() - ((n % 300) || ' minutes')::interval
     from generate_series(1, 2000) n
     union all
     select $1::uuid, 'u' || n, 'signup_completed', 1, 'merchant', 'm' || n, now() - ((n % 300) || ' minutes')::interval
     from generate_series(1, 500) n`,
    [projectId]
  )
}
