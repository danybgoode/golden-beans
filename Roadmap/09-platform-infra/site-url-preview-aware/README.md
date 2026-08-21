---
status: shipped      # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: site-url-preview-aware
build_order: 24
---

# Epic: A preview deployment stops calling itself localhost

> **Area:** 09-platform-infra · **Risk:** medium · **Class:** Fix · **Archetype:** Shared seam
> **Appetite:** S (one wave; if it exhausts, stop and re-shape)
> **Origin:** [`agentic-pm-public-surface` A13](../../02-commercial/agentic-pm-public-surface/README.md)
> — found by Codex persisting on a finding after the comment it first objected to had been fixed.

## Why

`SITE_URL` is scoped to **Production only**. `getSiteUrl()` reads it and otherwise returns
`http://localhost:3000`. So every preview deployment renders every absolute URL as a link to the
reader's own machine:

- the landing hero's copied prompt says *"Read http://localhost:3000/llms.txt"*;
- `/northstar-self-serve.md` hands out `http://localhost:3000/install`;
- `/llms.txt`, `sitemap.xml`, `robots.txt` and every route's `metadataBase` do the same.

**Nothing fails.** It is consistently the *wrong* host, so the one-host specs pass, CI is green, and
the page looks right. That is what made it survive two epics.

**What it actually costs:** a preview cannot be used to verify any URL-bearing surface, which is
most of the public surface. `agentic-pm-public-surface` had to move an owed product-owner
verification (Story 1.4, the end-to-end workshop run) from the preview to production-after-merge,
which is the wrong order — the point of a preview is to find out *before* merging.

## The rule this must not break, and does not

**AGENTS.md rule #5: site/base URLs never fall back to a request Host header.** That rule exists
because a bare-container `Host` header is attacker-controllable and can build a broken or hostile
absolute URL on a redirect path.

`VERCEL_BRANCH_URL` and `VERCEL_URL` are **not** request-derived. They are set by the platform into
the deployment's environment, are identical for every request that deployment serves, and cannot be
influenced by a caller. Rule #5 is untouched.

This distinction is the whole epic, so it is stated here and repeated in the source: **the next
person to read `site-url.ts` must not "fix" this back out on the strength of rule #5.**

## Platform-first note

Nothing new is modelled. No migration, no table, no new dependency, **no new environment variable**
— the fallback reads variables Vercel already sets. One function changes.

## What already exists (reuse, don't rebuild)

