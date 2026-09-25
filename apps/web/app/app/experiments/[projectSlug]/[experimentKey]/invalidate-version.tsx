'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/design-system/primitives'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { transitionExperimentVersionAction } from '../actions'

// experiments-for-humans · Story 4.3 — the retired JSON manager's one capability with no other home:
// marking a version's evidence untrustworthy. It lives on the Plan tab, owner-only, confirmed.
export function InvalidateVersion({
  slug,
  experimentId,
  versionId,
  version,
}: {
  slug: string
  experimentId: string
  versionId: string
  version: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function invalidate() {
    setPending(true)
    setError(null)
    try {
      const result = await transitionExperimentVersionAction(slug, experimentId, versionId, 'invalid')
      if (!result.ok) setError(result.error)
      else {
        setOpen(false)
        router.refresh()
      }
    } catch {
      setError('That didn’t reach the server. Nothing changed; try again.')
    } finally {
      setPending(false)
    }
  }
  return (
    <>
      <Button variant="secondary" className="ds-btn--sm" onClick={() => setOpen(true)}>
        Mark invalid
      </Button>
      {error ? (
        <p className="ds-chart-note" role="alert">
          {error}
        </p>
      ) : null}
      <ConfirmDialog
        open={open}
        verb="Mark invalid"
        noun="experiment version"
        subject={`v${version}`}
        consequence="Its evidence is marked untrustworthy for good: it can't be started, stopped or decided again."
        pending={pending}
        onCancel={() => setOpen(false)}
        onConfirm={() => void invalidate()}
      />
    </>
  )
}
