'use client'
import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { setDisplayNameAction } from './account-actions'

// mockups-as-built · Story 3.5 — the one place an existing account sets its name.
//
// Daniel's ruling (2026-09-10): collect a name at sign-up AND let an existing account set one here,
// because every account created before this story has none — including the one that owns the
// product. Without this, those accounts would show their email in Activity forever.

export function AccountName({ current }: { current: string | null }) {
  const router = useRouter()
  const [value, setValue] = useState(current ?? '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try {
        const result = await setDisplayNameAction(value)
        if (result.ok) {
          // What was STORED, not what was typed: the server collapses whitespace, and the field
          // should show the name as Activity will.
          setValue(result.name ?? '')
          setSaved(true)
          router.refresh()
        } else {
          setError(result.error)
        }
      } catch {
        setError('Could not reach the server. Try again.')
      }
    })
  }

  return (
    <form className="ds-shell-name" onSubmit={onSubmit}>
      <label htmlFor="account-name">Your name</label>
      <input
        id="account-name"
        className="ds-input"
        type="text"
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          setSaved(false)
        }}
        autoComplete="name"
        // No `maxLength` (cross-agent review, agy — declined): the browser counts UTF-16 units,
        // the rule counts characters a reader sees, so 80 would cut a valid 80-emoji name at 40.
        placeholder="Shown instead of your email"
        aria-invalid={error !== null}
        aria-describedby={error !== null ? 'account-name-error' : undefined}
      />
      <button type="submit" className="ds-btn ds-btn--secondary ds-btn--sm" disabled={pending}>
        {pending ? 'Saving…' : 'Save'}
      </button>
      {saved && <span role="status">Saved.</span>}
      {error !== null && (
        <span id="account-name-error" role="alert">
          {error}
        </span>
      )}
    </form>
  )
}
