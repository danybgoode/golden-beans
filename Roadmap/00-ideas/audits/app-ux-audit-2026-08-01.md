# Golden Beans `/app` — UX, IA & Brand Audit + Redesign Proposal (first pass)

*Written 2026-08-01. Scope: the signed-in product (`/app/**`) only — the public landing stays out
of scope per your note, and is already covered by `design-direction.md` / `ux-guidelines.md`.
Companion artifact: `app-redesign-concept-v1.html` (visual mockups for the proposals in §6).*

---

## 0. The one finding that explains all the others

Golden Beans was built **for an agent to operate and for a PM to audit** — not for a PM to operate
directly. That's not a guess; it's visible in the code itself: the backend is genuinely excellent
(immutable decision ledgers, SRM diagnostics, signed webhook delivery, an audit trail that
"refuses" a claim that lost its caveats), but almost none of that rigor has a UI translation layer.
A PM today reads the engine's raw output — JSON blobs, HTML tables, and definition lists — the same
shape an API response takes, styled dark. The product hasn't been *designed* for a human yet; it's
been *rendered*.

That single root cause explains the JSON-textarea flag editor, the funnel that's a bulleted list of
three numbers, the chaos/secops surface that's seven stacked read-only tables, and the fact that
the entire "you + your agent" brand promise — the whole reason this document exists — currently
lives **only in the marketing copy on the landing page**, and vanishes the moment you sign in.

The fix isn't a redesign from zero. The design tokens are good, the UX guidelines doc you already
wrote is better than most teams ship with, and the component primitives (`Panel`, `Button`, `Badge`,
`Icon`, `AgentWindow`) already exist. The fix is **adoption + extension**: apply what you have,
build the handful of app-grade patterns that are missing (data viz, a rule builder, an activity
feed, real confirmation flows), and — most importantly — bring the agent *into* the product instead
of leaving it as a landing-page prop.

---

## 1. The persona: the augmented PM

Before auditing screens, it's worth pinning down who they're for, because it changes what "good"
means here. This isn't a generic "time-pressed PM" persona — the brief describes something more
specific, and the product should be designed to that specificity, not softened toward a generic one.

**Who they are.** A PM who has an agent (Claude, or whatever harness they run) doing real, bounded
work on their behalf inside Golden Beans — drafting a flag definition, launching a chaos scenario,
pulling a North Star delta, opening the PR that ships a targeting rule. The agent is not a chatbot
bolted onto a dashboard; it's closer to a co-worker with scoped, revocable credentials (which,
notably, is *exactly* what `agent-write-keys.ts` and the audit/decision-ledger backend already
model — the backend already thinks of the agent as an accountable actor, the UI just doesn't show
it that way yet).

**What's different about this PM, concretely:**

- **They span disciplines the old PM role didn't.** Feature flagging (LaunchDarkly/GrowthBook
  territory), product analytics (PostHog/Amplitude territory), experimentation stats (a data
  scientist's job), resilience engineering (an SRE's job), security posture correlation (a
  DevSecOps job), and now, per your brief, enough git/release literacy to know *what shipped and
  whether it's safe* — without becoming an engineer. The product's job is to be the translation
  layer that makes each of those legible without requiring the underlying expertise.
- **The agent relieves the loneliness of the decision, not the decision itself.** Your framing —
  "PMs may want to take some action but feel alone; now they have their agent doing it and
  validating with them" — is a specific interaction pattern, not just a vibe: the agent proposes
  or executes, the PM sees it clearly enough to *validate or override*, and that validation is
  recorded. That's a UI pattern (propose → show → confirm/override → record), and right now the
  product has the "record" part (excellent immutable audit trails) but not the "propose → show →
  confirm" part in any visible surface.
- **They still "manage meetings and other people's workloads,"** per your note — so the product
  can't assume they live inside it all day. It has to be legible in short bursts: a glance at
  Command Center should answer "did anything need me today," the way a good status page or a
  well-run standup does.
- **Git is a foreign, slightly hostile language to them.** Not because they're incapable of
  learning it, but because it's not their job to. The ask isn't "teach PMs git" — it's "translate
  what the agent did in git into what a PM cares about" (what changed, why, is it live, is it
  safe to reverse).

**What this means for "good" in this product**, restated as a short checklist I'll hold every
proposal in §6 against:

