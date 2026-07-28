'use client'
import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createAuthBrowserClient } from '@/lib/supabase-browser'
import { Button } from '@/components/ui/Button'

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
    <form className="auth-form" onSubmit={onSubmit}>
      <label className="auth-form__label">
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </label>
      <label className="auth-form__label">
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      <Button type="submit" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
      {status && (
        <p className="auth-form__message auth-form__message--error" role="status">
          {status}
        </p>
      )}
    </form>
  )
}
