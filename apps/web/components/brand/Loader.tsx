'use client'

import { useEffect, useState } from 'react'
import { LOADER_PHRASES } from '@/lib/loader-phrases'

export function GoldenBeansLoader({ compact = false }: { compact?: boolean }) {
  const [phraseIndex, setPhraseIndex] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPhraseIndex((current) => (current + 1) % LOADER_PHRASES.length)
    }, 1500)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className={`gb-loader${compact ? ' gb-loader--compact' : ''}`} role="status" aria-live="polite">
      <span className="gb-loader__dot" aria-hidden="true" />
      <p>{LOADER_PHRASES[phraseIndex]}</p>
      <span className="sr-only">Loading Golden Beans</span>
    </div>
  )
}
