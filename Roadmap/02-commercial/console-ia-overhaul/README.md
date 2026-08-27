---
status: in-progress  # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: console-ia-overhaul
build_order: 25      # integer position in the ONE global build sequence — the SSOT once the epic
                     # exists (the seed's value is only a fallback). Fill it in at the betting
                     # table; plain integers, no "#2a" suffixes. See 00-ideas/README.md → Ordering.
---

# Epic: Four destinations — an information architecture for the signed-in console

> **Area:** 02-commercial · **Risk:** high · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/console-ia-overhaul.md`](../../00-ideas/seeds/console-ia-overhaul.md)
> **Appetite:** M (one wave) · **Underwritten by:** _null — not yet bet_
> **Audit:** [`00-ideas/audits/app-ux-audit-2026-08-01.md`](../../00-ideas/audits/app-ux-audit-2026-08-01.md) — §0, §1, §2.4, §3.3, §6.3, §6.7, §7.
> **Design (approved 2026-08-27):** [`design/ia-audit.html`](design/ia-audit.html) · [`design/flags-console-prototype.html`](design/flags-console-prototype.html)
> **Builds on:** `app-shell-and-agent-rail` (#12) — its shell and route inventory are extended, not rewritten.
> **Finishes:** `flags-console-parity` (#24) — whose Sprint 3 left the JSON authoring stack on the page.

## Why

The signed-in product has **sixteen destinations and no information architecture.** Thirteen of them
come from `lib/project-route-inventory.ts`; three more — `Home`, `Connect`, `Agent notes` — are bolted
into `ProductShell`'s header outside the inventory entirely. They are presented as one flat list
inside a `<details>` disclosure, ordered by the sprint that built each. Nobody decided to have
sixteen.

> **Corrected 2026-08-27 by the architecture lock (A1), counted rather than estimated.** This
> paragraph said *seventeen*, and *fifteen in the inventory*. The inventory holds **fourteen** surfaces,
> **thirteen** of which render (`onboarding` is `flow-only` and is filtered out), and the header adds
> **three** — `Sections` is the disclosure *containing* the other thirteen, not a destination. Counting
> the container as a destination is the exact confusion this epic exists to remove, so the count that
> makes the case is the one that survives the fix. The argument does not need the bigger number:
> nobody decided to have sixteen either.

**The defect underneath the navigation is that the product has no unit of work.** Golden Beans is a
growth engine: ship a thing, switch it on for some people, watch whether it moved the number — one
loop, about one object, a **feature**. There is no page for a feature. There are five pages that each
hold one aspect of one, and two of them can only be reached by typing a key into the address bar.
So the nav lists *containers*, because there is nothing else to list.

This is the same defect `flags-console-parity` fixed one level down. That page showed the storage
model instead of the job. The navigation shows the route table instead of the work.

**The outcome, stated as the test it must pass.** Today, reaching a feature's funnel requires knowing
that `/app/funnel/<project>/<key>` exists and hand-editing a placeholder the nav itself supplies.
**When this epic is done, every surface in the product is reachable in three clicks or one `⌘K`, and
no navigation entry anywhere tells anyone to edit a URL.**

## Platform-first note

**No new table, no new SQL, and no new auth boundary.** The nav is generated from an inventory that
already exists and is already unit-tested; the funnel and impact pages already work and are re-pointed
rather than rewritten; the per-project connector URL already renders inside `ProductShell` at a route
the nav filters out; the three credential pages already enforce owner checks that move with them.

> **Sharpened 2026-08-27 by the architecture lock.** "No new query" was too strong in one place and
> unproven in another, and both are now decided rather than left for a builder to discover:
> - **One new route handler** — `⌘K`'s feature index (A6) — which writes **no new SQL**: it calls the
>   existing `getFlagRegistryView()` behind the existing `requireProjectMembership`, and projects to
>   1.1 KB server-side so a page load pays nothing.
> - **Whether a migration is needed is Story 2.1's open question, not a settled "no"** — `connector_tokens`
>   has no column that could answer *"connected · last used when"*, and nothing in the product records a
>   connector read (A10). That criterion is escalated, not assumed away.

Per AGENTS rule #1 every read stays on the existing `lib/` seams. Per rule #2 `/install` is untouched —
it is a public page and serving the demo project's token there is *correct*; the defect was linking a
signed-in user to it. All new routes sit behind the same `requireProjectMembership` path as today's.

## What already exists (reuse, don't rebuild)

**Golden — use directly:**
- `apps/web/lib/project-route-inventory.ts` — every surface with label, audience, gate, description,
  unit-tested. **The nav needs no second list.**
- `apps/web/lib/shell-nav.ts` → `getShellNav()` — the active project, the project list, the entitled
  links. The project switcher's data is already resolved here.
- `apps/web/components/product/ProductShell.tsx` — the shell, already below the auth guard.
- `apps/web/app/app/onboarding/[projectSlug]/page.tsx` — **already renders the correct per-project
  connector URL inside `ProductShell`.** Story 2.1 is a registration plus a status line.
- `apps/web/lib/connector-tokens.ts` → `getActiveConnectorUrl(projectSlug)`.
- `apps/web/app/app/{funnel,impact}/[projectSlug]/[featureKey]/page.tsx` — both work today.
- `apps/web/lib/tars-query.ts` → `getFeatureFunnel()`, plus the North Star / impact query libs.
- `apps/web/lib/flag-list-view.ts` → `buildFlagListView` — per-environment projection, sort, filter
  and paginate, all pure and unit-tested. The dormant collapse is a grouping over its output.
- `apps/web/app/app/flags/[projectSlug]/flag-console.tsx` — extended, not replaced.
- `apps/web/app/app/flags/[projectSlug]/[flagKey]/page.tsx` — the per-feature destination that
  already carries insight, preview, versions and per-environment on/off. **It is what makes
  deleting the JSON stack safe** (see D6).
- `apps/web/app/app/flags/[projectSlug]/flag-vocabulary.ts` — the one module that owns user-facing
  flag words (D7 of `flags-console-parity`). Every word this epic renders goes through it.
- `apps/web/lib/flags.ts` — 20+ existing `=== 'true'` gates; the new one goes here.
- `apps/web/app/app/{keys,flag-credentials,agent-keys}/[projectSlug]/page.tsx` — all three already
  `audience: 'owner'`; their checks move with them, unchanged.

**Design — the reference IA** (product owner approved 2026-08-27): `design/ia-audit.html` places all
19 surfaces with the code evidence for each claim; `design/flags-console-prototype.html` is clickable.
Per WAYS-OF-WORKING, **a reference end-state is inspiration, never signed-off scope** — the acceptance
criteria below are the contract, not the pixels.

## Decisions — ✅ LOCKED BY THE ARCHITECT 2026-08-27, BEFORE ANY BUILDER STARTED

Every row below was verified against **the live code on `main`** and **the live production database**
(`slweidgffcfndnskcskc`) and the **live Vercel env scopes**. Builders **cite** these. They never
re-derive them, and they never widen one because a paraphrase read permissively.

**Where each contract lives — imported once, never restated.** Every rule this epic obeys already has
a home, and a copy of a rule is a second thing to keep true:

| Contract | Its one home |
|---|---|
| Tenancy · public-route allow-list · connector two-gate rule · "merge to `main` is the deploy" | `AGENTS.md` rules #1–#5 |
| House style, "a comment asserting a property the code lacks is a defect" | `CODE-QUALITY.md` |
| Gate polarity, `=== 'true'`, "set ≠ live" | `apps/web/lib/flags.ts` (the file's own 17 comments) |
| Which surfaces exist, who may see them, what gates them | `apps/web/lib/project-route-inventory.ts` |
| Every user-facing flag word | `app/app/flags/[projectSlug]/flag-vocabulary.ts` |
| Auth gates (`requireDashboardAccess` / `…Membership` / `…Ownership`) | `apps/web/lib/dashboard-auth.ts` |
| The three activation states, sort/filter/paginate | `apps/web/lib/flag-list-view.ts` |
| Local reproduction of CI's gate | team memory → *Local CI gate recipe* |

### The locked decisions

| # | Decision — LOCKED | Verified against |
|---|---|---|
| **D1** | **One project switcher. There is no organisation layer and this epic does not add one.** | ✅ **VERIFIED.** `lib/membership.ts` → `getUserProjects` returns a flat `MemberProject[]`. The production schema has **58 tables and not one** organisation/tenant-group table (`information_schema.tables`, read 2026-08-27). The first-draft two-level breadcrumb has no data model behind it. |
| **D2** | **The four sections are a `section` field on the existing inventory, not a second list.** Closed union `'today' \| 'measure' \| 'ship' \| 'setup'`. | ✅ **VERIFIED.** `ProjectSurfaceGate`'s own comment already establishes the technique and the reason. `lib/shell-nav.ts`'s D1 comment already forbids a hardcoded list in `ProductShell`. |
| **D3** | **`funnel` and `impact` leave the inventory; `DEFAULT_FEATURE_HINT` dies with both call sites.** The routes keep working. | ✅ **VERIFIED.** Both are `topLevelProjectRoute: false` with `description: () => 'swap the feature key in the URL'`. `DEFAULT_FEATURE_HINT` has exactly **two** production call sites — `lib/shell-nav.ts:44,96` (declares + uses) and `app/app/page.tsx:13,90` (imports + uses) — plus two literal `'your-feature-key'` strings in `lib/project-route-inventory.test.ts:38,66`. **All four go in Story 1.2 or the constant survives with one user.** |
| **D4** | **`CONSOLE_SHELL_ENABLED` stays OFF until Story 3.5.** | ✅ **VERIFIED and reinforced** — see A3 and A4 below, which found *two* controls this epic would otherwise have removed before their replacement existed. That is the third and fourth instance of the hazard `flags-console-parity` Amendment 1 records. |
| **D5** | **The credential merge widens no boundary.** | ✅ **VERIFIED, with a correction to how it is described.** All three source routes call `requireProjectOwnership(projectSlug)` **at the route**, so a member already gets a flat 404 (`app/app/{keys,flag-credentials,agent-keys}/[projectSlug]/page.tsx:1`). There are **not three different checks to preserve — there is one**, applied three times. The merged route calls it once at the route, which is *identical*, not looser. See **A5** for what "each section re-asserts its own check" is corrected to. |
| **D6** | ⚠️ **PARTIALLY DISPROVED. The per-feature page is a superset for four of five controls and NOT for the fifth.** | See **A3**. `[flagKey]/page.tsx` carries insight, preview, the version list, per-environment on/off and serve-any-version — *and cannot create a flag that does not yet exist*. Story 3.3 is re-scoped, not deferred. |
| **D7** | ✅ **RESOLVED, with the measured number: (a) lazy — the palette fetches on first `⌘K`, never on page load.** | Measured against production for the largest real tenant (`miyagisanchez`) 2026-08-27: **42 flags · 44 versions · 15,639 bytes of definition JSONB · 55 lifecycle-audit rows, across 5 round trips** — that is what `getFlagRegistryView()` costs. The keys alone are **1,102 bytes**. Option (b) (seed from the pages that hold the registry) does not work: the palette must open on *every* `/app` route, so (b) means paying that 5-query, ~16 KB cost on every signed-in render to serve a control most sessions never press. See **A6** for the exact shape and its one stated deviation. |
| **D8** | ⚠️ **DISPROVED. It is sixteen, not seventeen — and the inventory holds fourteen, not fifteen.** | Counted 2026-08-27. See **A1**. |
| **D9** | ⚠️ **DISPROVED, decisively, with a number: they are two separate registries with ZERO overlap.** | `features` (TARS) holds **1** row for `miyagisanchez` — `setup_guide`. `flag_registries` holds **42** — `checkout.stripe_enabled`, `catalog.owned_shop_only_enabled`, … The join on `key` returns **0**. See **A4**. |

---

### Amendments — every deviation, decided here rather than discovered mid-build

#### A1 — "Seventeen destinations" is wrong. It is **sixteen**, and the inventory holds **fourteen**. *(disproves the Why section)*

Counted against `PROJECT_ROUTE_INVENTORY` and `ProductShell`'s header on `main`:

- **14** inventory surfaces (the README said 15): funnel · impact · journeys · experiments · flags ·
  tasks · scenarios · keys · flag-credentials · flag-audit · destinations · shares · agent-keys ·
  onboarding.
- **13** of those render for the owner of `miyagisanchez` **in production today** — `onboarding` is
  `status: 'flow-only'` and `getProjectSurfaceLinks` filters it out. Every gate that could hide one is
  live: `EXPERIMENT_GOVERNANCE_ENABLED`, `JOURNEY_PROJECTIONS_ENABLED`, `SIGNALS_ENABLED`,
  `FLAG_CONSOLE_ENABLED` all Production-set, and `FLAG_SERVING_ENABLED` **live-proved on** by
  `GET /api/v1/flags/snapshot` returning **401, not 404** (2026-08-27).
- **3** header destinations, not four: `Home` → `/app`, `Connect` → `/install`, `Agent notes` →
  `/llms.txt`. **`Sections` is not a destination** — it is the `<details>` disclosure that renders the
  inventory. Counting the container as a destination is exactly the confusion this epic exists to fix.

**13 + 3 = 16.** The Why section is corrected to sixteen. The argument is *unaffected* and does not
need the better-sounding number: nobody decided to have sixteen either, and one of them is a
disclosure containing the other thirteen.

#### A2 — ⚠️ **Preview deployments do not mirror production's gates. The Sprint 1 and 2 walkthroughs as scaffolded cannot pass on a preview, and that is not a bug.**

`vercel env ls`, read 2026-08-27:

| Var | Production | Preview | Development |
|---|---|---|---|
| `FLAG_CONSOLE_ENABLED` | ✅ | ✅ | ✅ |
| `FLAG_RULE_BUILDER_ENABLED` | ✅ | ✅ | ✅ |
| `AGENT_RAIL_ENABLED` | ✅ | ✅ | ✅ |
| `FLAG_SERVING_ENABLED` | ✅ | ❌ | ❌ |
| `EXPERIMENT_GOVERNANCE_ENABLED` | ✅ | ❌ | ❌ |
| `JOURNEY_PROJECTIONS_ENABLED` | ✅ | *(one dead branch scope)* | ❌ |
| `SIGNALS_ENABLED` | ✅ | ❌ | ❌ |
| `CONNECTOR_ENABLED` | ✅ | ❌ | ❌ |
| `SITE_URL` | ✅ | ❌ *(by design — `site-url-preview-aware`)* | ❌ |

So on a branch preview a member sees **9** surfaces, not 13: Flags, Experiments, Journeys and Tasks
are all gate-closed there. **Sprint 1's walkthrough step 5** ("Ship's rail shows Environment picker,
Features, Experiments and Activity") would render **Activity alone** on a preview — a correct render
that reads exactly like a broken one.

**Decision.** The gate-**off** steps (the 404s) stay on preview, because they depend on no other
epic's gate. Every gate-**on** step moves to **production, after Story 3.5's flip**, and each sprint
walkthrough says which environment it is for, per step. Mirroring four other epics' gates into
Preview would change what previews serve for work this epic does not own; it is offered to Daniel as
an option, not taken unilaterally.

*This is the `site-url-preview-aware` lesson one level up: `vercel env ls` before designing, not
after. The safety property here is environmental, and no test in this repo can see it change.*

#### A3 — ⚠️ **D6 is PARTIALLY DISPROVED: Story 3.3 as written would delete the only way to create a new feature.** *(re-scopes Story 3.3)*

`[flagKey]/page.tsx` was read line by line on `main`. It carries **four** of the five controls the
JSON stack holds — `FlagInsight`, `FlagPreview`, the immutable version list with its JSON, `FlagSwitch`
(per-environment on/off) and `FlagVersionServe` (serve any version). D6's superset claim holds for all
of those.

**It does not hold for creation.** `[flagKey]/page.tsx` renders
`<FlagAuthoring slug={projectSlug} flagKey={flag.key} />` — the key is **fixed from the route**, so it
versions a flag you can already click. The `<form onSubmit={onCreate}>` block in `flag-manager.tsx`
(lines 386–427), the one whose `<h2>` reads *"Create an immutable definition version"* and which
Story 3.3's acceptance names for deletion, is **the only surface in the product that can create a
flag key that does not yet exist.**

`flag-manager.tsx` already says this out loud, at lines 429–436, and it was written *because this
nearly happened once already*:

> *"Gating that whole block on `showCredentials` hid the AUTHORING form too — and with the console on,
> the per-feature destination only versions a flag you can already click, so there would have been NO
> way to create a new flag at all. That is the third time in this epic that a control was nearly
> removed before its replacement existed. **The authoring form therefore STAYS in both gate states
> until something replaces it.**"*

Story 3.3's own escape hatch — *"authoring remains possible on the per-feature route and the catalog
sync"* — is **false for the per-feature route** and true only for catalog sync, which is an API
reached with a `flag_sync` credential, not a console path.

**Decision — Story 3.3 is RE-SCOPED, not deferred.** With `CONSOLE_SHELL_ENABLED` on it deletes the
per-flag **duplicate**: the definitions stack (`showDefinitions`), the `RuleBuilder` and the
raw-JSON authoring textarea — **and lands, in the same story, a "New feature" creation control on the
features list**, written in `flag-vocabulary.ts` words, posting through the *same*
`createFlagDefinitionVersionAction` (one write path, one validator — `flags-visual-rule-builder` A1).
The gate-off branch is untouched.

*This is LEARNINGS' rule applied before a builder could break it: **land the replacement and retire the
original in the SAME story**. It is also the second time in two epics that a constraint written in a
code comment turned out to be load-bearing — "a constraint you cannot immediately justify is not
thereby unjustified", and this one justified itself in one grep.*

#### A4 — ⚠️ **D9 is DISPROVED with a number: the two registries do not intersect at all.** *(re-scopes Story 3.2 and corrects its walkthrough)*

Live production, 2026-08-27, `miyagisanchez`:

```
features (TARS)        1 row    → setup_guide
flag_registries       42 rows   → checkout.stripe_enabled, catalog.owned_shop_only_enabled, …
join on key            0 rows
```

They are separate tables, separate lifecycles, separate naming conventions, and **not one flag has a
TARS counterpart**. `getFeatureFunnel()` filters `events` by `feature_id = <featureKey>`, so a Funnel
tab on `checkout.stripe_enabled` returns `feature_not_found` — **for 42 of 42 features, today**.

**Decision — Story 3.2 ships, and the honest empty state IS the deliverable.** The tabs are built; for
every feature currently in the registry they render the sentence naming *which* absence this is
(*"`checkout.stripe_enabled` is a feature flag. It has no funnel because nothing in the TARS registry
is measuring it"*) rather than a zero. Two hard constraints:

1. **The tab must not call `notFound()`.** `app/app/funnel/[projectSlug]/[featureKey]/page.tsx:26`
   does exactly that on `feature_not_found`. A tab that 404s the whole feature page because the
   *other* registry has no row would be a regression caused by a missing measurement.
2. **The spec must be written against a feature that HAS a funnel** — that is `setup_guide`, and it is
   not a flag, so the funnel-renders-numbers spec belongs on `/app/funnel/…/setup_guide`, while the
   feature-page tab spec asserts the *empty state*. Asserting numbers on a flag's tab is a test that
   cannot pass.

**Sprint 3's walkthrough step 5 is corrected** — it told Daniel that clicking Funnel on
`checkout.stripe_enabled` renders Targeted/Adopted/Retained numbers. It cannot, and shipping that
sentence would have him report a correct empty state as a bug.

*This is the fifth appearance in this repo of "a query that silently requires a tag the realistic
caller has no reason to set". The difference this time is that it was found **before** the code was
written, by asking the database instead of the doc — and the answer is not a bug to fix but a
sentence to render.*

#### A5 — D5's "each section re-asserts its own check" is corrected to what it can actually mean

There is **one** boundary — `requireProjectOwnership` — and all four credential kinds sit behind it
today. "Four sections each re-asserting their own check" would describe four boundaries that do not
exist, which is a `CODE-QUALITY` rule 3 defect written in advance.

**Locked instead:** `/app/setup/keys/[projectSlug]` calls `requireProjectOwnership` **at the route,
before any list read**, exactly as its three sources do; and **each of the four list/mint/revoke
server actions independently re-resolves ownership**, as they already do today — the page's guard is
never the only thing standing between a member and a mint. The acceptance test is unchanged and
testable: **a member gets a flat 404, not an empty page.**

#### A6 — D7's resolution, and its one stated deviation from "no new query"

**Locked: lazy, on first `⌘K`, through a Route Handler that reuses the existing seam.**

- `GET /api/internal/feature-index/[projectSlug]` — `requireProjectMembership` first (no new auth
  boundary), then calls the **existing** `getFlagRegistryView()` and projects it **server-side** to
  `{ key, description }[]`. **~1.1 KB crosses the wire, once per palette open**, not 16 KB per page.
- **The stated deviation:** the Platform-first note promises "no new query". No new **SQL** is
  written — but this is **one new route**. Sprint 1's Story 1.5 constraint ("no new query, no new
  route") is a *Sprint 1* constraint and is honoured there: the surfaces palette needs no data at all,
  because `getShellNav()` already resolved the links. Story 3.4 adds the route. Said here so a builder
  does not have to decide it and a reviewer does not have to catch it.
- **The number Story 3.4 must state:** `/app` route load cost is **unchanged — zero added queries,
  zero added bytes**, because nothing is fetched until the palette opens.

#### A7 — ⚠️ **The two Setup routes need a fifth gate value, and the three routes they replace need to LEAVE the nav when it opens**

`ProjectSurfaceGate` is a closed union and `ProjectSurfaceGates` is built in **three** places
(`lib/shell-nav.ts`, `app/app/page.tsx`, `lib/project-route-inventory.test.ts`). Sprint 2 adds
`'console-shell'` to the union and all three records **in one commit**, and the compile error is what
guarantees it.

The harder half: with the gate **on**, `Setup › Keys` supersedes `/app/keys`, `/app/flag-credentials`
and `/app/agent-keys`, which Story 2.3 says "stay reachable and redirect here". A route that redirects
must not also be a nav entry. **Locked:** a second derived gate value, `'legacy-keys'`, supplied as
`!isConsoleShellEnabled()` by all three callers. No new field on `ProjectSurface`, no special case in
the filter, and the three legacy surfaces leave the nav at exactly the moment their replacement
appears — the same instant, by construction, which is the whole point.

#### A8 — **`ProductShell` must be told its section, and the compiler must make that mandatory**

Stories 1.3 and 1.4 need the *active* section. `ProductShell` today receives only `projectSlug`, and
its own comment says it is "deliberately not told the route segment". Next.js gives a Server Component
no pathname, and the alternative — a client island reading `usePathname()` — is the one thing this
file's comments forbid twice ("a client island here would be the one component able to break all of
them at once").

**Locked:** `ProductShell` gains a **required** `section: ConsoleSection` prop. There are **18**
`<ProductShell` call sites; making it required turns "every page declares where it lives" into a
compile error at each one. This is architect work in Story 1.3, done first, because every branch
opened afterwards inherits it.

#### A9 — **The `⌘K` palette is the one client island in the shell, and it must fail to nothing**

Story 1.5's "it cannot break the page it sits on" has no mechanism in this repo — **there is no
ErrorBoundary anywhere in `apps/web`** (grepped 2026-08-27). **Locked:** the palette ships as
(1) a pure, zero-DOM filter in `lib/` with unit tests, plus (2) a client component wrapped in a
minimal client-side error boundary that renders `null`. The boundary is written as part of Story 1.5
and mutation-checked by throwing from the palette on purpose and confirming the page still renders.

*A guard that has never been observed catching anything is not a guard — `landing-frijoles-rebrand`
shipped three that could not fail.*

#### A10 — ⚠️ **Two of Story 2.1's acceptance criteria are unbuildable as written. ESCALATED to Daniel 2026-08-27.**

Both are facts about the live system, not preferences:

1. **"Connected · last used &lt;when&gt;" has no source of truth.** `connector_tokens` has exactly five
   columns — `id, project_id, token, revoked_at, created_at`. **There is no `last_used_at`**, and
   nothing anywhere records a connector read: `app/api/v1/public/mcp/c/[token]/route.ts` calls
   `resolveConnectorToken` and writes nothing, and `audit_log` has **no connector action at all** (13
   distinct actions in production, none of them connector-related). "Last used" needs either a
   migration plus a write on a hot public read path, or it needs to not be claimed.
2. **`miyagisanchez` has ZERO connector tokens — not one revoked, none.** Production holds three rows
   total: `golden-beans-demo` (active), `miyagi` (active), `golden-beans` (revoked). So Story 2.1's
   "honesty check" fallback is not the edge case, it is **the only case** for Daniel's own tenant. And
   `lib/connector-tokens.ts` states in its own comment that **"v1 has no self-serve token minting"** —
   so "offer to mint one" is a **new production credential-minting surface**, which is outside this
   epic's pre-authorized merge scope by name.

**Status: awaiting Daniel. Sprint 1 does not depend on either and proceeds.** The answer is recorded
here as a dated amendment when it arrives.

---

### Routing — who builds what, and why

Stated so the choice is auditable (WAYS-OF-WORKING → *Routing a build by model tier*).

| Sprint · Story | Built by | Why |
|---|---|---|
| **1.1 The gate** · **1.2 `section` on the inventory** · **1.3 The shell + A8's required prop** | **Architect (Claude Opus 5), never delegated** | Shared surface with the epic's largest blast radius: `flags.ts`, `project-route-inventory.ts` and `ProductShell` are imported by every signed-in route and by every branch opened after this. WAYS-OF-WORKING: shared-surface work is done *first and by the architect*. |
| **1.4 The per-section rail** · **1.5 `⌘K` over surfaces** | **Codex** (`gpt-5.6-terra`, `--tier build`) | Mechanical over a locked contract: the rail is a filter over `section`, the palette is a filter over links `getShellNav()` already resolved. Both have zero-DOM pure cores that the unit layer pins. |
| **2.1 `Setup › Connect`** · **2.3 One `Setup › Keys`** | **Architect, never delegated** | Credential surfaces. `auth · never delegated` is the routing table's own line, and A5 + A10 are exactly where a boundary widens by accident. |
| **2.2 The `/install` link** | **Codex** (`--tier standard`) | One link and one comment; `/install` itself is provably untouched by `git diff`. |
| **3.1 Answer line + dormant collapse** · **3.2 Funnel/Impact tabs** · **3.4 `⌘K` feature index** | **Codex** (`--tier build`) | Arithmetic in `flag-list-view.ts` (pure, unit-tested), a tab over existing query libs, a filter over A6's projection. All three are downhill over a locked contract. |
| **3.3 Delete the JSON stack + land "New feature"** · **3.5 The flip** | **Architect, never delegated** | 3.3 removes a control *and* lands its replacement (A3) — the ordering rule, and the epic's single most-repeated hazard. 3.5 is what users see, and it is a product-owner merge. |

**Review is inverted from the build, by the router, never hand-picked** —
`node scripts/review-route.mjs --builder <who-wrote-it> --tier <low|high> <PR#>`. Two cross-family
passes per PR from the families that did **not** build it; the fresh reviewer subagent on **HIGH tier
only**. A capped family is a **refund ask to Daniel**, not a licence to substitute subagents.

