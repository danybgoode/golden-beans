'use client'

import { useEffect, useState } from 'react'
import { Bean, Sparkles, Sprout } from 'lucide-react'
import { LOADER_PHRASES } from '@/lib/loader-phrases'

function nextIndex(current: number) {
  // The first server/client render is deterministic. Randomness starts only after hydration.
  const candidate = Math.floor(Math.random() * LOADER_PHRASES.length)
  return candidate === current ? (current + 1) % LOADER_PHRASES.length : candidate
}

export function GoldenBeansLoader({ compact = false }: { compact?: boolean }) {
  const [phraseIndex, setPhraseIndex] = useState(1)

  useEffect(() => {
    setPhraseIndex((current) => nextIndex(current))
    const timer = window.setInterval(() => {
      setPhraseIndex((current) => nextIndex(current))
    }, 1800)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className={`gb-loader${compact ? ' gb-loader--compact' : ''}`} role="status" aria-live="polite">
      <div className="gb-loader__garden" aria-hidden="true">
        <span className="gb-loader__halo" />
        <Bean className="gb-loader__bean" />
        <Sprout className="gb-loader__sprout" />
        <Sparkles className="gb-loader__sparkles" />
      </div>
      <p>{LOADER_PHRASES[phraseIndex]}</p>
      <span className="sr-only">Loading Golden Beans</span>
    </div>
  )
}
