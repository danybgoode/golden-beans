# Retrospective — A preview deployment stops calling itself localhost

**Shipped:** 2026-08-20 · **PR:** [#116](https://github.com/danybgoode/golden-beans/pull/116)
(`c2589e1`) · 4 stories · 1 amendment · **9 cross-family review rounds**

## What shipped

`getSiteUrl()` resolves `SITE_URL` → (on a preview only) the deployment's own hostname → localhost.
Previews now serve their own URLs; production is untouched.

The fix itself is nine lines. Everything else in this epic was making sure those nine lines cannot
do damage, and proving that the platform actually behaves the way the fix assumes.

## What went well

**The architecture lock was worth more than the code.** `vercel env ls` — one command, run before
writing anything — established that `SUPABASE_URL`, `SIGNUP_ENABLED`, `CONNECTOR_ENABLED` and
`REPORT_SHARES_ENABLED` are *all* Production-scoped. That single fact turned the epic's scariest
question ("what if a preview mints a connector URL that dies with the preview?") from a design
problem into an observation: those paths cannot run on a preview at all, because a preview has no
database. Without checking, the honest response would have been a much larger and worse design —
two URL functions and a per-caller judgement call that would have drifted within a quarter.

**The acceptance was a real preview, and it had to be.** D5 said plainly that no unit test could
prove Vercel exposes `VERCEL_ENV` at runtime — nothing in this repo had ever demonstrated it, since
`isSiteUrlMisconfiguredInProduction()`'s false branch is indistinguishable from the variable being
absent. So the epic was not called done until a preview URL was fetched and observed. It returned
the **branch** hostname, which confirmed D3 by observation rather than by reading docs.

**Production was safe by ordering, not by promise.** `SITE_URL` is set in Production, so the new
branch is unreachable there. That is a property of the code's shape, it was asserted directly
(including the negative case — production without `SITE_URL` must fall to localhost, never to
`*.vercel.app`), and it was re-verified against the live site after merge.

## What we learned the hard way

**Nine review rounds, and most late findings were bugs in the previous round's fix.** The rule
LEARNINGS records for concurrency work turns out to hold for source-scanning guards too. The caller
registry alone was corrected five times:

| Round | Hole found in the previous version |
|---|---|
| Codex 1 | the gate check searched the whole file, so a **dead import** passed |
| Codex 2 | discovery matched import *shapes*, so a namespace import or renamed binding escaped |
| agy 2 | the specifier pattern rejected an explicit `.ts` extension — which **this repo's own tests use** |
| agy 2 | `SEARCH_DIRS` was hardcoded, so a new top-level directory escaped |
| agy 3 | `[\s\S]*?` spanned a side-effect import and **swallowed code between imports** |
| agy 4 | trailing `//` comments defeated the `$` anchor — a false pass on the dangerous side |
| agy 5 | trailing `/* … */` comments did the same |

Every one of those was a guard that looked right and reported success. The only thing that ever
caught them was a reviewer or a mutation check.

**Fixing a finding introduced a worse one, and my own test caught it.** Replacing the hardcoded
`SEARCH_DIRS` with a deny-list matched bare directory names *at any depth* — so `public` skipped
`app/api/v1/public/` as well as the static-assets folder, silently dropping the **signup route**, a
durable caller, out of discovery entirely. The stale-registry test went red immediately. That is the
half of the guard that watches the other half, doing exactly its job.

**A reviewer can be handed a stale diff, and it looks exactly like a confident wrong finding.** agy
reported already-fixed issues twice, quoting the pre-fix source verbatim — once claiming a test
failed that was green. Both times the tell was the same and it is cheap: **the code quoted in the
finding does not exist in `origin` at the reviewed SHA.** Check that before accepting *or*
dismissing; the same reviewer's other rounds produced five real defects.

**A local gate that is a subset of CI's is worse than no local gate.** typecheck + lint + unit were
green while CI's `Static gate + build` failed on Prettier over the files this PR *adds*. The
specific trap: running `format-changed.mjs` without `PRETTIER_BASE_REF` reports "no added files" and
**exits 0**, which reads as a pass. This is the second epic to pay for this exact lesson.

**A generated file in the diff was a symptom, not the bug.** A reviewer flagged `BUILD-ORDER.md` as
hand-edited. It had been generated — but regenerating produced a *diff*, which meant the committed
copy was stale, and the cause was real status drift: the sprint said "In review" while the epic
frontmatter still said `scaffolded`. Fixed at the cause. Checking beat both accepting and dismissing.

## Gaps, stated rather than implied

- **The guard covers the in-repo half only.** If someone adds `SUPABASE_URL` to Preview scope, every
  durable-URL path becomes reachable on previews and the registry test stays green. That limit is
  written into the test's own header, because a guard that pretended to cover it would be worse than
  one that says plainly that it does not.
- **The gate check proves a *reference*, not control flow.** A file could call its gate and ignore
  the result. Proving "this identifier dominates every path to the URL construction" is a
  control-flow question, and a regex pretending to answer it would be the exact failure mode this
  epic spent five rounds removing. The limit is named in the test.
- **`isSiteUrlMisconfiguredInProduction()` has still never been observed firing.** Its false branch
  and an absent `VERCEL_ENV` are indistinguishable. This epic makes that less likely to matter — the
  preview path proves `VERCEL_ENV` is exposed — but the production branch itself remains unexercised.
