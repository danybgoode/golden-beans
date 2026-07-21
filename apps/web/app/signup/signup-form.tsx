'use client'

import { useState, type FormEvent } from 'react'

// multi-tenant-activation · Sprint 3, Story 3.1/3.2 — posts to /api/v1/public/signup (Sprint 2,
// Story 2.1). The honeypot + submit-state + error-handling idiom is lifted from
// WaitlistForm.tsx (components/landing/WaitlistForm.tsx) rather than reinvented — this route
// deliberately does NOT call supabase.auth.signUp() straight from the browser (see the route's
// own header comment: a client-side call would bypass the enablement gate, the honeypot, and the
// rate limit entirely, so the gate would be decoration).
//
// State shape — useState per field, a `busy`-equivalent submitting status, a `role="status"`
// message — mirrors app/login/login-form.tsx so the two auth-adjacent forms in this app read the
// same way to the next person who opens both.

type Status = 'idle' | 'submitting' | 'success' | 'error'

export function SignupForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [company, setCompany] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setStatus('submitting')
    setError(null)
    try {
      const res = await fetch('/api/v1/public/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, company }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.ok) {
        setStatus('error')
        setError(body?.error ?? 'Something went wrong — try again.')
        return
      }
      setStatus('success')
    } catch {
      setStatus('error')
      setError('Something went wrong — try again.')
    }
  }

  // Success replaces the form outright — the account exists but is unconfirmed (no tenant yet,
  // see lib/provisioning.ts), so there is nothing left for this form to do except tell the
  // visitor where to go next.
  if (status === 'success') {
    return (
      <p role="status" className="note" style={{ fontSize: 15 }}>
        Check your email for a confirmation link — click it and your tenant + API key are ready,
        no manual steps.
      </p>
    )
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--dim)' }}>
        Email
        <input
          className="gb"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--dim)' }}>
        Password
        <input
          className="gb"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      {/* Honeypot — visually off-screen (not display:none, which some bots skip filling), same
          idiom as WaitlistForm.tsx. */}
      <input
        type="text"
        name="company"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }}
      />
      <button className="btn btn-gold" type="submit" disabled={status === 'submitting'}>
        {status === 'submitting' ? 'Starting…' : 'Start free'}
      </button>
      {status === 'error' && (
        <p role="status" className="note" style={{ color: 'var(--red)' }}>
          {error}
        </p>
      )}
    </form>
  )
}
