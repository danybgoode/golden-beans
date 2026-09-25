'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/design-system/primitives'
import { retryExperimentServingAction } from './builder-actions'

// experiments-for-humans · Story 3.3 (D7) — the partial state's one-click retry, on the row the page
// derived it for. It survives a reload because the page, not this button, knows the state.
export function RetryServing({ slug, experimentKey }: { slug: string; experimentKey: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function retry() {
    setPending(true)
    setError(null)
    try {
      const response = await retryExperimentServingAction(slug, experimentKey)
      if (!response.ok) setError(response.error)
      else if (!response.serving) setError('Still not serving. Try again in a moment.')
      else router.refresh()
    } catch {
      setError('That didn’t reach the server. Nothing changed; try again.')
    } finally {
      setPending(false)
    }
  }
  return (
    <>
      <Button variant="primary" className="ds-btn--sm" state={pending ? 'loading' : 'idle'} onClick={retry}>
        Retry serving
      </Button>
      {error ? (
        <span className="ds-state-detail" role="alert">
          {error}
        </span>
      ) : null}
    </>
  )
}
