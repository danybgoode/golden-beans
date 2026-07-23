# Agent index — Golden Beans

## What is this?

**Golden Beans is a standalone Unified Growth Engine** — telemetry ingest + a TypeScript SDK, a TARS
funnel (Targeted/Adopted/Retained), a North Star metric, and A/B bucketing, wrapped in a commercial
shell (public landing, waitlist, and a read-only MCP connector). It is **multi-tenant by design**:
every event is scoped to a `project`, and **no request-derived read path can cross projects**
(one narrow, registered exemption exists for background schedulers — see
[§ The scheduler exemption](#the-scheduler-exemption-narrow-registered-and-property-bound); it does
not apply to anything that serves a request). It exists so a team can
run product analytics + experimentation from one primitive set instead of stitching vendors together;
its first proof-of-use is dogfooding Miyagi's real setup-guide funnel. It is *not* a fork of any
sibling project — it's maintained on its own, consuming the shared `ways-of-work` plugin for process.

**Architecture**: **Next.js App Router (`apps/web`) + Supabase Postgres**, deployed on **Vercel**
(merge to `main` = deploy). Supabase is accessed **service-role only, server-side** — RLS is ON with
no anon policies; every query is `project_id`-scoped, and that `project_id` is always resolved
**server-side** — from the request's hashed API key (`lib/auth.ts`) on authed ingest/read paths, or
from an allow-listed demo slug (`lib/public-demo.ts`, rule #2) / a revocable connector token
(`lib/connector-tokens.ts`, rule #3) on the public/connector paths — **never from the request body**.
A framework-agnostic TypeScript SDK lives in `packages/sdk`.

**Repo layout** (monorepo):
```
golden-beans/
├── apps/web/            ← the Next.js app: ingest/registry/query API + landing/connector UI
│   ├── app/api/v1/      ← the engine's public API (track, features/sync, public/*, connector)
│   ├── lib/             ← the reusable seams (auth, supabase, rate-limit, query libs, flags…)
│   └── supabase/migrations/  ← expand/contract SQL migrations (applied separately from deploy)
├── packages/sdk/        ← @golden-beans/sdk — createGrowthEngineClient (the ONLY app→engine path)
├── scripts/             ← CLI tooling (cross-review, seed-*, build-order, sync-* from Miyagi)
└── Roadmap/             ← product source of truth (poster, ways-of-working, learnings, epics)
```

**Workflow (gitflow)**: work on a **feature branch** (`feat/<epic-slug>`), commit per story, open a
**PR**, and **merge to `main`** when verified + approved. Merging to `main` is the deploy — Vercel's
GitHub integration auto-deploys `main` to production on every merge, no manual step. **Never run
`vercel deploy`/`vercel deploy --prod` from the CLI** — that's an out-of-band deploy that bypasses
the git-tracked pipeline and isn't how this project ships; if a deployment looks stuck or wrong,
check `gh api repos/<owner>/<repo>/deployments` (confirms which commit SHA is actually live) or the
Vercel dashboard, don't reach for a CLI deploy to "fix" it. **Env vars require a REDEPLOY to reach running functions — corrected 2026-07-21.** An earlier
version of this file claimed the opposite ("took effect on the already-deployed production
functions with no redeploy needed", from commercial-shell Sprint 2). That was **disproved
empirically** during the multi-tenant-activation launch: `SIGNUP_ENABLED=true` was added to the
Production scope with `vercel env add ... --value true`, and `/signup` still returned 404 more than
seven minutes later, because Vercel snapshots env vars into a deployment at build time and the
running functions kept serving the values captured at their own build. **Adding or changing a var
is only half the job — a new deployment (i.e. a commit to `main`) is what makes it live.** Verify
by exercising the behaviour the var controls, never by `vercel env ls` (which never shows values). Two gotchas hit while confirming this: (1) `vercel env add`
piped from `echo -n "..." |` can silently save an **empty** value — always verify with `--value
<val>` explicitly, and check the live behavior it's supposed to affect (e.g. render the page that
reads it), not just `vercel env ls` (which never shows values) or `vercel env pull` (unreliable for
sensitive-flagged vars — mark anything non-secret `--no-sensitive` at creation); (2) a **local**
checkout's `node_modules` can go stale after pulling a merge that added a dependency — `npm ci`
before trusting a local build failure. **Supabase migrations are a separate step, not part of the
Vercel deploy** — `supabase link --project-ref <ref>` (find the ref via `supabase projects list`)
then `supabase migration list` (diffs local vs. remote) and `supabase db push` (apply pending
ones); nothing here happens automatically on merge. Roll back a bad merge with `git revert` on
`main`.

## Start here (orientation for any agent)

Before planning or building, read these — they are the source of truth and change often:
- **`Roadmap/README.md`** (product source of truth, one level above this file if nested under an app)
  — the product poster: every feature by domain, current status.
- **`Roadmap/WAYS-OF-WORKING.md`** — how we plan/build/ship: the cadence, gitflow, Definition of Done
  (story **and** epic), QA/smoke-test rules, the test harness. Follow it.
- **`Roadmap/LEARNINGS.md`** — the distilled, cross-cutting wisdom from past epics' retrospectives
  (multi-agent + async-deploy coordination, tooling gotchas, what's worked). **Read it** — it's how a
  past retro reaches you instead of dying in its epic folder. You feed it at epic close (see the epic
  Definition of Done).
- **Team memory** (if your tooling keeps one) — durable facts: deploy topology, per-epic notes,
  gotchas.
- Process: **plan first** (plan mode → user stories → product-owner approves) → branch + **scaffold
  the epic/sprint docs before code** → build one story → verify → **smoke-test** → PR → merge. At
  **epic close**, update `Roadmap/README.md` (the poster), write a `RETROSPECTIVE.md`, and **promote
  its durable learnings to `Roadmap/LEARNINGS.md`**.

---

## ⚠️ The rules that cannot be violated

### 1. The growth engine (Supabase-backed ingest/registry/TARS/North Star/experiments) owns telemetry. Never build a parallel pipeline.
If a feature needs to track an event, define a feature, read a funnel, or compare an experiment, it goes
through the existing primitives — `/api/v1/track`, `/api/v1/features/sync`, the TARS/North Star/A-B query
libs (`apps/web/lib/{tars,north-star,ab}*.ts`) — via the real `@golden-beans/sdk` client. Do not insert
directly into `events`/`features` from application code, and do not stand up a second event table or a
bespoke analytics route for something this system already models.

| Concern | Where it lives |
|---|---|
| Event ingest | `POST /api/v1/track` (`apps/web/app/api/v1/track/route.ts`) |
| Feature/signal registry | `POST /api/v1/features/sync` (`apps/web/lib/feature-schema.ts`) |
| Funnel / North Star / experiment reads | `apps/web/lib/{tars,north-star,ab}-query.ts` |
| Client SDK | `packages/sdk` (`createGrowthEngineClient`) |

### 2. `/api/v1/public/*` may only ever serve the demo project. Never widen it.
The public landing's live-proof section and any other public read route are gated by
`assertPublicAllowedSlug()` (`apps/web/lib/public-demo.ts`) against `DEMO_PROJECT_SLUG`. A real customer
project (e.g. `miyagisanchez`) must 403, not 404, on these routes. Any new public-facing read path reuses
this same allow-list check — never a route that trusts a caller-supplied project slug.

### 3. The MCP connector is enablement-gated. Never bypass either gate as a shortcut.
`CONNECTOR_ENABLED` (`apps/web/lib/flags.ts`, born unset/OFF) and per-project revocable tokens
(`connector_tokens`, `apps/web/lib/connector-tokens.ts`) are two independent kill switches — the route
must 404 while the flag is off regardless of token validity, and a revoked token must fail regardless of
the flag. Never hardcode the flag to `true`, and never add a connector code path that skips the token
check "temporarily."

### 4. Merging to `main` is the deploy. Never run a manual `vercel deploy`/`--prod`.
Vercel's GitHub integration auto-deploys `main` on every merge — see "Workflow (gitflow)" above. If a
deployment looks stuck or wrong, confirm via `gh api repos/<owner>/<repo>/deployments` (exact commit SHA +
status per environment), never via a CLI deploy.

**Env vars REQUIRE a redeploy to reach running functions**, and the redeploy must be a **commit to
`main`** — not `vercel redeploy`/`--prod`, which this rule forbids. Vercel snapshots env vars into a
deployment at build time, so setting a var is only half the job. (An earlier copy of this line
claimed the opposite; it was corrected in the "Workflow" section on 2026-07-21 but this second copy
survived until 2026-07-22 — see LEARNINGS' "grep for its siblings" rule, which is exactly what
should have caught it.) Confirmed again 2026-07-22: `CRON_SECRET` was invisible to the running
functions until a new deployment.

### The scheduler exemption (narrow, registered, and property-bound)

**Approved by Daniel 2026-07-22** (event-destination-router S2). Read this whole section before
citing it. It is deliberately hard to qualify for.

**The invariant is unchanged in substance:** *no tenant may ever observe another tenant's data.* What
this amendment corrects is an over-broad *wording* — "no read path can cross projects" also caught
background schedulers, which serve no tenant and return no tenant data. The fix scopes the invariant
to **request-derived** paths and permits a *registered* scheduler fan-in.

**Why an exemption rather than a redesign:** a scheduler must decide *which tenants have due work*
before any per-tenant work can start. That question is inherently cross-tenant — moving it to an
external scheduler **relocates** the cross-tenant read, it does not remove it, while adding a second
deployment surface, its own auth and its own failure modes. That trades real robustness for nominal
compliance.

**ALL SIX conditions must hold. Failing any one voids the exemption:**

1. **No request can reach it.** It runs only from a platform scheduler (cron). If any user request,
   API key, session or MCP call can reach the code path, it is *not* exempt — no exceptions for
   "internal" or "admin" routes.
2. **It returns tenant IDENTIFIERS only** — bare `project_id`s. Never tenant *data*: no names, slugs,
   counts, aggregates, timestamps, event fields, destination fields or metadata. **One extra column
   voids the exemption** and requires re-approval.
3. **Service-role only, enforced at the database** — `REVOKE ALL … FROM PUBLIC, anon, authenticated`
   then `GRANT EXECUTE … TO service_role`, pinned by a spec that asserts a *function-level* denial
   (not an RLS error, which would mean EXECUTE leaked and the body ran).
4. **The caller authenticates with a platform secret and fails closed** (`CRON_SECRET`; unset ⇒ 401).
5. **Everything downstream is strictly single-tenant** — the work it schedules takes a **required**
   `projectId` and re-asserts it on every query and write.
6. **It is listed in the registry below.** The exempt set is finite and auditable. Adding to it is a
   deliberate decision by Daniel, recorded here — never inferred by analogy.

**Registry of exempt functions (complete):**

| Function | Returns | Caller |
|---|---|---|
| `projects_with_due_work()` (`20260724100000_delivery_retry.sql`) | `project_id` only | `app/api/internal/dispatch-deliveries` (cron, `CRON_SECRET`-gated) |

**This exemption does NOT permit — do not cite it for any of these:**

- ❌ Any cross-tenant read on a path that serves a request — including "internal" API routes, admin
  screens, the MCP connector, or anything reachable with a session or API key.
- ❌ Cross-tenant reporting, analytics, dashboards, exports or "just a count across tenants."
- ❌ Returning tenant data (even one name or number) from an exempt function.
- ❌ Cross-tenant `JOIN`s in any tenant-facing query, for performance or convenience.
- ❌ Reading another tenant's row "to check something" before acting on your own.
- ❌ Treating this as precedent. A new scheduler needs its own approval and its own registry row.

**If you are an agent and you think you need a new exemption: you almost certainly do not.** Scope
the query to a `project_id` resolved server-side. If you genuinely cannot, stop and put an explicit
either/or decision to Daniel — **a comment or a commit message cannot amend this rule.**

### 5. Site/base URLs never fall back to a request Host header.
`getSiteUrl()` (`apps/web/lib/site-url.ts`) reads `SITE_URL` or falls back to a hardcoded
`localhost:3000` — never `req.headers.get('host')` (Roadmap/LEARNINGS.md: a bare-container Host-header
fallback can silently build a broken URL from a garbage header, dangerous on any redirect/URL-building
path). Any new code that builds an absolute URL from the running request reuses this helper instead of
deriving its own fallback.

---

## Context routing — read only what you need

| I'm working on… | Read these docs |
|---|---|
| Event ingest / SDK / track schema | `apps/web/app/api/v1/track/route.ts`, `apps/web/lib/track-schema.ts`, `packages/sdk/src/index.ts` |
| Feature/signal registry | `apps/web/lib/feature-schema.ts`, `apps/web/app/api/v1/features/sync/route.ts` |
| TARS / North Star / A/B reads | `apps/web/lib/{tars,north-star,ab}-query.ts` + their `*-schema.ts` |
| Tenant identity / auth / API keys | `apps/web/lib/auth.ts`, `apps/web/lib/supabase.ts`, the `projects`/`api_keys` migrations |
| Public read routes (demo-only) | `apps/web/lib/public-demo.ts` (rule #2) |
| MCP connector | `apps/web/lib/{flags,connector-tokens}.ts`, `apps/web/app/install/` (rule #3) |
| Landing / waitlist / commercial | `apps/web/app/page.tsx`, `apps/web/lib/{landing-sections,waitlist-schema}.ts`, `references/landing-end-state.md` |
| Rate-limit / abuse guards | `apps/web/lib/rate-limit.ts` |
| A new epic (plan/scope) | `Roadmap/README.md`, `Roadmap/WAYS-OF-WORKING.md`, `Roadmap/LEARNINGS.md`, the epic's `README.md` |

---

## Quick-reference

```bash
npm run dev                                   # next dev (apps/web)
npx tsc --noEmit -p apps/web                   # type-check
npm run build                                  # next build (the deterministic gate's build step)
npm run test:e2e                               # Playwright `api` project — the always-on gate
npm run test:e2e:browser                       # Playwright `browser` project — opt-in real-browser smoke
npm run seed:demo | npm run seed:self          # (re)seed the demo / self-tracking tenants
node scripts/cross-review.mjs <PR#> --agent antigravity  # baseline external review; add Devin for high-risk PRs
node scripts/build-order.mjs                   # regenerate Roadmap/00-ideas/BUILD-ORDER.md (never hand-edit)
# Supabase migrations are SEPARATE from the Vercel deploy (see rule #4 / Workflow above):
supabase link --project-ref <ref> && supabase migration list && supabase db push
```

**Key env vars** (all on `apps/web`, set in Vercel):
- **Supabase** — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (service-role, server-only; `lib/supabase.ts` throws if missing).
- **URLs** — `SITE_URL` (absolute-URL base; `lib/site-url.ts` — never a Host-header fallback, rule #5).
- **Tenancy** — `DEMO_PROJECT_SLUG` + `DEMO_PROJECT_API_KEY` (the demo tenant), `DEMO_CONNECTOR_TOKEN`; `SELF_PROJECT_SLUG` + `SELF_PROJECT_API_KEY` (the landing's self-dogfood tenant).
- **Gates** — `CONNECTOR_ENABLED` (`lib/flags.ts`, MCP connector kill-switch, ON in prod),
  `JOURNEY_PROJECTIONS_ENABLED` (`lib/flags.ts`, journey registry/read/UI kill-switch, **born OFF**), and
  `EXPERIMENT_GOVERNANCE_ENABLED` (`lib/flags.ts`, experiment registry/lifecycle/UI enablement gate,
  **born OFF**; legacy local bucketing, exposure ingest and v1 comparison do not read it), and
  `SIGNUP_ENABLED` (`lib/flags.ts`, self-serve signup enablement gate, **born OFF**; gates the
  `/signup` page, `POST /api/v1/public/signup`, tenant provisioning in `/auth/callback`, and the
  landing's §1/§7 CTA flip — all four read it fresh per request, but every env change still needs a
  new Git-tracked deployment because Vercel snapshots env values at build time). The same redeploy
  requirement applies to every gate above.
  *A future epic adds `DESTINATION_DELIVERY_ENABLED`, also born OFF.*
- **Tenancy limits are DATA, not env** — `projects.monthly_event_quota` / `projects.ingest_rate_per_min`
  (`lib/quota.ts`); raising a customer's ceiling is an `UPDATE`, never a deploy.

**Key imports** (reuse before rebuild — the load-bearing `lib/` seams):
- `lib/supabase.ts` → `getSupabaseServiceClient()` — the ONLY DB client (service-role, server-only).
- `lib/auth.ts` — hashed-key → `project_id` resolution. Every authed route starts here.
- `lib/rate-limit.ts` — DB-backed, serverless-safe bounded writes for any public write route.
- `lib/site-url.ts` → `getSiteUrl()` — the ONLY absolute-URL builder (rule #5).
- `lib/public-demo.ts` → `assertPublicAllowedSlug()` — the demo-only gate for any public read (rule #2).
- `lib/{tars,north-star,ab}-query.ts` — the canonical read paths; never re-query `events` ad hoc.
- `packages/sdk` → `createGrowthEngineClient` — the ONLY app→engine path for tracking (rule #1).
