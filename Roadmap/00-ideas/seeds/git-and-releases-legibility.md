---
title: "Git & Releases — a PM-legible picture of what the agent shipped (discovery spike)"
slug: git-and-releases-legibility
status: ready
area: "02"
type: spike
priority: null
appetite: S
underwritten_by: null
risk: low
epic: null
build_order: 17
updated: 2026-08-08
---

# Spike brief — is there a PM problem here at all?

> **Class:** Spike (discovery) · **Lane:** shaped bet · **Appetite:** S
> **Source:** `Roadmap/00-ideas/audits/app-ux-audit-2026-08-01.md` §5, §6.6, §7 (P2), §8.
> **Reclassified from `feature` to `spike` on 2026-08-08**, and **not underwritten.** The raw seed
> said it plainly: *"the least validated of the audit's proposals... worth a discovery pass before
> it is bet."* This is that discovery pass, shaped so it can be picked up when it earns a wave.

## The question this spike answers

> **Does a PM actually want this, and if so, what is the smallest thing that satisfies the want —
> given that `app-shell-and-agent-rail` may already have shipped most of it?**

Two sub-questions, in this order:

1. **Is the want real?** The persona evidence is currently *one line in the brief* — "PMs and git
   usually don't get along." That is a hypothesis, not a finding. Every other seed in this wave
   traces to an observed gap between a promise and a screen; this one traces to an intuition.
2. **Is it already answered?** The shipped agent rail renders agent activity from `audit_log` and
   pending proposals from `task_write_confirmations`. "What did my agent just do" now **has** a
   surface. The honest first move is to check whether "what did my agent just *ship*" is a genuinely
   different question to a PM, or the same question with a different noun.

If the answer to (2) is "same question," this seed should be **archived**, and that is a good
outcome for a one-session spike.

## Why it is P2 and last in the sequence

Unlike #13, #15 and #16 — each of which surfaces an existing, validated backend — this one is
**net-new data plumbing plus net-new UI**. There is no `lib/` seam to render. It is the only item in
the funnel that would have to build its data source before it could build its screen, and it is the
only one whose user need has not been observed. Those two facts together are why it sorts last and
why it is not underwritten.

## Appetite

**S — one session.** Discovery, not build. If the session ends with "the want is real and here is
the smallest shape," that shape gets shaped properly and bet separately. If it ends with "archive
it," the session paid for itself.

## The idea, as the audit framed it

Graphite's transferable lesson is not its plumbing — it is the *translation instinct*: take a
genuinely confusing structure and render it as a clean, linear, status-at-a-glance picture. A
developer asks "is my stack mergeable." A PM should be able to ask something smaller and get an
equally clear answer: **"what did my agent just ship, in what order, and is any of it still waiting
on something."**

The shape it would take: a linear timeline of merged/pending changes the agent made on the PM's
behalf — each with a one-line plain-language summary (not the diff), each tagged live/pending, each
traceable back to the flag, experiment or scenario it belongs to.

## Hard boundary (survives any outcome)

**No git operations are exposed.** No rebase, no branch management, no stacking commands. That stays
the engineer's and the agent's job. The audit is explicit that the goal is not to teach PMs git, and
this boundary is not a v1 scope decision — it is the shape of the idea.

## The open question this seed must NOT answer

**Git storage: Gitea vs GitHub vs both** (audit §8). The audit recommends deferring and the
reasoning holds: the UI need is identical either way, so solving legibility first means the storage
decision never blocks the design. **Do not let this spike become the venue for an infrastructure
decision it does not need to make.** If the session drifts there, that is the circuit breaker.

## What the spike must produce

A written finding in this file covering:

1. **Overlap verdict** — read `components/product/AgentRail.tsx` and `CommandCenter.tsx` as they
   shipped, then state whether "what shipped" is a distinct question from "what the agent did." Cite
   the components, not the plan.
2. **The want, evidenced or not** — whatever real signal exists. A PM conversation, a support
   question, an observed workaround. **"No evidence found" is a valid and valuable finding**; write
   it plainly rather than reasoning toward the feature.
3. **If real: the smallest shape**, and specifically whether it is a *new surface* or an *additional
   lane on the existing rail*. The second is dramatically cheaper and is the likely answer.
4. **The data source question** — where a plain-language "what shipped" summary would come from, and
   whether any of it can be derived from `audit_log` (which the rail already reads) rather than from
   a git host. This is the fact that decides whether a follow-on epic is S, M or L.
5. **A recommendation:** shape it · fold it into the rail · archive it.

## What already exists (check these first — this IS the spike's first hour)

*Verified present on live `main`, 2026-08-08.*

| Thing | Where | Why it matters here |
|---|---|---|
| The agent activity rail | `components/product/AgentRail.tsx`, `RailDisclosure.tsx` | Already answers "what did my agent do." The overlap verdict starts here |
| The front door | `components/product/CommandCenter.tsx` | Already answers "did anything need me today" |
| The activity read seam | `lib/agent-activity.ts` over `audit_log`, indexed `(project_id, created_at DESC)` | If "what shipped" is derivable from here, the follow-on is cheap. If not, it is expensive |
| Pending proposals | `task_write_confirmations` + `consume_write_confirmation` | The "still waiting on something" half may already exist |
| Agent-vs-human attribution | `metadata.via === 'connector'` on the audit row | The provenance a "what did *my agent* ship" view needs |
| Gate | `AGENT_RAIL_ENABLED` | Any rail addition rides this, rather than adding a fourteenth gate |
| Specs | `e2e/agent-activity.spec.ts`, `agent-rail.authed.spec.ts`, `agent-rail-dark.spec.ts`, `command-center.authed.spec.ts` | The precedent for how a rail addition gets tested |

## Out of scope for the spike

- No branch, no build, no schema.
- No Gitea/GitHub evaluation, installation, or cost comparison.
- No design mockups beyond a sketch sufficient to state the recommendation.

## Open risks

- **Risk: confirmation bias.** The audit proposed it, so a spike can easily find reasons to build
  it. The honest counterweight: the spike is *allowed to recommend archive*, and the person running
  it should say up front which outcome would surprise them.
- **Risk: it competes with better-evidenced work.** It sits at #17 behind four items that each trace
  to an observed gap. That ordering is the finding, and it should not be reordered without new
  evidence about the want.
