---
title: "Git & Releases — a PM-legible picture of what the agent shipped, with no git operations"
slug: git-and-releases-legibility
status: raw
area: "02"
type: feature
priority: null
appetite: null
underwritten_by: null
risk: low
epic: null
build_order: null
updated: 2026-08-05
---

# Seed — Git & Releases, the Graphite-informed panel

**Raw. Not shaped.** P2 — the newest ground in the audit, and the least validated.

**Source:** `Roadmap/00-ideas/audits/app-ux-audit-2026-08-01.md` §5, §6.6, §7 (P2), §8.

## The idea in one paragraph

Graphite's transferable lesson is not its plumbing — it is the *translation instinct*: take a
genuinely confusing structure and render it as a clean, linear, status-at-a-glance picture. A
developer asks "is my stack mergeable." A PM should be able to ask something smaller and get an
equally clear answer: **"what did my agent just ship, in what order, and is any of it still waiting
on something."**

## Shape it would take

A linear timeline of merged/pending changes the agent made on the PM's behalf — each with an
AI-generated one-line plain-language summary (not the diff), each tagged live/pending, each traceable
back to the flag, experiment or scenario it belongs to.

## Hard boundary

**No git operations are exposed.** No rebase, no branch management, no stacking commands. That stays
the engineer's and the agent's job. The audit is explicit that the goal is not to teach PMs git.

## Open question this seed inherits

**Git storage: Gitea vs GitHub vs both** (audit §8). The audit recommends deferring, and the
reasoning holds: the UI need is identical either way, so solving legibility first means the storage
decision never blocks the design. Do not let this seed become the venue for an infrastructure
decision it does not need to make.

## Least validated of the audit's proposals

Unlike the P1 seeds, this one has no existing backend to surface — it is net-new data plumbing plus
net-new UI, and the persona evidence for it is a single line in the brief ("PMs and git usually don't
get along"). Worth a discovery pass before it is bet.
