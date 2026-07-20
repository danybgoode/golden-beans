---
title: "Golden Beans project rules and poster hardening"
slug: project-rules-and-poster-hardening
status: raw
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
