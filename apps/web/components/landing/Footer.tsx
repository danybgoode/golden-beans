import Link from 'next/link'
import { BrandLockup } from '@/components/brand/BrandLockup'
import { Icon } from '@/components/ui/Icon'

// methodology-experience · Story 2.4 — the footer links the methodology.
//
// `next/link` rather than a bare `<a>`: `@next/next/no-html-link-for-pages` (correctly) fails the
// lint for an `<a>` to a page — a full document load where a client-side transition belongs. The
// GitHub link beside it stays an `<a>` because it leaves the site entirely, and the agent-manifest
// links stay `<a>` because they are static files, not routes.
export function Footer() {
  return (
    <footer className="footer" id="footer">
      <div className="wrap footer__inner">
        <div className="footer__links">
          <BrandLockup compact />
          <Link className="icon-link" href="/methodology">
            <Icon name="book" /> Methodology
          </Link>
          <a className="icon-link" href="https://github.com/danybgoode">
            <Icon name="external" /> GitHub
          </a>
          <span className="footer__agent-manifest">
            <Icon name="sparkles" /> agent-readable: <a href="/llms.txt">/llms.txt</a> ·{' '}
            <a href="/northstar-self-serve.md">/northstar-self-serve.md</a> · <a href="/install">/install</a>
          </span>
        </div>
      </div>
    </footer>
  )
}
