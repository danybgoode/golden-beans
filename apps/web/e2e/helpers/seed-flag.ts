import { createClient } from '@supabase/supabase-js'
import type { FlagDefinition } from '@golden-frijoles/sdk'
import { readTenantRecord } from './authed-fixture'

// A fixture flag version, written the way `auth.setup.ts` writes its own.
//
// ── Why this is not a UI drive any more ───────────────────────────────────────────────────────
// Until console-ia-overhaul Story 3.3, every authed suite that needed a flag with a specific shape
// typed it into the JSON textarea on the flags page. That form is deleted from the console branch
// (with the rule builder's free-key field beside it — A21), and its replacement, the "New feature"
// wizard, creates a plain on/off definition on purpose: it cannot express an arbitrary rule, a
// rollout or a metadata entry, which is exactly what these fixtures are for.
//
// So the fixture goes through `create_flag_definition_version` — the same RPC
// `createFlagDefinitionVersionAction` calls once it has resolved ownership and parsed the
// definition. What the tests ASSERT is unchanged; only the provenance of the row moved, and the row
// is the same shape the app itself writes.
//
// Extracted rather than copied into each suite: two specs needed it within one story, and this
// repo's own history says the second copy is where they drift.

function admin() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to seed a fixture flag')
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** The auth-setup tenant, or a throw naming what is missing rather than a null-deref later. */
export function fixtureTenant(): { projectId: string; userId: string; slug: string } {
  const record = readTenantRecord()
  if (!record?.projectId || !record?.slug) {
    throw new Error('this spec requires the auth-setup project')
  }
  return { projectId: record.projectId, userId: record.userId, slug: record.slug }
}

/** A plain boolean definition — the shape most fixtures want, so most callers pass nothing. */
export function booleanDefinition(description: string): FlagDefinition {
  return {
    valueType: 'boolean',
    description,
    defaultVariantKey: 'on',
    variants: [
      { key: 'off', value: false },
      { key: 'on', value: true },
    ],
    rules: [],
  }
}

export async function seedFlagVersion(
  key: string,
  definition: FlagDefinition,
  reason: string
): Promise<void> {
  const { projectId, userId } = fixtureTenant()
  const { error } = await admin().rpc('create_flag_definition_version', {
    p_project_id: projectId,
    p_flag_key: key,
    p_definition: definition,
    p_reason: reason,
    p_actor_user_id: userId,
  })
  if (error) throw new Error(`could not seed ${key}: ${error.message}`)
}
