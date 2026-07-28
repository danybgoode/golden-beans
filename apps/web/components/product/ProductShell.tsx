import { BrandLockup } from '@/components/brand/BrandLockup'
import { Icon } from '@/components/ui/Icon'

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
            <Icon name="panels" />
            Projects
          </a>
          <a href="/install">
            <Icon name="cable" />
            Connect
          </a>
          <a href="/llms.txt">
            <Icon name="book" />
            Agent notes
          </a>
        </nav>
        <span className="product-shell__signal">
          <Icon name="gauge" />
          Engine ready
        </span>
      </header>
      <div className="product-shell__body">{children}</div>
    </div>
  )
}
