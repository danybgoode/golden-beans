import { BrandLockup } from '@/components/brand/BrandLockup'
import { Icon } from '@/components/ui/Icon'

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer__inner">
        <div className="footer__links">
          <BrandLockup compact />
          <a className="icon-link" href="https://github.com/danybgoode">
            <Icon name="external" /> GitHub
          </a>
          <span>
            <Icon name="sparkles" /> agent-readable: <a href="/llms.txt">/llms.txt</a>
          </span>
        </div>
        <p className="footer__meta">
          Footnote ledger, in order of appearance: the demo project is synthetic · Targeted is
          registry-declared, not gateway-observed · A/B lift has no significance engine yet · the connector,
          pod report, and inverted-loop sections above are honestly badged as not-yet- shipped. If a claim on
          this page ever stops being checkable, that&apos;s a bug — file it.
        </p>
      </div>
    </footer>
  )
}
