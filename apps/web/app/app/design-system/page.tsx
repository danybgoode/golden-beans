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
import {
  ComparisonBars,
  DayColumns,
  IntervalBar,
  Plot,
  SmallMultiple,
  SplitBar,
  StageBars,
} from '@/design-system/charts'
import { SpecimenDialog, SpecimenProductDialog } from './specimen-dialog'
import {
  Answer,
  Button,
  Callout,
  Card,
  Col,
  DormantSummary,
  EmptyCard,
  EnvironmentControl,
  Field,
  GroupBanner,
  ListCard,
  ListHead,
  Menu,
  MenuItem,
  PageHead,
  PageTab,
  PageTabs,
  Pane,
  Pill,
  RailItem,
  Row,
  RowMain,
  RowState,
  ShownOnce,
  Stat,
  StatLink,
  Step,
  Steps,
  Summary,
  Switch,
  Switcher,
  Tab,
  Table,
  TableEmpty,
  TableCell,
  TableHead,
  TableRow,
  Tag,
  Toast,
  Wizard,
  type ControlState,
} from '@/design-system/primitives'

export const dynamic = 'force-dynamic'

/** Every state a control can be put into by a caller. The browser states are exercised by hand. */
const CONTROL_STATES: ControlState[] = ['idle', 'loading', 'success', 'error', 'disabled', 'unbuilt']

/**
 * The specimen's own series. Literals, like every other value on this page.
 *
 * Deliberately NOT smooth: a monotonic ramp makes every line primitive look correct, and the two
 * things worth seeing here are that the plot scales to its own domain and that the columns keep a
 * zero-value day distinguishable from a one-event day.
 */
const SPECIMEN_SERIES = [
  ['23 May', 946], ['30 May', 1002], ['6 Jun', 988], ['13 Jun', 1071], ['20 Jun', 1104],
  ['27 Jun', 1098], ['4 Jul', 1140], ['11 Jul', 1163], ['18 Jul', 1189], ['25 Jul', 1201],
  ['1 Aug', 1224], ['8 Aug', 1230], ['15 Aug', 1258], ['27 Aug', 1284],
].map(([date, value]) => ({ date: date as string, value: value as number }))

