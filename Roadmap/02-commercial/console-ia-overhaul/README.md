---
status: shipped  # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
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

> **Sharpened 2026-08-27 by the architecture lock, then AMENDED by A18.** ⚠️ **This epic does ship
> one migration** — a partial unique index closing a race both cross-family reviewers raised as
> Blocking (A18). "No new table" still holds. The rest of this note stands:
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
~~Per WAYS-OF-WORKING, **a reference end-state is inspiration, never signed-off scope** — the
acceptance criteria below are the contract, not the pixels.~~

⚠️ **WITHDRAWN by A22 (2026-08-28).** That sentence is why Sprints 1 and 2 shipped a correct
information architecture and a rejected visual result: every criterion below is structural, the
build satisfies all of them, and it looked like a different product. **Where the product owner has
approved a design, the design IS the contract** — `design/CONSOLE-CONTRACT.md` and
`design/flags-console-prototype.html` are binding for every signed-in route, and
`e2e/console-visual.authed.spec.ts` is the assertion that can go red on the way a page looks.

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

#### A10 — ⚠️ **Two of Story 2.1's acceptance criteria were unbuildable as written. ESCALATED and ✅ ANSWERED 2026-08-27.**

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

**✅ ANSWERED BY DANIEL 2026-08-27. Story 2.1 is unblocked; both answers are the contract now.**

1. **"Last used" is dropped. The status is provisioned / not-provisioned, and it says which it is.**
   *"No connector URL for this project yet"* or *"Connector URL active since &lt;created_at&gt;"* — both
   derivable from the five columns that exist. **No migration, and no write added to the connector's
   public read path.** The Platform-first note's "no new table, no new SQL" therefore holds after all.
   **The page must say, in words, what it does and does not know:** that a connector URL exists is not
   the same claim as that Claude ever used it, and a status line that blurs the two would be exactly
   the `CODE-QUALITY` rule 3 defect — prose asserting a property the system cannot observe.
