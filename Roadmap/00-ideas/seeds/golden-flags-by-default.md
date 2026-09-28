---
title: "Golden Frijoles by default — a spawned project already carries the flag provider"
slug: golden-flags-by-default
status: shipped
area: "09"
type: feature
priority: wave-2026-09-16-plugin
appetite: M
underwritten_by: wave-2026-09-16-plugin
risk: high
epic: "09-platform-infra/golden-flags-by-default"
build_order: 31
updated: 2026-09-19
---

# Pitch — Golden Frijoles by default

## Mirror-back
> Whenever anyone — you, or anyone you distribute this to — uses `dobby-foundation` to start a new
> project or integrate into an existing one, it should **already carry Golden Frijoles**, suggest
> installing it, and hand over the exact command. A Golden Frijoles account (free tier) is a
> requirement, not a suggestion.

## Problem

`groom` Stage 6b currently tells every consuming project to extend **`lib/flags.ts` `DEFAULT_FLAGS`** —
one consumer's in-house Supabase table, hardcoded into the supposedly project-agnostic planning skill.
`check-plugin-leaks.mjs` misses it because the filename is generic. So the template leaks a
consumer's flag architecture into every future project, and every `risk: high` epic's kill-switch
story names whatever mechanism that project happened to build.

## Appetite

**M — one wave.** Architect session + builder fan-out + one review round. Blocked on the
`golden-frijoles-cli` epic reaching its Sprint 2.

## Outcome & signal

A project spawned from the template cannot reach a merged kill-switch story without a real Golden
Frijoles project, and getting one is a single command the agent prints.

**How you test it:** spawn from `template/`, ask for a HIGH-risk feature. The agent says it needs a
Golden Frijoles project and prints `npx @golden-frijoles/cli init`. `node scripts/preflight.mjs` fails
loudly without credentials and passes after.

## Stage-2.5 bucket

**Light enhancement.** The SDK, control plane and credential model all ship. New: one preflight check,
a rewritten Stage 6b, one guard rule, the onboarding prompt.

## Scope

**In v1:** the mandate, the preflight, the onboarding, the template SDK wiring, the `groom` rewrite,
the plan table written down.

**Out of v1 (no-gos):**
- **No local-dev fallback provider.** One provider, always. A fallback is exactly how Miyagi ended up
  with two lists.
- **No plan awareness** — no quota display, upgrade prompts or limit errors. Everything is unlimited
  today; metering is a later `golden-beans` epic.
- Experiments, scenarios, telemetry adoption. Flags only.
- **Miyagi's own cutover.** That is [`medusa-bonsai` → `flag-provider-mandate`](https://github.com/danybgoode/miyagi-product-management/tree/main/Roadmap/09-platform-infra/flag-provider-mandate),
  and a distributable product should not carry one consumer's migration.

## Rabbit holes

- **"Required" must survive an offline builder.** Fail loud at init; fail **soft** at runtime. A
  transient outage must never break a build, a test run or CI. Backwards is the way this breaks every
  consuming project.
- **Edge runtime.** SDKs are often not Edge-compatible and middleware may need a flag. Verify against
  the actual package and write the answer into the template.
- **Credential sprawl.** `gf init` writes only `flag_read` locally; `flag_sync` is a CI secret.
- **Sync is not activation.** Miyagi is the cautionary tale: definitions synced, activations never
  created, 39 of 42 flags reading "Never turned on here" while the runtime served compile defaults
  through a fallback chain. The kill-switch story must make activation its own explicit step.

## What already exists (reuse, don't rebuild)

`@golden-frijoles/sdk` (`createFlagProvider`, `createFlagDefinitionSyncClient`, the `MAX_FLAG_*`
constants) · `golden-beans` `lib/credential-inventory.ts` · `scripts/check-plugin-leaks.mjs` ·
`groom` Stage 6b's polarity doctrine (correct as-is) · `template/scripts/permissions-smoke.mjs` (the
shape `preflight.mjs` copies) · `golden-beans` `/install`.

## UX heuristics & rails check
- **CI guards covering this surface:** `check-plugin-leaks.mjs`, `check-skill-scripts.mjs`. `preflight.mjs` becomes a new one.
- **Audits-lens findings that apply:** [`ways-of-work-audit-2026-09-16.md`](../audits/ways-of-work-audit-2026-09-16.md) §7.
- **Design-language debt:** n/a.

## Kill-switch / runtime gate
**Carve-out (risk: high, but no runtime seam).** Config, docs and one check script; git is the rollback.

## Acceptance criteria
See the epic's Definition of Done — the load-bearing two are: preflight fails with the exact install
command and passes after `gf init`, and **a Golden outage does not break a build or a test run**,
proven by a test.

## Open risks / research
- Edge-runtime compatibility of `createFlagProvider` — unverified.
- Gated on the CLI epic's Sprint 2.
