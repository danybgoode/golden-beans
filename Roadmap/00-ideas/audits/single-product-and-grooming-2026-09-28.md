# Audit: one product, one repo, and what strangers actually get (2026-09-26 → 2026-09-28)

**Scope:** the product owner's brief of 2026-09-26 — clarify the architecture and the repo/name taxonomy after the
unification audit, make Golden Frijoles one product (repos and local folders renamed), check what the public plugin
really delivers (Jev guards, Telegram, routines), and evaluate four asks: Jev for linters, DSPy + Jev replacing the
mechanical kickoff prompts, an intent ↔ understanding confidence score with follow-up routing and schema-driven
prototypes, and recalibrating the "one deep ask per run" rule. Read against `golden-beans` and `dobby-foundation`
(`golden-frijoles/skills`) as of 2026-09-26. Input to grooming; no code written. The working document the product owner
reviewed is a Claude Docs page ("Golden Frijoles — current state, single-product plan and grooming evaluation"); this
file is the durable record.

---

## 0. The verdict

1. **Golden Frijoles is already one product in four layers** — plugin `golden-frijoles`, kit `@golden-frijoles/kit`,
   CLI/SDK `@golden-frijoles/{cli,sdk}`, engine at goldenfrijoles.com. It *feels* like two because it has two repos,
   **two Roadmaps** (this one: 37 seeds, 30 epics; dobby-foundation: 12 seeds, 6 epics) and four legacy names in use
   (Golden Beans, `golden-beans`, `dobby-foundation`, `ways-of-work`). `think-skills` was seeded in dobby-foundation
   because unification-audit D2 made that the public skills repo — correct by the decision, wrong for one planning home.
2. **Both repos are public today**, including this one (created 2026-07-14, no LICENSE file; `packages/cli` says
   `UNLICENSED`). D8's "engine stays proprietary" is currently only copyright's default.
