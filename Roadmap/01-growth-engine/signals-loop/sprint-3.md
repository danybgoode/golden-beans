# Signals loop — Sprint 3: The closed loop (writes + flip)

**Status:** ✅ SHIPPED & LIVE (2026-07-27) — full production write smoke run end-to-end, see below. PR [#38](https://github.com/danybgoode/golden-beans/pull/38), 8 cross-review rounds (alternating families) to a clean Blocking-free round. Both gates still OFF; Story 3.4 flips them.

> Amended 2026-07-26 (see the epic README). The credential design changed materially (Amendment 2):
> the connector's plaintext, publicly-displayed URL token may **not** authorize a mutation, so the
> write surface gained its own hashed credential scope — which is now its own story, 3.1. Story 3.3
> absorbs the corrected competitor copy (Amendment 1) and the ladder-evidence addition (4.3).

## Stories

### Story 3.1 — The `agent_write` credential scope
**As** Daniel, **I want** write-capable agent credentials as a third `scope` on the existing
`api_keys` taxonomy — hashed, revocable, expirable, audited, on their own dashboard screen —
**so that** the first public mutation surface is authorized by a secret that has never been printed
on a public page.
**Why this is not the connector token:** `connector_tokens` are stored in plaintext *by design* and
are deliberately re-displayed on `/install`. A URL-borne credential travels through browser history,
`Referer` headers, proxy logs and screenshots — the `report_shares` migration already wrote this
down at length. See Amendment 2.
**Ships:** `scope = 'agent_write'` (+ the CHECK arm, wrapped in `IS TRUE` — a composite CHECK that
evaluates to NULL is a suggestion, not a constraint, per LEARNINGS) · an `active_agent_write_keys`
view with the scope filter welded in, service-role only, mirroring `active_ingest_keys` ·
`lib/agent-write-keys.ts` · a dashboard screen · `agent_write_key_minted` / `agent_write_key_revoked`
audit actions (their own labels — an audit label that can be chosen by picking an endpoint is worse
than no audit log).
**Acceptance:** an `agent_write` key is rejected by `/api/v1/track` (it is not in
`active_ingest_keys`) and an ingest key is rejected by the write tools (it is not in
`active_agent_write_keys`) — **both directions asserted, both mutation-checked**; a revoked key
fails; an expired key fails; minting and revoking each write their own audit row; the DB rejects a
`scope='agent_write'` row with a `share_lens`.
**Risk:** **HIGH — credential surface + migration. Architect only. Daniel merges.**

### Story 3.2 — Staged write tools (the connector's first public mutation path)
**As a** PM's agent, **I want** staged write tools — claim/resolve/dismiss via
**propose→confirm→apply** (propose returns a preview + a single-use confirmation token; nothing
mutates without apply) — dark behind `CONNECTOR_WRITES_ENABLED`, requiring **both** the connector
token and an `agent_write` Bearer key that resolve to the **same** project, fully audited, **so
that** the loop actually closes in my agent, not in a dashboard click.
**Addition (Amendment 4.2):** `resolve` accepts an **evidence pointer** — a commit SHA, PR URL or
note — stored on the task. A resolution with no resolvable pointer is recorded as resolved
*without evidence*, never silently as evidenced (the `pod-report` honesty rule, one layer in).
**Acceptance:** propose-without-apply mutates nothing (asserted by re-reading the row, not by
trusting the response); a confirmation token is single-use, project-bound and expires; gate OFF →
write tools absent from `tools/list`; connector token + ingest key (wrong scope) → refused;
connector token for project A + `agent_write` key for project B → refused; revoked key → refused;
every apply → an audit row. The connector manifest and `/install` describe the write tools
accurately (AGENTS rule #3 honesty).
**Risk:** **HIGH — first public write surface. Architect only. Daniel merges.**

### Story 3.3 — Landing §4 backfill, the dogfood loop, and ladder evidence
**As the** landing, **I want** §4 flipped teaser → live inverted-loop section (side-by-side with the
integrated-AI alternative, via the section↔epic registry) and the dogfood loop running — gb's own
errors → tasks → our agent fixes, loop events tracked in the engine itself — **so that** we demo
what we run.
**Corrected copy (Amendment 1):** PostHog Desktop is **announced, launching Summer 2026** — not
shipped. §4 says so. We do not compare our shipped loop against a competitor's unreleased one and
let the reader assume both exist.
**Addition (Amendment 4.3):** task-lifecycle facts become **ladder evidence** in `pod-report`'s
AI-adoption scoring, so landing §5's step claim is computed from real agent-resolved tasks rather
than asserted. See `references/Steps-of-AI-Adoption.md`.
**Acceptance:** §4 renders real task output through the registry; one real gb task shows the full
lifecycle in gb's own funnel; §5's ladder evidence count changes when a task is resolved by an
agent, and the section still renders its "not measured" list beside it.
**Risk:** LOW — delegable.

### Story 3.4 — Launch (flip + full-loop smoke)
**As** Daniel, **I want** the launch: flip `SIGNALS_ENABLED` then `CONNECTOR_WRITES_ENABLED`, run
the loop end-to-end in a fresh session — a customer's-own-agent-shaped session pulls a real task,
claims via propose→confirm→apply, resolves with an evidence pointer — then revoke-confirm-dead,
**so that** the differentiator demo is real before anyone hears about it.
**Rollout order is part of the design** (LEARNINGS, the router epic): migration → env vars →
commit to `main` (the redeploy that makes them live) → verify by exercising the surface, never by
`vercel env ls`.
**Acceptance:** flip recorded; one real task resolved by the external-shaped agent session;
revocation verified live (the same call 401s after revoke).
**Risk:** **HIGH — Daniel flips/merges**

## Sprint QA
- **api spec(s):** 3.1 → both-directions credential rejection + expiry + audit-label correctness ·
  3.2 → propose-without-apply no-mutation (re-read the row) · single-use/expiring confirmation
  token · gate-OFF → tools absent · wrong-scope, cross-project and revoked key all refused ·
  audit-row presence · 3.3 → §4 registry render + dogfood events present + ladder evidence wired
- **browser smoke owed:** yes — S3 full-loop smoke in a fresh session (pull → claim → confirm →
  resolve → revoke → confirm dead) + the production flip, **owed to Daniel by name**
- **deterministic gate:** `npm run typecheck` + `lint` + `build` + `test:unit` + Playwright `api`
- **review:** HIGH-risk PR → cross-family review is a **floor**, not a ceiling. Agy to clean, then
  Codex on the stabilized head; stop when a round from the *other* family comes back clean

## Cross-review record (8 rounds, alternating families)

Cross-family review is a **floor**, and this sprint is the sharpest evidence for it yet: every
round found real defects in the *previous* round's fix, and the families kept catching each other's
misses. The LEARNINGS entry about concurrency work ("most late findings are bugs in your own
previous round's fix") generalises to credential work without modification.

| # | Reviewer | Blocking | Should-fix | The one worth remembering |
|---|---|---|---|---|
| 1 | Codex | 1 | 2 | the audit row could not name the credential its own comment promised |
| 2 | Agy | 1 | 1 | a task counted as agent-resolved forever, once it ever was |
| 3 | Codex | 1 | 1 | a claim on a claimed task got a token it could never spend |
| 4 | Agy | 1 | 1 | the round-3 credential binding **failed OPEN** on a missing key |
| 5 | Codex | 1 | 1 | the wrong key **burned** the owner's confirmation — a DoS worse than the bug it fixed |
| 6 | Agy | 1 | 1 | a stringified expiry silently minted an **unexpiring** write credential |
| 7 | Codex | 1 | 2 | the UUID tie-break ordered nothing (random UUIDs are not temporal) |
| 8 | Agy (scoped) | **0** | 1 | — clean on the security surface; the preview understated its own outcome |

**The recurring defect, three times in one sprint:** a comment asserting a property the code does
not provide — the audit's credential id, "last write wins" with no ordering, and a UUID tie-break
that does not tie-break. Each was found by a reviewer, never by the author. This repo already had
the LEARNINGS entry ("prose in a diff reads as evidence") and it still happened three times, which
suggests the rule needs a mechanical check rather than another restatement.

## Known limitations (recorded, not hidden)

**1. The transition and its audit row are not atomic.** Reported as Blocking in round 7 and
triaged rather than fixed. `recordAudit` is best-effort *by design* and has been since
multi-tenant-activation — an audit write must never fail the action it describes. Making them
atomic means moving the audit into `transition_task`, which the **dashboard** also uses: a redesign
of shared lifecycle infrastructure to change a trade made deliberately elsewhere.

What is genuinely new is that the maturity score now reads that trail, so a dropped row moves a
published number. It moves it **down** — a missing row means fewer agent-resolved tasks counted,
never more. For a metric whose purpose is refusing to over-claim, that is the safe direction. If
the trail ever needs to be a ledger, that is its own story with its own review.

**2. `requireString` throws on a non-string argument** (round 2, Agy). Real: a Server Action is a
public HTTP surface, and a non-string yields a 500 rather than a clean `{ ok: false }`. Not fixed
here because it is the established pattern in **six** action files, and changing one creates
exactly the latent inconsistency LEARNINGS warns about. It throws before any auth or mutation, so
nothing leaks and nothing half-applies. Worth its own change.

**3. The fail-closed credential check has no test that can reach it** (round 4). The route cannot
produce a null key, so no HTTP spec exercises it; the protection is the **required parameter** —
i.e. the compiler, not a test. Stated because "mutation check passed" would have been false.

## Sprint 3 — Smoke walkthrough (RUN IN PRODUCTION 2026-07-27, every step observed)

_Run end-to-end against `https://golden-beans-gamma.vercel.app` with both gates live. Two disposable
credentials were minted inside SQL (so no plaintext was constructed in a shell), used, and revoked;
`select count(*) … where label like 'SMOKE%' and revoked_at is null` returns **0**._

1. **Capture real errors.** `POST /api/v1/track` × 5 distinct `userId`s with a `$error` event.
   → all **201**. Nothing appears on the queue yet — promotion is lazy, by design (Amendment 3).
2. **The agent presents BOTH credentials.** `tools/list` with the connector URL **and** an
   `agent_write` Bearer key.
   → **9 tools**, including `propose_task_change` + `apply_task_change`.
   With the connector token *alone*, the same call returns **7** — the write tools are absent, not
   erroring. That is Amendment 2 proven in production.
3. **Pull the queue.** `list_tasks`.
   → 1 task, `TypeError: prod smoke…`, evidence bundle showing **5 users / 5 events**. This call is
   what promoted the signal.
4. **Propose a claim.** `propose_task_change` (`action: claim`).
   → preview `open → claimed`, a confirmation token, and *"NOTHING HAS CHANGED YET"*.
   **Then read the row in the database:** `status=open`, `claimed_by=null`. The preview told the
   truth and nothing moved — asserted against the row, never against the response.
5. **Apply.** `apply_task_change`.
   → `open → claimed`. Replaying the same token → `already_used`. Single-use holds in production.
6. **Resolve with real evidence.** `propose` + `apply` with this repo's actual HEAD SHA.
   → preview `evidenceKind: commit`, applied with `evidenceRecorded: true`. The row now reads
   `status=resolved`, `resolution=fixed`, `evidence_pointer=f386032…`.
7. **The audit trail names the credential.** Two `task_transitioned` rows, both `via=connector`,
   both carrying the `agentKeyId` of the exact key used — so *"which credential closed this, and do
   I revoke that one?"* is answerable from one place.
8. **The ladder evidence computes.** `GET /api/v1/reports/pod/lifecycle` →
   `{ instrumented: true, agentResolvedTotal: 1, agentResolvedWithEvidence: 1,
   sampleEvidencePointer: "f386032…" }`. Landing §5's step claim is now computed from a real
   agent-resolved task rather than asserted (Amendment 4.3). One is honestly below the "scaled"
   threshold of 3, so the criterion reads `not_met` with a reason — which is the point.
9. **Revoke, and confirm dead.** Revoke the write key, repeat step 2 with the *same* key and token.
   → write tools **gone**; `list_tasks`/`get_task` still present. Instant, no deploy.

**The acceptance criterion for the whole epic — a signal became a task, the customer's own agent
claimed and resolved it over MCP with checkable evidence, and the loop is auditable — is met in
production.**
