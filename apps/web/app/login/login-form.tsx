'use client'
import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createAuthBrowserClient } from '@/lib/supabase-browser'

// multi-tenant-activation · Sprint 1, Story 1.1 — SIGN-IN ONLY. Self-serve sign-up is Sprint 2
// (Story 2.1: signup → instant tenant), and it ships DARK behind SIGNUP_ENABLED — so Sprint 1
// deliberately does not expose account creation here (accounts + memberships are hand-seeded).
// On success we push to /app and refresh so the server shell re-reads the freshly-set session.
export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setStatus(null)
    const supabase = createAuthBrowserClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) {
      setStatus(error.message)
      return
    }
    router.push('/app')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit}>
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      {status && <p role="status">{status}</p>}
    </form>
  )
}
