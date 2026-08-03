# Session kickoffs — prompt cheat sheet

Quick-reference prompts for starting a new session. **Fill the `<VALUES>` and paste.**

The principle: a kickoff is a **thin pointer, not a content dump**. Context lives in the durable docs
(`AGENTS.md`, `WAYS-OF-WORKING.md`, `LEARNINGS.md`, the epic/sprint files, team memory) — so the prompt
just *points* at them. This keeps prompts cheap and consistent, and it's **vendor-neutral**: any coding
agent re-orients from the same docs. It also sidesteps the biggest hidden cost in multi-agent dev — the
"communication tax" of re-passing large context.

> `AGENTS.md` "Start here" already chains to `WAYS-OF-WORKING.md` + `LEARNINGS.md` + team memory, so
> naming **AGENTS + the one sprint/scope doc** is usually all the orientation an agent needs.

**The three stages.** Since the economics layer landed (WAYS-OF-WORKING → *Betting & appetite*),
every kickoff below sits in one of three stages — say which one you're in and the rest follows:

| Stage | Question it answers | Kickoffs |
|---|---|---|
| **Shape** | *What is this worth, and what's the smallest thing that delivers it?* | §1 (groom → a pitch), §3 (spike), §10 (re-shape after a breaker) |
| **Bet** | *What are we funding this wave, and what does it displace?* | §9 (the betting table) |
| **Build** | *Execute the approved plan.* | §2, §4, §6, §7, §8 |

Shaping without a bet produces plans nobody funds; betting without shaping funds work nobody sized.
A **fixed-scope** ask (bug, chore, clear story) skips Bet by design — see §1.

## Fill-in values
- `<ask>` — the raw one-line request
- `<epic-slug>` — e.g. `discovery-polish`
- `<NN-macro>` — macro-section folder, e.g. `01-onboarding-and-auth`
- `<N>` — sprint number
- `<risk>` — **LOW** (reviewer may auto-merge on green CI) / **HIGH** (product owner merges)
- `<appetite>` — **S** (one builder session) / **M** (one wave) / **L** (multi-wave) — the budget, fixed before the solution
- `<lane>` — **shaped bet** (→ the table) / **fixed scope** (→ straight to a builder) / **reactive** (logged against the wave)
- `<wave>` — the wave file under `Roadmap/bets/`, e.g. `wave-2026-08-03-harness-portability.md`
- `<AGENTS-path>` — this project's `AGENTS.md` (or the app-specific one, if it's a monorepo)

## Command shorthands
A small, fixed vocabulary so the *instruction* half of a message is unambiguous — each verb just
**points** at a numbered kickoff/action below (same thin-pointer principle; vendor-neutral).
Pleasantries are fine and cost nothing — the leverage is the defined verb, not trimming "great work."

| Say this | Expands to |
|---|---|
| **Groom: \<ask\>** / **Shape: \<ask\>** | §1 — groom a raw ask into a shaped pitch (synonyms; "Shape" just names the stage) |
| **Bet** / **Bet the wave** | §9 — run the betting table at a wave boundary, write `Roadmap/bets/<wave>.md` |
| **Re-shape \<slug\>** | §10 — an M/L bet hit its circuit breaker; back to shaping, never extended in flight |
| **Build S\<N\> of \<epic\>** | §2 — build a sprint |
| **Spike \<name\>** | §3 — run a spike |
| **Review PR #\<N\>** | §4 — fresh-reviewer single pass |
| **Cross-review PR #\<N\>** | §4 judgment line — Agy baseline; add Devin for high-risk PRs, Cursor as specialist/tie-breaker |
| **Panel: \<scope-doc \| ask\>** | advisory second opinion on a *plan* — `node scripts/cross-panel.mjs <doc> --lens both --agent codex\|antigravity` (single-pass, print-only, never gates; surfaced at groom Stage 2/4) |
| **Wrap S\<N\>** | tick the sprint doc status + emit the §7 sprint-wrap terminal summary |
| **Close epic \<slug\>** | §6 — full epic Definition of Done |
| **Clear to merge — LOW** / **product-owner-merge** | the risk-tier gate: reviewer auto-merges on green CI / product owner merges |
| **Next** | proceed to the next story/sprint per the current `sprint-N.md` |
| **Resume** | §8 — pick up a session that died mid-flight (`node scripts/session-trail.mjs --resume`) |

---

## 1 · Groom a raw ask into a shaped pitch — strong model *(the Shape stage)*
```
Groom: <ask>.
Read <AGENTS-path> (Start here) + Roadmap/LEARNINGS.md; skim team memory, Roadmap/00-ideas/BUILD-ORDER.md
and the latest Roadmap/bets/ wave file (what's already funded, and what it displaced).
Use the groom skill — planning only, no code. Orient → SET THE APPETITE BEFORE ANY SOLUTIONING → classify
class + lane → "can we already do this?" → disambiguate → platform-primitives-first reframe → bill of
materials → slice into sprints. Land the pitch in Roadmap/00-ideas/seeds/ with appetite: set and
underwritten_by: null. Never assume — validate at each gate.
```
**The appetite is a creative constraint, not a forecast.** It is fixed *before* the solution is
designed; if the solution won't fit, narrow the problem or cut scope — never grow the appetite
mid-shaping. An agent will build anything if allowed to tokenmaxx; the appetite is what makes it
stop and hammer scope instead.

