import { BrandLockup } from '@/components/brand/BrandLockup'
import { Icon } from '@/components/ui/Icon'

export function Footer() {
  return (
    <footer className="footer" id="footer">
      <div className="wrap footer__inner">
        <div className="footer__links">
          <BrandLockup compact />
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
