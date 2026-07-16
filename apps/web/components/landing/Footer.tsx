export function Footer() {
  return (
    <footer style={{ borderTop: '1px solid var(--line)' }}>
      <div className="wrap" style={{ paddingTop: 48, paddingBottom: 48 }}>
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', alignItems: 'center', color: 'var(--dim)', fontSize: 13.5 }}>
          <span className="logo" style={{ fontSize: 16 }}>
            <span className="bean" style={{ width: 15, height: 20 }} />
            golden beans
          </span>
          <a href="https://github.com/danybgoode" style={{ color: 'var(--dim)' }}>GitHub</a>
          <span style={{ marginLeft: 'auto', font: '500 12px var(--mono)' }}>
            agent-readable manifest: 🔜 Sprint 3
          </span>
        </div>
        <p style={{ margin: '22px 0 0', font: '400 12px var(--mono)', color: '#6d6250', lineHeight: 1.8 }}>
          Footnote ledger, in order of appearance: the demo project is synthetic · Targeted is
          registry-declared, not gateway-observed · A/B lift has no significance engine yet · the
          connector, pod report, and inverted-loop sections above are honestly badged as not-yet-
          shipped. If a claim on this page ever stops being checkable, that&apos;s a bug — file it.
        </p>
      </div>
    </footer>
  )
}