2. **The owner-gated mint button IS built, and the production mint stays Daniel's act.**
   - An **explicit owner-only server action** — never on render. `lib/connector-tokens.ts`'s own
     comment forbids minting as a render side effect ("a bot crawl or prerender hitting this page
     shouldn't create credentials"), and that constraint is untouched: a mint requires a POST from an
     owner.
   - **Audited**, like every other mint in this product — `connector_token_minted` into `audit_log`,
     alongside `api_key_issued`, `flag_read_key_minted`, `agent_write_key_minted` and the rest. There
     are 13 audited actions today and **not one of them is connector-related**; that gap closes here.
   - **Shown once**, on its own, with a copy button — never read back off a table.
   - **AGENTS rule #3 is unchanged and must stay unchanged:** the connector has two independent kill
     switches, `CONNECTOR_ENABLED` and the revocable per-project token. Minting adds a way to create
     the second one. It must not become a way around the first — **the mint control does not render,
     and the action refuses, while `CONNECTOR_ENABLED` is off.**
   - **Pressing it against production is Daniel's, by name.** Building the surface is this epic's
     work; minting a real production credential is not something a merge authorization covers
     (team memory: *env vars pre-authorized, minting production credentials never*).

**A2's answer, same date: previews are left alone.** The five Production-only gates are not mirrored —
mirroring them would change what every preview serves for four other epics' features this epic does
not own. The walkthroughs are already written for it: dark-state steps on preview, lit-state steps on
production after the flip.

---

#### A11 — **`Today` IS `/app`.** Two stories asked for things that only fit if it is

Story 1.3 says the logo links to Today. Story 1.4 says *"Today has no rail and renders full width"*.
Those fit together only if Today is a **page** rather than a container — and it already is one: `/app`
is Command Center, whose entire subject is *"did anything need me today"*.

**Locked:** Today's href is `/app`, the logo points at the same place, and `tasks` — the one `today`
surface — is reached from Command Center and from `⌘K` rather than from a rail Story 1.4 says must
not exist. `lib/console-shell.ts` exports it once as `TODAY_HREF`.

A consequence worth stating: `ShellSection` is `ConsoleSection | 'home'`, and `home` and `today` mark
the **same** tab. They are kept as two names because they answer different questions — `home` is where
`/app` itself says it lives, `today` is what a surface classified into that section says — and a spec
asserts that exactly one tab is current for every one of the five values, never zero and never two.

#### A12 — **A tab with no entitled surface behind it is ABSENT, not disabled**

`Ship` holds three surfaces on three independent gates; `Setup` holds five owner-only ones. A member
entitles none of Setup, and on a preview `Ship` is down to one surface (A2). Rendering the tab anyway
would give a member a tab that 404s them.

**Locked:** a section renders only when the viewer entitles ≥1 surface in it. **`Today` is the
exception and always renders**, because `/app` cannot be gated away. `getSectionEntryHref` returns
`null` rather than `''` for an unentitled section, and a spec pins that distinction — an empty string
renders as `href=""`, which navigates to the current page: a tab that silently does nothing.

#### A13 — **The switcher moves you to the same SECTION, and resolves the target project's own role**

`ProductShell`'s old comment explained why it linked to `/app` instead of offering a switcher: *"a
real switcher has to know the CURRENT surface to move you to the same page in another project, and
this component is deliberately not told the route segment."* A8 changed that premise — the shell is
now told its section. It is still not told the route segment, and the switcher does not pretend
otherwise: it moves you to the equivalent **section**, a promise it can keep, not the equivalent
**page**, which it cannot.

**The tenancy detail that needed a spec:** the target project's landing is resolved with **that
project's role**, never the active one's. A viewer who owns project A and is only a member of project
B must not be offered B's owner-only Setup landing on the strength of a role held in A. Gates are
process-wide; roles are per project. Where the target entitles nothing in the section, the switch
degrades to `/app` rather than linking someone at a route that will 404 them.

#### A26 — ⚠️ **A3 and A21 are BOTH still wrong about one thing: the per-feature route CAN create a new key.** *(2026-08-28, verified by reading `flag-authoring.tsx`)*

A3 says `[flagKey]/page.tsx` *"cannot create a flag key that does not yet exist"* because it renders
`<FlagAuthoring flagKey={flag.key} />` with the key fixed from the route. A21 corrected the COUNT of
creation paths from one to two and left that sentence standing. It is false.

`FlagAuthoring` passes `initialFlagKey`, and **`RuleBuilder`'s key field stays editable** — the
component's own comment says so, and explains that it follows the key on save precisely because *"a
sync-created flag sometimes needs its key corrected"*. So an owner on any feature's page can retype
the key and create a different feature. That path survives Story 3.3 untouched, and it rides
`FLAG_RULE_BUILDER_ENABLED`.

**Nothing about the plan changes, and that is worth saying rather than leaving implied.** Story 3.3's
"New feature" control is still required, for two reasons that outlive this correction:

1. It is gated independently. With `FLAG_RULE_BUILDER_ENABLED` off — its born state, and a state a
   kill switch exists to reach — the per-feature builder does not render, and the console would have
   no creation path at all.
2. *"Open an unrelated feature and retype its key"* is not a creation control. Nobody looking to add
   a feature finds it, which is the same defect as a nav entry telling you to edit the URL.

Recorded because a reader who trusts A3's sentence draws a wrong conclusion in the dangerous
direction — *"the per-feature page cannot create, so nothing else can"* — and this epic has now
corrected the same claim twice. The habit that works is reading the file the citation names.

#### A25 — **A22 applies to every signed-in route, so the sweep is at the CLASS.** *(2026-08-28)*

A22's scope line — *"the console visual language applies to **every signed-in route**, not only the
flags surfaces"* — was implemented for the shell and Ship › Features in Part A and for nothing else.
The other twelve routes were still rendering the landing's label style. Two sweeps, both keyed on the
shared component classes rather than on the pages:

- **Do-not #3.** `FILTER THE AUDIT`, `2 ROWS`, `WHAT THIS PROJECT IS NOT MEASURING YET (2)` and every
  `<th>` in every `DataTable` were tracked uppercase MONO — a column-label style used as a body
  style. Split the contract's own way: what labels a COLUMN keeps uppercase at the measured 11px
  Archivo 600; everything else becomes sentence-case sans. One `.is-console` block, twelve routes.
- **Do-not #1.** Every route rendered `<h1>Keys — miyagisanchez</h1>` above a "← Your projects" link.
  Both are gone: the top bar's switcher names the project on every console route, and the rail is the
  way back. The flags page's LEGACY branch keeps both, because that markup IS the gate-off render and
  D6 promises flipping the flag returns the pre-epic page.

**⚠️ What the sweep does NOT reach, stated rather than implied.** Command Center's own layout is
still pre-contract — mono-italic caveats, a wide vertical gap between the stat row and the funnel
figures. It is a page redesign, no story in this epic covers it, and half-doing it here would leave a
route that is neither. Owed, and named in `sprint-3.md`.

#### A24 — **Targeting is split out of Value, and the environment summary sits ABOVE the tabs.** *(2026-08-28, deviation from the design's tab list)*

The approved design gives a feature seven tabs: Value · Targeting · Environments · Funnel · Impact ·
History · Settings. This ships **six**, and the two differences are decisions rather than omissions.

- **`Targeting` exists, and it is not optional.** Story 3.2 added Funnel and Impact to a page whose
  Value tab already carried the rule builder AND "preview as a user". Measured at 1440 × 960 the page
  was **3346px tall** — the contract's no-scroll promise broken on the second-most-visited surface in
  the console. Both moved to Targeting, where they answer the question the tab is named for.
- **`Environments` does NOT exist as a tab.** Its content — one row per environment, with the state
  and who did it — renders above the tab strip instead. *"Is this on, and where"* is the question
  somebody opening a feature arrives with, and a tab they have to find first is not an answer to it.

⚠️ **The tab strip is a `<nav>` with `aria-current`, not a `role="tablist"`.** A first version used
`role="tab"`; these are links whose activation is a full navigation, and there is no JS on the page
to give a tablist its arrow keys, so the role would have been an ARIA claim the page cannot keep. It
is now the same markup `ProductShell`'s section tabs use — one pattern, learned once.

#### A23 — **The "New feature" wizard has no environment step, and creates a definition that defaults to `on`.** *(2026-08-28, deviations from the prototype's wizard)*

Two deviations, both forced by the difference between the prototype's model and this control plane's.

**1. Step 3 is a review, not "Where should it exist?".** The design's third step activates the new
feature in the chosen environments. That is a SECOND write — `activateFlagAction`, once per
environment, each carrying an optimistic snapshot revision and each gated on `FLAG_SERVING_ENABLED` —
and a create-then-activate sequence has a partial-failure state this control would then have to
explain. Story 3.3's locked contract is *"posting through the SAME
`createFlagDefinitionVersionAction` — one write path, one validator"*. So the feature arrives
switched on nowhere, the review says so in words, and turning it on is one click from the row switch
this story also lands.

**2. `defaultVariantKey` is `on` for BOTH kinds.** The obvious reading of the design — *a kill switch
is on by default, a release toggle is off by default* — maps `enablement` onto
`defaultVariantKey: 'off'`. In Golden that creates a feature you cannot turn on: **activation and
what the served version EVALUATES to are two different things**, and a definition defaulting to `off`
serves `false` while the console reports the feature as on. That is the "activated ≠ on" trap the
latest version of 34 of 42 live flags is already in, and `describeActivationSurprise` raises a
confirm on every activation of such a version — so the wizard would have manufactured features whose
own switch warns about them, forever.

What the KIND decides instead is `metadata.polarity`, which drives how loudly the console warns
before a flip and how the list sorts and filters. That is exactly what the design's own copy claims
for it: *"the difference decides how loudly this screen warns you before flipping it."*

#### A22 — ⚠️ **The approved design is BINDING, the AgentRail leaves the console, and the flags page is rebuilt against the prototype.** *(2026-08-28, Daniel)*

> *"The signed-in console must look like that file. Every page under /app. … The current UI/UX is
> completely wrong, including all the text. It should match the mockup perfectly. Nothing else is
> approved."*

**The sentence this amendment withdraws is this document's own:**

> *"a reference end-state is inspiration, never signed-off scope — the acceptance criteria below are
> the contract, not the pixels."*

That sentence is why Sprints 1 and 2 shipped a correct information architecture and a **rejected
visual result.** Every acceptance criterion in this epic is structural — *"the header renders one
project switcher and four sections"* — and the shipped build **satisfies all of them** while looking
like a different product: a 48px `h1` wrapping to four lines, three-line rail cards with `GATED`
badges, uppercase mono body copy, and a list that scrolls forever. **Nothing in the plan could go red
on the way a page looked.**

WAYS-OF-WORKING's rule about reference end-states exists to stop a *spec doc* being treated as
signed-off scope. It does not mean an explicitly approved design has no force. **Where the product
owner has approved a design, the design is the contract.**

`design/CONSOLE-CONTRACT.md` and `design/flags-console-prototype.html` are now committed to the repo
and binding for every signed-in route. ⚠️ **They were cited twelve times across nine source files
before either was committed** — every numbered "Do-not" was unresolvable, including the one
authorising the AgentRail removal (fresh reviewer, PR #124, Blocking). A contract that cannot be read
is not a contract.

**A22a — the AgentRail does not render on console routes.** This closes Do-not #4, which the contract
correctly identifies as *"a decision the epic never made, and it must be made explicitly rather than
inherited."* The rail appears in none of the ten approved reference states, and inside the console
grid it squeezed the content column to **544px** against the approved **1180** — which is why every
table clipped.

⚠️ **The honest description is "the rail is gone", not "the rail is conditional."** `header !== null`
IS the console, and after A19 that is every signed-in `/app` route; the remaining branch needs
`activeProject`, which needs a session. Nothing renders it in practice.

So it is a **control removed**, and this epic's own ordering rule applies: name what it carried and
where each thing goes. It carried the agent's recent activity and its waiting-on-you queue. The
approved design gives both a home — **"What changed & why"** in the top bar — **which is not built.**
Until it is, this trades a squeezed console for a missing surface. `e2e/agent-rail.authed.spec.ts` is
skipped with a forwarding address rather than deleted, so the removed capability leaves a trace.

**A22b — Do-not #6 does not reproduce, and the contract is wrong about it.** `CONSOLE-CONTRACT.md`
predicts `body.scrollWidth > innerWidth` on the shipped build. It is **false** at 1440×960: the tables
already scroll inside their own `overflow-x: auto` containers, which is what that same Do-not asks
for. That assertion would have passed on day one and caught nothing. The gate asserts the **content
column width** instead, which fails honestly. Recorded because the contract is binding and this is
the one number in it that is not true.

**A22c — the visual gate does not seed, and no assertion says "42 → 2 + 1" end to end.** Asserting the
design's row count literally needs the design's dataset; installing it into the shared `authed`
fixture broke `flag-rule-builder`, and giving the gate its own project broke `command-center` and
`design-system`. The literal "2" is also the prototype's data — production is 3 serving / 39 never
(A20). So the arithmetic is unit-tested exhaustively where the dataset IS controlled, and the
rendering is asserted on whatever the tenant holds. Stated as a loss, not filed as a pass.

#### A21 — ⚠️ **A3 is WRONG on a fact: there are TWO surfaces that can create a new feature, not one.** *(2026-08-28, verified in code)*

A3 says the `<form onSubmit={onCreate}>` in `flag-manager.tsx` is *"**the only surface in the product**
that can create a new feature."* It is not. **`RuleBuilder` can too**, and it is the surface Story 3.3
also deletes:

- `rule-builder.tsx:349` renders a **free-text "Flag key" `<input>`** (`value={flagKey}`,
  `onChange={setFlagKey}`) — not a key fixed from the route.
- `flag-manager.tsx:380` posts it through the **same** `createFlagDefinitionVersionAction(slug,
  builtKey, …)`.

So the product has **two** free-key creation paths, both on the features list, both behind
`flag-manager.tsx`, and Story 3.3 deletes **both**.

**A3's CONCLUSION is unchanged and now better supported.** "Land the replacement in the same commit as
the deletion" was right; it was under-argued. The deletion removes two creation paths, not one.

**But the wrong fact is dangerous in a specific way, which is why this is recorded rather than quietly
fixed.** A reader who believes "only the textarea can create" could reasonably conclude that deleting
*only* the `RuleBuilder` is safe, or that after deleting the textarea the `RuleBuilder` still covers
creation. Both conclusions are false, and both leave the product unable to create a feature — the
exact outcome A3 exists to prevent, reached *by trusting A3*.

**They ride DIFFERENT gates, and this constrains the deletion.** The textarea is inside the
`FLAG_CONSOLE_ENABLED` branch; `RuleBuilder` additionally rides **`FLAG_RULE_BUILDER_ENABLED`**
(`page.tsx:114`). Story 3.3's promise that *"the gate-off branch is untouched, byte-for-byte"* is
therefore a promise about **two** gates, and the `git diff` proof must be run in both off-states, not
one. Note `flag-manager.tsx`'s own comment already warns that gating the wrong block once hid the
authoring form entirely — *"there would have been NO way to create a new flag at all"*.

⚠️ **One thing I could NOT measure: `FLAG_RULE_BUILDER_ENABLED`'s live production value.** It is
stored **Sensitive** in Vercel, so the value cannot be read back. `flags-visual-rule-builder` (#15)
records it as ON in production and verified on the real flags page, and that is the best evidence
available — but it is a *record*, not a measurement, and it is the difference between production
having two creation paths today or one. **Confirm it during the Story 3.3 walkthrough** rather than
assuming; the replacement control is required either way, so nothing is blocked on the answer.

#### A20 — ⚠️ **Story 3.1's "two rows" is wrong, and one of its three states has ZERO live instances.** *(2026-08-28, measured against production)*

Story 3.1 says *"Production therefore renders **two rows** and one summary line"*. Measured on live
production (`miyagisanchez`, Production environment, 2026-08-28):

| Activation state | Live count | How it is stored |
|---|---|---|
| **on** — serving a version | **3** | a `flag_environment_activations` row with a non-null `version_id` |
| **off** — deliberately switched off | **0** | a row with a **null** `version_id` |
| **never** — nobody has ever touched it here | **39** | **no row at all** |
| | **42** | |

Two corrections follow, and the second is the one that changes the work.

**1. It is three rows, not two, and the dormant line reads 39.** A cosmetic fix to the story and its
walkthrough — but a walkthrough step that says "you see two rows" when the page shows three is a step
that fails on a correct build, and this epic has already shipped guards that could not fail.

**2. ⚠️ The `off` state has NO live instance, so nothing on production can show it.** This is the real
finding. Story 3.1 asks for three visually distinct switch states, one of which is *"turned off →
red"*. On production that styling is **unreachable**: every one of the 42 flags is either serving or
untouched. Consequences, decided here rather than discovered by whoever builds it:

- **The answer line's middle clause renders "0 deliberately switched off" for every reader today.**
  The line must read naturally at zero rather than emitting a limp "0 switched off" — a summary that
  states an empty category as if it were news is worse than one that omits it. **DECIDED: a clause
  with a zero count is dropped from the sentence, not rendered with a `0`.** That is list arithmetic,
  so it belongs in `lib/flag-list-view.ts` with the rest, and it is unit-testable at every
  combination — which is the only place all three states can be exercised at all.
- **The red `off` switch cannot be asserted against the live tenant.** Its spec needs a constructed
  fixture. A browser check on production would pass vacuously — there is no such row to render — and
  a vacuous pass is how `landing-frijoles-rebrand` shipped three guards that could not fail.
- **The smoke walkthrough must not ask Daniel to look for a red switch.** He would not find one, and
  the honest reason is that nobody has ever deliberately switched a flag off in production — not that
  the build is broken.

**Why this was worth measuring rather than assuming.** The sprint contract's own figure — *34 of 42
flags' latest version defaults to `false`* — is **confirmed** (34 `defaultVariantKey: "off"`, 8 `"on"`),
but it is a **different axis** from the three states, and conflating them is the trap. A flag can
default to `false` and have **never been activated**: 34 defaulting off does not mean 34 render as
"off". Today it means 39 render as "never" and 0 render as "off". "Activated ≠ on" remains the point
of the three states; the number that supports it is 39, not 34.

#### A19 — ⚠️ **D4 IS OVERRULED. The console ships ENABLED at Sprint 2, not dark until Sprint 3.** *(2026-08-27, Daniel)*

> *"done means shipped to production always. and not dark, always enabled"*

D4 said `CONSOLE_SHELL_ENABLED` stays OFF until Story 3.5, and called itself "the epic's single largest
risk". Daniel has overruled it as a standing principle, and the principle has evidence behind it:
`flags-console-parity` **SHIPPED DARK** and its flip, its walkthroughs and its outcome test were all
still owed weeks later. Shipping dark has repeatedly meant shipping nothing.

**Checked before flipping, because D4's stated risk deserved a real answer rather than a dismissal.**
D4's reasoning was: *"the new nav names destinations (`Setup › Connect`, `Setup › Keys`, a feature's
Funnel tab) that do not exist until Sprints 2 and 3."* Two of those three now exist — Sprint 2 built
them — and **the third was never a nav destination**: a feature's Funnel tab is a tab on the flag
detail page, not an entry in the inventory. So the premise is spent.

Verified against the live production gates (`CONNECTOR_ENABLED`, `EXPERIMENT_GOVERNANCE_ENABLED`,
`FLAG_CONSOLE_ENABLED`, `JOURNEY_PROJECTIONS_ENABLED`, `SIGNALS_ENABLED` all `true`;
`FLAG_SERVING_ENABLED` proved on by `/api/v1/flags/snapshot` returning 401 rather than 404), the lit
nav for `miyagisanchez` resolves to: **Today** → `/app` · **Measure** → journeys, scenarios ·
**Ship** → experiments, flags, flag-audit · **Setup** → connect, keys, destinations, shares. Every one
exists and serves.

**None of Sprint 3's unbuilt stories is a nav destination.** 3.1 improves the flags list, 3.2 adds
tabs to a page, 3.3 removes a duplicate, 3.4 extends `⌘K`. The console does not name any of them.

**The real consequence, stated rather than discovered:** Sprint 3 now builds against a LIVE console.
Story 3.3 — which deletes the JSON authoring stack — stops being a dark change and becomes a
user-visible one on merge. A3 already re-scoped it to land its replacement in the same commit, and
that requirement is now load-bearing rather than prudent: there is no dark period in which a missing
control would go unnoticed.

**Story 3.5 is consequently reduced.** Its flip is done here; what remains for it is deleting the dead
legacy header, the `<details>` disclosure, and `isConsoleShellEnabled()` — under A16's correction
(`Connect` and `Agent notes` survive as public chrome).

#### A18 — ⚠️ **This epic ships ONE migration after all.** *(2026-08-27, authorized by Daniel)*

The Platform-first note says "no new table, no new SQL". That held until cross-review: **both**
external families independently raised `mintConnectorToken` as **Blocking** — a check-then-act with
nothing behind it, so two concurrent mints could both insert.

`20260827120000_connector_token_uniqueness.sql` — a **partial** unique index on `(project_id) WHERE
revoked_at IS NULL`. Partial is the correctness argument, not a detail: revocation is soft, so a
rotating project accumulates revoked rows by design, and a plain `UNIQUE (project_id)` would forbid
ever minting a second token.

**Applied to production BEFORE the merge that deploys the code** (AGENTS rule #4 — merging is the
deploy). Verified by attempting the forbidden write against production and watching it be rejected,
and by confirming rotation still works; row counts unchanged afterwards.

**Why the read-side fix was not enough on its own.** Returning every active token made a duplicate
*visible and revocable* rather than live and hidden behind a `LIMIT 1` — that removed the danger,
and it is what shipped first. It could not remove the race. Only a constraint can: an application
check is a promise about interleaving the application is not in a position to make.

The note's claim is corrected rather than quietly dropped: **one migration, additive, no backfill,
no data change.** "No new table" still holds.

#### A17 — ⚠️ **The three legacy credential routes are NOT redirected. They keep their forms.** *(2026-08-27, deviation from Story 2.3)*

Story 2.3 says: *"The three old routes stay reachable and redirect here while the gate is on."*
**They stay reachable; they are not redirected**, and the difference is the ordering rule this epic
exists to respect.

Minting is not merged in this sprint — the story's own escape hatch allows exactly that (*"if the
three pages' minting forms turn out to have materially different shapes, ship the LIST merged and
leave minting on the existing routes — and say so"*), and they do differ materially: `flag_read`
needs an environment, `flag_sync` needs a source string, `agent_write` needs an expiry from an
allow-list, ingest needs none of those.

So `/app/keys`, `/app/flag-credentials` and `/app/agent-keys` remain **the only surfaces that can
issue those credentials.** A redirect would send an owner who came to mint a key away from the one
page that can mint it — a control removed before its replacement exists, which is the exact hazard
A3, A7 and `flags-console-parity` Amendment 1 all record.

**What actually happens with the gate on:** the three routes leave the NAV (A7's derived
`legacy-keys` gate), `Setup › Keys` becomes the single place that answers *"what has access to this
project"*, and every row there links to the surface that manages its kind. The list moved; the
controls did not. Both surfaces work in both gate states, and neither is ever the only route to a
control.

**Consequence for Story 3.5:** nothing to unwind. There is no redirect to remove, and the three
routes do not become dead — a later epic may merge the forms, at which point redirecting is safe
because there would finally be somewhere to redirect *to*.

#### A16 — ⚠️ **Sprint 1 made `header === null` permanently reachable; Story 3.5's deletion plan is corrected** *(2026-08-27)*

`header === null` no longer means "the gate is off" — it means the console chrome does not apply, and
two states reach it permanently regardless of the gate: an **anonymous** viewer (the two demo
dashboards are allow-listed public surfaces that render this shell) and the **`getShellNav` catch**.

So Story 3.5's *"the now-dead gate-off branch is deleted"* would strip the public demo dashboards of
all header content. Amended in `sprint-3.md`: **3.5 deletes `Home` and the `<details>` disclosure
only.** `Connect` and `Agent notes` STAY — they are the public chrome's only route to `/install` and
`/llms.txt`, and they never rendered in the console branch. (`Home` is safe because its destination is
duplicated: both branches link `/app` from the logo, so it loses a link, not a route.) 3.5 also gains
an acceptance criterion naming what an anonymous visitor sees after the flip. Recorded now rather than at 3.5, because the reason is legible in Sprint 1's code today and
will not be in three sprints.

#### A15 — DISPROVED: Ship's rail must NOT carry the environment picker *(re-scopes Story 1.4)*

Story 1.4 says: *"Ship's rail carries the environment picker — flags-scoped, exactly as
`flags-console-parity` D3 decided, because it scopes Ship and nothing else."* **That cites D3 for the
opposite of what D3 says.** `app/app/flags/[projectSlug]/flag-console.tsx` records it in its own
words, at the picker itself:

> *"Flags-scoped and rendered as links, so the chosen environment is in the URL and travels with a
> copied address. **`ProductShell` is untouched (D3): this is not ambient chrome, and a switcher in
> the shell would imply it governs pages that do not read it.**"*

Two facts, both read on `main` 2026-08-27, make the move wrong rather than merely unsupported:

1. **It is not a picker, it is a URL rewriter for one page.** Each option's href is
   `buildFlagListQuery(params, { environment }, DEFAULT_FLAG_ENVIRONMENT)` — it carries the flags
   list's `q`, `state`, `type`, `sort` and `page` through the switch. The shell does not have those
   params and cannot get them without threading a flags-page prop through every Ship route. **A rail
   picker would silently drop the reader's search and filters on every environment change.**
2. **Two of Ship's three surfaces do not read an environment.**
   `app/app/experiments/[projectSlug]/page.tsx` contains the string `environment` **zero** times;
   `flag-audit` mentions it once, in prose describing what the audit records, not as a parameter it
   reads. A picker in Ship's rail would therefore sit above two pages it does not govern — precisely
   the failure D3's sentence names.

Duplicating it instead of moving it is worse: two pickers on `/app/flags`, which is the "two devices
for one promise" that `app-shell-and-agent-rail`'s D5 already refused once.

**Locked: the environment picker stays exactly where it is, on the flags page, and Ship's rail does
not carry one.** The rest of Story 1.4 is unchanged. Nothing is lost — the control is not moving, so
the ordering rule does not even engage.

*This is the second acceptance criterion in this epic that cited a prior decision for the opposite of
what it said (A3 was the first). Both were caught by opening the file the citation named. The habit
that works is reading the source of a citation, not the citation.*

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

> ### ⚠️ Amendment A14 — **Codex is quota-capped for this entire epic. The six mechanical stories move to the architect.** *(2026-08-27, Daniel's call)*
>
> The first delegation (`codex-task --tier build`, Stories 1.4 + 1.5) exited 1 in five seconds with
> `You've hit your usage limit … try again at Sep 23rd, 2026`. The tool's own tree snapshot confirmed
> **nothing was written** — which is exactly why it reports the tree separately from the transcript.
> Sep 23 is roughly four weeks out, so Codex is unavailable for the whole epic, not for one story.
>
> **Stories 1.4, 1.5, 2.2, 3.1, 3.2 and 3.4 are therefore built by the architect**, and the rows above
> stay as written with this amendment beside them rather than being quietly rewritten — the routing
> table is meant to be auditable, and an edited-in-place table would hide that the plan changed.
>
> **The review layer is NOT short, and that distinction matters.** The refund rule exists because a
> missing review layer must never read like a clean one. Here nothing is missing: the builder is
> `claude`, so the router's order (codex → agy → vibe → claude) excludes Claude and would have picked
> **codex + agy**; with codex capped it picks **agy + vibe**, both probed ALIVE, both foreign to this
> diff. Two cross-family passes, exactly as policy requires. A refund was offered and declined
> because the capped pool was the BUILD pool, not the review pool.

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

## Definition of Done (epic) — ✅ COMPLETE
- [x] All sprints merged to `main` + smoke-tested (gaps stated — see each sprint's QA section)
- [x] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [x] This README marked ✅; every sprint status ticked with commit refs
- [x] `RETROSPECTIVE.md` written
- [x] Product poster (`Roadmap/README.md`) updated — the **02 · Commercial** section
- [x] **Landing backfill check — stated rather than skipped:** this epic changes **no public offer**.
      `/install` and `/llms.txt` are untouched and still linked from the public chrome (A16 is
      precisely the amendment that kept them); the console is entirely behind a session. **No landing
      section moves.**
- [x] Team memory + `MEMORY.md` index updated
- [x] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [x] **Kill-switch:** `CONSOLE_SHELL_ENABLED` exists in all three Vercel scopes, was created
      DISABLED (enablement polarity), and is **`true` in production** — flipped at Sprint 2 under
      A19 and proved by both Setup routes going **404 → 307** across that deploy. *Verify-only.*
      ⚠️ Sprint 3 found its sibling: **`FLAG_CONSOLE_ENABLED` was set nowhere in CI**, so the
      blocking gate had been asserting a dark console against a lit production. Fixed in `f825f46`.
- [x] Feature branch deleted; **this README's frontmatter `status: shipped`** (the SSOT — run `node scripts/build-order.mjs`)

### What is OWED, by name

1. **The signed-in production walkthrough** (`sprint-3.md`), whose two writing steps — turning a
   live flag off and creating a real definition version — are Daniel's by construction.
2. **Mint a connector URL** (`Setup › Connect`, Sprint 2). A real production credential mint is never
   covered by a merge authorization.
3. **Command Center's own layout**, which no story in this epic covers (A25).
