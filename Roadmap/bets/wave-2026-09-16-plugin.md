# Wave 2026-09-16 — the operating system gets a diet, and flags get one provider

The product owner arrived with four asks across three repos: optimize ceremony and close the gap to
the AI-adoption steps we defined; make Golden Frijoles the mandatory flag provider (which requires
building it a CLI it doesn't have); audit the plugin and extract what has matured in
`medusa-bonsai`; and build a CLI build-view on Claude Mods. Findings:
[`00-ideas/audits/ways-of-work-audit-2026-09-16.md`](../00-ideas/audits/ways-of-work-audit-2026-09-16.md).

| Bet | Appetite | Displaced (the opportunity cost) |
|---|---|---|
| **#3 [Ways-of-work lean pass](../09-platform-infra/ways-of-work-lean-pass/README.md)** — permissions + auto mode, the review collapse, the ceremony diet | **L** (multi-wave, re-bet per wave) | Product work in every repo for the duration. This is a bet on throughput, paid for by not shipping features this wave |
| **#4 [Plugin audit + medusa extraction](../09-platform-infra/plugin-audit-and-extraction/README.md)** — pay or delete the dark-skill debt, port the stranded rails | **L** (multi-wave) | Stacks behind #3, so it also displaces whatever #3 displaces. Its Sprint 3 is the first thing to drop |
| **#5 [Golden Frijoles is the flag provider](../09-platform-infra/golden-flags-by-default/README.md)** — the mandate, the preflight, the template's own wiring | **M** (one wave) | Blocked on the CLI epic; nothing else competes for the same slot |
| **#6 [The build view](../09-platform-infra/build-visualization-claude-mods/README.md)** — the frontmatter contract + a Claude Mod | **M** (one wave) | Last in the stack. If the wave runs long, this is the honest thing to re-bet |

The `golden-beans` half of this wave — **Golden Frijoles CLI v1** — is recorded in this Roadmap's
[`bets/wave-2026-09-16.md`](wave-2026-09-16.md) (moved here with the plugin Roadmap, 2026-09-28).

**Decisions of record.**

- **Underwritten by the product owner's 2026-09-16 approval** of all four seeds plus the audit. The
  seeds and the epic frontmatter point here.
- **The training wheels are not the guardrails.** What comes off is the manual re-implementation of
  things the platform now does, and the ceremony a Step-2/3 operation has outgrown. The risk tiers,
  the kill-switch doctrine, the escalate-don't-guess triggers and the money/auth merge rule all stay.
- **Review: one cross-family pass + one fresh reviewer, every PR.** Not the managed Code Review
  service — no plan change, explicitly declined. Today LOW = 2 external + 0 fresh and HIGH = 2
  external + 1 fresh; after, it is **1 + 1 everywhere**. A reduction on HIGH, a re-composition on
  LOW, with family independence and context independence each covered exactly once.
- **The consuming `WAYS-OF-WORKING.md` copies are REGENERATED, not hand-merged.** `TEMPLATE FILL-IN`
  markers become named slots, each project commits a `fill-ins.yml`, and drift detection is what
  makes it stick. This is the most likely place the lean pass quietly loses content, and it is
  called out in the epic rather than discovered.
- **A dark skill is deleted, not carried.** Four of ten advertised skills have never had a script.
  Deleting them from the marketplace is an honest outcome; shipping them is not.
- **The frontmatter contract is the epic; the mod is the last sprint.** Function hooks are
  pre-release, so the build-view epic is deliberately structured to pay in full without them.
- **#3 and #4 stack; they do not run in parallel.** Both edit `SKILL.md` files and `template/`.
  Sprints in one epic share hot files by construction — stack or pay.

---

## Amendment — 2026-09-17: the wave moved home, and one bet was rescoped

- **The foundation epics now live here**, not in a consumer's funnel. `dobby-foundation` is a
  standalone product that is distributed, never a byproduct of `medusa-bonsai`. S1.1 of the lean pass
  gave this repo its own `Roadmap/`; `plugin-audit-and-extraction`, `build-visualization-claude-mods`
  and the new `golden-flags-by-default` followed it. Each consuming repo keeps a pointer README as its
  own board's status SSOT.
- **`flag-provider-mandate` was split.** It bundled two jobs: making the distributable template carry
  Golden (here, as `golden-flags-by-default`) and finishing Miyagi's own cutover (stays in
  `medusa-bonsai`). A product you distribute should not carry one consumer's migration.
- **That bet was also rescoped on evidence.** It was written as "build a cutover"; the cutover is
  already built and production runs on it. The real defect is that flags were never *activated* in
  Golden — 39 of 42 read "Never turned on here", so the runtime served compile defaults through a
  fallback chain while the console showed Golden. Smaller, and different.
- **`plugin-audit-and-extraction` shrank.** The lean pass already ported `pr-reviewer.md`, resolved
  `live-smoke`'s debt by honest reclassification, and shipped `epic-dod`/`render-ways-of-working`/
  `permissions-smoke`. What is left: the three reporting skills, the seven routine prompts, the hook
  budget wiring, four script ports, and housekeeping. **Re-bet it down before slicing.**

## Outcome

- **#5 — SHIPPED 2026-09-19**, within its M appetite (one wave, one sprint, one PR: #24). The epic was
  **renamed** mid-wave from `flag-provider-mandate` to
  [`golden-flags-by-default`](../09-platform-infra/golden-flags-by-default/README.md), and the row above
  was pointing at the dead slug until this line was written. The rename split a bundled bet in two: making
  the distributable template carry Golden (shipped here) and finishing one consumer's own cutover (moved
  to `medusa-bonsai`, where it belongs — a product you distribute should not carry one consumer's
  migration). The `golden-beans` half it was blocked on, **Golden Frijoles CLI v1**, closed 2026-09-18.