3. **The public plugin delivers much less than our own projects run.** The kit is built from each skill's
   `requires_scripts`; several rails live in `template/scripts/` but in no skill's list. A plugin-only user gets:
   - no **Jev review guard** (`review-guard.mjs`, `cross-review.mjs`, `review-route.mjs` aren't in the kit);
   - a **Jev prose guard that is always off**: with no `jev.config.json` every rail defaults to `off`, and
     `effectiveMode()` returns before the `egress: null` branch, so the registry's `jev.egress` question never fires.
     Nothing tells anyone to get a `TYPESAFE_API_KEY`;
   - **Telegram** only if they bring a bot: "export `TELEGRAM_BOT_TOKEN`" is the whole guide, the skill says to copy
     `reporting.config.example.json` (not shipped by the kit), and the setup question offers Slack, whose only sender
     is this repo's `notification-rails` code;
   - **no routines** (the seven prompts are `template/`-only). Routines are only a scheduler: every report skill runs on
     demand, and the scripts under them need no Claude cloud. No non-Claude scheduler ships;
   - a **silent build view** (`scripts/build-state.mjs` isn't in the kit);
   - a **kickoff whose review step stops**: `emit-epic-kickoff.mjs` tells the builder to run `node scripts/review-route.mjs`.
4. **Jev for linters** fits as a second stage behind deterministic checks (raise-only), not a replacement.
5. **DSPy 3.4.0 (2026-09-25) added Jev-backed `Noul`/`Choice`/`Score` output types and the `ReAnchor` optimizer.**
   Compile the kickoff and the build/QA prompts from measured parts; don't optimize a kickoff end to end (one
   evaluation = one epic build). "DSPy compiles, the kit runs": a Python `optimize/` workspace writes versioned JSON the
   zero-dependency kit reads.
6. **Intent ↔ understanding** gets a 0–100 "intent match" score from four signals — coverage both ways, ambiguity left,
   **divergence of three independent readings**, the product owner's teach-back — and each gap is routed to one
   artifact. Advisory until calibrated on ~20 epics' "did we build what you meant?" outcomes.
7. **Schema-driven sketches reverse what `apps/web/design-system/state-contract*.mjs` already does**: instead of
   extracting a block signature from approved prototype HTML, the approved spec renders the wireframe *and* is the
   build contract.
8. **The session rule becomes "one deep ask per approval gate"** plus a measured budget line; the binding constraint is
   now the product owner's decision bandwidth, not model stamina.

---

## 1. Actions minutes, measured (the public/private question)

GitHub API, every run 2026-09-01 → 2026-09-28:

| Repo | Runs | Linux minutes / 30 days | Biggest job |
|---|---|---|---|
| golden-beans | 1,355 | ≈ 2,670 | CI "Playwright vs local Supabase + local server": 1,175 min in 26 days, 5.7 min/run |
| golden-frijoles/skills | 192 (09-16 → 09-27) | ≈ 610 | CI |

Private would cost ≈ $2/month on Pro or ≈ $8 on Free in minutes (2,000 / 3,000 included, $0.006/min Linux 2-core),
and CI **stops at the quota** with no card on file. The larger cost: CodeQL and secret scanning/push protection are free
only on public repos; private needs GitHub Code Security / Secret Protection (Team plan+, per-committer). Self-hosted
runners are free today; the announced $0.002/min platform fee is postponed, not cancelled.

---

## 2. Decisions of record — approved by Daniel, 2026-09-28 08:36 (America/Mexico_City)

"All approved as recommended."

- **E1 — Repo strategy:** one **public** monorepo with per-folder licences, one Roadmap, a small **private** repo for
  business-sensitive docs (client specifics, pricing bets, Mutiny strategy, audits naming customers), and CI that
  publishes the plugin and kit to `golden-frijoles/skills` as a lean install mirror (install prompt unchanged).
  Supersedes the working doc's earlier "private monorepo + public mirror" (revised 2026-09-28 after measuring §1).
- **E2 — Names:** monorepo `golden-frijoles/golden-frijoles`; local folder `~/dobby/golden-frijoles`;
  `~/dobby/dobby-foundation` archived after the first mirrored release installs cleanly. Addresses do **not** move in
  this pass (Vercel/Supabase projects, `golden-beans-gamma.vercel.app`, tenant slugs, `golden-beans-connector`,
  `GOLDEN_BEANS_*`, `golden_beans.webhook.test` — rebrand close-out A3/A4/A6).
- **E3 — What becomes public in the kit:** the review rail, the routine prompts and `build-state.mjs`.
- **E4 — Notifications:** bring-your-own bot now, with a guided setup; a hosted "Connect Telegram" is a later account
  feature.
- **E5 — DSPy:** allowed as a dev-time Python dependency in `optimize/` only; the kit stays zero-dependency.
- **E6 — Intent match:** advisory for the first 20 epics; thresholds decided with data.
- **E7 — Session rule:** "one deep ask per approval gate", plus the measured session-budget line.
- **E8 — Engine licence:** FSL-1.1 for `apps/web` and `supabase/` (each version converts to Apache-2.0 after two
  years); Apache-2.0 for plugin, kit, CLI, SDK. To be confirmed with a lawyer before the LICENSE files land.

---

## 3. Sequence (seeds written alongside this audit)

| build_order | Seed | Class · appetite · risk | Depends on |
|---|---|---|---|
| 37 | [`one-roadmap`](../seeds/one-roadmap.md) | Chore · S · low | E1 |
| 38 | [`jev-reanchor-thresholds`](../seeds/jev-reanchor-thresholds.md) | Spike · S · low | E5 |
| 39 | [`public-monorepo`](../seeds/public-monorepo.md) | Feature · M · high | E1, E2, E8 |
| 40 | [`distribute-what-we-use`](../seeds/distribute-what-we-use.md) | Feature · M · high | 39, dobby-foundation seed `review-rail-one-implementation`, E3, E4 |
| 41 | [`intent-match`](../seeds/intent-match.md) | Feature · M · low | E6 |
| 42 | [`semantic-lint`](../seeds/semantic-lint.md) | Feature · S · low | 38 |
| 43 | [`session-budget`](../seeds/session-budget.md) | Chore · S · low | E7, 40 |
| 44 | [`compiled-prompts`](../seeds/compiled-prompts.md) | Feature · L · low | 38, 39 |
| 45 | [`sketch-specs`](../seeds/sketch-specs.md) | Feature · L · low | 41 |

`think-skills` stays in dobby-foundation's funnel until `one-roadmap` moves it; it becomes intent-match's
"is it worth doing?" route. Items 37 and 38 are small and independent; 39 is the one to deep-groom first, because every
later item's file paths depend on it.

---

## Sources

- DSPy 3.4.0 release notes: https://github.com/stanfordnlp/dspy/releases/tag/3.4.0
- DSPy ♥ Jev (signature syntax, ReAnchor limits): https://stacktoheap.com/blog/2026/09/25/dspy-heart-jev/
- DSPy PR #10463 (experimental decision types): https://github.com/stanfordnlp/dspy/pull/10463
- TypeSafe Jev docs: https://docs.typesafe.ai
- GitHub Actions billing: https://docs.github.com/billing/managing-billing-for-github-actions/about-billing-for-github-actions
- GitHub Actions 2026 pricing changes: https://github.com/resources/insights/2026-pricing-changes-for-github-actions
- GitHub Advanced Security (public vs private): https://docs.github.com/en/get-started/learning-about-github/about-github-advanced-security