### Branch stack

`feat/console-ia-overhaul` → `feat/console-ia-overhaul-s2` → `feat/console-ia-overhaul-s3`, each cut
from the previous, one PR per sprint, merged in order. **Merged without `--delete-branch` until the
last one** — merging a stacked PR's base with `--delete-branch` auto-closes the child irreversibly
(`app-shell-and-agent-rail`, 2026-08-07). Expect a conflicted child after each merge and rebase it
immediately: **a conflicted PR stops CI from creating any run at all**, which presents as an outage
(`gh pr view <N> --json mergeable` first).

## Deploy order

**Frontend-only; no migration.** The sequence that is never an outage:

1. **Sprint 1 merges dark.** `CONSOLE_SHELL_ENABLED` unset ⇒ `ProductShell` renders today's header,
   byte-for-byte, auditable by `git diff` rather than promised in prose.
2. **Sprint 2 merges dark.** The two Setup routes follow the established
   `if (!isConsoleShellEnabled()) notFound()` pattern — *dark means nonexistent, before auth or
   project lookup* (`app/app/journeys/[projectSlug]/page.tsx`). An unauthenticated GET returns a flat
   **404** while dark and a login redirect once open; both are assertable by the Playwright `api`
   project, which is what Sprint 1 and 2's gate specs actually test.
