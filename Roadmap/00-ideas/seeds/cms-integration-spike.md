---
title: "E6 — CMS-neutral experiment integration + Payload go/no-go"
slug: cms-integration-spike
status: scaffolded
area: "01"
type: spike
priority: null
risk: low
epic: "01-growth-engine/cms-integration-spike"
build_order: 18
updated: 2026-07-27
---

# Spike — E6 CMS-neutral integration + Payload decision

## Mirror-back

Prove the original integrate-don't-own thesis against Miyagi's current CMS and E5's real flag/
experiment control plane, then make a current, evidence-backed Payload module go/no-go. Do not
pre-decide “no” merely because Miyagi already has an editor, and do not install a CMS merely because
Payload is capable. The output is a written architecture/product decision plus the exact follow-on
scope if the answer is go.

## Classification

**Spike / written decision, low risk.** No production code, dependency, database or deployment
change. The spike is scaffolded because the question remains active and E5 makes the reference
integration concrete. It runs in the same frontier-led session after E5's flag contract is locked.

## Outcome & signal

The spike succeeds when the decision explains, from current code:

- how a CMS-owned content key/version becomes a Golden flag/experiment variant;
- how Miyagi renders, exposes, measures, decides and restores without copying content into Golden;
- whether the current in-house CMS satisfies the reference contract;
- whether Payload should be adopted by Golden, by Miyagi, offered as an adapter, or deferred;
- the operational/auth/multi-tenant consequences of each option; and
- the exact trigger and ready scope for whichever work follows.

Daniel's acceptance is a signed go/no-go decision with a code-path trace, data-ownership table,
failure/rollback sequence and present-day Payload evidence. “No-go” must include observable reopen
triggers; “go” must include a bounded feature seed. Neither outcome is assumed in advance.

## Stage-2.5 bucket

- **Already possible:** Miyagi owns runtime copy overrides, announcements, an admin editor, preview,
  batched saves, search/filter/pagination and import/export. Golden owns local assignment,
  exposure/outcome analysis, tasks and immutable decisions.
- **Light enhancement unlocked by E5:** a typed Golden flag can return a CMS-owned content version
  identifier; a governed experiment can bind that flag version. The app resolves the actual body
  and records exposure through the existing SDK.
- **Genuinely new decision:** whether structural page/block modeling, drafts/versions, editorial
  workflow, media, localization or multiple CMS consumers justify Payload or a packaged adapter.

## Questions the spike must answer

1. **Ownership:** Are content bodies, layouts, media, locales, schedules and drafts always CMS-owned?
   If any exception is proposed, what product need justifies it?
2. **Identity/version:** What stable, non-PII identifiers let Golden reference a recoverable CMS
   version without understanding its schema?
3. **Evaluation:** Does the application evaluate a Golden flag locally, then resolve content from
   its CMS without adding a request-time Golden content dependency?
4. **Telemetry:** Which exposure and outcome facts are emitted through `/api/v1/track`, and how are
   retries/double exposure prevented?
5. **Decision/rollback:** How does Golden preserve experiment evidence while publication and
   restoration remain CMS actions?
6. **Miyagi fit:** Can `platform_copy_overrides`, `platform_announcements`, `/admin/contenido` and
   their existing rollback meet the contract at today's scale?
7. **Payload fit:** Would Payload solve an observed constraint now? Where would it live, who would
   authenticate editors, how would tenant boundaries map, and who would own migrations/backups?
8. **Packaging:** Is there enough evidence for a reusable adapter, or only a Miyagi reference
   recipe? What second consumer would prove the abstraction?
9. **MADMEN alignment:** Does the choice advance the seller-first activation loop, or distract from
   the consent-safe funnel that must exist before content optimization has signal?

## Reference contract to validate, not assume

1. CMS owns `surface`, `content_key`, locale, recoverable `content_version` and content body.
2. Golden owns a typed flag and governed experiment referencing only stable CMS identifiers.
3. Application server evaluates locally from E5's cached snapshot and asks its CMS for the chosen
   version; outage behavior is an app-owned default.
4. Application renders, then emits one deduplicated exposure with flag key/version, experiment
   definition version and variant—never the content body.
