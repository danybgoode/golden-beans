# Four destinations — an information architecture for the signed-in console — Sprint 2: Setup

**Status:** ⬜ not started

> ## Build contract (locked by the architect before the builder started — 2026-08-27)
>
> **Cite `D4`, `D5`, `A2`, `A5`, `A7`, `A10` from the epic README. Do not re-derive them.**
>
> **Where the rules live:** auth gates → `apps/web/lib/dashboard-auth.ts` · the public-route allow-list
> → `AGENTS.md` rule #2 · the connector's two independent kill switches → `AGENTS.md` rule #3 ·
> gate polarity → `lib/flags.ts`.
>
> ### The five things this sprint may not get wrong
>
> 1. **`/install` is not touched.** It is a public marketing page, and serving `DEMO_PROJECT_SLUG`'s
>    connector URL *there* is what AGENTS rule #2 requires. The defect was linking a **signed-in** user
>    to it, and Story 2.2 fixes that by changing where the product's own link points. `git diff` on
>    `app/install/page.tsx` must show **one added comment and nothing else**.
> 2. **Both new routes gate before auth**, following `app/app/journeys/[projectSlug]/page.tsx`:
>    `if (!isConsoleShellEnabled()) notFound()` **above** `requireProject…`. Dark means *nonexistent* —
>    a flat 404 for everyone, not a login redirect, which is the one thing the Playwright `api` project
>    can actually assert without a session.
> 3. **A5 replaces "each section re-asserts its own check."** There is **one** boundary —
>    `requireProjectOwnership` — and all three source routes already apply it *at the route*
>    (`app/app/{keys,flag-credentials,agent-keys}/[projectSlug]/page.tsx`, line 1 of each). The merged
>    route calls it at the route too, before any list read; and **each mint/revoke server action
>    independently re-resolves ownership**, as they already do. The page's guard is never the only thing
>    between a member and a mint. Testable acceptance, unchanged: **a member gets a flat 404, not an
>    empty page.** Describing four boundaries that do not exist would be a `CODE-QUALITY` rule 3 defect
>    written in advance.
> 4. **A7 is one commit, not two.** Adding `'console-shell'` to the `ProjectSurfaceGate` union breaks
>    all three `ProjectSurfaceGates` builders (`lib/shell-nav.ts`, `app/app/page.tsx`,
>    `lib/project-route-inventory.test.ts`) — that compile error is the feature. And
>    `'legacy-keys'` (supplied as `!isConsoleShellEnabled()`) is what takes `/app/keys`,
>    `/app/flag-credentials` and `/app/agent-keys` **out of the nav at the same instant** their
>    replacement enters it. A route that redirects must not also be a nav entry.
> 5. **Story 2.3 is architect work, never delegated** (WAYS-OF-WORKING → *auth · never delegated*).
>    Three owner-only pages becoming one is exactly where a boundary widens by accident.
>
> ### ⚠️ Story 2.1 is BLOCKED on A10 until Daniel answers. Do not guess either half.
>
> Both are facts about production, read 2026-08-27:
>
> - **`connector_tokens` has five columns — `id, project_id, token, revoked_at, created_at`.** There is
>   no `last_used_at`, and **nothing in the product records a connector read**: the MCP route calls
>   `resolveConnectorToken` and writes nothing, and `audit_log` has no connector action among its 13.
>   *"Connected · last used &lt;when&gt;" has no source of truth.* Do not invent one, and do not quietly
>   downgrade the sentence — that is the amendment Daniel owns.
> - **`miyagisanchez` has ZERO connector tokens.** Production holds three rows in total:
>   `golden-beans-demo` (active), `miyagi` (active), `golden-beans` (revoked). The story's "honesty
>   check" fallback is the **only** state Daniel's own tenant can render. `lib/connector-tokens.ts` says
>   in its own comment that *"v1 has no self-serve token minting"*, so "offer to mint one" is a **new
>   production credential-minting surface** — outside this epic's pre-authorized merge scope, by name.
>
> **Everything in this sprint that does not depend on that answer is built while it is pending:** the
> route and its dark 404, the shell placement with no landing `Nav`/`Footer`/sales headline, the copy
> button, the Add-to-Claude link, the docs link in place of the SDK snippet, Story 2.2 and Story 2.3.
>
> ### Live credential facts for Story 2.3, read from production 2026-08-27
>
> `miyagisanchez` has **five** active credential scopes, not four:
>
> | scope | active | total | carries an expiry |
> |---|---|---|---|
> | `ingest` | 2 | 3 | no |
> | `flag_read` | 1 | 1 | yes |
> | `flag_sync` | 1 | 3 | yes |
> | `agent_write` | 1 | 1 | no |
> | **`share`** | **2** | 2 | no |
>
> Two consequences the story must handle rather than discover:
>
> 1. **The page's promise is "everything that has access to this project", and the merged page will
>    NOT list share links** — they are their own Setup surface (`/app/shares`), and a sixth scope
>    (`flag_admin`) exists in the schema too. So the page must either include them or **say what it
>    excludes**. A page that claims completeness and omits two live bearer tokens is worse than one
>    that scopes its claim honestly.
> 2. **Three of the five kinds carry no expiry at all**, so the "expiry" column is empty for most
>    rows today. Render "no expiry" as words. A blank cell in a credentials table reads as "unknown",
>    and unknown-vs-never is exactly the distinction an owner is scanning that column to make.
>
> ### The `Add to Claude` link is copy-then-paste, and that is verified, not assumed
>
> `https://claude.ai/customize/connectors?modal=add-custom-connector` takes **no URL parameter** —
> confirmed in `app/install/page.tsx` and in `app/app/onboarding/[projectSlug]/page.tsx`, which both
> already hold this exact constant. **Do not invent a deep link.** Prefer lifting the existing panel
> from `onboarding` over rebuilding it; if `onboarding` still needs to exist as a first-run flow, it
> **links here** rather than keeping a second copy.

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
- ✅ **A10, answered by Daniel 2026-08-27 — the status is PROVISIONED / NOT-PROVISIONED, not "last
  used".** `connector_tokens` has five columns (`id, project_id, token, revoked_at, created_at`); there
  is no `last_used_at`, the MCP route writes nothing, and `audit_log` has no connector action among its
  13. So the page renders *"No connector URL for this project yet"* or *"Connector URL active since
  &lt;created_at&gt;"* — **and says in words that a URL existing is not the same as Claude having used
  it.** No migration; no write added to the connector's public read path.