**Then the lane decides what happens next — say which one at the end of the groom:**

| Lane | Tell | What follows |
|---|---|---|
| **Shaped bet** | genuinely-new / strategic | pitch is complete (problem · appetite · bill of materials · rabbit holes · no-gos) → stops at `status: ready`, waits for §9. **No scaffolding yet** — an unfunded epic is a plan nobody paid for. |
| **Fixed scope** | bug, chore, well-specified story | default `appetite: S`, **skip §9 entirely** → on my approval scaffold the epic + sprint docs (commit path-scoped) and emit the per-sprint kickoffs |
| **Reactive / ops** | incident, launch support, can't wait | no shaping — do it, then log it against the current wave's budget so the economics stay visible |

*Add for a shaped bet:* `"Stop at the pitch. Do not scaffold — this goes to the betting table."`

## 2 · Build a sprint — plan on strong model → execute
```
Read <AGENTS-path> (Start here) + Roadmap/LEARNINGS.md, then
Roadmap/<NN-macro>/<epic-slug>/README.md + sprint-<N>.md.
Build Sprint <N> of "<epic-slug>" per WAYS-OF-WORKING, in your OWN git worktree off latest main on
feat/<epic-slug>. Plan mode → confirm stories with me → build one story at a time. Commit per story
PATH-SCOPED (git add <your files> && git commit -- <those paths>; never -A). One api spec per testable
story. Keep the CI gate green; open a draft PR declaring risk <risk>. Write the sprint smoke walkthrough
into sprint-<N>.md before calling it done.
```
*HIGH-risk: add — "all stories HIGH → product owner merges; the authed money-path browser smoke is owed
to the product owner."*

## 3 · Run a spike — strong model
```
Read <AGENTS-path> (Start here) + Roadmap/LEARNINGS.md, then <brief path>.
Run the <name> spike: time-boxed, READ-ONLY investigation → a written DECISION appended to the brief. No
branch, no code. Answer the brief's questions against the live codebase; sort each capability into
already-possible / light-enhancement / genuinely-new; end with Go / No-go / Go-with-constraints.
I sign off the decision before anything gets groomed.
```

## 4 · Review a PR — external reviewer (NOT the builder)
```
Review PR #<N> cold after the deterministic gate. The builder stays architect/coordinator and does not
approve its own diff. Run Agy once via `node scripts/cross-review.mjs <N> --agent antigravity`; add
Devin for money/auth/DB/tenancy/concurrency/shared-infra risk, and Cursor only as a specialist or
tie-breaker. Check correctness + AGENTS.md, post findings, and resolve every Blocking item.
Re-review substantive fixes; use targeted validation for docs/presentation-only deltas.
```

## 5 · Strategy / process work — strong model
```
Read <AGENTS-path> (Start here), Roadmap/WAYS-OF-WORKING.md, Roadmap/LEARNINGS.md; skim team memory,
Roadmap/00-ideas/BUILD-ORDER.md and the latest Roadmap/bets/ wave file.
<task>. Docs/planning only. Never assume — validate before editing any canonical doc. No git commits (flag
the changed files for me to review + commit).
```

## 6 · Close an epic
```
Close epic <epic-slug> per WAYS Definition of Done (epic): all sprints merged + smoke-tested (gaps stated) ·
each sprint-N.md has its smoke walkthrough · README ✅ AND its frontmatter `status: shipped` (the SSOT) ·
regenerate the board (`node scripts/build-order.mjs` — never hand-edit BUILD-ORDER.md) · RETROSPECTIVE.md
written · product poster (Roadmap/README.md) updated · team memory updated · promote durable learnings into
LEARNINGS.md (dedupe — sharpen, don't append near-duplicates) · branch deleted.
```

## 7 · Sprint-wrap terminal summary — what an agent prints when a sprint lands
The on-screen handoff when a sprint wraps (triggered by the **"Wrap S\<N\>"** shorthand). This is the
*terminal* message, **not** a doc — the durable record is the `sprint-N.md` (+ `RETROSPECTIVE.md` at
epic close). Keep it a **thin pointer + the delta the product owner must act on**; do **not** re-narrate
what the doc already holds (that re-summary is the only "double work" here — the fix is to point, not
repeat).
```
✅ S<N> "<epic>" wrapped — <one line: what shipped>
Merged:  PR #<N> (<commit>) · risk <LOW|HIGH>
Gate:    <your CI gate> green (CI <run id/link>)
Owed to you (can't self-smoke): <money/auth/browser steps by name — or "none">
Next:    <next story/sprint — or DECISION needed from you>
Detail:  Roadmap/<NN-macro>/<epic>/sprint-<N>.md   ← source of truth, not repeated here
```

## 8 · Resume a session that died mid-flight

