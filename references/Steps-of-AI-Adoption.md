# Steps of AI Adoption

**Boris Cherny · Jul 16, 2026**

> **Provenance note.** Upstream (medusa-bonsai) this file previously held a mangled PDF table
> extraction **truncated mid-step-2** — steps 3 and 4 missing entirely — and an assessment written
> against it on 2026-07-17 had to be re-benchmarked on 2026-07-19. This is the complete, clean text.
>
> **Copied into golden-beans 2026-07-20**, replacing this repo's own lossier `StepsofAIAdoption.txt`
> (5,831 B flat extraction, which collapsed the source table's bottleneck/products/**guardrails**
> column semantics and dropped step 4's guardrail labels). E3 `pod-report` Story 2.4 scores
> **against those named criteria columns**, so the structured version is the source of truth — the
> flat one was deleted, not kept alongside. See
> [`Roadmap/00-ideas/seeds/ai-adoption-maturity-lens.md`](../Roadmap/00-ideas/seeds/ai-adoption-maturity-lens.md).

Each step lists: **your role · agents in flight · what it looks like · the bottleneck · products
that help · guardrails**, then how to get to the next step.

---

## Step 0 — Gated

**Agents: 0**

Only older or lighter/faster models are approved, latency compounds through AI gateways and custom
auth, no MCP governance, internal access to AI tools is gated or process-heavy.

No IT infra or approval path for hosting Claude-created code or artifacts; outputs only exist
locally.

**Bottleneck:** legacy security and approval processes, focus on cost-per-token containment vs.
outcomes, lack of true technical voices in decision-making.

**Products:** Claude.ai chat

**Guardrails:** SSO/SCIM plus role-based access · org-level budget caps · deploy inside existing
approvals/IAM · data governance package

> **0 → 1:** Executive/buyer alignment and escalation of blockers; frameworks for launching Claude
> securely.

---

## Step 1 — Assisted

**Your role: you + an agent (a pair) · Agents: ~1**

One engineer, one agent, mostly supervised — a fast pair programmer. You run one session at a time
and review almost every change before it merges.

**Unlock:** a change that used to fill an afternoon becomes something you finish between meetings.

**Bottleneck:** your attention and the need to inspect each response and code edit. Due to low trust
in the model's output and lack of self-verification, you feel you must read everything, so you never
look away. Work is synchronous: you sit and watch while Claude works, rather than moving on to the
next task.

**Products:** Claude Code in the Desktop, CLI, or IDE · Claude Cowork, Claude Design · usage via
Anthropic API, Bedrock, Vertex, or Microsoft Foundry · Claude Code analytics dashboard + Analytics
API · Compliance API for Claude Enterprise · plan mode to review intent before edits

**Guardrails:** per-seat spend caps · centrally managed model/effort settings · centrally managed
policy · OpenTelemetry export into existing SIEM/observability stack

> **1 → 2:** Run more than one agent at a time; a self-verification loop you trust (tests + build +
> lint + e2e testing with a real dev environment); auto mode, to avoid blocking permission prompts;
> automate code review.

---

## Step 2 — Parallel

**Your role: orchestrator · Agents: ~10**

One engineer orchestrates 5–10 agents at once, each on its own worktree or git checkout, jumping
between them. Claude checks its own work — tests, build, lint, security scan — before you see it.
Auto mode is always on. Automated code review and security review are on by default. Output
multiplies, you review final diffs rather than keystrokes, and your backlog of maintenance work
starts shrinking. Claude writes most of the code.

**Unlock:** a backlog that used to take the team weeks becomes one engineer's afternoon of
orchestration.

**Bottleneck:** reviewing output. You're hand-writing less code and instead checking six streams of
it, and this takes up more of your time. Prompting and steering the model as you juggle sessions.

**Products:** auto mode · agent view · Claude Code Review · Claude Security Review · Claude Code on
Mobile, cloud execution in Desktop · usage via Claude Teams or Claude Enterprise · Claude Tag (do a
single task) · worktree isolation in CLI and Desktop · remote control, so you can monitor your
agents from your phone

**Guardrails:** analytics to monitor team usage · automatic code quality enforcement (lint,
automated tests, typecheck) · Claude-powered end-to-end verification (e.g. using the Claude Chrome
extension or iOS/Android simulator MCP) · manual code review, code merge, and security review — hold
the same quality bar for human and agent-generated code · pre-approve common safe bash and MCP
commands in `settings.json`

> **2 → 3:** Give Claude a way to pull in context (let Claude read code, wikis, discussions); agency
> and code review speed (agents may touch code owned by other teams); break up your work into loops
> and routines; let Claude kick off Claude.

---

## Step 3 — Supervised autonomy

**Your role: manager of managers (an org tree) · Agents: ~100**

Claude writes all or nearly all of the code. *"Did you read the code?"* becomes *"what context was
the model missing and how do we solve it for next time?"*

**Unlock:** Claude proactively does work that you would have had to kick off manually before.
Maintenance and cleanup that used to wait for someone to find the time now runs continuously in the
background.

**Bottleneck:** trust in the loop and your team's decision throughput. The agent tree is too deep to
babysit and your trap is scaling agent count before the loop has earned widespread trust.

Ensuring tokens are used efficiently as usage increases. Requires monitoring (via OTel or Analytics)
and a culture that encourages experimentation while controlling costs once internal use cases find
PMF. Ask yourself: *is this something an engineer would have done?*

**Products:** subagents with worktree isolation (so parallel agents don't collide) · routines,
`/loop`, `/batch`, and `/goal` to fan out repetitive work · dynamic workflows · Claude Tag (have it
monitor a channel or data source and kick off tasks proactively) · automatic code review · automatic
security review · agent sandboxing

**Guardrails:** `CLAUDE.md` and Skills to encode standards · tune auto mode classifier based on your
team's usage · manage token use with model selection, advisors, LSPs, breaking up `CLAUDE.md` into
lazy Skills

> **3 → 4:** Scaled automation of domain-specific use cases (e.g. code migration, fuzzing,
> feature-building, feedback remediation).

---

## Step 4 — AI-native

**Your role: VP steering by intent · Agents: ~1,000+**

The loop is fully closed and most agents are kicked off by Claude. Hundreds to thousands of agents
run; you steer by intent and monitor by exception.

**Unlock:** the quarter-long migration becomes a workflow you kick off and check on.

**Bottleneck:** identifying and automating work at scale, and enforcing the right guardrails for
each type of work.

**Products:** Claude Agent SDK to programmatically build and schedule agents · Claude Tag (active in
most Slack channels, auto-responding to posts)

**Guardrails:** cost controls for automation · model selection for automation
