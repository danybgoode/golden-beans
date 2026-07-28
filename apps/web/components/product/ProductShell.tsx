import { BookOpenText, Cable, Orbit, Telescope } from 'lucide-react'
import { BrandLockup } from '@/components/brand/BrandLockup'

/**
 * Product chrome is rendered inside each page after its auth/flag guard resolves.
 *
 * This must not become an App Router layout: Next may stream a parent layout before a child calls
 * `notFound()`, turning the required dark-route 404 into a 200 with not-found content. Keeping the
 * shell below the guard makes the HTTP status and the visual rail agree.
 */
export function ProductShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="product-shell">
      <header className="product-shell__header">
        <BrandLockup compact href="/app" />
        <nav aria-label="Product">
          <a href="/app">
            <Orbit size={17} aria-hidden="true" />
            Garden
          </a>
          <a href="/install">
            <Cable size={17} aria-hidden="true" />
            Connect
          </a>
          <a href="/llms.txt">
            <BookOpenText size={17} aria-hidden="true" />
            Agent notes
          </a>
        </nav>
        <span className="product-shell__signal">
          <Telescope size={16} aria-hidden="true" />
          Watching growth
        </span>
      </header>
      <div className="product-shell__body">{children}</div>
    </div>
  )
}
