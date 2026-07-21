---
title: "Golden Beans project rules and poster hardening"
slug: project-rules-and-poster-hardening
status: shipped
area: "09"
type: chore
priority: "#1a"
risk: low
epic: null
build_order: "#1a"
updated: 2026-07-20
---

# Seed — Golden Beans project rules and poster hardening

Close the foundation-template drift before the next high-risk platform epic. `AGENTS.md` still has no real
product/architecture statement or non-negotiable rules; `Roadmap/README.md` still carries template title,
mission and license markers; `Roadmap/WAYS-OF-WORKING.md` still has unfilled locale/tooling/deploy guidance;
and root `README.md` says the Growth Engine build has not started even though v1 is shipped and live. Replace
only verified placeholders, define canonical ownership for events/identity/destinations/credentials, document
the actual Vercel + Supabase rail and test commands, and add a grep-to-zero guard for load-bearing template
markers. Keep instructional mentions of the phrase only where the guard itself is explained.

This is a small Chore/Maintainer pass, not a brand or architecture redesign. It should land before
`event-destination-router` so builders do not make high-risk schema/auth decisions against an empty rules file.
Also correct the shared kickoff-generation assumption exposed while scaffolding the router: Golden Beans
kickoffs must read this repo's root `AGENTS.md`, not `apps/miyagisanchez/AGENTS.md`. Land that reusable fix in
the versioned `ways-of-work` plugin and verify it against both a Golden Beans and a Miyagi epic.

---

## Outcome (2026-07-20)

Landed on branch `chore/project-rules-and-poster-hardening`:

- **Filled every load-bearing placeholder** — `AGENTS.md` (product/architecture header, repo layout,
  context-routing table, quick-reference commands, env vars, key imports; the five cannot-be-violated
  rules already existed from commercial-shell), `Roadmap/README.md` (title, mission, license, cleaned
  template comments), `Roadmap/WAYS-OF-WORKING.md` (English-only app-copy locale policy + the real
  CLI-access tooling table), and the root `README.md` (stale "Growth Engine not started" → the two
  shipped epics + live URL).
- **Grep-to-zero guard** — `scripts/check-template-drift.mjs` (`npm run check:template-drift`), matching
  the placeholder *syntax* so prose mentions that explain the guard are allowed. Wired into `ci.yml`'s
  `typecheck-build` job (zero-dep, pre-install) and the advisory `.githooks/pre-push`.
- **Plugin kickoff fix — VALIDATED already landed upstream, not rebuilt.** The seed's caveat held:
  `dobby-foundation` commit `f6a7b95` (PR #5, "fix stale Miyagi-only kickoff text") already replaced the
  hardcoded `apps/miyagisanchez/AGENTS.md` with the generic root-relative `AGENTS.md` in both the groom
  SKILL SSOT and the new `templates/kickoff.md` + `emit-kickoff.mjs` generator. **Remaining gap is local
  only:** the *installed* marketplace/cache copy on this machine is stale at `b13ae84` (pre-fix) — refresh
  it via Claude Code's `/plugin` update, a machine-global action for Daniel (not manual cache surgery).
