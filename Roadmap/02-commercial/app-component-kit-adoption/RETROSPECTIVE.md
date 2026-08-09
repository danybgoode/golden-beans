# Component-kit adoption sweep — bring the remaining /app routes onto the design system — Retrospective

_Closed: 2026-08-09 · one wave (appetite M), three sprints, three PRs, all merged and live._

## What shipped

A PM can now open Flags, then Destinations, then Impact and operate all three the same way — and
nothing irreversible happens on one click.

| Sprint | PR | Merged | What became true |
|---|---|---|---|
| 1 — the three primitives | [#82](https://github.com/danybgoode/golden-beans/pull/82) | `0e54414` | `DataTable`, `ConfirmDialog`, `FormSection`/`Field` exist, plus the first table/form/dialog CSS the repo has ever had |
| 2 — convert the routes | [#83](https://github.com/danybgoode/golden-beans/pull/83) | `997fc93` | Six surfaces render through the kit: `keys`, `agent-keys`, `destinations`, `experiments` (form), `flags`, `impact` |
| 3 — confirm what can't be undone | [#84](https://github.com/danybgoode/golden-beans/pull/84) | `b0aa85e` | Nine irreversible controls ask first and say what stops; the bespoke two-click confirm is gone |

Adoption went from **2 of 26** route files consuming `components/ui` to **9 of 27**, and the two the
count started with (`onboarding`, `task-queue`) only ever used `Icon`. Every table in the product
that is a list now sorts, filters, distinguishes *"you have none"* from *"none match what you
typed"*, and carries `aria-sort`.

The part that made it urgent rather than tidy also landed: `flags-visual-rule-builder` (#15) and
`scenarios-pm-operable` (#16) can now consume `ConfirmDialog` and `FormSection` from `main` instead
of each building half of both in a different shape.

## What went well

**The architecture-lock pass paid for itself before a line was written.** Reading the code instead
of the doc found that D5 — a locked decision the whole of Sprint 3 was built on — described a
component that does not exist as described. `AgentRail.tsx` "already confirms" was false; it has no
interactive controls at all. The real pre-existing confirmation was in `destination-manager.tsx`,
unmentioned in any planning document. Had that gone unchecked, Sprint 3 would have shipped a second
confirmation pattern beside a first one nobody had noticed — the precise outcome D5 existed to
prevent.

**The gate caught what it was supposed to, and the reviewers caught what it can't.** CI was green on
a PR whose `ConfirmDialog` stranded keyboard users on `<body>`; a cross-family reviewer found it in
one pass. Determinism and judgment covered different failures, which is the whole argument for
having both.

**Measuring instead of asserting.** Two "regressions" this epic turned out to be the environment: a
`next dev` server corrupting the local gate's build output, and a spec failing from accumulated
fixture data. Both were disproved by running the identical command on clean `main` rather than by
reasoning about the diff. That habit cost minutes and saved a false bug report each time.

## What we learned

**A spec that watches a mechanism running will not notice that it never puts anything back.** The
`ConfirmDialog` focus-trap spec passed a component that trapped focus correctly and then abandoned
the user on `<body>` when it closed, because it only examined focus *while the dialog was open*.
Coverage of the happy path is not coverage of the exit.

**A cross-family finding usually points at one file when the answer is a pattern in four.** It
happened twice. Agy named `agent-keys` and `destinations` for a missing `try/catch`; the same shape
was in `keys` from Sprint 1, and going back through the diff for the *class* turned up a fourth
variant in `flags` that no reviewer had flagged — one that had already been fixed once, in PR #82,
and reintroduced one file over. Treat a finding as a sample, not the population.

**"Less code" is the wrong acceptance criterion for a table conversion.** Measured: 136→135 and
152→163 code lines. A column definition is not shorter than the `<tr>`/`<td>` markup it replaces —
it is the same cells *plus* a sort accessor, a filter accessor and a null-vs-absent decision each.
What the conversion buys is capability and consistency. The Sweeper acceptance worth keeping is
**same behaviour, no regressions**, which is falsifiable; "less code" was a prior, and it was wrong.

**Amend a locked criterion out loud, and ask.** Both amendments were written down with reasoning,
and both were still an unapproved scope change until the product owner answered — which is what
cross-review flagged as Blocking. Recording the reasoning is not the same as getting the decision.

**`DataTable` can only be called from a client component**, because its `columns` carry accessor
functions and functions cannot cross the server→client boundary as props. `impact` needed a new
client island for this. Worth knowing before #15 and #16 add tables.

**Assert the property, not its proxy.** Story 3.2 asks that cancelling perform *no network call*, so
the spec counts POSTs during a dismissal. "The row still says active" would also pass if the revoke
fired and merely failed.

## Gaps / follow-ups

- **Owed to the product owner:** the **consequence copy**. Whether each sentence tells a PM what
  they're about to lose is the one judgement in this epic no spec makes — walkthrough step 7 in
  `sprint-3.md`. Also the signed-in visual parity pass across the six converted routes.
- **The D3 finding, open by design.** `DataTable`'s filter is unconditional, which is wrong for
  small fixed-cardinality tables. Three surfaces hit it (`flags` definitions, `experiments` versions,
  the experiment detail page's per-variant tables). The option needed — an explicit prop, or
  auto-suppression below a row threshold that D7 would want *read* rather than hardcoded — is the
  next wave's call. Underneath it sits a sharper question: whether those should be one flat table of
  versions at all, which is an IA change and #15's territory.
- **Carry-over, named**: `scenarios` (D6 — #16 rewrites it), the experiments detail route,
  `decision-recorder`'s layout, `shares`, `journeys`, `funnel`, `tasks/page.tsx`, `app/page.tsx`.
  Full list with a reason each in `sprint-2.md` → Story 2.4. `shares` and `journeys` are the
  strongest next candidates — both are flat list + form, the shape `DataTable` already fits.
- **`shares` → Revoke and `journeys` → Activate are irreversible and unconfirmed.** Out of scope
  because their routes were never converted, but they are real one-click actions on live objects.
- **Two pre-existing authed-rail failures**, verified identical on clean `main` and untouched here:
  `command-center.authed` (the authed rail does not inject `SUPABASE_DB_URL`, unlike
  `test:e2e:local`) and `project-navigation.authed`.
- **`north-star-sync.spec.ts` fails against a local database with accumulated fixture data.** Green
  on CI's fresh DB. Nothing to do with this epic, but it will keep costing someone a diagnosis.
- **An unknown feature key on `/app/impact/<slug>/<key>` returns 500, not 404** — noticed while
  seeding the fixture. Pre-existing; not this epic's to fix, but worth a seed.
- **`D4` remains unpaid on purpose.** The generic tag selectors in `globals.css` stay until the
  *last* route is converted. That debt is explicitly beyond this appetite.
