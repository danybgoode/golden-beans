import 'server-only'
import { cache } from 'react'
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
    }
  )
}

// The current authenticated user, or null. Uses getUser() — which verifies the JWT against the
// auth server — never a bare getSession() (which trusts the cookie contents), per Supabase's SSR
// security guidance. Every authed surface starts here.
//
// ── Why React `cache()` (app-shell-and-agent-rail, fresh-reviewer finding) ────────────────────
// `getUser()` is an HTTP round trip to the auth server BY DESIGN — that verification is the whole
// reason it is used instead of `getSession()`. It is also called more than once per render now:
// the page's own guard calls it, and ProductShell's section nav calls it again through
// lib/shell-nav.ts. Without memoisation every signed-in route pays two auth round trips.
//
// `cache()` is per-REQUEST, not a cross-request cache: React clears it between renders, so this
// cannot serve one visitor's user object to another. That property is what makes it safe here at
// all — an ordinary module-level cache on an identity lookup would be a tenancy bug.
export const getSessionUser = cache(async () => {
  const supabase = await createAuthServerClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return data.user
})
