# Reproduce every verify-spike result

Every number in [`DECISION.md`](DECISION.md) comes from one of these commands, run from the repo root
on macOS arm64 (2026-09-29). Nothing here touches a database, the network (apart from the one-time
tool downloads and the Jev step), or CI.

## Tools (one-time)

| Tool                                           | Install                                                                                                                                       | Measured                  |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Quint 0.33.0                                   | `npm i @informalsystems/quint@0.33.0` in a scratch dir (or use `npx -y @informalsystems/quint@0.33.0`)                                        | 5 s                       |
| Apalache (the exhaustive checker Quint drives) | downloaded by `quint verify` on first use; needs Java 17+ (Java 23 was present)                                                               | inside the first 30 s run |
| Lean 4.34.1 via elan                           | `curl -sSfL https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh \| sh -s -- -y --default-toolchain leanprover/lean4:stable` | ~5 s + toolchain download |

No Mathlib. The proofs use core Lean only, which is why they build in about a second.

## S1.1 — the outbox model check

```bash
QUINT=/path/to/quint bash Roadmap/09-platform-infra/verify-spike/quint/check.sh quick   # simulator table, ~1.5 min
QUINT=/path/to/quint bash Roadmap/09-platform-infra/verify-spike/quint/check.sh         # + the exhaustive runs
```

Each row prints the result `DECISION.md` § Evidence records next to the result it got. The script
exits 1 if any row differs **or produces no result** (a missing tool or a checker crash), so a blank
row can never read as a pass. The four counterexample traces are in
`quint/traces/*.itf.json`. Print any of them one step per line with
`node Roadmap/09-platform-infra/verify-spike/quint/summarize-itf.mjs <trace>`.

## S1.2 — the Lean proofs and the differential test

```bash
cd Roadmap/09-platform-infra/verify-spike/lean
lake build                        # model + proofs + the diff-test executable (~5 s)
lake env lean Axioms.lean         # each theorem uses only propext, Classical.choice, Quot.sound; no sorryAx
cd -
for seed in 1 2 3; do node Roadmap/09-platform-infra/verify-spike/diff-test/run.mjs 2000 $seed || break; done
```

Expected: `"disagreements": 0` for seeds 1, 2 and 3 (2,000 cases each, the Lean model ~65 ms per
batch), exit code 0.

**Mutation check (does the test have teeth?):** in `lean/Flageval/Model.lean`, change `nonBlank` to
use Lean's `c.isWhitespace` instead of `jsWhitespace`, then `lake build` and re-run seed 1. Expect
**165 disagreements** and exit code 1, with every proof still passing. Restore the file afterwards.

## S1.3 — Jev triage

```bash
node Roadmap/09-platform-infra/verify-spike/jev-triage/run.mjs   # needs jev.egress true + TYPESAFE_API_KEY
```

This rewrites `jev-triage/answers.json`. Jev is a model, so a re-run can differ in the second decimal.
The table in `jev-triage.md` is from the 2026-09-29 run.