3. **Sprint 3 merges dark**, then Story 3.5 flips the var — **preview first, verified, then
   production**. Per AGENTS rule #4, setting the var is half the job: a **commit to `main`** is what
   makes it live. Never `vercel deploy`.
4. **Only after the flip is verified** are the dead header links and the `<details>` disclosure
   deleted (Story 3.5's second half).

> **A2 changes where the walkthroughs run, and it is not a detail.** `FLAG_SERVING_ENABLED`,
> `EXPERIMENT_GOVERNANCE_ENABLED`, `SIGNALS_ENABLED` and `JOURNEY_PROJECTIONS_ENABLED` are
> **Production-only**, so a branch preview shows **9** surfaces where production shows **13** — Flags,
> Experiments, Journeys and Tasks are all gate-closed there. Every *gate-off* step (the 404s) stays on
> preview, where it depends on nothing this epic does not own. Every *gate-on* step runs on
> **production, after Story 3.5's flip**, and each walkthrough step now names its environment.
> Mirroring four other epics' gates into Preview would change what previews serve for work this epic
> does not own — it is offered to Daniel as an option, not taken.

## Scope — stories

| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 The gate — `CONSOLE_SHELL_ENABLED`, born OFF | high |
| 1 | 1.2 `section` on the route inventory; funnel/impact leave it; `DEFAULT_FEATURE_HINT` deleted | high |
| 1 | 1.3 The shell: project switcher + four sections | high |
| 1 | 1.4 The per-section rail | low |
| 1 | 1.5 `⌘K` over surfaces | low |
| 2 | 2.1 `Setup › Connect` — your own connector URL, with a status | high |
| 2 | 2.2 The signed-in Connect link stops pointing at `/install` | low |
| 2 | 2.3 One `Setup › Keys` — four credential kinds, one page | high |
| 3 | 3.1 The features list: the answer line and the dormant collapse | low |
| 3 | 3.2 Funnel and Impact as tabs on a feature | low |
| 3 | 3.3 Delete the JSON authoring stack and the rule builder | high |
| 3 | 3.4 `⌘K` indexes feature keys (resolves D7) | low |
| 3 | 3.5 Flip the gate; delete the dead header nav | high |

## Definition of Done (epic)
- [ ] All sprints merged to `main` + smoke-tested (gaps stated)
- [ ] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [ ] This README marked ✅; every sprint status ticked with commit refs
- [ ] `RETROSPECTIVE.md` written
- [ ] Product poster (`Roadmap/README.md`) updated — the **02 · Commercial** section
- [ ] **Landing backfill check:** this epic changes no public offer (`/install` is untouched, D-note
      above), so no landing section moves. State that explicitly at close rather than skipping it.
- [ ] Team memory + `MEMORY.md` index updated
- [ ] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [ ] **Kill-switch:** `CONSOLE_SHELL_ENABLED` exists in **every env**, created **DISABLED**
      (enablement polarity), and Story 3.5's flip is verified live. *Verify-only — decided at
      grooming, not a new gate here.*
- [ ] Feature branch deleted; **this README's frontmatter `status: shipped`** (the SSOT — run `node scripts/build-order.mjs`)
