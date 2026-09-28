---
title: "One public monorepo with per-folder licences, a private docs repo, and a lean install mirror"
slug: public-monorepo
status: raw
area: "09"
type: feature
priority: "single-product-wave-A"
appetite: M
underwritten_by: null
risk: high
epic: null
build_order: 45
updated: 2026-09-28
---

# Seed: One public monorepo with per-folder licences, a private docs repo, and a lean install mirror

**Portfolio-pass seed** (not yet deep-groomed), from the [single-product audit](../audits/single-product-and-grooming-2026-09-28.md). Class **feature**, appetite **M**,
to confirm at grooming.
**Decisions:** E1, E2, E8 (approved 2026-09-28).

## Problem

Two code repos means cross-repo PR pairs for most rail changes and a "copy-in" step whose consumer gates keep finding
defects the source repo can't see (five in golden-frijoles-plugin wave 2). Both repos are already public; this one has no
licence at all, and business-sensitive docs (client specifics, pricing bets, strategy) sit in a public Roadmap.

## Sketch

- Move dobby-foundation's `plugins/`, `kit/`, `template/`, its CI and release workflows into this repo with history
  (subtree merge): `plugins/golden-frijoles/`, `packages/kit/`, `template/`.
- Per-folder LICENSE files: Apache-2.0 for plugin, kit, CLI, SDK (replace `UNLICENSED`); FSL-1.1 for `apps/web` and
  `supabase/` (E8, lawyer to confirm). "Golden Frijoles" stays a trademark (`NOTICE`).
- A release workflow publishes the plugin + kit paths to `golden-frijoles/skills` as a read-only mirror, so the
  install prompt, the parity check and the landing copy don't change. Kit npm publishing keeps its provenance.
- A small private docs repo takes client-specific and commercial material; a one-time gitleaks history scan here.
- Transfer `danybgoode/golden-beans` → `golden-frijoles/golden-frijoles`; local folder → `~/dobby/golden-frijoles`
  (move Claude Code's per-project history, keyed by absolute path). Archive `~/dobby/dobby-foundation` after the first
  mirrored release installs cleanly from an isolated home.
- Out of scope: addresses (Vercel/Supabase projects, `golden-beans-gamma.vercel.app`, tenant slugs, MCP id,
  `GOLDEN_BEANS_*`, the webhook test envelope).

## Rabbit holes

- Releases, provenance and the Vercel deploy must keep working through the move; plan the cut-over order.
- Consumers (medusa-bonsai) enable the plugin by marketplace name, which doesn't change; verify anyway.