- No landing `Nav`, no `Footer`, no sales headline. The reader is already signed in.
- The SDK snippet is **not** on this page — one link to the docs. Two audiences, two places.
- **Platform-first:** `app/app/onboarding/[projectSlug]/page.tsx` already renders this URL inside
  `ProductShell` today. Lift what is there; do not rebuild it. If `onboarding` still needs to exist
  as a first-run flow, it links here rather than duplicating the panel.
- ✅ **A10, answered by Daniel 2026-08-27 — the owner-gated mint button IS built.** `miyagisanchez`
  has **zero** connector tokens (production holds three rows: `golden-beans-demo` active, `miyagi`
  active, `golden-beans` revoked), so the "no connector yet" state is the **only** one this tenant can
  render until one is minted. Four hard constraints on the mint:
  - **An explicit owner-only server action, never on render.** `lib/connector-tokens.ts` forbids
    minting as a render side effect and that constraint is untouched.
  - **Audited as `connector_token_minted`**, alongside `api_key_issued` and the other 12 — there is no
    connector action in `audit_log` today, and this closes that gap.
  - **Shown once, on its own, with a copy button.** Never read back off a table.
  - **AGENTS rule #3 holds:** the control does not render, and the action refuses, while
    `CONNECTOR_ENABLED` is off. Minting creates the second kill switch; it must never route around the
    first.
  - **Pressing it on production is owed to Daniel by name** — building the surface is this epic's work,
    minting a real credential is not covered by a merge authorization.
  Never render an empty field that looks like a URL.
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

⚠️ **Per A2, the dark steps run on preview and the lit steps run on production after Story 3.5's
flip.** `CONNECTOR_ENABLED` is Production-only too, so a preview would render no connector panel at
all — a correct render that reads like a broken one.

### On preview — `https://<branch-preview>.vercel.app`, gate unset

1. Open `https://<preview>/app/setup/keys/miyagisanchez` in a private window.
   → A plain **404**. Not a login redirect.
2. Open `https://<preview>/app/setup/connect/miyagisanchez` in a private window.
   → A plain **404**.
3. Open `https://<preview>/app/keys/miyagisanchez` signed in as the owner.
   → It still works, unchanged. Nothing was moved out from under you while the gate is off.

### On production — `https://goldenfrijoles.com`, after the flip

4. Sign in, open `https://goldenfrijoles.com/app`, click **Setup**.
   → The rail shows Connect your agent · Keys · Destinations · Share links. `/app/keys`,
   `/app/flag-credentials` and `/app/agent-keys` are **no longer listed** — they redirect to Keys (A7).
5. Click **Connect your agent**.
   → The page is inside the product — no marketing header, no footer, no sales headline.
   → ⚠️ **Expect the honest "no connector yet" state, not a URL.** `miyagisanchez` has **zero**
   connector tokens (A10). That is the accurate answer, and it is what makes this page worth having.
6. Click **Mint a connector URL** and confirm. *(**Owed to Daniel by name** — this writes a real
   production credential; building the button is mine, pressing it is yours.)*
   → The token is shown **once**, with a copy button. Reload the page: the value is gone and the status
   now reads "Connector URL active since &lt;date&gt;". ⚠️ It does **not** claim Claude has connected —
   nothing in the product records a connector read, and the page says so.
7. Click **Keys** in the rail.
   → One list with all four credential kinds and a "what it may do" column. ⚠️ **Share links are NOT
   on this page** — they are their own Setup surface, and the page says so rather than implying it
   lists everything with access.
8. Sign in as a **non-owner member** of the project (or ask one to) and open the same Keys URL.
   → A **404**, not an empty page. *(auth path — **owed to Daniel by name**; no automated smoke covers
   a second real session.)*
9. Copy the connector URL and paste it into
   `https://claude.ai/customize/connectors?modal=add-custom-connector`.
   → Claude accepts the connector. *(**Owed to Daniel by name** — a real-account, real-session flow no
   automated smoke reaches.)*

If any step fails, note the step number + what you saw — that's the bug report.
