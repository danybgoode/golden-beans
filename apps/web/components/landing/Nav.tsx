export function Nav() {
  return (
    <nav className="gb">
      <span className="logo">
        <span className="bean" />
        golden beans
      </span>
      <div className="nav-links" style={{ display: 'flex', gap: 22, fontSize: 14 }}>
        <a href="#live-proof" style={{ color: 'var(--dim)' }}>Product</a>
        <a href="#primitives" style={{ color: 'var(--dim)' }}>Docs</a>
        <a href="#waitlist" style={{ color: 'var(--dim)' }}>Pricing</a>
      </div>
      <a
        href="#waitlist"
        className="btn btn-ghost"
        style={{ marginLeft: 'auto', padding: '9px 18px', fontSize: 14 }}
      >
        Join the waitlist
      </a>
    </nav>
  )
}
