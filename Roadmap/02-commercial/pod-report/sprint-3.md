# Pod Report + Roadmap Hub — Sprint 3: Share links + backfill (the flip)

**Status:** ✅ SHIPPED 2026-07-26 — PR [#33](https://github.com/danybgoode/golden-beans/pull/33)
squash `7697bba`, plus [#34](https://github.com/danybgoode/golden-beans/pull/34) (`762ae3a`) fixing
the tenant §5 reads. Four migrations applied to production **before** the code that reads them.
`REPORT_SHARES_ENABLED=true` set and deployed. Six cross-review rounds across two model families.
**Owed to Daniel:** minting the first real share links (see the walkthrough below) — the one launch
step an agent should not take on a standing authorization.

## Design decisions recorded at build time (2026-07-26)

### Share tokens are `api_keys` rows, and the scope filter lives in the DATABASE
The epic's Platform-primitives note says share links "join E2's `api_keys` credential taxonomy as
scoped revocable rows — one taxonomy, not a third system." Built literally: migration
`20260803100000` adds `scope` (`ingest` | `share`), `share_lens` and `expires_at` to `api_keys`.
Revocation reuses `revokeApiKey` — already project-scoped, already audited, already on the
dashboard's key screen. A `report_shares` table would have duplicated the whole lifecycle, and the
duplicate is the one that gets forgotten when a leaked link needs killing.

**The risk that buys, and how it is paid for.** One table means a share token and an ingest key
share one `key_hash` namespace — and a share token travels in a URL: browser history, `Referer`
headers, a screenshot in a chat thread. An ingest key never does. If the ingest lookup ever stopped
filtering by scope (a refactor, a badly-resolved merge), every share link ever pasted anywhere would
become a **write credential** for that tenant.

A `.eq('scope','ingest')` in `lib/auth.ts` was judged not good enough for that blast radius, because
it is a line someone can delete. So the filter moved into the database object the hot path queries:
`active_ingest_keys` is a view with `scope = 'ingest' AND revoked_at IS NULL AND not expired` baked
into its definition, joined to `projects`, granted to `service_role` only. `lib/auth.ts` selects
from the view. **There is no filter in application code to drop.** Same discipline as the write-cap
and evidence-pointer guards elsewhere in this epic: make the failure unrepresentable rather than
merely fixed.

**Rollout order followed** (AGENTS rule #4 / LEARNINGS): migration applied to production **first**,
verified that the view returns all 5 active keys and drops exactly the 3 revoked ones and **zero**
active ones, *then* the code that reads it ships.

### Amendment — every share-route rejection is 404, not 401 (2026-07-26)

**Story 3.1's acceptance line says "revoked token → 401". Built as 404 instead, deliberately, and it
is the stricter answer.** That line was written by analogy with the MCP connector — an API route,
where 401 is natural. On an HTML page it is actively worse: **a 401 confirms the token was real
once.** Revoking a leaked link would still tell whoever holds it that they had something valid — an
oracle handed to the exact person you just cut off.

404 for unknown, malformed, expired and revoked alike matches this repo's own doctrine:
`lib/dashboard-auth.ts` returns 404 and never 403 for a foreign project, specifically "so we don't
confirm a foreign project's existence". The *substance* of the criterion — a revoked link dies
immediately, with no deploy — is unchanged and spec'd.

### The property the whole design rests on, and the mutation that proves it

`e2e/report-share.spec.ts` asserts a share token is rejected by **every** authed surface (`/track`,
`/features/sync`, `/reports/pod/push`, `/north-star`), paired with a spec proving an ordinary ingest
key still works — because the first assertion alone would pass just as happily against an auth layer
that 401s everything.

**Mutation-verified.** Pointing `lib/auth.ts` back at the `api_keys` table with a `revoked_at` filter
and no scope condition — the exact regression the view exists to prevent — makes `POST
/api/v1/track` answer **400 instead of 401**: the share token authenticated successfully and only
failed body validation. That is the vulnerability, and the spec fails loudly on it. Reverted; the
gate is green at 354 api specs.

### Cross-review: five rounds, and the one that mattered came from the other family

**agy rounds 1–4** (2026-07-26): seven Should-fix, zero Blocking, round 4 — aimed specifically at the
auth surface — came back **clean**. Round 2's most valuable finding was a bug round 1's own fix had
introduced; round 3's was an arithmetic incoherence between two fields both earlier rounds had touched.

**Codex round 5** then opened with a **Blocking** finding on the surface agy had just declared clean.
Cross-family review is a floor on high-risk work, not a formality — the two families disagreed about
what mattered, which is the entire reason for running both.

| # | Finding | Severity as reported | What was actually true |
|---|---|---|---|
| 5a | The share route re-resolved its tenant from the mutable `slug` instead of carrying the credential's `project_id` | Blocking | **Real, but narrower than "Blocking" suggests.** `active_share_links` re-reads the slug through a live JOIN each request, so a rename-then-reassign resolves correctly. The exposure is a **TOCTOU window inside a single request**, milliseconds wide. Fixed by carrying the id (which also deletes a redundant query), so the window is closed by construction. |
| 5b | The scope/lens CHECK evaluated to `NULL`, and Postgres accepts a `CHECK` returning NULL | Should-fix | **Real and verified in production** — the probe row was accepted. Fixed by `IS TRUE` + a second column-level CHECK; the identical probe and the `UPDATE` escalation are both now rejected, and a valid share row still inserts. |
| 5c | `revokeShareAction` could revoke an ingest key and audit it as `report_share_revoked` | Should-fix | **Real.** The privilege boundary held (an owner may revoke their own keys); the **audit trail** did not. Fixed with a `scope='share'` predicate. |

**A correction worth recording.** The spec written to pin 5a **passed against a deliberately
re-broken build**, so it does not pin it — see the note in `e2e/report-share.spec.ts`. The finding is
not HTTP-testable (a millisecond race), and the argument for the fix is construction, not coverage.
This is the "a spec that passes is not a spec that can fail" trap, caught by mutation-checking a spec
that had every appearance of being a teeth test.

### One hash, not two that agree
Both credential kinds land in the same `UNIQUE` column, so they must hash identically. The first
attempt was a test asserting the two hashers agreed — which could not run at all, because
`lib/api-keys.ts` imports `server-only` (LEARNINGS: a pure helper cannot share a file with a
runtime-only import). The obstacle produced the better design: both now delegate to
`lib/credential-hash.ts`, so there is no second implementation to drift and nothing to assert.

## Stories

### Story 3.1 — Scoped share links (dark)
**As** Daniel, **I want** share links with per-audience lenses — *team* (everything) · *client*
(their pod's journey + their Pod Report, never other tenants' data) · *investor* (portfolio
horizon + momentum, no per-story internals) — as opaque revocable tokens in the path (E1 connector
pattern; one credential taxonomy with E2's `api_keys` scoped rows), behind a
`REPORT_SHARES_ENABLED` env gate that **ships dark/OFF**, **so that** externals glance at a link,
never an account.
**Acceptance:** each lens returns only its scope — spec'd with a **real** foreign tenant/token
(S4 lesson); revoked token → 401 immediately; gate OFF → share routes 404; scope enforced
server-side (lens comes from the token, never the URL).
**Risk:** HIGH — Daniel merges (public read of internal data + credential surface)

### Story 3.2 — Landing §5 backfill + hub dogfood
**As the** landing, **I want** §5 (Pods & proof) flipped teaser → live Pod Report section via E1's
section↔epic registry (backfill contract), and the hub instrumented **by the engine itself** (view
events per lens tracked as engine events), **so that** we sell what we use.
**Acceptance:** §5 renders real report output (synthetic/demo-safe — no client data on the public
page, ever); hub views appear in gb's own funnel.
**Risk:** LOW (public content via registry, gated)

### Story 3.3 — Launch
**As** Daniel, **I want** the launch: flip `REPORT_SHARES_ENABLED` in production, mint the first
real investor + client links, verify revocation kills a link, announce, **so that** the roadmap is
something we *show*, live.
**Acceptance:** flip recorded (env + date); one real external audience viewed a live link; a
revoke-confirm-dead cycle executed and noted.
**Risk:** HIGH — Daniel flips/merges

## Sprint QA
- **api spec(s):** 3.1 → lens-scope assertions (investor lens must NOT return story internals;
  client lens must NOT return foreign-tenant data) + revoked-401 + gate-OFF-404 · 3.2 → §5 renders
  registry-driven content in both gate states
- **browser smoke owed:** yes, to Daniel — fresh incognito session: open each lens → revoke →
  confirm dead; plus the production flip
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge

## Sprint 3 — Smoke walkthrough (do these in order)

Environment: production — `https://golden-beans-gamma.vercel.app`. Steps 1–5 are already run and
green (API-level, by the agent). Steps 6–9 are **owed to Daniel**: they need a browser, and step 6
mints a production credential.

1. `curl -s -o /dev/null -w "%{http_code}\n" https://golden-beans-gamma.vercel.app/s/nonsense`
   → **404.** A malformed token is refused.
2. Same with a well-formed but invented token (`/s/gbs_<43 random chars>`)
   → **404, identical to step 1.** Deliberate: a 401 would confirm the token was real once, which is
   an oracle handed to whoever holds a leaked link you just revoked. Unknown, malformed, expired and
   revoked all answer the same way.
3. `curl -s -o /dev/null -w "%{http_code}\n" -X POST https://golden-beans-gamma.vercel.app/api/v1/reports/pod/push -H 'Content-Type: application/json' -d '{}'`
   → **401.** The pod_report rail is live and fails closed.
4. Open `https://golden-beans-gamma.vercel.app/` and scroll to **§5 Pods & proof**
   → real numbers, not a teaser: *13 days · 88 commits · 2.2 d median epic lead time · 16.2
   deploys/week (proxy) · step 1 "Assisted" · **11 things we do not measure — and say so***, with the
   gaps named. Computed from golden-beans' own repository, re-pushed by CI on every deploy.
5. Open `https://golden-beans-gamma.vercel.app/hub/golden-beans-demo/report`
   → the full team-lens report: speed paired with its gaps, the maturity ladder with evidence
   pointers, benchmark citations, caveats on the page.

6. **Owed — Daniel (mints a production credential).** Sign in, open
   `https://golden-beans-gamma.vercel.app/app/shares/miyagisanchez`, pick the **investor** lens, label
   it, and mint. Copy the URL — it is shown once.
   *Why this is yours and not the agent's: the token is a bearer credential that exposes a real
   client's internal delivery history to anyone holding the URL. Choosing to create one, and choosing
   who receives it, is a business decision.*
7. **Owed — Daniel.** Open that URL in a **fresh incognito window** (no session).
   → **200**, the Pod Report through the investor lens: the ladder verdict WITH its
   not-instrumented count beside it, no per-criterion rows, no month-by-month authorship, and the
   caveats still present. If the verdict appears without its gap count, the lens has failed its one
   job.
8. **Owed — Daniel.** Back on the shares screen, **Revoke** that link, then reload the incognito tab.
   → **404, immediately, with no deploy.** That is the revoke-confirm-dead cycle Story 3.3 asks for.
9. **Owed — Daniel (a judgement call no spec can make).** Read the maturity verdict cold. It says
   medusa-bonsai operates at **step 1, "Assisted"**, 4 of 7 criteria met with evidence, 6 not
   instrumented. If you would say step 2 or 3, the lens is wrong — and that disagreement is the
   acceptance test, exactly as Sprint 2's QA framed it.

**Money/auth path:** yes — a new credential kind in `api_keys`, and a public read of internal data.
**Migrations:** `20260803100000`, `20260803110000`, `20260803120000`, `20260803130000` — all applied
to production before the code that reads them, each verified against production afterwards.
