# CMS-neutral experiment integration + Payload go/no-go — Sprint 1: Miyagi reference contract

**Status:** ⬜ not started

## Stories

### Story 1.1 — Current-code ownership and sequence trace

**As the** product owner, **I want** the integration traced through real Miyagi and Golden code,
**so that** the decision does not rely on an obsolete seed or generic CMS architecture.

**Acceptance:** the artifact names current content storage, reads, writes, preview, cache/
revalidation, rollback, auth and audit seams; it names E5 flag identity/version/evaluation and
existing experiment exposure/outcome/decision seams; a sequence follows one content version from
editor to render to exposure to outcome to restore; no step invents a route/table/tool that does
not exist or hides a required follow-on.

**Risk:** low

### Story 1.2 — CMS-neutral contract and failure table

**As an** application builder, **I want** a precise integration contract, **so that** any CMS can
participate without Golden owning its content.

**Acceptance:** contract fixes stable content identity/version, flag/experiment binding, local
evaluation, app-owned content resolution, deduplicated exposure, realistic outcomes, decision and
CMS-owned publish/restore; data/credential matrix says what crosses each boundary; failure table
covers Golden/CMS unavailable, stale snapshot, missing version, double exposure and rollback;
tenant/project identity is always server-resolved and no content body enters Golden.

**Risk:** low

### Story 1.3 — Miyagi fit and constraint evidence

**As the** Miyagi owner, **I want** the existing CMS tested against the contract, **so that** we
know which gaps are real rather than aspirational.

**Acceptance:** score current overrides, announcements and editor against content identity,
recoverability, drafts/versions, blocks/layout, media, localization, roles/approval, caching and
experiment binding; each gap names an observed workflow/user need or is marked untriggered; the
MADMEN activation plan is used to judge timing; `content.overrides_enabled` interaction with E5
migration is explicit.

**Risk:** low

## Sprint QA

- **validation:** every cited path exists at current HEAD; re-run targeted `rg` inventories and
  inspect migrations/history for claimed behavior.
- **api specs:** none—spike writes no code. Cite existing specs that prove rollback, editor writes,
  flag evaluation and experiment exposure.
- **browser smoke owed:** no production change. Optional read-only/internal trace through existing
  preview may validate sequence; do not call it a shipped integration.
- **deterministic gate:** `git diff --check`; docs links/paths resolve; no non-Roadmap file changes.

## Sprint 1 — Smoke walkthrough

Env: current local/production documentation and read-only code

1. Start from one Miyagi content key and trace current default, override, editor mutation, preview/
   render, cache invalidation and rollback.
   → Every state and owner is named with a current file/table/route.
2. Overlay E5's flag/version/evaluation and existing exposure/outcome/decision seams.
   → The CMS body never crosses into Golden; stable identifiers and failures are explicit.
3. Review the matrix against the MADMEN Miyagi activation plan.
   → Present content constraints are separated from future editorial optionality.

If a necessary seam does not exist, record it as a follow-on requirement rather than silently
assuming it.
