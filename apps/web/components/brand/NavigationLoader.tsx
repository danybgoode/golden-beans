'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { GoldenBeansLoader } from './Loader'

const MAX_VISIBLE_MS = 10_000

function isInternalNavigation(event: MouseEvent): boolean {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return false
  }

  const target = event.target
  if (!(target instanceof Element)) return false
  const anchor = target.closest('a')
  if (
    !anchor ||
    anchor.target === '_blank' ||
    anchor.hasAttribute('download') ||
    anchor.getAttribute('rel')?.split(/\s+/).includes('external')
  ) {
    return false
  }

  const destination = new URL(anchor.href, window.location.href)
  if (destination.origin !== window.location.origin) return false

  const current = new URL(window.location.href)
  if (
    destination.pathname === current.pathname &&
    destination.search === current.search &&
    destination.hash
  ) {
    return false
  }

  return destination.href !== current.href
}

/**
 * Shows the branded loader for client navigation and form submissions without a
 * Next loading.tsx boundary. That distinction is load-bearing: a route-level
 * suspense fallback starts streaming before a gated page can call notFound(),
 * turning the required dark-path 404 into an HTTP 200.
 */
export function NavigationLoader() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const startingUrl = useRef('')

  useEffect(() => {
    const show = () => {
      startingUrl.current = window.location.href
      setVisible(true)
    }
    const onClick = (event: MouseEvent) => {
      if (isInternalNavigation(event)) show()
    }
    const onSubmit = (event: SubmitEvent) => {
      if (!event.defaultPrevented) show()
    }

    document.addEventListener('click', onClick, true)
    document.addEventListener('submit', onSubmit, true)
    return () => {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('submit', onSubmit, true)
    }
  }, [])

  useEffect(() => {
    setVisible(false)
  }, [pathname])

  useEffect(() => {
    if (!visible) return

    const poll = window.setInterval(() => {
      if (window.location.href !== startingUrl.current) setVisible(false)
    }, 100)
    const timeout = window.setTimeout(() => setVisible(false), MAX_VISIBLE_MS)

    return () => {
      window.clearInterval(poll)
      window.clearTimeout(timeout)
    }
  }, [visible])

  if (!visible) return null

  return (
    <div className="navigation-loader">
      <GoldenBeansLoader compact />
    </div>
  )
}
