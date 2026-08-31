// The specimen — the one screen where the whole language is visible at once.
//
// ── Why this is a real route and not a Storybook ──────────────────────────────────────────────
// Story 2.1: *"a specimen route renders every scale step from `design-system/`… the specimen is how
// a reviewer sees the whole language on one screen."* A separate tool would render the primitives in
// a different document, with different resets and a different font pipeline — which is precisely how
// a component library comes to look one way in its catalogue and another in the product. This
// renders inside the real app, under the real shell, with the real `next/font` families.
//
// It is also the screen Sprint 2's walkthrough hands to Daniel: **the language is approved or
// rejected here, before any page is rebuilt on it.**
//
// ── It is deliberately NOT in the coverage denominator ────────────────────────────────────────
// `OUT_OF_SCOPE_PAGES` in `route-manifest.ts` carries it, with the reason: the specimen IS the
// reference every other route is measured against, so counting it as covered by itself is circular.
// It is still gated — the visual gate asserts it against `MEASURED-SPEC.md`.
//
// ── Access ────────────────────────────────────────────────────────────────────────────────────
// ⚠️ **This was WRONG on its first write, and a cross-family review caught it (agy, Blocking).**
// The check was `if (projectSlug) await requireProjectMembership(projectSlug)` — so
// `/app/design-system` with no `?project=` ran NO auth check at all, while the comment above it
// claimed the route was protected "exactly like every other `/app` route". A comment asserting a
// property the code does not have, on an auth boundary.
//
// And nothing else was covering it: `middleware.ts` is scoped to `/app/:path*` but its own header
// says it is **session PLUMBING ONLY — it does NOT gate routes**, because per-route authorization
// belongs at the data boundary. So the guard genuinely was the whole guard, and it was optional.
//
// What is at stake is smaller than the shape of the bug — the specimen renders no tenant data, every
// value below is a literal chosen to exercise a state — but "it leaks nothing" is not why a route is
// closed. Every sibling under `/app` requires a session, and an internal design surface is not a
// reason to be the one that does not.
//
// So: a session is required unconditionally, and membership additionally when a project is named.

import { ProductShell } from '@/components/product/ProductShell'
import { redirect } from 'next/navigation'
import { requireProjectMembership } from '@/lib/dashboard-auth'
import { getSessionUser } from '@/lib/supabase-auth'
import { SPECIMEN_WORDS } from '@/design-system/vocabulary'
import { SPACE, TYPE, WEIGHT } from '@/design-system/scales'
import { SpecimenDialog, SpecimenProductDialog } from './specimen-dialog'
import {
  Answer,
  Button,
  EnvironmentControl,
  Menu,
  MenuItem,
  Pill,
  RailItem,
  Stat,
  Step,
  Steps,
  Switch,
  Switcher,
  Tab,
  Table,
  TableEmpty,
  TableCell,
  TableHead,
  TableRow,
  Toast,
  Wizard,
  type ControlState,
} from '@/design-system/primitives'

export const dynamic = 'force-dynamic'

/** Every state a control can be put into by a caller. The browser states are exercised by hand. */
const CONTROL_STATES: ControlState[] = ['idle', 'loading', 'success', 'error', 'disabled', 'unbuilt']

function Section({
  id,
  title,
  note,
  children,
}: {
  id: string
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <section className="ds-specimen-section" id={id}>
      <h2 className="ds-specimen-title">{title}</h2>
      {note ? <p className="ds-specimen-note">{note}</p> : null}
      <div className="ds-specimen-body">{children}</div>
    </section>
  )
}

