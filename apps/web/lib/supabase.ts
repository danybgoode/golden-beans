import 'server-only'
import { createClient } from '@supabase/supabase-js'

// Service-role client only — this project has no client-side Supabase usage and no
// anon-key RLS policies (see supabase/migrations/20260713220000_track_events.sql).
// Every query is scoped by a project_id resolved server-side from the request's API
// key (see lib/auth.ts), never taken from the request body.
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

export function getSupabaseServiceClient() {
  const url = requireEnv('SUPABASE_URL')
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