Hitting a session limit part-way through an epic is routine, not exceptional — the epic-sized
handover (WAYS-OF-WORKING, "the default unit of work is now the EPIC") makes a multi-hour run the
normal shape. The durable docs carry scope and outcomes; what dies with the session is the *in-flight*
state: which story was half-built, which "it's green" was observed rather than assumed, which of the
uncommitted files are finished.

**Leaving the trail** — cheap, and worth doing at every natural boundary (a story lands, a gate goes
green, a decision gets made):
```bash
node scripts/session-trail.mjs --checkpoint "<what you just did / what's next>" \
  --verified "<command → the result you actually observed>"
```

**Picking it up:**
```
Resume: read <AGENTS-path> (Start here) + Roadmap/LEARNINGS.md, then run
`node scripts/session-trail.mjs --resume` and follow its briefing.
```

**Why this is not just a handover note.** `--resume` does not ask you to trust the note. Every
checkpoint captures branch, HEAD and the uncommitted file list *mechanically*, and re-entry **diffs
that against the repository as it is now, leading with the disagreement**. This is the direct
implementation of LEARNINGS' "re-derive a handover's status from the artifact, never from the
previous session's summary" — the rule pod-report Sprint 2 paid for, where a good-faith close-out
claimed four stories were built and two of those claims did not survive a check.

Two conventions that keep it honest:
- **`--verified` is for facts you OBSERVED**, and renders under its own heading, separate from the
  note. A session's prose about what it did is a claim; a named command with its output is evidence.
  Blurring them is how a confidently wrong handover survives into the next session.
- **The trail lives in the epic folder** (`IN-FLIGHT.md`, inferred from a `feat/<epic-slug>` branch)
  and is **deleted at epic close**, with anything durable promoted into `RETROSPECTIVE.md`. It is
  working state, not a record.

## 9 · Bet a wave boundary — strong model *(the Bet stage)*

Run at a **wave boundary, not on a calendar**: the previous wave's bets landed (or hit their
breaker), and nothing should start until we've said what we're funding and what it costs us.

```
Bet the wave.
Read <AGENTS-path> (Start here), Roadmap/WAYS-OF-WORKING.md (Betting & appetite), and every wave file in
Roadmap/bets/. Then read every seed in Roadmap/00-ideas/seeds/ with status: ready.
Run the betting table with me: for each candidate, state its appetite and — the part that matters — what
funding it DISPLACES. Recommend a slate that fits one wave; I decide. Then write
Roadmap/bets/wave-<date-or-slug>.md (bet · appetite · displaced, three lines each), set each funded seed's
underwritten_by: to that path and status: queued, and regenerate the board (node scripts/build-order.mjs —
never hand-edit BUILD-ORDER.md). Planning only, no code.
```

Three rules that keep this from becoming a ceremony:

- **An unpicked pitch is let go, not backlogged.** Note it in the wave file only if it was seriously
  considered. If it matters, it resurfaces — that's cheaper than maintaining a graveyard.
- **"What did it displace?" is the whole point.** A bet with no named opportunity cost hasn't been
  bet on; it's been waved through. A ticket board can show you what's queued and never what it cost.
- **`underwritten_by: null` is the honest state of an idea nobody has paid for.** Fine in the funnel,
  impossible on the board — `build-order.mjs` hard-fails a `queued` seed with no `appetite:` and
  flags a missing underwriter as drift.

Advisory second opinion available before you commit the slate: `node scripts/cross-panel.mjs
Roadmap/bets/<wave>.md --lens both --agent codex|antigravity` — print-only, never gates.

## 10 · Re-shape a bet that hit its circuit breaker — strong model

**The breaker is the default, not the exception.** When an M/L bet exhausts its appetite, work
*stops and returns to shaping* — it is never extended in flight. Repeated hammering on one problem
means the work is uphill (unknowns), not that it needs more tokens. A scope that stops moving is a
raised hand.

```
Re-shape <slug> — it hit its appetite breaker.
Read <AGENTS-path> (Start here) + Roadmap/LEARNINGS.md, Roadmap/bets/<wave>.md, the seed
Roadmap/00-ideas/seeds/<slug>.md, and whatever the epic actually produced before it stalled.
Do NOT propose more budget. Answer three questions in writing: (1) what did we learn that the original
shaping didn't know? (2) what is the smaller problem that fits the SAME appetite? (3) if there isn't one,
what's the case for dropping it — and what did the spend buy us anyway? Update the seed's pitch in place;
land it at status: ready so it re-enters at the next betting table. Planning only, no code.
```

Record the outcome as a dated line in the wave file that funded it — a bet that stopped is a result,
not a failure to hide. The seed keeps its history; a re-shaped pitch that wins the next table is the
system working.

---

*§1–§8 mirror what the `groom` skill emits (Stage 8) — keep the two in sync. §9–§10 mirror
WAYS-OF-WORKING → *Betting & appetite* (the SSOT for appetite tiers, lanes and the breaker; don't
fork a second copy here). Conventions baked in: appetite before solution, own worktree + path-scoped
commits, risk tier, single-pass review, strong-model planning.*
