import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// multi-tenant-activation · Sprint 1, Story 1.1 — the auth SESSION client.
//
// This is the ONLY place the Supabase anon key is used, and it touches ONLY the auth session
// (who is logged in), never DATA. All data reads/writes stay on the service-role client
// (lib/supabase.ts), gated by a server-side membership check (lib/membership.ts) — so introducing
// Supabase Auth does NOT create an anon-key data path (the AGENTS rule-#1/RLS invariant holds).

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

// A request-scoped client bound to the auth cookies. In a Server Component the cookie store is
// read-only, so setAll is a no-op there (middleware.ts owns refresh + cookie writes); in a Route
// Handler / Server Action the writes land.
export async function createAuthServerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Server Component context — cookie store is read-only. middleware.ts refreshes it.
          }
        },
      },
    },
  )
}

// The current authenticated user, or null. Uses getUser() — which verifies the JWT against the
// auth server — never a bare getSession() (which trusts the cookie contents), per Supabase's SSR
// security guidance. Every authed surface starts here.
export async function getSessionUser() {
  const supabase = await createAuthServerClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return data.user
}
