'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createAuthBrowserClient } from '@/lib/supabase-browser'

// multi-tenant-activation · Sprint 1, Story 1.1 — sign out, then refresh so the server shell
// re-reads the (now absent) session and bounces to /login.
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
