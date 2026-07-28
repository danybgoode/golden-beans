'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'

// The one interactive/client piece on an otherwise server-rendered landing. Posts to
// /api/v1/public/waitlist (Story 1.3 — apps/web/app/api/v1/public/waitlist/route.ts), which
// validates, checks a honeypot field, rate-limits by IP, and dedupe-safe-inserts the email.
// `company` is a hidden honeypot: real visitors never see or fill it; a bot that fills every
// field gets a silent 200 with no row inserted (server-side behavior, not enforced here).

type Status = 'idle' | 'submitting' | 'success' | 'error'

export function WaitlistForm({ compact = false }: { compact?: boolean }) {
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [status, setStatus] = useState<Status>('idle')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus('submitting')
    try {
      const res = await fetch('/api/v1/public/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, company }),
      })
      if (!res.ok) {
        setStatus('error')
        return
      }
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <p className="note waitlist-form__message waitlist-form__message--success">
        You&apos;re on the list — we&apos;ll reach out to provision a pilot.
      </p>
    )
  }

  return (
    <form className={`waitlist-form${compact ? ' waitlist-form--compact' : ''}`} onSubmit={onSubmit}>
      <input
        className="gb"
        type="email"
        required
        placeholder="you@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {/* Honeypot — visually off-screen (not display:none, which some bots skip filling) */}
      <input
        type="text"
        name="company"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="waitlist-form__honeypot"
      />
      <Button type="submit" disabled={status === 'submitting'}>
        {status === 'submitting' ? 'Joining…' : 'Join the waitlist'}
      </Button>
      {status === 'error' && (
        <p className="note waitlist-form__message waitlist-form__message--error" role="alert">
          Something went wrong — try again.
        </p>
      )}
    </form>
  )
}
