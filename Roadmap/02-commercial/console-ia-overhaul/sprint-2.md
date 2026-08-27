# Four destinations — an information architecture for the signed-in console — Sprint 2: Setup

**Status:** ⬜ not started

> **Build contract (to be locked by the architect before the builder starts).** Cite `D4` and `D5`
> from the epic README. Two things in particular:
>
> 1. **`/install` is not touched by this sprint.** It is a public marketing page, and AGENTS rule #2
>    requires public routes to serve the demo project only — serving `DEMO_PROJECT_SLUG`'s connector
>    URL *there* is correct. The defect was linking a **signed-in** user to it, and Story 2.2 fixes
>    that by changing where the product's own link points.
> 2. **Story 2.3 is auth-adjacent and is architect work, not fan-out** (WAYS-OF-WORKING → Model
>    tiers: *auth · never delegated*). Three owner-only pages becoming one is exactly where a
>    boundary widens by accident.
>
> Both new routes follow `if (!isConsoleShellEnabled()) notFound()` **before auth or project lookup** —
> the `app/app/journeys/[projectSlug]/page.tsx` pattern.

## Stories

### Story 2.1 — `Setup › Connect`: your own connector URL
**As a** signed-in operator, **I want** to copy my own project's connector URL from inside the
product, **so that** I can connect Claude to my data instead of to the demo project's.
**Acceptance:**
- `/app/setup/connect/[projectSlug]` renders inside `ProductShell` with `getActiveConnectorUrl(projectSlug)` —
  **the viewer's project, resolved server-side from their membership**, never from the URL.
- A copy button, and an **Add to Claude** link to
  `https://claude.ai/customize/connectors?modal=add-custom-connector`. The modal takes no URL
  parameter (verified in `app/install/page.tsx` against Miyagi's shipped panel), so the flow stays
  copy-then-paste. Do not invent a deep link.
- A **connection status**: "Not connected yet", or "Connected · last used <when>". A setup page that
  cannot tell you whether setup worked is a document, not a tool.
- No landing `Nav`, no `Footer`, no sales headline. The reader is already signed in.
- The SDK snippet is **not** on this page — one link to the docs. Two audiences, two places.
- **Platform-first:** `app/app/onboarding/[projectSlug]/page.tsx` already renders this URL inside
  `ProductShell` today. Lift what is there; do not rebuild it. If `onboarding` still needs to exist
  as a first-run flow, it links here rather than duplicating the panel.
- **Honesty check:** if the project has no active connector token, say so and offer to mint one —
  never render an empty field that looks like a URL.
**Risk:** high (credential surface)

### Story 2.2 — The signed-in Connect link stops pointing at `/install`
**As a** signed-in operator, **I want** Connect to take me somewhere inside the product, **so that**
I am not dropped onto the marketing site mid-task.
**Acceptance:**
- With the gate on, nothing in the signed-in shell links to `/install`.
- `/install` itself is **byte-identical** — public visitors still get the demo connector URL, which
  is what AGENTS rule #2 requires. Provable by `git diff`.
- `app/install/page.tsx` gains one comment recording *why* it keeps the demo slug, so the next reader
  does not "fix" it into a tenancy bug.
**Risk:** low

### Story 2.3 — One `Setup › Keys`
**As an** owner, **I want** one page listing everything that has access to this project, **so that**
I do not have to know which subsystem minted a key in order to find it.
**Acceptance:**
- `/app/setup/keys/[projectSlug]` lists all four kinds — API keys, snapshot/read keys, catalog sync
  keys, agent write keys — with a **"what it may do"** column in plain words, the environment, and
  the expiry.
- **Each section re-asserts its own owner check** rather than inheriting one page-level guard (D5).
  A member gets a **404**, exactly as they do on `/app/keys/[projectSlug]` today. The boundary moves
  **tighter or identical, never looser** — that is the acceptance criterion, and it is testable.
- Minting shows the key value **once**, on its own, with a copy button. It is never a value read back
  off a table.
- Revoking names what stops working before asking to confirm.
- The three old routes stay reachable and redirect here while the gate is on; with the gate off they
  are untouched.
- **This story is the one most likely to grow.** If the three pages' minting forms turn out to have
  materially different shapes, ship the *list* merged and leave minting on the existing routes —
  and say so. A half-merged page that still answers "what has access to this project" is worth more
  than an appetite spent unifying three forms.
**Risk:** high (auth — architect only, never delegated)

## Sprint QA
- **api spec(s):** `e2e/setup-routes.spec.ts` — both new routes 404 while dark, redirect to login once
  open; and a **member-vs-owner boundary spec** on `/app/setup/keys/[projectSlug]` asserting a
  non-owner gets 404, mirroring the existing `/app/keys` spec so a regression is impossible to miss.
- **browser smoke owed:** yes, to the product owner — **the real connector round-trip**. Copying the
  URL and pasting it into `claude.ai` is a real-account, real-session flow no automated smoke covers.
  Named here so it is not glossed at close.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge.

## Sprint 2 — Smoke walkthrough (do these in order)
Env: preview · `https://<branch-preview>.vercel.app` (production URLs once merged)

1. With `CONSOLE_SHELL_ENABLED` unset, open `https://<preview>/app/setup/keys/miyagisanchez` in a
   private window.
   → A plain **404**.
2. Set the var in the preview scope, push a commit, then sign in and open `https://<preview>/app`.
   Click **Setup**.
   → The rail shows Connect your agent · Keys · Destinations · Share links.
3. Click **Connect your agent**.
   → You see a URL containing a `gb_connector_…` token, and the page is inside the product — no
   marketing header, no footer. **Read the token and confirm it is not the demo project's.**
4. Click **Copy**, then open `https://claude.ai/customize/connectors?modal=add-custom-connector` in a
   new tab, paste the URL and save. *(This is the step owed to you — an automated smoke cannot do it.)*
   → Claude accepts the connector.
5. Return to `https://<preview>/app/setup/connect/miyagisanchez` and reload.
   → The status now reads "Connected · last used …" rather than "Not connected yet".
6. Click **Keys** in the rail.
   → One list with all four credential kinds and a "what it may do" column.
7. Sign in as a **non-owner member** of the project (or ask one to) and open the same Keys URL.
   → A **404**, not an empty page. *(auth path — owed to you by name.)*
8. Unset the var and push again.
   → Both Setup routes 404 for everyone. **Leave it unset — the flip is Story 3.5.**

If any step fails, note the step number + what you saw — that's the bug report.
