---
title: "E1 — Commercial shell: Golden Beans landing, waitlist, connector install page"
slug: commercial-shell
status: ready
area: "02"
type: feature
priority: "#1"
risk: high
epic: null
build_order: "#1"
updated: 2026-07-14
---

# Scope — E1 Commercial shell (landing-first, backfill-forward)

## Mirror-back
> Plan golden-beans top-down from the **end user and end product**: define the final landing page
> (the productized offer, per persona), stand up a **launch-ready v1 quickly from the already-shipped
> S1–S4 features**, and bake a **backfill contract** into the roadmap so every future epic lights up
> its landing section — working backwards from the end vision instead of forward from internals.
> Groomed single-session per Daniel's ways-of-work update (Fable; precedent:
> medusa-bonsai `batch-groom-2026-07-14`).

## Classification
**Feature / Grower** — acceptance ties to a success signal (waitlist signups, connector installs,
demo engagement — measured by the engine itself, dogfooded), not just "renders."

## Stage-2.5 bucket: genuinely new, with heavy reuse
No public surface exists today (`apps/web` serves the internal funnel/impact/experiments pages).
But this is **new routes in the existing Next.js app** — no new repo, no new infra rail. The demo
data, SDK, and funnel UI it shows off all shipped in growth-engine-v1.

## Decisions locked (Daniel, 2026-07-14 groom session)
1. **Brand: Golden Beans is the public name.** Design develops around it (PostHog bar, our own
   cooler version — dark roast + gold, honest badges as aesthetic).
2. **End-state first:** `references/landing-end-state.md` + `landing-end-state-mock.html` are the
   worked-backwards vision — *inspiration, never signed-off scope*.
3. **Backfill contract** goes into WAYS-OF-WORKING epic DoD: an epic that changes the public offer
   ships/updates its landing section in the same epic.
