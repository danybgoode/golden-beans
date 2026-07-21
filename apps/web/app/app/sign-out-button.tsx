'use client'
import { useRouter } from 'next/navigation'
import { createAuthBrowserClient } from '@/lib/supabase-browser'

// multi-tenant-activation · Sprint 1, Story 1.1 — sign out, then refresh so the server shell
// re-reads the (now absent) session and bounces to /login.
export function SignOutButton() {
  const router = useRouter()
  async function onClick() {
    await createAuthBrowserClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }
  return (
    <button type="button" onClick={onClick}>
      Sign out
    </button>
  )
}
