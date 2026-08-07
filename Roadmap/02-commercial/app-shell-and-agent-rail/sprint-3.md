# App shell and agent rail — Sprint 3: Command Center

**Status:** ✅ complete — `4ee6242` (3.1 + 3.2 + 3.3)

> **Build contract (locked by the architect before the builder started).** Binding: **no new runtime
> dependency** (the bet's headline constraint), **D6** (the agent strip is gated; the page is not),
> **D7** (inline styles are permitted in `/app` — the ban is landing-only — so dynamic bar widths
> are fine; raw hex and pictographs are still forbidden).
>
> **Branch stacks on Sprint 2** — `feat/app-shell-and-agent-rail-s3`, cut from the S2 branch.
>
> **The charting question is out of scope and stays out.** `.funnel` / `.bar` already exist in
> `references/design/assets/tokens.css` and are already imported by `apps/web/app/globals.css`. If
> a visual here seems to need a chart library, that is the circuit breaker — stop and hand it back
> to shaping, where `analytics-visualization-layer` is already seeded for exactly this decision.

## Stories

### Story 3.1 — `StatCard` and the North Star / TARS strip
**As a** PM, **I want** the front door to lead with the numbers that matter, **so that** I don't
have to know a URL to find out whether the business moved.
**Acceptance:** `/app` shows, per project I belong to, the North Star and the TARS headline figures;
where a figure genuinely can't be read, the card says so rather than rendering a zero; the real
Medusa revenue linkage is visible here rather than only at a URL you'd have to already know.
**Risk:** low
**Notes:** reuse `lib/{tars,north-star}-query.ts` — never re-query `events` ad hoc (AGENTS rule #1).
The "can't read" vs "genuinely zero" distinction is the same one `task-lifecycle-facts.ts` draws and
the same failure class LEARNINGS records four times: *a query that silently requires a tag the
realistic caller has no reason to set fails as an honest-looking zero, and a zero pages nobody.*
**Before trusting this strip, drive one end-to-end check that produces a NON-zero number.**

### Story 3.2 — `FunnelBars` on real TARS data
**As a** PM, **I want** the funnel to look like a funnel, **so that** I can read a drop-off instead
of parsing three numbers in a definition list.
**Acceptance:** the funnel renders as Targeted → Adopted → Retained bars with each stage's drop-off
labelled, driven by live TARS data; `apps/web/package.json` has gained no dependency;
`npm run check:design-drift` passes.
**Risk:** low
**Notes:** the CSS is already loaded. This is a thin React wrapper over `.funnel` / `.bar`, not a
chart implementation. The landing already uses these classes to *fake* a funnel in a demo — this
points the same rails at real numbers, which is the audit's §6.5 point exactly.

### Story 3.3 — Command Center replaces the bare `<ul>`
**As a** PM, **I want** `/app` to answer "did anything need me today", **so that** I can use this
product in short bursts between meetings.
**Acceptance:** `/app` no longer renders a bare `<ul>` of slugs; it shows the stat strip, the funnel,
and a recent-activity summary; with `AGENT_RAIL_ENABLED` OFF the page still renders correctly minus
the agent strip; the page degrades honestly for a user with no projects (the existing provisioning
empty state is preserved).
**Risk:** low
**Notes:** keep the `?provision=failed` retry path in `app/app/page.tsx` intact — it is
load-bearing for signup recovery and easy to delete by accident during a rewrite. Guards must stay
**above** any shared shell that can stream: LEARNINGS records that a `loading.tsx` or streaming
parent layout turned a feature gate's required 404 into a 200 during the design-system lift.

## Sprint QA
- **api spec(s):** 3.3 → extend the dark spec so Command Center renders with the gate OFF. 3.1 →
  one spec asserting the "unreadable" state is distinguishable from a real zero.
- **browser smoke owed:** yes — the funnel bars are rendered geometry an API spec cannot see.
  `design-system.browser.spec.ts` is the home; assert bar presence and relative heights, plus no
  horizontal overflow at a phone width.
- **deterministic gate:** as Sprints 1–2 — CI's own npm scripts, in CI's order.
- **non-zero check (not optional):** exercise the funnel end-to-end against a project with real
  events and confirm a non-zero number reaches the screen. A dashboard whose correct empty state is
  indistinguishable from its broken state is the bug class this repo shipped to production once.

## Sprint 3 — Smoke walkthrough (do these in order)
Env: the branch preview (pre-merge) · production `https://golden-beans-gamma.vercel.app` once merged

1. Sign in and go to `/app`.
   → A Command Center: stat strip, funnel bars, recent activity. Not a bulleted list of slugs.
2. Read the funnel for a project that has real events.
   → Three labelled bars with visible drop-off, and the numbers match what `/funnel/<project>/<feature>`
     reports for the same feature.
3. Read the North Star / revenue card.
   → A real figure. If it can't be read, it says so — it does not show `0`.
4. Set `AGENT_RAIL_ENABLED` to unset/false and reload.
   → The page still renders correctly, minus the agent strip. Nothing is broken or half-empty.
5. Open `/app` on a phone width.
   → Bars and cards reflow; no horizontal scroll; keyboard focus stays visible when tabbing.
6. Sign in as a brand-new user with no project yet.
   → The existing provisioning empty state still appears; Command Center does not render a wall of
     zeroes at someone with nothing yet.

If any step fails, note the step number + what you saw — that's the bug report.

## Sprint 3 — what actually happened

**No new query was written.** `readOutcome` in `lib/pod-report-query.ts` already did exactly this
rollup for the client-facing Pod Report — registered features → their funnels through
`lib/tars-query.ts`, plus the North Star metric, with every not-zero rule already enforced. It is now
exported as `getProjectOutcome` and shared. The owner's front door and the client's shared report
cannot disagree about a tenant's adoption numbers, because there is one implementation.

**`StatCard`'s props are a union, so a null value cannot be constructed without its caveat.** The
epic's honesty requirement is enforced by the type rather than by a reviewer noticing. Four North
Star states — no metric / unreadable / registered-but-never-recorded / a real value including a real
0 — are four different sentences (`lib/stat-figures.ts`, unit-tested). An undefined RATE is not 0%:
"nobody was targeted" and "a thousand targeted, none adopted" are opposite facts.

**The non-zero check found nothing broken, and was still worth every minute.** It is the only check
in the sprint that could distinguish a working funnel from a silently-empty one:
`e2e/command-center.authed.spec.ts` drives a lopsided 8 → 5 → 2 funnel through the REAL ingest path
and asserts 63% reaches the screen, the bars descend in RENDERED pixel height, the drop-off labels
read 63%/40% of previous, and the figures match `/app/funnel` for the same feature.

**`apps/web/package.json` is untouched.** The circuit breaker was never approached — three bars are
not a charting problem.

**Gate:** unit 894 · typecheck · lint · build · `check:design-drift` (73 files) · api **435 passed /
36 skipped / 0 failed** · authed **14 passed / 2 skipped** (the rail specs skip themselves when the
gate is dark, and say why).