5. Real outcomes arrive through canonical telemetry and are attributed by the existing experiment
   resolver.
6. Golden records integrity, metrics, task evidence and human decision.
7. CMS/app publishes or restores. Golden never becomes an editorial write-through proxy.

## Evidence package

- Current-code inventory and sequence trace for Miyagi content reads, editor writes, previews,
  rollback, caching/revalidation and Golden SDK/experiment seams.
- Data-ownership and credential-boundary matrix for in-house Miyagi, Payload-in-Miyagi,
  Payload-in-Golden and CMS-neutral adapter options.
- Failure table covering Golden unavailable, CMS unavailable, stale flag snapshot, missing content
  version, double exposure and rollback after an experiment decision.
- Current official Payload check: license/self-hosting, Next.js/admin architecture, drafts/
  versions, access control, multi-tenancy implications, API/MCP direction and Figma ownership.
- Go/no-go scorecard tied to observed needs, not feature-count enthusiasm.
- Approved decision record and follow-on seed/explicit reopen triggers.

## Boundaries

- No Payload install, schema, admin route, dependency, deployment or content migration in the spike.
- No copy/page/media bodies stored in Golden Beans.
- No generic CMS write tool through Golden's MCP connector.
- No claim that a written contract is a shipped integration.
- No real content experiment before E5's flag migration is stable and Miyagi has consent-safe
  traffic; a preview/internal trace may validate the sequence.
- No permanent adapter abstraction justified by only one implementation.

## Current sources

| Capability | Source | Spike use |
|---|---|---|
| Runtime copy | Miyagi `platform_copy_overrides`, `lib/copy-overrides*.ts` | Verify identity, version and fallback |
| Announcements | Miyagi `platform_announcements`, `lib/announcements*.ts` | Test whether schedule/audience remains CMS-owned |
| Editorial UX | Miyagi `/admin/contenido` | Assess current workflow gaps from shipped UI |
| Rollback | Miyagi `content.overrides_enabled` | Trace current recovery and E5 migration interaction |
| Flag evaluation | E5 flag snapshot/provider | Reference only stable content identifiers |
| Experiment loop | Golden bucketing, exposures, analysis, decisions | Avoid CMS-specific analytics |
| MADMEN strategy | Miyagi activation plan | Judge timing against real growth constraint |

## Payload research baseline

Payload remains MIT-licensed and self-hostable, and its current product includes a Next.js-native
admin/API foundation with access control and versions/drafts. Payload and Figma state that the open
source core and self-hosting continue; Payload's 4.0 direction includes a redesigned admin,
TanStack and MCP work. These facts make it credible, not automatically necessary:

- [Payload getting started](https://payloadcms.com/get-started)
- [Payload MIT license](https://github.com/payloadcms/payload/blob/main/LICENSE.md)
- [Payload joining Figma](https://payloadcms.com/posts/blog/payload-is-joining-figma)
- [Figma announcement](https://www.figma.com/blog/payload-joins-figma/)
- [Payload 4.0 direction](https://payloadcms.com/posts/blog/payload-40-admin-ui-redesign-tanstack-mcp-and-more)

## Single-session handling

The E5 coordinator first freezes flag identity/version/evaluation/exposure contracts. E6 then runs
as a bounded read-only lane: current-code trace, option matrix, failure analysis, primary-source
check and decision. A lower-model researcher may gather evidence only after the coordinator defines
the questions; the frontier coordinator writes and approves the final decision. E6 may conclude
go or no-go—its job is to remove ambiguity, not to rationalize a predetermined scope.

## Open risks

- E5 changes the integration from “experiment bucket maps to content” to the stronger “governed
  flag version maps to content and may be experiment-bound”; E6 must use the final contract.
- Miyagi's current key/value model may be entirely sufficient for code-owned layouts while still
  becoming inadequate for blocks, localization or editorial workflow. The decision must separate
  present fit from future optionality.
- Payload's Figma ownership is a direction risk, but current official sources preserve MIT/open-
  source/self-hosting. Product need, ownership and operational fit—not acquisition anxiety—decide.
