import { DEMO_PROJECT_SLUG } from '@/lib/public-demo'
import { getPodReport } from '@/lib/pod-report-query'
import { getSection } from '@/lib/landing-sections'
import { Badge } from '@/components/ui/Badge'

// Section 5 — Pods & proof (ROI). pod-report · Sprint 3, Story 3.2.
//
// Replaces the <Teaser/> this section shipped with. Reads in-process with the slug as a hardcoded
// constant rather than request input — the same arrangement LiveEngineProof uses, and the same
// reason rule #2's `assertPublicAllowedSlug` isn't repeated here: that check guards the HTTP
// boundary where a slug IS attacker-controlled, and no slug crosses one here.
//
// ── Whose data a PUBLIC page is allowed to show, and why it is the SELF tenant ────────────────
// Story 3.2: "no client data on the public page, ever." So this deliberately does NOT render the
// medusa-bonsai Pod Report — that is a real client's delivery history and it stays behind auth and
// revocable share links.
//
// It reads the DEMO tenant, and the artifact stored there is computed from golden-beans' OWN
// repository — our numbers, about our own work, published on purpose. So there is no
// client-exposure question to get wrong, and "we sell what we use" is a claim this section makes by
// being an instance of it.
//
// ── Why the DEMO tenant and not the self tenant, corrected after checking production ───────────
// This first read `SELF_PROJECT_SLUG`, on the reasoning that the push workflow's credential belonged
// to the self tenant. It does not: `SELF_PROJECT_API_KEY` — despite its name — authenticates as
// `golden-beans-demo`, which is where every roadmap artifact has always landed and where the first
// pod_report landed too. The section rendered its fallback teaser in production as a result.
//
// The name was the trap, and this repo has a LEARNINGS entry for exactly it: do not infer which rail
// a credential serves from what the credential is called. Confirmed by querying which project the
// pushed artifact actually belongs to, rather than by reading the variable name a second time.
//
// ── The INVESTOR lens, on purpose ─────────────────────────────────────────────────────────────
// The narrowest lens (lib/pod-report-lens.ts): no per-criterion ladder rows, no month-by-month
// authorship. Not because a stranger cannot be trusted with them, but because a landing section is
// not a report and a wall of criteria would bury the one line that matters. The lens cannot narrow
// the honesty — the not-instrumented count and the caveats survive it by construction, which is
// exactly why this section can be short without becoming a boast.
export async function PodReportProof() {
  const section = getSection('proof')
  const report = await getPodReport(DEMO_PROJECT_SLUG, 'investor')

  // Not-yet-pushed and could-not-be-read both land here. A landing section must never be the thing
  // that 500s the homepage, and it must never invent numbers to fill the space either — so the
  // honest teaser copy stays as the fallback, and the section is still badged by its epic.
  if (!report.ok) return <PodsProofFallback epic={section.epic} />

  const { view } = report
  const lead = view.speed.find((r) => r.key === 'epic_lead_time')
  const freq = view.speed.find((r) => r.key === 'deploy_frequency')
  const verdict = view.maturity?.verdict ?? null
  const repo = view.source.repo

  return (
    <div className="proof-block">
      <div>
        <p className="kicker">Pod report</p>
        <h3 className="card-title">
          Your dev team, as a <em className="gold-em">revenue engine</em>
        </h3>
        <p className="section-copy">
          Computed, not claimed — every figure below comes from <code>{repo ?? 'this repository'}</code>
          &apos;s own git and pull-request history, measured over{' '}
          <b className="data">{view.source.windowDays ?? '—'}</b> days and{' '}
          <b className="data">{view.source.commits ?? '—'}</b> commits. Nothing here is estimated, and the
          things we <em>cannot</em> measure are listed beside the things we can.
        </p>

        {/* The mockup's layout, the repo's numbers (epic D1): `.stat-grid` is the 2x2 tile
            arrangement from references/golden-beans-landing-v2.html, and what fills it is
            getPodReport's computed output rather than the mockup's hardcoded "+3.1x / -68%".
            CODE-QUALITY.md #8 — never invent numbers to fill space. */}
        <div className="stat-grid">
          {lead?.value && (
            <div className="stat">
              <b className="data">{lead.value}</b>
              <span>median epic lead time</span>
            </div>
          )}
          {freq?.value && (
            <div className="stat">
              <b className="data">{freq.value}</b>
              {/* The proxy label is part of the value, not a footnote. The computation marks this row
                  `isProxy` and the page says so where the number is. */}
              <span>deploys / week{freq.isProxy ? ' (proxy)' : ''}</span>
            </div>
          )}
          {verdict && (
            <div className="stat">
              <b className="data">
                step {verdict.step} · {verdict.stepLabel}
              </b>
              <span>on the published AI-adoption ladder</span>
            </div>
          )}
          {/* Rendered UNCONDITIONALLY beside the score, never as an afterthought. A maturity verdict
              shown without its coverage is the single most misleading thing this section could do,
              and Story 2.4's acceptance names it explicitly for exactly this lens. */}
          <div className="stat stat-gap">
            <b className="data">{(verdict?.notInstrumentedCount ?? 0) + view.notInstrumented.length}</b>
            <span>things we do not measure — and say so</span>
          </div>
        </div>

        <p className="note live-proof__footnote">
          {view.notInstrumented.length > 0 ? (
            <>
              Not instrumented here: {view.notInstrumented.map((row) => row.label.toLowerCase()).join(' · ')}.
              Each gap names the guardrail that would close it — which is most of what a pods engagement
              installs.
            </>
          ) : (
            <>Every gap this report can declare is declared inside the artifact itself.</>
          )}
        </p>

        <p className="section-status">
          <Badge status="live">COMPUTED · {section.epic}</Badge>
        </p>
      </div>
    </div>
  )
}

/**
 * The honest empty state for a public page.
 *
 * Deliberately keeps the teaser's shape and drops its stale claim: the original copy promised
 * "agent-augmented vs human-baseline", a comparison the 2026-07-25 amendment established cannot be
 * computed from this dataset and must not be advertised. Copy that outlives the decision that
 * retired it is how a landing page starts lying by omission.
 */
function PodsProofFallback({ epic }: { epic: string }) {
  return (
    <div className="proof-block">
      <div className="teaser">
        <div className="teaser__copy">
          <h3 className="card-title">
            Your dev team, as a <em className="gold-em">revenue engine</em>
          </h3>
          <p>
            The Pod Report — cycle and lead time, the DORA measures that are actually derivable, and an
            auditable position on the published AI-adoption ladder, computed from a real repository&apos;s own
            history and read against published benchmarks. Computed, not claimed: which is exactly why there
            are no numbers here until one is pushed.
          </p>
        </div>
        <Badge status="next">LIGHTS UP · {epic}</Badge>
      </div>
    </div>
  )
}
