# House style — what "good" looks like here

**Audience:** any contributor, human or agent, writing code in this repo. `AGENTS.md` has the rules
that cannot be violated; this has the ones you would otherwise hear in review.

**Why this file is short.** A long standards doc is an unread standards doc, and this repo has
watched documentation rot in place while the code moved (a model constant that configured nothing,
a comment asserting a check the code did not perform, a landing section stating a flag state that
had changed). So: only rules that have actually cost us something, each with the failure it
prevents. If a rule here is now wrong, fix or delete it.

**The meta-rule.** Anything said in a review twice becomes either a lint rule or a line in this
file. A convention nobody enforces is a convention that drifts.

---

## 1. Reuse the seam. Never build a second path.

`AGENTS.md` rule #1 states this for telemetry; it generalises. Before writing a query, a client, a
revoke path, or a URL builder — grep for the existing one. The load-bearing seams are listed in
AGENTS.md under "Key imports".

*Why:* the second copy is the one that gets forgotten when a leaked credential needs killing at 2am.
This repo has three credential kinds in one table sharing **one** revoke path, on purpose.

## 2. Make the failure unrepresentable, not merely fixed.

When you catch a bug, ask whether the *class* can be structurally excluded rather than patched.

- A scope filter that must not be dropped goes **in the database view**, not in application code —
  then there is no filter in application code to drop.
- Two things that must agree get **one** implementation, not two that currently match.
- A value that must not go stale is **computed**, not written down.

## 3. A comment that asserts a property must be true, and you must have checked.

Prose in a diff reads as evidence: a reviewer who sees a stated rationale spends their scrutiny
elsewhere. We have shipped a migration whose comment claimed an invariant the constraint did not
enforce, and it survived four review rounds.

**Verify a database-level guarantee by ATTEMPTING the write you claim is impossible.** Same for a
grant, a constraint, or an "unreachable" branch. Then write the comment.

## 4. Comments explain WHY, and name the failure mode.

Not what the line does — the reader can see that. Say what breaks if it is written the obvious way,
and cite the incident if there is one. A comment that says "we check X here" must sit above lines
that check X.

Density: high on anything security-, money-, migration- or concurrency-shaped; low on plumbing.

## 5. A test that cannot fail is worse than no test.

Because the next reader stops there. For anything security-critical: **mutation-check it** — break
the exact line the spec claims to defend, observe red, revert, confirm the tree is clean.

Two traps we have hit:
- A spec can be **unreachable by construction** (the guard sits behind a precondition the harness
  never satisfies) and still pass. If a guard is behind auth/state your test cannot reach, extract
  it into a **pure, zero-import module** and assert it directly.
- Testing a helper directly while the **caller** was never wired to it. Test through the caller with
  an input whose result differs between the old and new implementation.

## 6. Assert that a scripted edit matched.

An unasserted `str.replace()` that finds nothing succeeds silently, and it is invisible in a green
test run. `assert old in s` before writing.

## 7. Fail loud. Never substitute silently.

An unrecognised model name, a missing config, an empty CLI response: prefer a hard error to a
plausible-looking default. We ran an entire release cycle of prose on the wrong model because an
unknown `--model` silently substituted a default and exited 0.

Corollary: **score a subprocess on its exit code, never on a pattern in its output** — a CLI prints
its banner on the way to failing.

## 8. An honest empty state is part of the feature.

A zero and a broken read are indistinguishable to a reader, and a zero pages nobody. Any surface
whose "correct" empty state looks like its broken state needs either an explanatory empty state
("no tasks yet, and here are the three reasons that can mean") or one end-to-end check that produces
a non-zero number.

Never invent numbers to fill space. Falling back to an honest teaser beats rendering a plausible
placeholder.

## 9. Say what is announced vs. what is shipped.

Any claim on a public surface must be checkable. Do not compare our shipped thing against a
competitor's unreleased one and let the reader assume both exist. Do not state a capability as live
while its flag is off — read the flag.

## 10. Tenancy is not negotiable.

Every query is `project_id`-scoped, and that id is resolved **server-side** — from a credential,
never from the request body or a URL slug. If you already hold a resolved `project_id`, pass it;
do not re-resolve identity from something mutable. "Not yours" and "not there" must be
indistinguishable to the caller.

## 11. Rollout order is part of the design.

env vars → migration → merge (the deploy). An expand migration lands **before** the code that reads
it. Env vars need a **new deployment** to reach running functions — setting one is half the job.
Verify by exercising the behaviour, never by a CLI listing.

## 12. Leave the tree clean.

If your method mutates code (a mutation check, a bisect), revert it and **verify** — `git diff HEAD`
for source files your task had no business touching. A half-applied task reads exactly like a
finished one. We lost `timingSafeEqual` from a signature check this way, and every test still passed.

---

## The gate, before you say you are done

Run what CI runs, in this order — never a hand-written approximation of it:

```bash
npm run typecheck     # FOUR tsconfig projects, not just apps/web
npm run lint          # --max-warnings=0
npm run test:unit
npm run test:e2e      # needs `supabase start` + a freshly built server
```

Report the actual output. "Should pass" is not a result, and a green claim that was never run is the
single most expensive thing you can hand the next person.
