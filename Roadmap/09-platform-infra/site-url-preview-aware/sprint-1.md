# Site URL preview-aware — Sprint 1: The seam, its guards, and a preview that proves it

**Status:** ⬜ not started

> **Build contract.** One function changes. Read the epic README's **D1** (SITE_URL still wins),
> **D2** (preview only), **D3** (branch URL over deployment URL), **D4** (why the dangerous call
> sites are safe, and why that safety is fragile) and **D5** (the acceptance is a preview, not a
> unit test) before starting.
>
> **The rule that must survive this epic intact:** AGENTS.md #5 forbids a request `Host` fallback.
> A platform-set environment variable is not a request header. If any part of this diff reads
> anything off the incoming request, it is wrong.

## Build contract (locked by the architect before the builder started)

**Production cannot change, and it is provable by ordering rather than by promise.** `SITE_URL` is
set in Production (`vercel env ls`), so `getSiteUrl()` returns before the new branch is evaluated.
A spec asserts this directly rather than leaving it to the argument.

**`isSiteUrlMisconfiguredInProduction()` is not touched.** A production deploy missing `SITE_URL`
must keep failing loud. Silently serving its own `*.vercel.app` deployment URL instead of
`goldenfrijoles.com` would be a worse bug than the one being fixed, and an invisible one.

**Every new branch gets a mutation check.** This is a shared seam with ~20 call sites including auth
redirects and credential-bearing URLs; a guard that cannot fail here is worse than no guard
(CODE-QUALITY #5b). Break each branch, watch it go red, restore **from a file copy taken
beforehand** — never with `git checkout`, which discards uncommitted work (LEARNINGS, 2026-08-20).

**The epic is not done when the tests pass.** D5: unit tests cannot prove Vercel exposes
`VERCEL_ENV` / `VERCEL_BRANCH_URL` at runtime for this project. Story 1.4 is the acceptance.

## Stories

### Story 1.1 — `getSiteUrl()` knows it is on a preview
**As** anyone verifying a change on a preview deployment, **I want** the preview's own URLs in its
own output, **so that** I can actually exercise the surface before it merges.

**Acceptance:**
- `getSiteUrl()` resolves in this order, and no other:
  1. `SITE_URL`, trimmed, trailing slashes stripped — unchanged, and still first.
  2. **Only when `VERCEL_ENV === 'preview'`:** `https://` + `VERCEL_BRANCH_URL`, else
     `https://` + `VERCEL_URL`.
  3. `http://localhost:3000`.
- The scheme is hardcoded `https://`. Vercel serves preview deployments over TLS, and these
  variables carry a bare hostname with no scheme.
- The value is normalised the same way `SITE_URL` is (trimmed, no trailing slash), so callers that
  string-concatenate `${siteUrl}/install` cannot produce a double slash.
- Nothing is read from the request. No `headers()`, no `Host`, no `x-forwarded-*`.
- `lib/site-url.test.ts` covers, with the environment stubbed and restored: SITE_URL wins over a
  present VERCEL_BRANCH_URL · preview + branch URL · preview + only VERCEL_URL · preview with
  neither → localhost · **production without SITE_URL → localhost, not the deployment URL** ·
  development → localhost · trailing-slash and whitespace normalisation.
- The header comment explains **why a platform variable is not a Host header**, in the terms the
  epic README uses, so the next reader does not revert it citing AGENTS rule #5.
**Risk:** medium
**QA:** `lib/site-url.test.ts`, every branch mutation-checked

### Story 1.2 — The comments that now say the opposite
**As** the next person to read these files, **I want** them to describe the function that exists,
**so that** I am not reasoning from a sentence that was true last week.

**Acceptance:**
- `lib/landing-prompts.ts`, `components/landing/MakerHero.tsx` and
  `app/northstar-self-serve.md/route.ts` each currently assert that `getSiteUrl()` *never* derives a
  deployment's own hostname. All three are corrected (epic D6).
- Each correction says what is now true **and keeps the point the original was making** — that no
  production hostname is hardcoded in source, and that the specs exercise these surfaces against the
  run's own base URL.
- `grep` for the claim across the repo afterwards; fix the class, not the three files the epic
  happened to name.
**Risk:** low
**QA:** grep + review

### Story 1.3 — The dangerous call sites are guarded by a spec, not by a paragraph
**As** a maintainer widening an environment variable a year from now, **I want** to be told that I
have just made preview-minted URLs reachable, **so that** I find out from a red test rather than
from a customer holding a dead link.

**Acceptance:**
- Epic D4's safety property is currently a fact about Vercel project configuration and a paragraph
  in a README. It becomes an assertion in the repo.
- The guard names the **durable-URL** call sites — connector token URLs, report share links, the
  signup `emailRedirectTo`, the auth callback redirect base — and asserts that each is reachable
  only behind something Production-scoped, so a preview cannot mint one.
- It fails loudly with a message that explains the consequence, not just the mismatch. A maintainer
  who trips it should learn *why* it exists in the failure output.
- Written so it cannot pass vacuously: mutation-check it by making one of those paths look reachable
  and watching it go red.
**Risk:** medium
**QA:** the new guard, mutation-checked

### Story 1.4 — Observe it on a real preview
**As** the product owner, **I want** the fix demonstrated on a real preview URL, **so that** we know
Vercel actually exposes the variables rather than trusting that it does.

**Acceptance:**
- Push the branch, let Vercel build the preview, then **fetch the preview's own URLs**:
  - `curl <preview>/llms.txt` → every absolute URL is the preview host, not `localhost:3000`.
  - `curl <preview>/northstar-self-serve.md` → same, including `${siteUrl}/install`.
  - Load `<preview>/` and read the hero prompt → it names the preview host.
- **If it still says `localhost`, that is the finding**, and the fix is a Vercel project setting
  (system environment variables not exposed) rather than this code. Record it and stop — do not
  reach for a Host header.
- Production is re-checked after merge: `https://goldenfrijoles.com/llms.txt` still says
  `goldenfrijoles.com`, proving D1's ordering held.
**Risk:** medium
**QA:** **owed as an observation, not an assertion** — a real preview, fetched by hand

## Sprint QA

- `lib/site-url.test.ts` — new, every branch observed failing.
- The Story 1.3 guard — new, mutation-checked.
- Every pre-existing spec that pins a single host (`llms-txt`, `northstar-self-serve`,
  `landing-prompts`) green **without being edited** — they run against localhost, where behaviour is
  unchanged, so an edit to any of them in this diff is a review stop.
- Deterministic gate: `npm run typecheck` (four projects) + `npm run lint` + `npm run test:unit` +
  Playwright `api`.

## Smoke walkthrough

_To be written by the builder before the sprint is called done. Real preview and production URLs.
Story 1.4's preview observation is the acceptance and is recorded here with the actual hostname
that came back._
