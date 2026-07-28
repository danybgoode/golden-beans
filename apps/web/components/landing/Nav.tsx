import { ArrowUpRight, Sparkles } from 'lucide-react'
import { BrandLockup } from '@/components/brand/BrandLockup'

export function Nav() {
  return (
    <nav className="gb">
      <BrandLockup compact />
      <div className="nav-links" style={{ display: 'flex', gap: 22, fontSize: 14 }}>
        <a href="#live-proof" style={{ color: 'var(--dim)' }}>Product</a>
        <a href="/install" style={{ color: 'var(--dim)' }}>Install</a>
        <a href="#primitives" style={{ color: 'var(--dim)' }}>Docs</a>
        <a href="#waitlist" style={{ color: 'var(--dim)' }}>Pricing</a>
      </div>
      <a
        href="#waitlist"
        className="btn btn-ghost"
        style={{ marginLeft: 'auto', padding: '9px 18px', fontSize: 14 }}
      >
        <Sparkles size={15} aria-hidden="true" />
        Start growing
        <ArrowUpRight size={14} aria-hidden="true" />
      </a>
    </nav>
  )
}
