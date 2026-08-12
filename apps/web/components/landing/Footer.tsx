import { BrandLockup } from '@/components/brand/BrandLockup'
import { Icon } from '@/components/ui/Icon'

// landing-redesign-v2 · Sprint 2, Story 2.1 — the footer, and the page's footnote ledger.
//
// ── The ledger is the most important paragraph on this page ───────────────────────────────────
// It survived the redesign with its contents rewritten, because the previous one had gone stale in
// exactly the way it warns about: it still described "the connector, pod report, and inverted-loop
// sections above" as not-yet-shipped, months after all three shipped. A ledger that lists retired
// caveats teaches a reader to skip it, which costs more than having no ledger at all.
//
// So this one lists what is true of the page as it now stands, in the order the reader met it:
// which windows were illustrations, which numbers were real, and what the priced tier cannot do
// yet. If any line here stops being true, the section that changed is the one that should have
// changed it.
export function Footer() {
  return (
    <footer className="footer">
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
        <p className="footer__meta">
          Footnote ledger, in order of appearance: the agent conversations in the hero and in §2 are
          illustrations, labelled as such, not screenshots of a live session · §3&apos;s release list shows
          the shape of release legibility, not anyone&apos;s actual releases · §6 is the only section with
          real numbers — the Pod Report is computed from this repository&apos;s own git history, and the
          engine read comes from the synthetic demo project, which you can curl at /api/v1/public/north-star ·
          no customer data appears on this page, ever · the $49 tier has no billing rail behind it yet and
          says so where it is priced. If a claim on this page ever stops being checkable, that&apos;s a bug —
          file it.
        </p>
      </div>
    </footer>
  )
}
