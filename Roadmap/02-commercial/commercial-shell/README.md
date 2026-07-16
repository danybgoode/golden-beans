---
status: in-progress   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: commercial-shell
---

# Epic: Commercial shell — Golden Beans landing, waitlist, connector install page

> **Area:** 02-commercial · **Risk:** high · **Scope seed:** [`00-ideas/seeds/commercial-shell.md`](../../00-ideas/seeds/commercial-shell.md) · **Archetype:** Grower

## Why
Golden Beans has a shipped, live engine (growth-engine-v1) and no public face. This epic stands up
the launch-ready landing built backwards from the end-state vision — the productized offer per
persona, with the tokenized **MCP connector ("Add to Claude")** as the headline operate route, a
waitlist for hand-provisioned pilots, and the **backfill contract** wired in so every later epic
lights up its landing section. Success is a grower signal (waitlist conversions, connector
installs, demo engagement), measured by the engine itself.

## Design & content sources (inspiration, never signed-off scope)
- `references/landing-end-state.md` — section map, tagged by lighting-up epic
- `references/landing-end-state-mock.html` — layout skeleton
- `references/design-direction.md` — brand world (roastery), agent-window frame device, materials,
  voice, guardrails (2026-07-14, from Daniel's PostHog references)
- `references/design/` — **Claude Design export (pending, Daniel, ~2026-07-15):** high-fidelity
  landing design + brand system produced in Claude Design from the direction doc. **When present,
  it supersedes the mock's skin** (the mock stays the layout/section skeleton; end-state spec stays
  the content SSOT). Builders: check for this folder at sprint kickoff; if absent, build from the
  direction doc + mock as before.

## Platform-primitives note (the Medusa-first slot, gb edition)
Everything public reads existing engine primitives — tenant-scoped ingest, registry, TARS/North
Star/A-B views — against a **synthetic demo project**. No new data domains; the only new
primitives are the waitlist table and the read-only MCP route (per-project token in path).

## What already exists (reuse, don't rebuild)
- `apps/web/app/{funnel,impact,experiments}` — live-proof panels render these, framed per design direction
- S1.1 tenant-scoped ingest + per-project credentials — demo project seeding, connector token shape
- `packages/sdk` — the landing dogfoods itself (story 3.1)
- mb `seller-agent-connect-mcp-url` (ON in prod) — tokenized-URL + "Add to Claude" deep-link pattern lift
- mb `catalog-management` staged propose→confirm→apply — the shape for any FUTURE write tool (v1 is read-only)
- PostHog product audit (SCOPE.md, verified 2026-07-11) — primitives-grid honesty + positioning
- mb `frontend-design` skill — heuristics rail for S2.3

## Scope — stories
| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 Public landing shell + brand v1 | LOW |
| 1 | 1.2 Live-proof section on a synthetic demo project | LOW |
| 1 | 1.3 Waitlist (rate-limited, honeypot) | LOW |
| 1 | 1.4 Backfill contract wiring (DoD line + section↔epic registry) | LOW |
| 2 | 2.1 Read-only MCP connector v1 (ships dark) | **HIGH — Daniel merges** |
| 2 | 2.2 Install page (copy-URL + Add-to-Claude deep-link + npx docs) | LOW |
| 2 | 2.3 Design-direction polish pass + heuristics checklist | LOW |
| 3 | 3.1 Dogfood instrumentation (engine tracks its own landing) | LOW |
| 3 | 3.2 SEO/OG + agent-readable manifest | LOW |
| 3 | 3.3 Launch checklist: domain decision + connector flag flip | **HIGH — Daniel merges/flips** |

## Kill-switch (decided at grooming, Stage 6b)
Connector = enablement gate: `CONNECTOR_ENABLED` env check at the MCP route (**ships dark/OFF**,
flipped at 3.3) + per-project revocable tokens as the instant fine-grained kill. Landing/waitlist:
carve-out (public marketing, no money/auth seam; rollback = revert on `main`).

## Deploy order
Single repo, Vercel rail (per-PR previews). Demo-project seed (1.2) must land before the
live-proof section renders non-empty — same-PR ordering, no cross-repo dependency. Miyagi is
untouched by this epic.

## Definition of Done (epic)
- [ ] All sprints merged to `main` + smoke-tested (gaps stated)
- [ ] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [ ] This README marked ✅; every sprint status ticked with commit refs
- [ ] `RETROSPECTIVE.md` written
- [ ] Product poster (`Roadmap/README.md`) updated
- [ ] **Landing backfill check** (WAYS-OF-WORKING, adopted 2026-07-14): section badges match shipped reality
- [ ] Team memory updated (if kept)
- [ ] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [ ] **Kill-switch:** `CONNECTOR_ENABLED` exists with stated polarity (enablement, born OFF) + token revocation verified. *Verify-only — decided at grooming.*
- [ ] Feature branch deleted; **this README's frontmatter `status: shipped`** (run `node scripts/build-order.mjs`)
