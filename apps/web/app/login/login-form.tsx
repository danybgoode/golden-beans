'use client'
import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createAuthBrowserClient } from '@/lib/supabase-browser'

// multi-tenant-activation · Sprint 1, Story 1.1 — email+password sign-in with a sign-up toggle.
// Sign-up requires email confirmation (Supabase config); the confirmation link lands on
// /auth/callback. On a successful sign-in we push to /app and refresh so the server shell re-reads
// the freshly-set session.
type Mode = 'signin' | 'signup'

export function LoginForm() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setStatus(null)
    const supabase = createAuthBrowserClient()

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      setBusy(false)
      setStatus(error ? error.message : 'Check your email to confirm your account, then sign in.')
      return
    }

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
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          minLength={8}
          required
        />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Sign in'}
      </button>
      <button type="button" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')} disabled={busy}>
        {mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
      </button>
      {status && <p role="status">{status}</p>}
    </form>
  )
}
