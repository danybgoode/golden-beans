# Retrospective — landing redesign v2

**Shipped 2026-08-12.** PR [#92](https://github.com/danybgoode/golden-beans/pull/92), merged as
`4553767`, live at https://golden-beans-gamma.vercel.app.

## What shipped

The public landing moved from selling an **engine** ("The growth engine your agent operates") to
selling the **decision** ("Your roadmap has enough opinions"). Fifteen sections, built from
`references/golden-beans-landing-v2.html`, with the engine reframed as the reason receipts are
possible rather than the thing being sold.

Alongside it, and the part with the longer half-life: **mobile heuristics as site-wide rails**, plus
a guard that sweeps a list of routes rather than one hand-copied test per page.

- **S1** — `globals.css` mobile rails (`:where()`, specificity 0), the multi-route sweep, and the v2
  component classes.
- **S2** — the fifteen sections; `/northstar-self-serve.md`; the two copy-a-prompt blocks.
- **S3** — coupled specs reconciled, the gate, five review rounds, merge, production verification.

## What went well

**The rails found real defects on their first run.** `e2e/mobile-heuristics.browser.spec.ts` caught
`.landing-nav .btn` explicitly setting `min-height: 40px` — the most-tapped control on the site, 4px
under the floor `ux-guidelines.md` states, shipped and unnoticed. Writing the guard as a sweep rather
than a per-page test is what made covering `/login` cost one array entry.

**Asking three questions up front changed the deliverable.** Live proof survived, the `$49` tier
shipped with its caveat, and `/northstar-self-serve.md` got authored — all decided before any code,
none of it reworked later.

**Verifying by exercising behaviour rather than reading config.** Twice this session a config read
would have produced the wrong answer: `vercel env ls` shows no values (the RISK gate's state came
from a 404-vs-405 probe of a deployed route), and a stale dev server reported CSS that wasn't in the
build. AGENTS.md already says this; it earned its place again.

**A production cross-check that closes the page's own loop.** §6 tells readers to curl
`/api/v1/public/north-star`. Doing exactly that after deploy returned `value: 35, wow: 0.409` —
identical to what the page rendered. The claim is checkable because it was checked.

## What we learned

**A reviewer that read nothing still reports "clean."** Round 2 came back clean from agy with
`Attached 0 whole file(s); 38 did not fit the budget` in its own output — it had seen the diff and no
files. Taking that as a clean round would have ended review three rounds and six findings early. The
budget line is in the tool's output, not in its verdict; **read the scope line before the findings.**
Rerunning with `--code-only` fixed it, and every subsequent round attached files and found real bugs.

**A comment that explains a decision can be as wrong as code, and is trusted more.** An intermediate
fix carried a confident claim that the CSS minifier mangles `:where(:has())`. It does not — the
claim was an artifact of a grep pattern matching inside `:where(`, while the real cause was a stale
build. It would have shipped as documentation and misled the next reader. CODE-QUALITY #3 already
requires verifying a stated property; the failure mode worth naming is that **the verification and
the conclusion were done in one step, on a dirty environment.**

**A specificity default silently outranks the classes it is meant to defer to.** `.panel p` at
(0,1,1) beat every single-class rule on its own children: `.takeaway` rendered dim, `.micro--gold`
rendered dim, the tier price rendered at 14px. Nothing errored, and the call sites all looked
correct. Descendant rules that exist as *defaults* belong in `:where()`.

**Fixing one instance of a class of bug is not fixing the class.** The review found the hero's
unlabelled illustration. Pinning it with a spec — rather than editing just that one note — found two
more the reviewer never reached (§3, §4). The spec is what turned one finding into a property.

**A pre-existing bug found during a redesign is still yours to fix if the redesign amplifies it.**
`weekOverWeek` reported a flat series as +133% growth, was identical on `main`, and had been live for
weeks. This PR made §6 "the only section carrying real numbers", which is what made shipping past it
untenable.

## Gaps, stated

- **Codex reviewed rounds 1–2 only.** It hit its usage cap (until 2026-09-10) before round 3. The
  third eligible family (vibe) was routed onto the final diff instead, so the closing round still had
  two independent families on the same commit — but the *same* two families did not review start to
  finish. Recorded in the PR body per WAYS-OF-WORKING review rule 4.
- **No external reviewer saw the epic docs.** Both agy and vibe ran `--code-only` to fit agy's 256 KB
  argv cap, so six doc files — including every sprint's acceptance criteria — were withheld from
  every external pass. No external reviewer checked the code against its own stated acceptance.
- **Signed-in `/app` routes are not in the mobile sweep.** The `browser` project is anonymous by
  construction, so a signed-in route would be measured against its login redirect.
  `assertMobileClean` is exported for an `*.authed.spec.ts` sweep to reuse. This is the single
  highest-value follow-up: the rails are global, but only three public routes are *proven*.
- **13 `api` specs fail locally** on unset gates and unseeded demo data. Identical on `main`, green in
  CI. `SUPABASE_DB_URL` must be exported locally or ~30 more fail on a precondition — worth adding to
  the gate recipe.

## Follow-ups

1. An authed mobile sweep reusing `assertMobileClean` (the gap above).
2. `RESILIENCE_SCENARIOS_ENABLED` is off in production, so §3's RISK row renders its
   "not switched on yet" badge. The badge reads the flag, so flipping the gate clears it with no
   code change — but somebody should decide whether that gate is staying off.
3. `references/landing-end-state.md`'s personas and design language survived; its section map is
   superseded. If a v3 is ever groomed, groom it from `lib/landing-sections.ts`, not that file.