| Need | Already there |
|---|---|
| The single absolute-URL builder | `lib/site-url.ts` → `getSiteUrl()` (AGENTS rule #5), ~20 call sites |
| A production misconfiguration guard | `isSiteUrlMisconfiguredInProduction()`, already reading `VERCEL_ENV` |
| Proof that a surface's URLs come from one host | `e2e/llms-txt.spec.ts`, `e2e/northstar-self-serve.spec.ts`, `e2e/landing-prompts.spec.ts` |
| The reason `VERCEL_ENV` is trusted over `NODE_ENV` | `lib/site-url.ts`'s existing header comment |

## Architecture decisions — locked before any code

Verified against the live project with `vercel env ls` and the shipped source, not inferred.

### D1. `SITE_URL` still wins, always. Production is untouched by construction.

The new branch is only reachable when `SITE_URL` is absent. **`SITE_URL` is set in Production**, so
`getSiteUrl()` returns before the new code is evaluated on every production request. Production
behaviour cannot change; that is a property of the ordering, not a promise.

`isSiteUrlMisconfiguredInProduction()` **stays exactly as it is.** Production must keep failing loud
if `SITE_URL` goes missing — a production deploy silently serving its own ugly
`golden-beans-xyz.vercel.app` deployment URL instead of `goldenfrijoles.com` would be a worse bug
than the one this epic fixes, and it would be invisible.

### D2. The fallback fires ONLY on `VERCEL_ENV === 'preview'`

Not production (D1 — must stay loud). Not development, CI, or a local `npm run start`, where
`localhost:3000` is the correct answer and where `VERCEL_ENV` is unset.

This is the same reasoning the file already records for choosing `VERCEL_ENV` over `NODE_ENV`:
`next start` sets `NODE_ENV=production` in CI, locally, and on Vercel alike, so it cannot distinguish
them. `VERCEL_ENV` can.

### D3. Prefer `VERCEL_BRANCH_URL`, fall back to `VERCEL_URL`

`VERCEL_URL` is unique **per deployment** and changes on every push. `VERCEL_BRANCH_URL` is stable
for the life of the branch.

That difference matters precisely because of what this fixes: the surfaces in question hand a URL to
a **person or their agent** to paste somewhere. A prompt copied off a preview should still resolve
after the next push to that branch. `VERCEL_URL` is kept as a second choice so a context that
somehow lacks the branch variable still beats `localhost`.

### D4. Nothing about the DANGEROUS call sites changes — and the environment already guarantees it

`getSiteUrl()` has ~20 call sites, and they are not all informational. Some **mint a durable URL for
someone**: the MCP connector URL (`lib/connector-tokens.ts`), report share links
(`app/app/shares/…/actions.ts`), the signup email's `emailRedirectTo`
(`api/v1/public/signup/route.ts`), and the auth callback's redirect base. A preview-derived URL
persisted into one of those would die with the preview.

**Verified with `vercel env ls`: not one of those paths is reachable on a preview today**, because
their gates *and their database* are Production-scoped:

| Path | Why it cannot run on a preview |
|---|---|
| MCP connector URL | `CONNECTOR_ENABLED` — Production only |
| Report share links | `REPORT_SHARES_ENABLED` — Production only |
| Signup + `emailRedirectTo` | `SIGNUP_ENABLED` — Production only |
| Auth callback, provisioning, self-track | `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_*` — **all Production only**, so a preview has no database and no auth at all |

**This is a real safety property and a fragile one.** It holds because of how the project's
environments are scoped today, not because of anything in this diff — and it would evaporate the day
someone adds Supabase to Preview scope. So it is written down here, and Story 1.3 adds the
regression guard that states it in the repo rather than in this paragraph.

### D5. The acceptance test is a preview deployment, not a unit test

A unit test can only prove the function branches on the variables it is handed. It cannot prove that
**Vercel actually exposes them at runtime** — system environment variables are exposed subject to a
project setting, and nothing in this repo has ever demonstrated that `VERCEL_ENV` reaches a running
function. (`isSiteUrlMisconfiguredInProduction()` reads it, but its false branch is
indistinguishable from the variable being absent — a guard that has never been observed firing.)

So: unit tests pin the logic, and **the epic is not done until a real preview URL is fetched and
observed returning its own hostname.** If it returns `localhost`, the finding is that system
variables are not exposed for this project, and that becomes the fix rather than this one.

### D6. Three shipped comments become false and are corrected in the same commit

`agentic-pm-public-surface` corrected these to say `getSiteUrl()` *never* derives a deployment's own
hostname. After this epic that is wrong, and a comment asserting a property the code no longer has
is CODE-QUALITY #3 — the exact class that epic paid for twice.

- `lib/landing-prompts.ts`
- `components/landing/MakerHero.tsx`
- `app/northstar-self-serve.md/route.ts`

## Amendments

### A1. The resolver had to be split out, because `server-only` does not resolve under `node --test`

*Found while writing Story 1.1's unit tests, not at lock time.*

`lib/site-url.ts` begins `import 'server-only'`. That package is provided by Next's bundler and is
in neither `node_modules` tree, so `node --test` fails at import with `ERR_MODULE_NOT_FOUND` — the
resolution order could not be tested where it lived. The plan assumed it could.

**This repo already has the rule and the precedent.** LEARNINGS: *a unit-tested pure helper cannot
live in the same file as code that imports a framework/runtime-only module.* CODE-QUALITY #5: *if a
guard sits behind state your test cannot reach, extract it into a pure, zero-import module and
assert it directly.* `lib/agent-rail-visibility.ts` is the shape.

So the order lives in **`lib/site-url-resolve.ts`** — pure, zero-import, taking a `SiteUrlEnv`
object — and `lib/site-url.ts` stays the `server-only` seam every caller imports, doing nothing but
reading the four permitted variables out of `process.env`.

**Two things this bought beyond testability, both worth keeping:**

1. **The Host-header rule became structural rather than a promise.** `resolveSiteUrl(env)` has no
   request in scope to read. AGENTS rule #5 cannot be violated by accident here; it would take
   changing the signature.
2. **No `process.env` mutation in the test suite.** `node --test` shares one process across files,
   and an env-stubbing suite that throws mid-test leaks into every other suite. Every case is now
   an argument.

The public API is unchanged: `getSiteUrl()` and `isSiteUrlMisconfiguredInProduction()` keep their
names, their signatures and their call sites.

## Scope

| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 `getSiteUrl()` knows it is on a preview | medium |
| 1 | 1.2 The comments that now say the opposite | low |
| 1 | 1.3 The dangerous call sites are guarded by a spec, not by a paragraph | medium |
| 1 | 1.4 Observe it on a real preview | medium |

## Out of scope

- **Any change to `SITE_URL` in production**, or to `isSiteUrlMisconfiguredInProduction()`.
- Setting a Preview-scoped `SITE_URL` — a static value cannot match a per-branch hostname, which is
  why this epic exists rather than a one-line env change.
- A request-`Host` fallback, in any form, for any reason.
- Widening any Production-scoped variable to Preview. That would remove D4's safety property, and it
  is a separate decision with its own review.
- The signed-in app's own URL building, which does not use this seam for anything a preview reaches.

## Deploy order

One PR. No migration, no env var, nothing to sequence. Merging to `main` deploys, and production is
unaffected by D1.

## Epic Definition of Done

- [x] Sprint merged to `main`; production verified unchanged (`SITE_URL` still wins).
- [x] **A real preview deployment observed serving its own hostname** — the acceptance no unit test
      could give (D5). It returned the **branch** URL, which is D3 confirmed by observation.
- [x] `sprint-1.md` carries a fool-proof smoke walkthrough with real URLs and what came back.
- [x] This README marked ✅ complete; sprint status ticked with commit refs.
- [x] `RETROSPECTIVE.md` written.
- [x] Product poster updated — `Roadmap/README.md`.
- [x] `agentic-pm-public-surface`'s A13 updated to point here as resolved.
- [x] `Roadmap/LEARNINGS.md` updated.
- [x] No kill-switch: revertible by a normal revert, and production never reaches the new branch.

---

## ✅ Complete — shipped 2026-08-20

Live. A preview deployment now serves its own hostname; production is byte-for-byte unaffected,
verified after merge. 4 stories, 1 amendment, 9 cross-family review rounds.
See [`RETROSPECTIVE.md`](./RETROSPECTIVE.md).
