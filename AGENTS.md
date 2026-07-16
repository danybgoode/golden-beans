# Agent index — <TEMPLATE FILL-IN: project name>

## What is this?

<TEMPLATE FILL-IN: one or two sentences — what this product does, for whom, and the mission behind
it.>

**Architecture**: <TEMPLATE FILL-IN: the stack in one line — e.g. "Next.js App Router + Postgres" or
"a Django API + a React SPA".>

**Repo layout** (fill in if this is a monorepo; delete if it's a single app):
```
<repo-root>/
├── apps/<app-a>/     ← <what it is>
└── apps/<app-b>/     ← <what it is>
```

**Workflow (gitflow)**: work on a **feature branch** (`feat/<epic-slug>`), commit per story, open a
**PR**, and **merge to `main`** when verified + approved. Merging to `main` is the deploy — Vercel's
GitHub integration auto-deploys `main` to production on every merge, no manual step. **Never run
`vercel deploy`/`vercel deploy --prod` from the CLI** — that's an out-of-band deploy that bypasses
the git-tracked pipeline and isn't how this project ships; if a deployment looks stuck or wrong,
check `gh api repos/<owner>/<repo>/deployments` (confirms which commit SHA is actually live) or the
Vercel dashboard, don't reach for a CLI deploy to "fix" it. Confirmed 2026-07-16 (commercial-shell
Sprint 2): a Vercel env var added via `vercel env add ... --value ... --no-sensitive` took effect
on the already-deployed production functions with **no redeploy needed** — env-var-only changes
don't require a new deployment here. Two gotchas hit while confirming this: (1) `vercel env add`
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

<!-- TEMPLATE FILL-IN — this is the load-bearing section of this file. Write 3-5 non-negotiable
     architectural rules for THIS project: the things that must never be worked around, no matter how
     convenient a shortcut looks in the moment. Worked example shape below, replace entirely — do not
     ship this as-is: -->

<!--

### 1. <System of record> owns <domain>. Never build it from scratch.
If a feature touches <core domain concepts>, it goes through <the canonical module/service>. Do not
create ad-hoc tables or bespoke routes for these concerns.

| Concern | Where it lives |
|---|---|
| <concept> | <canonical location> |

### 2. <Secondary datastore> is ONLY for <non-core> data.
<Rule of thumb for what belongs where.>

### 3. <Any first-class cross-cutting concern> must stay accurate.
<What "accurate" means here and how it's checked.>

### 4. <Auth provider> is the auth layer. Never replace it.
<What this means in practice — no custom auth pages, etc.>

### 5. <Any other non-negotiable house rule, e.g. a copy/locale policy>.
<State it precisely enough that a fresh agent can self-check against it.>
-->

---

## Context routing — read only what you need

<!-- TEMPLATE FILL-IN: a table pointing from "what I'm working on" to the right context doc, so an
     agent doesn't have to read everything. Keep entries short. -->

| I'm working on… | Read these docs |
|---|---|
| <area> | <doc path> |

---

## Quick-reference

```bash
# TEMPLATE FILL-IN: your project's real dev/build/test commands
npm run dev
npx tsc --noEmit
npm run build
```

**Key env vars**:
<!-- TEMPLATE FILL-IN: list the env vars an agent needs to know about, grouped by app if a monorepo. -->

**Key imports**:
<!-- TEMPLATE FILL-IN: the handful of `lib/` seams every feature should reuse instead of reinventing
     (a data client, an auth helper, a notification sender, a rate limiter — whatever your project's
     equivalents are). -->
