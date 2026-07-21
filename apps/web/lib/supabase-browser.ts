'use client'
import { createBrowserClient } from '@supabase/ssr'

// multi-tenant-activation · Sprint 1, Story 1.1 — the browser-side auth client used by the login
// form to sign in / sign up. Auth session only (anon key); no data access. The NEXT_PUBLIC_* env
// vars are build-time-inlined into the client bundle (that's why they're NEXT_PUBLIC), so a real
// browser sign-in needs them present at `next build` time — see the Sprint 1 smoke notes.
export function createAuthBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
