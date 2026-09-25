'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/design-system/primitives'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { transitionExperimentVersionAction } from '../actions'

// experiments-for-humans · Story 4.3 — the retired JSON manager's lifecycle capabilities that have no
// other home, on the Plan tab, owner-only, confirmed:
//   · Invalidate — marking a version's evidence untrustworthy (any draft / running / stopped version).
//   · Start — a draft the builder did NOT make (a JSON/API draft has no answers, so the builder's Start
//     refuses it — "start it from its plan"; this is that plan). It only flips the lifecycle, exactly as
//     the manager did: such a draft was never bound to a flag version by the builder.
const COPY = {
  invalid: {
    label: 'Mark invalid',
    verb: 'Mark invalid',
    consequence:
      "Its evidence is marked untrustworthy for good: it can't be started, stopped or decided again. The feature keeps serving what it serves now.",
  },
  running: {
    label: 'Start this version',
    verb: 'Start',
    consequence: 'It starts counting now. Its plan can no longer be changed.',
  },
} as const

export function LifecycleAction({
  slug,
  experimentId,
  versionId,
  version,
  target,
}: {
  slug: string
  experimentId: string
  versionId: string
  version: number
  target: 'invalid' | 'running'
}) {
  const copy = COPY[target]
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run() {
    setPending(true)
    setError(null)
    try {
      const result = await transitionExperimentVersionAction(slug, experimentId, versionId, target)
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
        {copy.label}
      </Button>
      <ConfirmDialog
        open={open}
        verb={copy.verb}
        noun="experiment version"
        subject={`v${version}`}
        consequence={copy.consequence}
        // Inside the dialog that is still open, not behind it (fresh reviewer, #172).
        details={
          error ? (
            <p className="ds-chart-note" role="alert">
              {error}
            </p>
          ) : undefined
        }
        pending={pending}
        onCancel={() => setOpen(false)}
        onConfirm={() => void run()}
      />
    </>
  )
}