export default async function DesignSystemSpecimen({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>
}) {
  // ⚠️ The slug arrives as a QUERY parameter, not a path segment, and that is deliberate: this route
  // is `/app/design-system` with no `[projectSlug]`, so it cannot take one from the path. It is the
  // design system's own page, not a project's.
  //
  // Membership is still required when a slug is supplied, so the shell renders that project's
  // chrome — and `requireProjectMembership` resolves the tenant SERVER-side from the session, never
  // from this parameter, which is why a hand-typed `?project=` cannot reach a foreign project
  // (AGENTS.md; the request never selects the tenant).
  const { project } = await searchParams
  const projectSlug = project ?? ''

  // Unconditional. `redirect('/login')` matches what `requireProjectMembership` does for an
  // anonymous caller, so the specimen behaves like its siblings whether or not a project is named.
  const user = await getSessionUser()
  if (!user) redirect('/login')

  // ...and when a project IS named, membership of THAT project is required — resolved server-side
  // from the session, never from this parameter, so a hand-typed `?project=` cannot reach a foreign
  // project (AGENTS.md: the request never selects the tenant).
  if (projectSlug) await requireProjectMembership(projectSlug)

  return (
    <ProductShell projectSlug={projectSlug} section="setup">
      <main className="ds">
        <div className="ds-specimen">
          <header className="ds-specimen-head">
            <h1 className="ds-specimen-h1">The design system</h1>
            <p className="ds-specimen-lede">
              Every scale step and every primitive, in every state, rendered from{' '}
              <code>apps/web/design-system/</code>. This is the language. Approve or reject it here, before
              any page is rebuilt on it.
            </p>
          </header>

          <Section
            id="type"
            title="Type scale"
            note="Derived from the approved prototype by measurement. The count beside each step is how many declarations in the approved stylesheet use it."
          >
            <Table>
              <TableHead>
                <TableCell header>Step</TableCell>
                <TableCell header>Size</TableCell>
                <TableCell header>Uses</TableCell>
                <TableCell header wide>
                  Specimen
                </TableCell>
              </TableHead>
              {Object.entries(TYPE).map(([name, step]) => (
                <TableRow key={name}>
                  <TableCell>
                    <code>{name}</code>
                  </TableCell>
                  <TableCell>{step.px}px</TableCell>
                  <TableCell>{step.uses}</TableCell>
                  <TableCell wide className={`ds-specimen-type ds-specimen-type--${name}`}>
                    {step.role}
                  </TableCell>
                </TableRow>
              ))}
            </Table>
          </Section>

          <Section
            id="weight"
            title="Weight scale"
            note="Three weights, because the approved stylesheet declares exactly three. 400 is the inherited default and is never declared — a step for it would invent a decision the design does not make."
          >
            <div className="ds-specimen-row">
              {Object.entries(WEIGHT).map(([name, step]) => (
                <span key={name} className={`ds-specimen-weight ds-specimen-weight--${name}`}>
                  {name} · {step.px} · {step.uses} uses
                </span>
              ))}
            </div>
          </Section>

          <Section
            id="space"
            title="Space scale"
            note="The approved design's spacing is NOT on a scale — 21 values with no gaps. This is the smallest ramp it snaps to; every off-scale value is recorded in scales.ts with its count and nearest step."
          >
            <div className="ds-specimen-spaces">
              {Object.entries(SPACE).map(([name, step]) => (
                <div key={name} className="ds-specimen-space">
                  <span className={`ds-specimen-swatch ds-specimen-swatch--${name}`} />
                  <span className="ds-specimen-space-label">
                    {name} · {step.px}px
                  </span>
                </div>
              ))}
            </div>
          </Section>

          <Section
            id="buttons"
            title="Button — all six caller-set states"
            note="`disabled` and `unbuilt` are DIFFERENT states and must look different: one is “you cannot do this right now” and it comes back; the other is “this is not built yet” and it does not. Collapsing them is the defect ux-guidelines.md was written about."
          >
            <div className="ds-specimen-row">
              {CONTROL_STATES.map((state) => (
                <Button key={state} variant="primary" state={state} icon="check">
                  {state}
                </Button>
              ))}
            </div>
            <div className="ds-specimen-row">
              {CONTROL_STATES.map((state) => (
                <Button key={state} variant="secondary" state={state}>
                  {state}
                </Button>
              ))}
            </div>
          </Section>

          <Section id="pills" title="State pill" note="Dot plus word — never colour alone.">
            <div className="ds-specimen-row">
              <Pill state="on">{SPECIMEN_WORDS.on}</Pill>
              <Pill state="off">{SPECIMEN_WORDS.off}</Pill>
              <Pill state="never">{SPECIMEN_WORDS.neverActivated}</Pill>
            </div>
          </Section>

          <Section
            id="switch"
            title="Three-state switch"
            note="38 × 21. The dashed “never” is the state the console has never had: a flag nobody ever activated has no actor and no audit row, and rendering it the same as a deliberate kill is what made the old page unanswerable."
          >
            <div className="ds-specimen-row">
              <Switch state="on" label="On" />
              <Switch state="off" label="Off" />
              <Switch state="never" label={SPECIMEN_WORDS.neverActivated} />
              <Switch state="off" label="Disabled" disabled />
            </div>
          </Section>

          <Section
            id="rail"
            title="Rail item"
            note="One line, 36px, an icon, no description and no badge. The active item is a raised card — lighter fill, a border, a gold icon — carried on aria-current so the cue a sighted reader sees and the one a screen reader hears are the same attribute."
          >
            <nav className="ds-rail ds-specimen-rail">
              <RailItem icon="flag" href="#rail" current>
                Features
              </RailItem>
              <RailItem icon="flask" href="#rail">
                Experiments
              </RailItem>
              <RailItem icon="calendar-clock" href="#rail">
                Scheduled changes
              </RailItem>
              <RailItem icon="activity" href="#rail">
                Activity
              </RailItem>
            </nav>
          </Section>

          <Section id="chrome" title="Chrome — switcher, tabs, environment">
            <div className="ds-specimen-row">
              <Switcher project="miyagisanchez" />
              <EnvironmentControl environment="production" />
              <EnvironmentControl environment="preview" />
              <EnvironmentControl environment="development" />
            </div>
            <div className="ds-tabs ds-specimen-tabs" role="tablist">
              <Tab href="#chrome" selected>
                Today
              </Tab>
              <Tab href="#chrome">Measure</Tab>
              <Tab href="#chrome">Ship</Tab>
              <Tab href="#chrome">Setup</Tab>
            </div>
            <Menu>
              <MenuItem current>miyagisanchez</MenuItem>
              <MenuItem>golden-beans</MenuItem>
            </Menu>
          </Section>

          <Section id="answer" title="The answer line and stat tiles">
            <Answer>Production is serving 3 of 42 features. 39 have never been turned on here.</Answer>
            <div className="ds-specimen-row">
              <Stat value="3" label="Serving in Production" />
              <Stat value="39" label={SPECIMEN_WORDS.neverActivated} />
              <Stat value="0" label="Deliberately off" />
            </div>
          </Section>

          <Section
            id="table"
            title="Data table — header row, rows, and the empty state"
            note="The header row is the one uppercase place, and never mono. The empty state is an invitation, not a dead end."
          >
            <Table>
              <TableHead>
                <TableCell header wide>
                  Feature
                </TableCell>
                <TableCell header>State</TableCell>
                <TableCell header>Switch</TableCell>
              </TableHead>
              <TableRow>
                <TableCell wide>
                  <code>checkout.stripe_enabled</code>
                </TableCell>
                <TableCell>
                  <Pill state="on">{SPECIMEN_WORDS.on}</Pill>
                </TableCell>
                <TableCell>
                  <Switch state="on" label="checkout.stripe_enabled" />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell wide>
                  <code>listing.photo_hints</code>
                </TableCell>
                <TableCell>
                  <Pill state="never">{SPECIMEN_WORDS.neverActivated}</Pill>
                </TableCell>
                <TableCell>
                  <Switch state="never" label="listing.photo_hints" />
                </TableCell>
              </TableRow>
            </Table>
            <Table empty>
              <TableEmpty
                title="No scheduled changes"
                body="Scheduling a flag change is not available yet. Nothing is waiting to happen here."
                action={
                  <Button state="unbuilt" variant="secondary">
                    Not built yet
                  </Button>
                }
              />
            </Table>
          </Section>

          <Section
            id="dialog"
            title="Dialog"
            note="What is under test here is WHERE it is. A universal margin reset defeats the UA's centring on a modal dialog, and every confirmation in this product sat in the top-left corner from the day the component shipped until it was found by opening the page."
          >
            <SpecimenDialog />
            <SpecimenProductDialog />
          </Section>

          <Section id="feedback" title="Toasts">
            <div className="ds-specimen-col-stack">
              <Toast state="success">Copied the connector URL.</Toast>
              <Toast state="error">
                That key could not be revoked — it was already revoked at 09:14 UTC.
              </Toast>
            </div>
          </Section>

          <Section
            id="steps"
            title="Numbered steps and the wizard"
            note="The number is drawn from a CSS counter, not typed: check-design-drift.mjs bans enclosed numerals because a pasted glyph is illegible at the only size a text run tolerates."
          >
            <Steps>
              <Step note="It is scoped to this project and revocable.">Copy your connector URL</Step>
              <Step note="Claude → Settings → Connectors → Add.">Paste it into Claude</Step>
              <Step>Ask Claude for this project&rsquo;s funnel</Step>
            </Steps>
            <Wizard
              steps={[
                { label: 'Choose a kind', state: 'done' },
                { label: 'Name it', state: 'current' },
                { label: 'Copy the value', state: 'todo' },
              ]}
            />
          </Section>
        </div>
      </main>
    </ProductShell>
  )
}
