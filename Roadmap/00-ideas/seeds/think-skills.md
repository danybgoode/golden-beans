---
title: "Think skills: PMF Narrative → North Star → Deliberate Risk Validation as real, chained skills"
slug: think-skills
status: raw
area: "09"
type: feature
priority: "audit-wave-B"
appetite: M
underwritten_by: null
risk: low
epic: null
build_order: 53
updated: 2026-09-23
---

# Seed: Think skills: PMF Narrative → North Star → Deliberate Risk Validation as real, chained skills

**Portfolio-pass seed** (not yet deep-groomed). Seed 5 of the unification audit, [§5](https://github.com/danybgoode/golden-beans/blob/main/Roadmap/00-ideas/audits/golden-frijoles-unification-2026-09-23.md).
Home repo: **dobby-foundation (→ golden-frijoles/skills)**. Class **feature**, appetite **M** (from the audit, to confirm at grooming). Audit wave **B**.
**Depends on:** Seed 1 (ships in the golden-frijoles plugin).

## Problem

The three pre-planning coaches (`references/pmf_narrative_facilitator.md`, `northstarworkshop.md`, `deliberateriskvalidation.md`) are chat prompts with a fenced YAML header that no loader reads, **uncommitted** in this repo (`?? references/`), with no output contract. groom can't read what they produce.

## Sketch (from the audit; grooming will cut or reshape it)

- Commit + convert each into a SKILL.md with frontmatter.
- Output contracts under `Roadmap/00-strategy/` (`pmf-narrative.md`, `north-star.md`, `risk-validation.md`, with frontmatter).
- Each offers the next, and groom reads them at orientation ("does this seed test the riskiest dimension?").
- `gf north-star set` (golden-beans CLI) pushes the workshop's metric to the engine; `/northstar-self-serve.md` and the skill render from one source.

## Open questions for the deep groom

- Is the Amplitude North Star Playbook PDF in `references/` redistributable? (Probably not in a public repo.)
