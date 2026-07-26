# Pod Report + Roadmap Hub — benchmarks/ROI + live roadmap-vs-end-state views — Retrospective

_Closed: 2026-07-26_

## What shipped

| Sprint | Ships | Where |
|---|---|---|
| 1 | `report_artifacts` + the `roadmap-push` rail · journey / drill-down / horizon views | PR [#30](https://github.com/danybgoode/golden-beans/pull/30) `bea1728` |
| 2 | Delivery metrics + the AI-adoption maturity lens, computed from the real dataset | PR [#32](https://github.com/danybgoode/golden-beans/pull/32) `0eca9fc` |
| 2.5 | The push rail wired · `/hub/<slug>/report` · the audience lens · the outcome layer joined | PR [#33](https://github.com/danybgoode/golden-beans/pull/33) `7697bba` |
| 3 | Scoped revocable share links (`/s/<token>`) · landing §5 backfill · hub dogfood · launch | PR #33, flag flipped on deploy `762ae3a` |

**Live in production:** `/hub/<slug>/report`, `/s/<token>` behind `REPORT_SHARES_ENABLED=true`,
`/app/shares/<slug>`, and §5 of the landing rendering real computed numbers (13 days · 88 commits ·
2.2 d median epic lead time · step 1 "Assisted" · **11 things we do not measure, named**).

Two pod_report artifacts stored: golden-beans' own (pushed by CI on every deploy, feeding §5) and
medusa-bonsai's real 841-commit history on the `miyagisanchez` tenant, behind auth.

## What went well

- **The epic's ethic survived contact with implementation, because it was made structural rather
  than remembered.** `isHonest()` refuses to render a numbers-without-caveats artifact; the lens
  assigns the honesty fields outside every per-lens branch; the verdict and its not-instrumented
  count render inside one element; the database rejects a `pod_report` payload with no declared gaps.
  Each of those is a rule that cannot be forgotten rather than one someone must remember.
- **Sprint 2's computation was genuinely good** — it caught and rejected two flattering-but-false
  numbers of its own accord: a 0.16 h "cycle time" that was really review latency, and a 0-day epic
  lead time caused by 83 epics documented after the work.
- **Three real bugs were found by RUNNING things, not reading them**: the payload CHECK that rejected
  every `pod_report` (verified against production before the fix), the `source` field collision, and
  `source.repo` hardcoded to `'medusa-bonsai'` — the last invisible until the script was pointed at a
  second repository.

## What we learned

1. **A close-out is a claim, and claims get verified.** Sprint 2's doc said all four stories were
   built. Two did not survive re-derivation against `origin/main`, the production database and the
   live site: `--push` printed a warning and exited 0, and `lib/pod-outcome.ts` had zero callers
   despite the doc naming the tenant it was "built against". Validate a handover against the
   artifact, never against the previous session's summary.
2. **Cross-family review is a floor on high-risk work, not a formality.** Four agy rounds found seven
   Should-fix and zero Blocking; round 4, aimed at the auth surface, came back clean. Codex then
   opened with a Blocking finding on that same surface.
3. **The most valuable finding in a round is often a bug the previous round's fix introduced.** Round
   2's best catch was `stripEvidence` claiming evidence was "withheld" when none existed — created by
   round 1's fix, breaking an invariant a sibling comment had already declared.
4. **When you harden one instance of a bug class, its siblings are what the next round finds.** Round
   1 taught `readOutcome` to distinguish a failed read from an empty one; `readNorthStar`, three
   functions down, had the identical defect and kept it until round 2.
5. **A `CHECK` constraint that evaluates to NULL is a suggestion.** PostgreSQL accepts it, so a
   composite predicate with an `IN` against a nullable column silently permits exactly the row it
   appears to forbid — and the migration comment asserting otherwise was believed for four rounds.
6. **Do not infer which rail a credential serves from its name.** `SELF_PROJECT_API_KEY`
   authenticates as `golden-beans-demo`. §5 shipped reading the wrong tenant and rendered its
   fallback teaser in production.
7. **A local gate that is a subset of CI's gate is worse than none.** Three push-and-wait round trips
   — lint, prettier, then the test tsconfigs — each for a static check that runs in seconds locally.
   `tsc -p apps/web` is not `npm run typecheck`.
8. **A green notification workflow is not a delivered notification**, and the fix is an exit code
   rather than an annotation.
9. **A spec can look like a teeth test and pin nothing.** The spec written for the Blocking finding
   passed against a deliberately re-broken build; mutation-checking it was the only reason that was
   discovered, and the finding turned out narrower than reported.

Promoted to `Roadmap/LEARNINGS.md`: 1, 2, 5, 6, 7, 8, 9. Items 3 and 4 sharpen entries that already
exist there.

## Gaps / follow-ups

- **Owed to Daniel — the one launch step an agent should not take alone:** minting the first real
  share credentials in production, and deciding which tenant's report goes to which audience. The
  mechanism is proven (mint → open → revoke → dead, spec'd against a real revoked row), but minting a
  live bearer credential that exposes internal delivery data is a named human action. Walkthrough in
  `sprint-3.md`.
- **`REPORT_SHARES_ENABLED=true` is set and deployed (`762ae3a`), but its ON state is unverified from
  outside** — deliberately: an unknown token returns 404 whether the gate is off or the token is
  merely wrong, and that no-oracle property is the design. Confirming it needs one valid token, i.e.
  the item above.
- **Epic ship-date detection is still exact-string** (`git log -S 'status: shipped'`). Carried from
  Sprint 2 with its reasoning intact: both attempted `-G` replacements changed verified numbers
  rather than preserving them. A proper fix parses frontmatter per revision, with a fixture proving it
  reproduces 47 epics / 7.2 days first.
- **The lens scores golden-beans 6/7 and medusa-bonsai 4/7**, conservative for both. The judgement
  call Sprint 2's QA asked for — read the verdict cold, check it against your own sense of where the
  pod sits — is still owed, and no spec substitutes for it.
- **`report_viewed` fires only when a visitor cookie already exists**, so internal hub views by
  signed-in members are largely uncounted (a Server Component cannot set a cookie). Wiring that
  funnel to the session user id is a small follow-up.
- **Deferred, unchanged:** the Attio destination (E4 3.2) and the live Miyagi dogfood of experiment
  governance.
