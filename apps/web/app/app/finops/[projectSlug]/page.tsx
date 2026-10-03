import { requireProjectMembership } from '@/lib/dashboard-auth'
import { getFinopsView } from '@/lib/finops-query'
import { ProductShell } from '@/components/product/ProductShell'
import {
  Callout,
  Col,
  Empty,
  ListCard,
  ListHead,
  PageHead,
  Row,
  RowMain,
  Tile,
  Tiles,
} from '@/design-system/primitives'
import { ExportCsv } from './export-csv'

// finops · Sprint 3, Story 3.3 — what each epic, skill and model cost, and how often quotes held (D25).
//
// ONE project, resolved server-side by `requireProjectMembership` (lib/membership.ts): a non-member gets the same 404
// as a project that does not exist. Every number comes from lib/finops-view.ts over two sources it names on the page —
// the epics' own frontmatter (the roadmap push) and this project's `$agent_usage` events (the opt-in usage push).
//
// The three states are the seed's approved surfaces (finops-actuals → Visuals): populated, empty (how to turn the push
// on), error. A failed read is the error state, never the empty one: "nothing yet" and "could not look" must not look
// alike (D4).
export const dynamic = 'force-dynamic'

const ABOUT_THE_UNIT =
  '≈ API $ is a list-price equivalent — what these tokens would cost on the Claude API at the dated price table the kit carries — not what anyone was billed. Claude Code only — other agents not measured.'

export default async function FinopsPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params
  const membership = await requireProjectMembership(projectSlug)

  let view: Awaited<ReturnType<typeof getFinopsView>> | null = null
  try {
    view = await getFinopsView(membership.projectId)
  } catch {
    view = null
  }

  return (
    <ProductShell projectSlug={projectSlug} section="measure" railActive={'finops'}>
      <main data-finops-state={view === null ? 'error' : view.state}>
        {view === null ? (
          <>
            <PageHead title="FinOps" lede="What each epic cost against its quote." />
            <Callout tone="warn">Couldn&apos;t load usage for this project. Try again.</Callout>
          </>
        ) : view.state === 'empty' ? (
          <>
            <PageHead title="FinOps" lede="What each epic cost against its quote." />
            <Empty
              title="No usage yet."
              body={
                <>
                  Turn on usage push with{' '}
                  <span className="ds-mono">gf-kit config set spend.telemetry on</span>, then build an epic.
                  Quotes and actuals arrive with your next roadmap push.
                </>
              }
            />
            <Callout>{ABOUT_THE_UNIT}</Callout>
          </>
        ) : (
          <>
            <PageHead
              title="FinOps"
              lede="What each epic cost against its quote, and which skills and models it went to."
              actions={<ExportCsv rows={view.epics} projectSlug={projectSlug} />}
            />
            <Tiles>
              {view.tiles.map((t) => (
                <Tile key={t.label} label={t.label} value={t.value} absent={t.absent} detail={t.detail} />
              ))}
            </Tiles>

            <ListCard label="Epics">
              <ListHead>
                <Col header>Epic</Col>
                <Col header width="meta">
                  Appetite · Quote
                </Col>
                <Col header width="state">
                  Actual · Δ
                </Col>
                <Col header width="act">
                  Sessions
                </Col>
              </ListHead>
              {view.epics.length === 0 ? (
                <Row>
                  <Col colSpan={4}>
                    No epic carries a quote or an actual yet — push the roadmap after the next groom.
                  </Col>
                </Row>
              ) : (
                view.epics.map((e) => (
                  <Row key={e.slug}>
                    <RowMain title={e.name} description={e.slug} mono={false} />
                    <Col width="meta">
                      {e.appetite} · {e.quote}
                    </Col>
                    <Col
                      width="state"
                      title={e.actualSource === 'live' ? 'from the usage push, still building' : undefined}
                    >
                      <span data-tone={e.tone ?? undefined}>
                        {e.actual} · {e.delta}
                      </span>
                    </Col>
                    <Col width="act">{e.sessions}</Col>
                  </Row>
                ))
              )}
            </ListCard>
            <p className="ds-hint">
              Quote and stamped actual: each epic&apos;s README frontmatter, from the latest roadmap push. “so
              far” and sessions: the usage push.
            </p>

            <ListCard label="By skill">
              <ListHead>
                <Col header>Skill</Col>
                <Col header width="meta">
                  ≈ API $
                </Col>
                <Col header width="state">
                  Tokens
                </Col>
                <Col header width="act">
                  Share
                </Col>
              </ListHead>
              <ShareRows
                rows={view.bySkill}
                empty="No usage pushed yet — skills arrive with the usage push."
              />
            </ListCard>

            <ListCard label="By model">
              <ListHead>
                <Col header>Model</Col>
                <Col header width="meta">
                  ≈ API $
                </Col>
                <Col header width="state">
                  Tokens
                </Col>
                <Col header width="act">
                  Share
                </Col>
              </ListHead>
              <ShareRows
                rows={view.byModel}
                empty="No usage pushed yet — models arrive with the usage push."
              />
            </ListCard>
            <p className="ds-hint">
              Skills and models: this project&apos;s usage push, latest snapshot per session
              {view.lastUsageAt ? `, newest ${view.lastUsageAt.slice(0, 10)}` : ''}.
            </p>

            <Callout>{ABOUT_THE_UNIT}</Callout>
          </>
        )}
      </main>
    </ProductShell>
  )
}

function ShareRows({
  rows,
  empty,
}: {
  rows: { name: string; usd: string; tokens: string; share: string }[]
  empty: string
}) {
  if (!rows.length)
    return (
      <Row>
        <Col colSpan={4}>{empty}</Col>
      </Row>
    )
  return (
    <>
      {rows.map((r) => (
        <Row key={r.name}>
          <RowMain title={r.name} />
          <Col width="meta">{r.usd}</Col>
          <Col width="state">{r.tokens}</Col>
          <Col width="act">{r.share}</Col>
        </Row>
      ))}
    </>
  )
}
