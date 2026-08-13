import { Panel } from '@/components/ui/Panel'
import { SectionDivider } from '@/components/ui/SectionDivider'

// landing-redesign-v2 · Sprint 2, Story 2.1 — ⑨ For the engineers who will inevitably ask.
//
// ── The command here is NOT the one in the mockup, and that is the point ──────────────────────
// `references/golden-beans-landing-v2.html` puts `npx golden-beans init` in this slot. There is no
// such command: `packages/sdk/package.json` declares no `bin`, and no CLI package is published —
// the real first step is the `npm install` that `app/install/page.tsx` already documents. Shipping
// the mockup's line verbatim would have put a copy-pasteable command that fails on first contact
// in front of the one persona on this page who will definitely run it (the fourth collision
// between the mockup's copy and something checkable — see the epic README's D1 for the other
// three). If an `init` wizard ships later, this line changes in the epic that ships it.
//
// The bullets below are all real and all named in AGENTS.md: signed destinations with at-least-once
// delivery, per-credential scoping, one shared revoke path across all three credential kinds, and
// the append-only decision ledger.
const guarantees = [
  'Signed event destinations',
  'Scoped credentials',
  'Revocable access',
  'Audit trail',
  'SDK data-in layer',
]

export function SdkSection() {
  return (
    <>
      <SectionDivider number={9} title="For the engineers who will inevitably ask" />
      <section id="sdk">
        <div className="wrap">
          <h2 className="section-title">Yes, there&apos;s an SDK</h2>
          <p className="measure">
            A few lines get the first event in. Your engineers keep control of what enters Golden Frijoles.
            You get a product layer you and your agent can actually operate.
          </p>
          <p className="takeaway">Everybody gets to keep their IDE.</p>

          <Panel className="section-lead">
            <pre className="code-block">npm install @golden-frijoles/sdk</pre>
          </Panel>

          <ul className="plain-list">
            {guarantees.map((guarantee) => (
              <li key={guarantee}>{guarantee}</li>
            ))}
          </ul>
        </div>
      </section>
    </>
  )
}
