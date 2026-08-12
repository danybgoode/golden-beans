import { getSiteUrl } from '@/lib/site-url'
import { handoffPrompt } from '@/lib/landing-prompts'
import { CopyPromptCard } from './CopyPromptCard'

// landing-redesign-v2 · Sprint 2, Story 2.2 — "try it before you connect anything."
//
// The most unusual section on the page and the one with the clearest job: give a reader something
// genuinely useful before asking for anything at all. The prompt sends their own agent to two
// public routes — /llms.txt and /northstar-self-serve.md — neither of which needs an account, a
// tenant, or the connector. If they never come back, they still got a North Star workshop out of
// it, which is a better outcome than a bounce and an honest reason to trust the rest of the page.
//
// The URL comes from getSiteUrl() rather than a literal (AGENTS.md rule #5). That is what lets
// e2e/landing-prompts.spec.ts fetch every route the prompt names against the run's own base URL —
// a hardcoded production hostname would make the CTA untestable everywhere it is not production,
// which is everywhere it gets reviewed.
export function TryItSection() {
  const prompt = handoffPrompt(getSiteUrl())

  return (
    <section className="band section-tight" id="try">
      <div className="wrap row2 row2--center">
        <div>
          <p className="panel-label">Try it before you connect anything</p>
          <h2 className="section-title">Give your agent one Golden Bean.</h2>
          <p className="measure measure--narrow">
            Copy this into ChatGPT, Claude, or the agent you already use. It reads the public Golden Beans
            guide, explains what it can do, then offers to run the North Star workshop with you.
          </p>
          <p className="takeaway">No account. No MCP. No tiny onboarding hostage situation.</p>
          <p className="note section-lead">
            When you want the work to persist — or your agent to use live product context — that&apos;s when
            you connect Golden Beans.
          </p>
        </div>
        <CopyPromptCard label="Handoff prompt · public routes" prompt={prompt} />
      </div>
    </section>
  )
}