4. **ReportHub stays in medusa-bonsai** as groomed (`reporthub-as-notion`, HIGH, build #5 there).
   Golden-beans' productized reporting is **E3 (Pod Report)**, which reuses the projection-rail
   patterns and serves miyagisanchez as client #1; "report-rendering as an engine primitive: yes/no"
   is a named decision gate at E3's groom — not absorbed now.
5. **E1 depth:** E1 deep to DoR; E2–E6 land as ordered raw seeds, groomed when they reach the front.

## What already exists (reuse, don't rebuild)
| Capability | Where | Reuse for |
|---|---|---|
| TARS funnel / North Star / A/B comparison pages | `apps/web/app/{funnel,impact,experiments}` | The live-proof section renders these against a demo project — real UI, not screenshots |
| Tenant-scoped ingest + per-project credentials (S1.1) | engine API + own Supabase | Demo project seeding; connector token shape |
| TS SDK (track/trackAdoption/bucketing) | `packages/sdk` | Dogfood story: the landing instruments itself |
| Tokenized MCP connector URL + "Add to Claude" deep-link pattern | mb `seller-agent-connect-mcp-url` (ON in prod) | The install page + connector route — pattern lift, not rebuild |
| Staged propose→confirm→apply MCP mutation pattern | mb `catalog-management` | Shape for any future engine *write* tool (v1 connector is read-only) |
| PostHog product audit (verified 2026-07-11) | `Roadmap/01-growth-engine/growth-engine-v1/SCOPE.md` → Product frame | Positioning + primitives-grid honesty |
| `frontend-design` skill heuristics | medusa-bonsai `skills/frontend-design` | Design rail for the landing (UX heuristics check) |
| Playwright api harness + CI gate | template via S0.3 | One spec per testable story, per WoW |

**UX heuristics & rails check:** frontend-design heuristics apply; no design-token guard exists in
gb yet (debt noted, not this epic); PostHog reference screenshots **do not exist in-house**
(validated 2026-07-14) — captured fresh at S2.3 build time into `references/`.

## v1 boundary
**In:** public landing (end-state sections 1, 2, 3①③, 6, 8 live; 4, 5, 7 as honest teasers) ·
synthetic demo project + live-proof rendering · waitlist (email → own Supabase, rate-limited) ·
**read-only MCP connector v1** (funnel/north-star/experiments query tools, per-project token in
path, dark until flipped) · install page ("copy URL → Add to Claude" + `npx` docs) · dogfood
instrumentation (the engine tracks its own landing) · SEO/OG basics.
**Out (named, not creep):** self-serve signup/auth hardening (E2) · pod report section content
(E3) · signals loop (E4) · any engine *write* tools over MCP · pricing tiers (E2) · custom domain
*purchase* (decision story only — paid infra ⇒ Daniel) · significance stats · blog/docs site.

## Slicing (skateboard → car) — 3 sprints, sized to observed throughput (~3–4 stories/session)

### Sprint 1 — Launch-ready landing (the skateboard)
| Story | Ships | Risk |
|---|---|---|
| 1.1 As a visitor I want a Golden Beans landing at `/` (hero, section scaffold per end-state map, honest 🔜 badges) so the offer is legible in 30s. Acceptance: renders anonymously, mobile-clean, no client data anywhere. Internal pages move under `/app` or stay path-gated. | public shell + brand v1 | LOW |
| 1.2 As a skeptical PM I want the live-proof section fed by a **synthetic demo project** (seeded via the real SDK/API) so the numbers are real engine output. Acceptance: anonymous visitor sees live TARS/North-Star/A-B; zero Miyagi data; demo reseeds idempotently. | demo tenant + live-proof | LOW |
| 1.3 As a prospect I want to join a waitlist so I'm queued for a pilot. Acceptance: email → row in own Supabase; rate-limited + honeypot; confirmation state; duplicate-safe. | waitlist | LOW (public write, guarded) |
| 1.4 As the team I want the backfill contract in WAYS-OF-WORKING (epic DoD line + section↔epic registry in the landing code) so every launch fills the page. Acceptance: DoD line merged; registry file maps sections→epics. | process wiring | LOW |

### Sprint 2 — The operate routes
| Story | Ships | Risk |
|---|---|---|
| 2.1 As a PM's agent I want a **read-only MCP connector** (tokenized URL path, tools: funnel, north-star, experiments for *your* project) so the headline route is real. Acceptance: fresh Claude session adds the connector via deep-link and reads the demo project; token revocation kills access; **ships dark** (Stage 6b below). **New primitive (public route contract + token namespace) → cross-panel offer stands.** | MCP connector v1 | **HIGH — Daniel merges** |
| 2.2 As a visitor I want the install page (copy-URL field, "Add to Claude" deep-link, `npx` wizard docs) so each persona has a route in. Acceptance: deep-link works on free tier against the demo project. | install page | LOW |
| 2.3 As the brand I want a polish pass (frontend-design heuristics; fresh PostHog screenshots captured to `references/` for calibration) so the bar is met, not approximated. Acceptance: heuristics checklist run + noted in PR. | design pass | LOW |

### Sprint 3 — Launch & dogfood
| Story | Ships | Risk |
|---|---|---|
| 3.1 As the team I want the landing instrumented **by the engine itself** (visitor→waitlist TARS funnel, `golden-beans` as its own tenant) so we sell what we use. Acceptance: real funnel visible in the engine; grower signal defined (waitlist conversion). | dogfood loop | LOW |
| 3.2 As a searcher/agent I want SEO/OG/meta + an agent-readable manifest (`llms.txt`-style) so both humans and agents parse the offer. Acceptance: link unfurls correctly; manifest lists the routes. | discoverability | LOW |
| 3.3 As Daniel I want the launch checklist: domain decision (**paid infra ⇒ Daniel green-light; v1 may stay on vercel.app**), connector flag flip, announce. Acceptance: checklist executed; flip recorded. | launch | **HIGH — Daniel merges/flips** |

## Stage 6b — kill-switch decision (`risk: high`)
Runtime seam exists → **enablement (dark-launch) gate, recommended as part of story 2.1**:
- **Gate:** `CONNECTOR_ENABLED` env check at the MCP route handler (gb has no flag service by
  design — Decision 1 of v1; an env gate + redeploy is the honest v1 seam), **plus** per-project
  tokens as the fine-grained kill: revoking a token (DB row) cuts access instantly, no deploy.
- **Polarity:** enablement — **ships dark/OFF**, flipped deliberately at story 3.3.
- **Landing/waitlist need no flag** (carve-out: public marketing content, no money/auth seam;
  rollback = revert on `main`).

## QA / smoke (Stage 8b owners)
Per story: one Playwright api spec (waitlist POST validation/rate-limit; demo-project read
endpoints; MCP tool-call round-trip with a disposable token). Sprint-end fool-proof walkthroughs
in each `sprint-N.md` with real URLs. **Owed to Daniel by name:** S2 connector smoke in a fresh
Claude session (add via deep-link → query demo funnel → revoke token → confirm dead) · S3 flag
flip + live waitlist submission on production.

## Open risks
- **Client-data leakage on a public page** — the demo tenant must be the *only* project any public
  route can read; enforce project allow-list at the route, spec'd. (Mirrors the S4 realistic-input
  lesson: test with the least-convenient input — a real Miyagi projectId — and assert 403.)
- **Registry-declared Targeted honesty** — the live-proof section states the caveat; overselling
  is a brand risk, not just a docs nit.
- **Connector deep-link API drift** — `claude.ai/new?modal=add-custom-connector` verified
  2026-07-11; re-verify at S2.1 build time.
- **Vercel-hosted launch** — fine for E1; the E2 revisit trigger (multi-tenant scale + Postgres
  write ceiling) already stands in SCOPE.md.

## Definition of Ready
- [x] Mirror-back confirmed; 4 forks decided by Daniel (2026-07-14: brand · reporthub fit ·
      groom depth · end-state form).
- [x] Stage-2.5 bucket named; reuse list produced; research cited (PostHog audit + deep-link
      pattern, verified 2026-07-11; screenshots-gap validated 2026-07-14).
- [x] v1 in/out boundary written; stories risk-tiered; QA + smoke owners named.
- [x] Kill-switch decision recorded (enablement env gate + revocable tokens; landing carve-out).
- [ ] **Daniel approves this scope doc** → scaffold `02-commercial/commercial-shell/` (poster gains
      the 02 macro-section), sprints 1–3, kickoffs emitted.