| A PM needs to... | Today | Target |
|---|---|---|
| Understand what an action will do *before* taking it | Rarely — buttons say "Activate," not what activation changes | Every control states its effect and blast radius up front (this is already the letter of your own `ux-guidelines.md` — it's just unevenly applied) |
| See what the agent did without reading JSON | No — `<details><summary>Inspect immutable JSON</summary>` is the actual UI for "what changed" on flags, experiments, and decisions | A plain-language activity feed, with the JSON one click deeper for anyone who wants it |
| Validate/override an agent-proposed action in one place | No — there's no surface where an agent's proposal and a PM's approval share a screen | An approval pattern modeled on Claude Code's Plan Mode, which your own `ux-guidelines.md` already names as the bar |
| Read a funnel, a rollout, or an experiment result as a *picture* | No — TARS is a 3-line list, rollout is a table, experiment comparison is a table | Real charts: funnel bars, a rollout ring, a control-vs-treatment comparison |
| Get from "something's wrong" to "it's contained" fast, without engineering | No self-serve kill switch in the UI; scenarios are explicitly read-only ("Read-only operating evidence") | A visible, confirmable kill switch on any live breaker/scenario, matching the circuit-breaker work already built server-side |
| Know if a metric is really moving the business, not just an event count | Partially — North Star already carries real Medusa revenue inputs (a real asset, underused) | A always-visible North Star / P&L strip, not a page you have to know exists |

---

## 2. Current-state audit of `/app` (evidence, not vibes)

Everything below is drawn directly from the repo, with file references so it's checkable against
the code the way your own docs like it. Repo state as cloned 2026-08-01, `main`.

### 2.1 The shell has a header. It doesn't have a product.

`ProductShell` (`apps/web/components/product/ProductShell.tsx`) gives every signed-in route a
sticky header with three links — *Projects*, *Connect*, *Agent notes* — and a static "Engine ready"
pill. That's the entire persistent navigation for a product with eleven distinct feature areas
(flags, experiments, scenarios, journeys, destinations, funnel, impact, tasks, keys, agent-keys,
shares). There's no section nav, no breadcrumb past "← Your projects," no search, no command
palette, and — critically for the brief — **no agent presence anywhere in the chrome.** A PM
arriving at any of these eleven areas has no way to see, from the shell alone, what project they're
in relative to the others, or what their agent has been doing.

### 2.2 One page in twenty-six uses the design system

```
grep -rl "components/ui/Panel\|Button\|Badge\|AgentWindow" apps/web/app/app --include="*.tsx"
→ onboarding/[projectSlug]/page.tsx   (1 of 26 route files)
```

Every other route — `flags`, `experiments`, `scenarios`, `journeys`, `funnel`, `impact`,
`destinations`, `keys`, `shares`, `agent-keys`, `tasks`, and the `/app` home itself — is built from
raw semantic HTML (`<h1>`, `<p>`, `<ul>`, `<table>`) and styled entirely through generic tag
selectors in `globals.css` (`.product-shell main > ul > li`, `:where(input, textarea, select)`,
etc.). That's a real technique and it's not *bad* per se — it's why the product is visually
consistent rather than chaotic — but it means there is no notion of a **card**, a **stat**, a
**data table with real columns/sort/filter**, or a **form section**, only "a list" and "a table."
Every screen ends up the same generic shape regardless of what it's showing: an analytics funnel,
a security exercise, and a webhook destination all render as a `<h1>` + a `<table>`.

This is good news, framed correctly: the primitives (`Panel`, `Button`, `Badge`, `Icon`,
`AgentWindow`, `SectionDivider` in `apps/web/components/ui/`) already exist and are reasonably
built. The work is mostly **adoption and a handful of new primitives**, not "invent a design
system from nothing."

### 2.3 Zero data visualization, anywhere, in an analytics product

```
grep -rl "recharts\|<svg\|<canvas\|d3\." apps/web/app/app --include="*.tsx"
→ (no results)
```

No chart library is even installed (`apps/web/package.json` has no `recharts`/`d3`/`chart.js`/
equivalent). Every number in the product — funnel stages, North Star input time series, experiment
lift, rollout percentages, breaker trip rates — is a row in a table or an item in a `<dl>`. For a
product whose entire pitch is "see the funnel, see the North Star, see the lift," that's the single
highest-leverage visual gap to close.

### 2.4 Feature-by-feature walkthrough

**`/app` home** (`app/app/page.tsx`) — a bare `<ul>` of project slugs, each with a nested `<ul>` of
route links plus a raw description string. No North Star, no "what happened since you last looked,"
no agent activity, no P&L. This is the front door and it currently says nothing about the product.

**Flags** (`app/app/flags/[projectSlug]/flag-manager.tsx`, 483 lines) — creating a flag means
hand-typing a raw JSON definition into a `<textarea>` (targeting rules, variants, and all).
Reading a flag's history means expanding a `<details><summary>Inspect immutable JSON</summary>`
per version. There is no visual targeting-rule builder, no percentage-rollout control, and no diff
view between versions — despite GrowthBook (a direct competitor by your own framing) shipping
exactly that kind of visual rule builder as table stakes.

**Experiments** (`app/app/experiments/[projectSlug]/`, 874 lines across two files) — this is where
the gap between backend rigor and UI is starkest. The governed-experiment view is genuinely
sophisticated: SRM (sample-ratio-mismatch) diagnostics with χ² and p-value, addressability coverage,
an **immutable human decision ledger** (ship/keep/iterate/inconclusive/invalid, with rationale, that
structurally cannot mutate a live flag) — a feature neither PostHog nor GrowthBook front-ends as
cleanly as your backend already computes it. And yet: to view the *basic* (ungoverned) comparison
view, a PM has to hand-construct a URL query string
(`?metricEvent=<event name>`) — the page literally instructs you to do this in prose. The governed
analysis view renders SRM as an inline string (`χ² 7.7104 · p 0.0055`) and the full decision history
as `<details><summary>Captured analysis and integrity evidence</summary><pre>{JSON...}</pre>}`.
A statistically rigorous result is being delivered in a format that assumes the reader is another
program, not a person.

**Scenarios — chaos engineering & security ops** (`app/app/scenarios/[projectSlug]/page.tsx`,
287 lines) — this is your intended flagship differentiator (per `prd-g-chaos-secops.md`, the module
that neither PostHog nor GrowthBook offers at all), and today it's **seven stacked HTML `<table>`
elements** — targets, runs, defensive-simulation results, impact evidence, breaker policies, breaker
trips — one after another down the page, explicitly **read-only** ("Read-only operating evidence...
Runtime gates may stay OFF"). There is no "define a scenario" flow, no kill switch a PM can press,
no side-by-side control-vs-treatment chart. The original PRD's Requirement E1 asks for "Visual
Scenario Simulation" letting a PM define a scenario like *Black Friday Load* and watch the downstream
TARS impact; what exists today is an inspection console for scenarios an agent already ran via API.
That's a legitimate v1 — but it's the opposite of "PM manages it via the UI."

**Funnel** (`app/app/funnel/[projectSlug]/[featureKey]/page.tsx`, 52 lines) — TARS, the product's
namesake framework, renders as a `<dl>` with three `<dd>` numbers (Targeted / Adopted / Retained).
Worth sitting with: the *landing page* has a genuinely nice CSS funnel-bar component
(`.funnel`/`.bar` in `references/design/assets/tokens.css`) used in the fictional agent-window demo
to sell the idea of a funnel — and the real product, showing real numbers, doesn't use it.

**Impact** (`app/app/impact/[projectSlug]/[featureKey]/page.tsx`, 61 lines) — a North Star input's
time series (date → value) renders as a two-column `<table>`, i.e., a line chart's data with no
line. This is also where the real Medusa revenue linkage lives — a genuine, differentiated asset
(most flag/analytics tools don't tie a metric to actual e-commerce revenue) that's currently
invisible unless you already know this URL exists.

**Journeys, destinations, tasks, keys, shares, agent-keys** — same underlying pattern: a
`<table>`-per-concept, unstyled forms, `<details>` for anything structured. I won't re-litigate each
one; the fix in §6 is systemic, not per-page.

### 2.5 The say-do gap: the agent is a landing-page prop

```
grep -rl "AgentWindow" apps/web --include="*.tsx"
→ components/ui/AgentWindow.tsx
→ components/landing/InvertedLoopSection.tsx
→ components/landing/LiveProofSection.tsx
→ components/landing/Hero.tsx
```

`AgentWindow` — the "you ▸ / ⚙ tool_name / result" device that *is* the brand's entire promise, and
that your own `ux-guidelines.md` calls out as "already at the bar" — appears **only** in three
landing-page marketing components. It never renders once inside `/app`. A PM signs up because the
homepage sold them on working alongside their agent, signs in, and finds... a `<ul>` of project
links. There's currently no answer, anywhere in the signed-in product, to "what has my agent been
doing," "what does it want to do next," or "did it just change something I should know about." This
is the single biggest gap between what the brand promises and what the product delivers, and I'd
treat it as the top-priority fix (§6.2).

### 2.6 What's genuinely good — protect this in the rebuild

- The design tokens (`references/design/assets/tokens.css`) are disciplined and specific (three
  material families, a real semantic color system, honesty-badge conventions) — extend them, don't
  replace them.
- `ux-guidelines.md` is a better-than-average UX spec already — it names the right bar (Nielsen
  Norman + Anthropic's own agentic-product principles), and most of what's missing in the audit
  above is *already written down as a requirement* there. This proposal is largely "go build what
  you already specified."
- The backend is unusually honest by design: an artifact that lost its caveats is *refused*, not
  shown (per `Roadmap/README.md`); the decision ledger is structurally incapable of mutating a live
  flag; SRM is computed and surfaced, not hidden. That rigor is a real brand asset — "we won't
  let you or your agent fool yourselves" is a stronger PM pitch than either PostHog's or
  GrowthBook's current one, once it has a UI worth trusting.
- `Panel`, `Button`, `Badge`, `Icon`, `AgentWindow`, `SectionDivider` are reasonable, small,
  extendable primitives — the onboarding page proves they work when used.

---

## 3. Competitive & positioning read

### 3.1 PostHog

PostHog's own positioning has moved decisively toward agent-native since the reference screenshots
in `design-direction.md` were captured: feature flags are now marketed as the control layer agents
use to roll a change out and roll it back, with flag creation, targeting, and rollout status all
reachable from Cursor, Claude Code, VS Code, or any MCP-compatible agent — plus an in-app "PostHog
AI" chat for the same tasks. That matters for your positioning: **"agent-native" is no longer a
blue ocean** — PostHog and GrowthBook (below) both ship it now. Golden Beans' differentiation can't
rest on "an agent can call our API"; every competitor can say that in 2026.

Where PostHog still has open flank, per third-party reviews rather than their own marketing:
independent write-ups describe it as still hard for non-technical PMs to run in-app experiments
with — configuring events, managing cohorts, creating experiment variants, and debugging flag
behavior all require real setup, and it's not a tool built for a PM without technical support next
to them. That's the exact wedge your persona (§1) is built to exploit — a PM who has an agent doing
the technical lifting *and* a UI legible enough to validate it without a developer in the loop.

**Worth studying, not copying:** the "product OS" breadth (one platform instead of stitched vendors — you already argue this), and the discipline of always pairing a screenshot of the real UI with the marketing claim ("evidence-first," which `design-direction.md` already names as a guardrail — hold the product to the same bar the landing already holds itself to).

### 3.2 GrowthBook

GrowthBook's 2026 positioning is even more directly aimed at your stated wedge: it now bills
itself as the first warehouse-native platform for experimentation, feature flags, and product
analytics, explicitly built for teams *and their agents* to run rigorous tests at scale and learn
faster. On flags specifically, any feature flag can become an A/B test in one click, with
GrowthBook automatically assigning variants and tracking metrics against the customer's own
warehouse data — no separate instrumentation required. And on agent workflows: the product is
built so a developer can highlight a block of code, wrap it in a flag, set targeting, and spin up
an experiment without leaving their editor — explicitly framed as letting agents do this work
safely.

Two UI patterns genuinely worth borrowing the *mechanic* of (not the visuals):
- **Flag → experiment is one click, not a second setup.** Golden Beans already has the backend
  concept (a flag *becomes* the thing an experiment governs) — the UI should make that transition
  a single, visible action instead of two unrelated feature areas.
- **Feature Evaluation Diagnostics** — GrowthBook lets a user preview what a specific user profile
  would experience before a change goes live, and shows exactly why a flag evaluated the way it
  did for a given user in production. This is a "debug for a PM" pattern worth having on your Flags
  screen: "show me what user X sees right now, and why."

Where GrowthBook is narrower than Golden Beans on paper: no funnel/North-Star-equivalent framework, no chaos engineering, no security-ops correlation. Its whole surface is flags + experiments + analytics-on-your-warehouse. **That's the gap your PRD already claims and your competitive doc should say out loud**: GrowthBook and PostHog both stop at the feature-and-experiment boundary; Golden Beans' stated ambition (North Star, TARS, chaos, secops, and now git legibility) is a materially wider primitive set — the risk isn't scope, it's that the UI hasn't caught up to justify the width yet (see §2).

### 3.3 Positioning matrix (for internal alignment, not a landing claim)

| Surface | PostHog | GrowthBook | Golden Beans (today) | Golden Beans (stated ambition) |
|---|---|---|---|---|
| Feature flags | ✅ mature, dense UI | ✅ mature, visual rule builder | 🚧 raw JSON textarea | Visual builder, one-click → experiment |
| Experimentation | ✅ | ✅ warehouse-native stats | 🚧 rigorous backend, table UI | Governed ledger as a first-class, legible surface |
| Funnels / North Star | Insights (general-purpose) | ❌ not a product area | 🚧 real data, `<dl>` rendering | The differentiator, once visualized |
| Chaos engineering | ❌ | ❌ | 🚧 read-only tables | The clearest whitespace — nobody else has this |
| Security-ops correlation | ❌ | ❌ | 🚧 read-only tables | Same — genuine whitespace |
| Agent-native controls | ✅ PostHog AI + MCP | ✅ MCP, "agents welcome" | ✅ backend-first (agent-write-keys, audit) | Needs a *visible* agent surface, not just an API |
| Git/release legibility for PMs | ❌ | ❌ | ❌ (not built) | Genuine whitespace if scoped to "legibility," not "git education" |
| Self-hosted / data control | Cloud-first, self-host available | Warehouse-native trust story | Supabase-hosted today | Not yet a story — decide deliberately (§8) |

**The positioning line this suggests:** not "PostHog and GrowthBook, but agent-native" (that's
table stakes now) — closer to *"the growth engine built for the PM who now also owns resilience,
security, and the P&L — with an agent that shows its work instead of just doing it."* That's a
claim only Golden Beans can currently make, and only once §6 closes the gap between the claim and
the screen.

---

## 4. Buzz.xyz — evaluated for the primitive, not the chat UI

Buzz is useful here for one specific reason, and it isn't "PMs need a chat app" — you were explicit
that Golden Beans shouldn't compete with Slack, and I'd hold that line. What Buzz actually validates:

Buzz is a collaboration workspace where AI agents aren't assistants responding to commands — they're
full members of channels, carrying their own cryptographic identity, permissions, and audit trail
alongside the humans in the room. It's built to replace both Slack and GitHub with one system where
agents write code, run tests, review work, and hand off tasks as accountable members rather than
bots you summon. Block's own framing of the bet: the bottleneck has moved from intelligence to
coordination — that's a workspace problem, not a model problem.

**Why this is directly relevant despite not being a chat product:** Golden Beans' backend already
half-builds this primitive. `agent-write-keys.ts`, `audit.ts`, and the immutable decision ledger
give an agent's actions a scoped credential and an append-only trail — conceptually the same
"agent as an accountable actor" idea Buzz puts at the center of its UI. The gap isn't the backend
model, it's that **none of it is surfaced as a legible, ambient feed** the way a Buzz channel
surfaces every agent action to every human in the room. Right now that trail only shows up as a
`<details>`-collapsed JSON blob per-record, per-page — it exists, but it isn't *read* by anyone who
isn't already looking for it.

**Recommendation:** don't build a chat surface. Build an **Agent Activity feed** — a persistent,
ambient panel (see §6.2) that turns every already-recorded audit event (flag version created, flag
activated, scenario launched, decision recorded, webhook rotated) into one plain-language line, in
the order it happened, attributed to the actor (agent or human) that did it. That's Buzz's real
lesson for you: **accountable, legible, ambient — not necessarily conversational.**

---

## 5. Graphite — evaluated for the git-legibility ask

Graphite's core mechanics are built for engineers managing stacked PRs: visualizations for
navigating between PRs in a stack, live check status, AI-generated diff summaries, and a
customizable diff view. Its merge queue batches and tests multiple PRs in parallel rather than one
at a time, and it wraps all of this in a unified PR inbox plus GitHub integration meant to cut down
context-switching. None of the *plumbing* (rebasing, staging, stacking commands) is relevant to a
PM — and per your own framing, PMs and git "usually don't get along," so the goal explicitly isn't
to teach them `gt create` / `gt submit`.

What **is** transferable is the *translation instinct*: Graphite takes a genuinely confusing
structure (a DAG of dependent branches) and renders it as a clean, linear, colored,
status-at-a-glance picture — a handful of colored nodes where each branch visibly points to the one
before it. That's the exact move Golden Beans needs for git/release state, but pointed at a
different question. A developer using Graphite asks "is my stack mergeable." A PM using Golden
Beans should be able to ask a much simpler question and get an equally clear picture: **"what did
my agent just ship, in what order, and is any of it still waiting on something."**

**Recommendation — scoped narrowly, on purpose:** a **Git & Releases** panel that doesn't expose
git operations at all (no rebase, no branch management — that stays the engineer's/agent's job).
It shows a linear timeline of merged/pending changes the agent made on the PM's behalf, each
annotated in plain language (via the same AI-diff-summarization instinct Graphite already validates
as useful — an AI-generated summary of a diff is exactly the kind of translation a PM needs, not
the diff itself), each tagged with its live/pending state, and each traceable back to the flag,
experiment, or scenario it belongs to. Whether this reads from GitHub, from a self-hosted Gitea
instance, or from something else is an infrastructure decision that's genuinely separable from this
— I'd treat it as the right call to defer (see §8): the UI need ("PM-legible release picture") is
the same regardless of where the git data physically lives, and solving the legibility problem
first means the storage decision doesn't block the design.

---

## 6. Redesign proposals (first pass — see the companion HTML artifact for visuals)

### 6.1 IA & navigation: give the shell a product

Replace the 3-link header nav with a real information architecture. Proposed top-level sections,
grounded in what already exists in the codebase (not invented categories):

```
Command Center   — North Star + TARS at a glance, agent activity, quick actions   [NEW]
Flags            — existing, redesigned (6.3)
Experiments      — existing, redesigned
Scenarios        — chaos + secops, redesigned (6.4) — this becomes a headline nav item,
                    not a buried route, because it's the differentiator
Journeys         — existing
Git & Releases   — NEW (6.6), Graphite/Buzz-informed
Destinations     — existing
Settings         — keys, agent-keys, shares consolidated (currently three separate top-level routes)
```

Keep the mobile-first bottom-tab pattern the current shell already uses at narrow widths (it's a
good instinct — extend it to cover the fuller nav via a "more" overflow, don't lose it).

### 6.2 The agent rail — the single highest-leverage change

A persistent, collapsible panel (desktop: a right rail; mobile: a pull-up sheet) present on every
signed-in screen, built directly from the existing `AgentWindow` component and vocabulary
(`you ▸`, `⚙ tool_name`, tool-call framing) — the exact device your brand already uses to sell the
product, now actually living inside it. It does three things:

1. **Shows recent agent activity** in plain language, sourced from the audit trail that already
   exists (`audit.ts`, `agent-write-keys.ts`) — "Agent created flag `checkout-v2` (draft) · 2m ago,"
   "Agent launched scenario `black-friday-load` on 5% of `EU` traffic · 14m ago."
2. **Surfaces pending proposals that need a PM's validation** — anything an agent is *staged* to
   do but that a policy (or the action's own risk) gates behind a human confirm, styled with the
   same "propose → show → confirm" shape as Claude Code's Plan Mode, which `ux-guidelines.md`
   already names as the reference bar.
3. **Never hides what it is.** Per your existing honesty-badge discipline, this rail should read as
   "here's what your agent is doing," not as an ambient chatbot — it's an activity + approval
   surface, not a conversation.

This is the fix for §2.5. It's also, not coincidentally, the fix that makes "PM feels alone, agent
validates with them" a real, on-screen interaction instead of a line in a brief.

### 6.3 Flags: from JSON textarea to a visual rule builder

Keep the immutable-version model (a real strength — competitors don't all have this) but stop
requiring hand-typed JSON to use it:

- A rule builder: attribute → operator → value rows (the same shape GrowthBook's targeting UI uses,
  per §3.2), building the same JSON your backend already validates — the PM never has to see the
  JSON to create a rule, but it's always one click away for anyone who wants it (kept as the
  "Inspect" affordance you already have, just no longer the *only* affordance).
- A rollout visualization (a simple ring or bar showing the live percentage/segment split per
  environment) instead of the current per-environment "active (snapshot N)" text line.
- A version *diff*, not a version *dump* — show what changed between v3 and v4 in plain language,
  the same translation instinct as §5's diff summaries.
- Borrow GrowthBook's "preview as a specific user" pattern (§3.2) as a lightweight debug tool on
  this same screen.

### 6.4 Scenarios (chaos + secops): from a read-only log to the tool the PRD describes

This is the highest-value redesign because it's your clearest whitespace (§3.3) and currently the
least PM-usable surface in the product:

- A **"Define a scenario"** flow that matches PRD-G's Requirement E1/E2 almost verbatim: name it,
  pick a target and a blast radius (a cohort/percentage, using the existing targeting-rule concept
  from Flags so a PM only learns this pattern once), set the fault (latency/error injection via the
  existing SDK payload mechanism already described in the PRD) and hand it to the agent to run —
  with the same propose/confirm pattern from §6.2, since this is exactly the kind of action a PM
  wants their agent executing *with* them, not alone.
- A **kill switch** that's actually a button, not an implication — with a destructive-action
  confirmation naming exactly what stops and that it can't be undone, per your own
  `ux-guidelines.md`. Wire it to the circuit-breaker backend that already exists
  (`breaker-admin-operations.ts`) rather than building new plumbing.
- A **control-vs-treatment comparison chart** for the business-impact evidence table — this is
  Requirement E3 (auto-generated business post-mortem) rendered as an actual chart instead of a
  `<table>` with a "technical delta / claim / blockers" row.
- Keep every "no causal customer claim" and "internal/synthetic cohort" caveat exactly as strict as
  it is today — that honesty is a brand asset (§2.6), not friction to design away.

### 6.5 Funnel / North Star / Impact: make the namesake framework look like one

- Replace the `<dl>` on `/funnel` with real bars — Targeted → Adopted → Retained, each stage's
  drop-off labeled, using the funnel-bar CSS that already exists in
  `references/design/assets/tokens.css` (`.funnel`/`.bar`) and is currently only used to fake a
  demo on the landing page. It's already built. Point it at real data.
- Replace the `/impact` date/value table with a sparkline or line chart per North Star input.
- Promote a North Star + P&L summary strip onto Command Center (§6.1) — the real Medusa revenue
  linkage (a genuine differentiator per §2.4) shouldn't require knowing a URL exists.

### 6.6 Git & Releases: the Graphite/Buzz-informed panel

Per §5: a linear, plain-language timeline of what the agent shipped, each item stateful
(pending → merged → live), each traceable to the flag/experiment/scenario it belongs to, with an
AI-generated one-line summary instead of a diff. No git operations exposed. Whether the data source
is GitHub, a self-hosted Gitea, or both is a §8 decision, deliberately decoupled from this screen's
design.

### 6.7 New component primitives needed

To build the above without falling back into "everything is a table," the design system needs a
small number of genuinely new pieces, extending (not replacing) the existing token system:

- `StatCard` / a North-Star summary strip
- `Chart` primitives: a funnel bar, a simple line/sparkline, a comparison bar (control vs.
  treatment), a rollout ring — a charting library will need to be added (`apps/web/package.json`
  currently has none); something lightweight (Observable Plot, visx, or a hand-rolled SVG set
  matching the token system) fits this stack better than a heavy dependency
- `RuleBuilderRow` (attribute/operator/value, for Flags and Scenario targeting alike)
- `ActivityFeedItem` (for the agent rail and Git & Releases)
- `ConfirmDialog` for destructive/hard-to-reverse actions (revoke, kill switch, deactivate) — named
  explicitly in `ux-guidelines.md` already, just not built yet
- `DataTable` (sort/filter/empty-state built in once, instead of a bespoke `<table>` per page)

---

## 7. Phased roadmap

**P0 — systemic, unlocks everything else**
Adopt the existing component kit across all 26 routes · build the Agent Activity rail (§6.2) ·
build Command Center (§6.1) to replace the bare `<ul>` home · add a charting primitive to the stack.

**P1 — the differentiators**
Scenarios redesign (§6.4) — this is the whitespace, prioritize it over polish elsewhere · Flags
visual rule builder (§6.3) · Funnel/North Star visualization (§6.5).

**P2 — the new ground**
Git & Releases panel (§6.6) · the propose/confirm pattern generalized from Scenarios to every
agent-initiated action · cross-project P&L rollup on Command Center.

---

## 8. Open questions worth deciding deliberately, not by default

- **Data-residency story.** GrowthBook's whole trust pitch is "your data never leaves your
  warehouse." Golden Beans currently owns telemetry ingest outright (Supabase-hosted). That's a
  legitimate different choice, but it should be a stated position ("we host it, and here's the
  discipline we hold ourselves to" — leaning on the refuse-if-caveats-lost ethos from §2.6) rather
  than an unaddressed gap next to a competitor who's made residency their headline.
- **Git storage: Gitea vs. GitHub vs. both.** §5's recommendation deliberately doesn't answer this
  — the Git & Releases screen can be designed against either. Worth deciding based on the
  in-house-control priority you mentioned, but not blocking the UI work.
- **How far the propose/confirm pattern goes.** Should *every* agent action route through a visible
  confirm step, or only ones above some risk threshold (destructive, spend-affecting, customer-
  facing)? This is worth a short policy doc before §6.2 is built, since it changes how noisy the
  agent rail is.

---

## 9. Companion artifact

`app-ux-audit-2026-08-01-concept-v1.html` (alongside this file) shows first-pass visual proposals
for Command Center, the agent rail, the Flags rule builder, and the Scenarios launch/kill flow —
built on your existing token system, in the same annotated-proposal format as
`references/design/polish-pass-proposal.html`, so it's directly comparable to how you've reviewed
design work before. Treat it as a conversation starter, not a spec — happy to refine any section,
or go deeper on one screen at a time, from here.

---

## 10. Verification pass — 2026-08-05, against live `main` (`36aceba`)

*Added at grooming, not by the audit's author.* WAYS-OF-WORKING requires the architecture-lock pass
to **disprove scope** before a builder starts: "an acceptance criterion describing a guard, a table
or a flag state the live system doesn't have is fiction — correct the doc, with the reasoning, out
loud." The audit was written against a clone taken 2026-08-01; four days of `main` have landed since.
Every grep and file reference in §2 was re-run. **The audit holds.** Four corrections and one
material re-frame follow — they change the bill of materials, not the diagnosis.

### 10.1 Corrections of fact

| § | Audit said | Live `main` says |
|---|---|---|
| 2.2 | "1 of 26 route files" uses the design system (`onboarding`) | **2 of 26** — `app/app/tasks/[projectSlug]/task-queue.tsx` now consumes `components/ui` too. The pattern is unchanged; the count moved by one. |
| 2.3 | Zero data visualization; no chart library installed | **Confirmed.** `apps/web/package.json` has no `recharts`/`d3`/`chart.js`/`visx`/`plot`. No `<svg>`/`<canvas>` anywhere under `app/app`. |
| 2.5 | `AgentWindow` renders only in three landing components | **Confirmed** (`Hero`, `InvertedLoopSection`, `LiveProofSection`). But see 10.2 — the component is *less* than the audit credits it with. |
| 2.1 | 11 feature areas behind a 3-link header | **Confirmed.** 15 `page.tsx` files across 11 areas; `ProductShell.tsx` still ships *Projects · Connect · Agent notes* + a static "Engine ready" pill. |

### 10.2 `AgentWindow` is a frame, not the device

§2.5 and §6.2 both read as though `AgentWindow` *is* the `you ▸ / ⚙ tool_name / result` device and
the work is to render it inside `/app`. It isn't. `AgentWindow` is 27 lines of chrome — a title bar,
three dots, a status chip, and `{children}`. The tool-call vocabulary the brand actually sells is
written ad-hoc inside each of the three landing components that use it.

So §6.2 cannot "just reuse the existing component." The reusable part — an `ActivityFeedItem` /
tool-call line — **does not exist yet and has to be extracted**, which is what §6.7 already lists.
Consistent, but the two sections imply different amounts of work; §6.7 is the honest one.

### 10.3 The audit trail is readable, project-scoped, and best-effort — and that last word matters

§4 and §6.2 propose sourcing the agent rail from "the audit trail that already exists (`audit.ts`)."
Precise status:

- **`lib/audit.ts` is write-only.** Its sole export is `recordAudit`. There is no `audit-query.ts`.
- **A read path exists and is the right precedent:** `lib/task-lifecycle-facts.ts` selects from
  `audit_log` scoped by `project_id`, filtered by `action`, ordered by `created_at`. The agent rail's
  read seam should be built in its shape, not invented.
- **Agent-vs-human attribution is already solved, correctly.** `task-lifecycle-facts.ts` records the
  reasoning verbatim: an action is an agent's because the audit row says `via: 'connector'` — a fact
  about which credential and code path performed the mutation — *not* because `claimed_by` pattern-
  matches something like `claude` or `-bot`, which would let "the subject of the measurement choose
  its own answer." §6.2's "attributed to the actor that did it" has a real, non-guessable basis.
- **But the trail is explicitly best-effort.** `recordAudit` swallows its own failure by design, so
  that a successful revoke is never rolled back by a failed log write. Its own comment: *"this trail
  is best-effort, not a ledger you can prove completeness against."*

That last point is a **design constraint the audit missed**, and it bites precisely because of the
honesty discipline §2.6 rightly calls a brand asset. An ambient rail captioned "here's everything
your agent did" would be claiming completeness the data structurally cannot support — the same
failure mode as an artifact that lost its caveats. The rail must be captioned as a *recent-activity*
view, not a complete ledger. Whichever `AuditAction` values it renders should be an explicit,
reviewed allow-list, not `select *`.

### 10.4 The re-frame: propose → confirm is already built server-side, and §8's open question is half-answered

This is the material one. §2.5 says "there's no surface where an agent's proposal and a PM's approval
share a screen," and §8 asks whether *every* agent action should route through a visible confirm.
Both were written without the signals-loop Sprint 3 write surface, which the migration log shows
landing on `20260806`:

- `agent_write` is a third `api_keys` scope; a write requires **two credentials that must agree** —
  a `gb_connector_…` token in the MCP URL *and* a `gb_key_…` bearer with `scope='agent_write'`,
  both resolving to the same `project_id`.
- `task_write_confirmations` **is** the staging table: an agent stages a proposal, and
  `consume_write_confirmation` spends it. `20260806140000` made `agent_key_id` NOT NULL so a
  confirmation is a capability minted *for* a specific credential and cannot be spent by a caller
  presenting none.
- `CONNECTOR_WRITES_ENABLED` gates the whole surface, and the migration states plainly: **"the write
  surface has never been enabled in production."**

Two consequences for shaping:

1. **§6.2's "pending proposals" list has a real backing table** for the task surface. The rail's
   approval half is a UI over `task_write_confirmations`, not a new mechanic — a substantially
   smaller bill of materials than the audit implies.
2. **§8's third open question is narrower than it reads.** "How far does propose/confirm go?" has
   already been answered *for agent writes over the connector*: they all stage. The live question is
   only whether **owner-initiated UI actions** (activate a flag, trip a breaker, revoke a key) adopt
   the same shape — a different question, and a smaller one.

### 10.5 Rails already covering this surface

Named here so the pitch's reuse list doesn't re-derive them:

- **`npm run check:design-drift`** (`scripts/check-design-drift.mjs`) already walks
  `apps/web/components/landing` **and all of `apps/web/app`** — so every `/app` route is already
  guarded against raw hex and pictographs. Two live implications: the `⚙`/`▸` glyphs in the brand's
  tool-call vocabulary **will fail this guard** inside `/app` and need an `Icon` treatment instead
  (do not disable the rule); and the inline-style ban is landing-only, so dynamic bar widths in
  `/app` are permitted.
  **Gap:** the guard does *not* cover `apps/web/components/ui` or `components/product` — the exact
  directories new primitives would land in.
- **`references/design/assets/tokens.css` is imported first by `apps/web/app/globals.css`**, and the
  guard asserts that import. The `.funnel` / `.bar` CSS §6.5 wants is therefore **already loaded in
  the signed-in app** — it needs pointing at real data, not installing.
- **`design-system.authed.spec.ts`, `design-system.browser.spec.ts`, `project-navigation.authed.spec.ts`,
  `scenario-dashboard.authed.spec.ts`, `task-dashboard.spec.ts`** already exist in `apps/web/e2e/`
  and are where new UI acceptance specs accrete.