const SPECIMEN_DAYS = [
  ['14 Aug', 820], ['15 Aug', 910], ['16 Aug', 760], ['17 Aug', 1180], ['18 Aug', 1340],
  ['19 Aug', 0], ['20 Aug', 1420], ['21 Aug', 1610], ['22 Aug', 1550], ['23 Aug', 1290],
  ['24 Aug', 1730], ['25 Aug', 1880], ['26 Aug', 4], ['27 Aug', 2040],
].map(([date, value]) => ({ date: date as string, value: value as number }))

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
    <ProductShell projectSlug={projectSlug} section="setup" railActive={null}>
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
              <Switch state="on" label={SPECIMEN_WORDS.switchOn} />
              <Switch state="off" label={SPECIMEN_WORDS.switchOff} />
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

          {/* ═══ THE PAGE LAYER — design-system-rails · Sprint 4 ═══════════════════════════════
              Everything above is a CONTROL. Everything below is how a whole page is assembled, and
              it is on the specimen for the same reason the controls are: `every primitive the module
              exports actually reaches the specimen` fails on an export with no entry here, and ten
              of the fourteen original primitives went unasserted before that check existed.

              The examples are the real ones. `PageHead` renders the flags page's own head, the list
              card renders a feature row — so the specimen is where a reviewer sees the language
              rather than a diagram of it. */}
          <Section
            id="page-head"
            title="Page head — title, one sentence, actions"
            note="23/700 title, 13.5/400 lede, and the actions pushed to the right edge by a spacer rather than by a justify rule — the head's children are a title block plus any number of controls, and only one gap in that row is the flexible one."
          >
            <PageHead
              title="Features"
              lede="Everything this project can switch, and what production is doing with it."
              actions={
                <>
                  <Button variant="secondary">Compare environments</Button>
                  <Button variant="primary">+ New feature</Button>
                </>
              }
            />
          </Section>

          <Section
            id="summary"
            title="The summary strip"
            note="Four counts, each a link that filters the list to itself. `aria-current` paints the selected tile AND announces it — one attribute, so the two cannot disagree. A ZERO is dimmed in every tone: a green 0 beside “On in production” reads at a glance as a healthy number."
          >
            <Summary>
              <StatLink value={42} label="All features" href="#summary" tone="all" current />
              <StatLink value={3} label="On in production" href="#summary" tone="on" />
              <StatLink value={0} label="Turned off here" href="#summary" tone="off" />
              <StatLink value={39} label={SPECIMEN_WORDS.neverActivated} href="#summary" tone="never" />
            </Summary>
          </Section>

          <Section
            id="list"
            title="The list card — header row, rows, a group banner, and one line replacing forty"
            note="Every row is 71px, which is the contract's measurement. The state detail is clamped to one line and carries its full sentence on `title`: the copy that separates “never turned on here” from “switched off” is long on purpose, and left to wrap it made the row 90px in the state 39 of 42 production flags are in."
          >
            <ListCard label="Features specimen">
              <ListHead>
                <Col header>Feature</Col>
                <Col header width="state">
                  State in production
                </Col>
                <Col header width="meta">
                  Type &amp; risk
                </Col>
                <Col header width="act">
                  On / off
                </Col>
              </ListHead>
              <GroupBanner state="on" count={1} columns={4}>
                {SPECIMEN_WORDS.on} in production
              </GroupBanner>
              <Row>
                <RowMain
                  title="checkout.stripe_enabled"
                  description="Card payments at checkout."
                  href="#list"
                />
                <RowState state="on" label={SPECIMEN_WORDS.on} detail="serving v5" />
                <Col width="meta">
                  <Tag tone="kill" label="Type">
                    Kill switch
                  </Tag>
                  <Tag tone="risk-high" label="Risk">
                    High risk
                  </Tag>
                </Col>
                <Col width="act">
                  <Switch state="on" label="checkout.stripe_enabled in production" />
                </Col>
              </Row>
              <Row>
                <RowMain
                  mono={false}
                  title="Storefront read key"
                  description="API key — used by the storefront."
                />
                <Col width="state">
                  {/* The word a real credential row carries — `credentialPermits('ingest')`. It said "Read the
                      numbers", which is the PROTOTYPE's phrase for a read key and is used by no kind
                      in this product: the specimen and the product were captioning the same row
                      differently (fresh reviewer, Minor). */}
                  <Pill label>Send events</Pill>
                </Col>
                <Col width="meta">
                  <Tag>production</Tag>
                  <Tag>No expiry</Tag>
                </Col>
                <Col width="act">
                  <span className="ds-kebab" />
                </Col>
              </Row>
              <DormantSummary
                title={`39 features have never been turned on in production`}
                detail="No one has ever switched them on or off here. Nothing is wrong with them — nothing has happened to them."
                action="Show them"
                href="#list"
                columns={4}
              />
            </ListCard>
          </Section>

          <Section
            id="page-tabs"
            title="A page's own tab strip, and the pane it opens"
            note="A <nav> with aria-current, NOT a role=tablist: activating one of these is a full navigation, and promising a JS widget with arrow keys behind it is an ARIA claim a server-rendered page cannot keep. It is drawn the same as the section tabs above, so a reader learns the pattern once."
          >
            <PageTabs label="Specimen sections">
              <PageTab href="#page-tabs" current>
                Value
              </PageTab>
              <PageTab href="#page-tabs">Environments</PageTab>
              <PageTab href="#page-tabs">Funnel</PageTab>
            </PageTabs>
            <Pane>
              <Field
                label="Is it on in production"
                hint="Turning it off is one click and is recorded with a reason."
              >
                <Switch state="on" label="checkout.stripe_enabled in production" />
              </Field>
            </Pane>
          </Section>

          <Section
            id="fields"
            title="A field, its hint, and its error"
            note="The error slot's height is reserved whether or not it has text, so showing a message never moves the submit button a cursor is already travelling towards. A field with a control passes controlId and gets a real <label for>; one without gets a <span>, because a <label> with no association is a promise of one that does not exist."
          >
            <Field
              label="What to call it"
              controlId="specimen-field"
              hint="For you, not for the machine."
              error={null}
            >
              {(control) => <input {...control} className="ds-input" defaultValue="ci" />}
            </Field>
            <Field
              label="What to call it"
              controlId="specimen-field-error"
              hint="For you, not for the machine."
              error="Give the key a label, so you can tell it apart from the others later."
            >
              {(control) => <input {...control} className="ds-input" defaultValue="" />}
            </Field>
          </Section>

          <Section
            id="callouts"
            title="Callouts, cards, and the two kinds of empty"
            note="`empty` means nothing here YET and a control exists that would fill it; `unbuilt` means this does not exist and no control does. references/ux-guidelines.md says the two must look different, and rendering them the same sends a reader hunting for a button nobody has written."
          >
            <Callout>A note that is true every time you open the page.</Callout>
            <Callout tone="warn">
              <b>Flag serving is currently switched off.</b> Features can be prepared, but turning them on and
              off is unavailable.
            </Callout>
            <Card>
              <span className="ds-label">A padded card</span>
              <p className="ds-hint">
                The list card&rsquo;s surface, holding prose and fields instead of rows.
              </p>
            </Card>
            <EmptyCard
              title="No destinations yet"
              body="Until you add one, events are recorded here but not forwarded anywhere."
            />
            <EmptyCard
              state="unbuilt"
              title="Scheduling is not built yet"
              body="Nothing here can schedule a feature change today — so this is not an empty list."
            />
          </Section>

          {/* ── design-system-rails · Sprint 5, Story 5.1 — the charts, in every state ──────────
              The specimen is where a populated chart can be asserted at all. Production
              `miyagisanchez` has one TARS feature, zero journeys, zero scenarios and zero tasks
              (epic D10), so most product routes can only ever render an EMPTY state — and a
              primitive whose populated form nothing exercises is a primitive nobody has seen.

              Every value below is a literal chosen to exercise a state. The unreadable states sit
              beside their populated twins on purpose: a bar that could not be drawn and a bar of
              length zero are the pair a reader has to be able to tell apart, and putting them
              anywhere but side by side makes that impossible to judge. */}
          <Section
            id="charts"
            title="Charts"
            note="Hand-rolled SVG on the token set — no chart library, and none reachable (epic D7). DD4's four colour rules are implemented rather than cited: magnitude is one hue light to dark, two-way identity is grey and blue, status carries a word and a count beside every colour, and a nonzero value never rounds to zero pixels."
          >
            <div className="ds-specimen-col-stack">
              <p className="ds-label">Magnitude — one hue, light to dark</p>
              <StageBars
                stages={[
                  { label: 'Signed up', value: 1284, sharePercent: 100 },
                  { label: 'Listed a product', value: 742, sharePercent: 58, dropped: { count: 542, percent: 42 } },
                  { label: 'First sale', value: 318, sharePercent: 25, dropped: { count: 424, percent: 57 } },
                  { label: 'Repeat sale', value: 147, sharePercent: 11, dropped: { count: 171, percent: 54 } },
                ]}
                note="Four stages, four steps of one ramp. A fifth stage repeats the darkest step rather than reaching for a fifth colour — the brand's four accents fail as a categorical set (DD4)."
              />

              <p className="ds-label">…and the same bars with a stage nobody could read</p>
              <StageBars
                stages={[
                  { label: 'Targeted', value: 24330, sharePercent: 100 },
                  { label: 'Adopted', value: null },
                  { label: 'Retained', value: 0, sharePercent: 0 },
                ]}
                note="The middle stage could not be read and says so; the last is a real zero and renders no bar at all. If a zero-value fill existed it would be given the 4px floor and would invent the reading the floor exists to prevent."
              />
            </div>

            <div className="ds-specimen-col-stack">
              <p className="ds-label">Two-way identity — grey and blue</p>
              <ComparisonBars
                rows={[
                  { series: 'control', label: 'Control', observed: 6120, needed: 6250 },
                  { series: 'treatment', label: 'Treatment', observed: 6088, needed: 6250 },
                ]}
                note="The only pair on this palette that survives a colour-vision check (ΔE 23.4 protan, 23.2 tritan). A third variant is a third row, never a third hue."
              />

              <p className="ds-label">Status — never colour alone</p>
              <SplitBar held={1840} failed={3} unreadable="This drill has never run." />
              <p className="ds-chart-note">
                Three failures in 1,843 draws is 0.16% — under a pixel on any track this console
                renders. The red segment has a 4px floor and the exact count sits beside it, because
                the sliver is not what carries the fact.
              </p>
              <SplitBar held={0} failed={0} unreadable="This drill has never run — nothing here is evidence yet." />
            </div>

            <div className="ds-specimen-col-stack">
              <p className="ds-label">A series, and the two ways it cannot be one</p>
              <Plot series={SPECIMEN_SERIES} label="Specimen series" />
              {/* The three states side by side, which is the only way a reader can judge that they
                  are actually distinguishable. A populated card, a card with one reading, and a card
                  with none — the second and third are what production `miyagisanchez` renders today
                  (L2), and the first is what nothing in the product can currently show. */}
              <div className="ds-chart-smalls">
                <SmallMultiple
                  label="A series with a trend"
                  value={1284}
                  delta={{ percent: 7.4, direction: 'up' }}
                  series={SPECIMEN_SERIES}
                  freshness="updated 2h ago"
                />
                <SmallMultiple
                  label="A series with one reading"
                  value={4200}
                  series={[{ date: '2026-07-06', value: 4200 }]}
                  freshness="last update 8w ago"
                />
                <SmallMultiple label="A series with none" value={null} series={[]} />
              </div>
            </div>

            <div className="ds-specimen-col-stack">
              <p className="ds-label">An interval, drawn</p>
              <IntervalBar
                low={0.062}
                high={0.304}
                point={0.181}
                format={(value) => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`}
                unreadable="Not computable."
              />
              <p className="ds-chart-note">
                The whole range sits above zero, so the treatment is better — the only question left
                is by how much.
              </p>
              <IntervalBar
                low={-0.091}
                high={0.278}
                point={0.084}
                format={(value) => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`}
                unreadable="Not computable."
              />
              <p className="ds-chart-note">
                This one includes no-difference, so it is drawn dashed and in the neutral token. The
                range still includes zero, which means &ldquo;no difference&rdquo; is one of the
                answers the data allows.
              </p>
              <DayColumns
                series={SPECIMEN_DAYS}
                unreadable="Nothing has been served yet."
                note="A day with one event and a day with none must not look the same: the floor keeps the first visible and the second is drawn in the inert token."
              />
            </div>
          </Section>

          <Section
            id="once"
            title="A value shown once"
            note="Sprint contract #7: the key value is shown once, on a screen of its own, with a copy button — never a value read off a table. Gold-bordered because it is the one thing on the page a reader cannot get back by reloading."
          >
            <ShownOnce
              title="Copy this key now — it is not shown again"
              body="Only its hash is stored, so nothing here can show it to you a second time."
            >
              <div className="ds-copyrow">
                <code>gb_key_0000000000000000000000000000000000000000</code>
                <Button variant="secondary">Copy</Button>
              </div>
            </ShownOnce>
          </Section>
        </div>
      </main>
    </ProductShell>
  )
}
