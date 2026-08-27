'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createAuthBrowserClient } from '@/lib/supabase-browser'

// multi-tenant-activation · Sprint 1, Story 1.1 — sign out, then refresh so the server shell
// re-reads the (now absent) session and bounces to /login.
//
// ── Moved from app/app/sign-out-button.tsx by console-ia-overhaul S1.3 ────────────────────────
// It has two callers now: `/app`'s own header (while the console gate is off) and `ProductShell`'s
// account menu (while it is on). `ProductShell` lives in `components/`, so importing it from `app/`
// made the shared layer depend on a route directory — the ONLY such import in the codebase, found
// by cross-review (Mistral Vibe, PR #122).
//
// The finding's stated mechanism was wrong: it is not a Next.js App Router rule and it does not
// fail the build (it built and ran green for several rounds before this). The layering inversion is
// real anyway, and its actual cost is concrete rather than theoretical — the file sat inside a route
// folder, so renaming or restructuring `app/app/` would silently break the chrome that wraps every
// signed-in page. Answering the observation rather than the conclusion.
//
// The signOut() error is CHECKED, not ignored (cross-review catch, Codex 2026-07-20): navigating
// away regardless would tell the user they're signed out while the session is still live — the
// worst possible failure mode on a shared machine. On failure we stay put and say so.
export function SignOutButton() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  async function onClick() {
    setError(null)
    const { error: signOutError } = await createAuthBrowserClient().auth.signOut()
    if (signOutError) {
      setError('Sign-out failed — you are still signed in. Please try again.')
      return
    }
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      <button type="button" onClick={onClick}>
        Sign out
      </button>
      {error && <span role="alert">{error}</span>}
    </>
  )
}
