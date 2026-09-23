---
title: "Workspaces become the tenant: one person, many products, one boundary"
slug: workspaces
status: raw
area: "02"
type: feature
priority: "audit-wave-C"
appetite: L
underwritten_by: null
risk: high
epic: null
build_order: 32
updated: 2026-09-23
---

# Seed: Workspaces become the tenant: one person, many products, one boundary

**Portfolio-pass seed** (not yet deep-groomed). Seed 7 of the unification audit, [§7](../audits/golden-frijoles-unification-2026-09-23.md).
Home repo: **golden-beans**. Class **feature**, appetite **L** (from the audit, to confirm at grooming). Audit wave **C**.
**Depends on:** D5 (decided): amend the AGENTS.md tenancy invariant in this epic.

## Problem

There's no entity above `projects`. The portfolio view, FinOps budgets and billing all need one, and AGENTS.md says *no request-derived read path can cross projects*. Daniel chose option A (audit D5): workspaces become the tenant, and the invariant is restated at workspace level **in the same change that introduces the table**.

## Sketch (from the audit; grooming will cut or reshape it)

- `workspaces` + `workspace_members`; `projects.workspace_id`; backfill one workspace per existing owner.
- The invariant rewritten in AGENTS.md: *no tenant (workspace) observes another's data*; projects within a workspace may be read together by its members.
- Every auth path (`lib/auth.ts`, dashboard auth, connector tokens, CLI tokens) re-checked against the workspace.
- Quotas and budgets become workspace data.

## Open questions for the deep groom

- Is billing in scope, or only the boundary?
- Can a project move between workspaces?
- Kill-switch: likely a migration carve-out (expand/contract).
