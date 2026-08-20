# Wave 2026-08-20 (second) — the public surface names the category

`methodology-experience` closed earlier the same day, which is what freed this wave. The product
owner arrived with his first read of the maker-ops page in production plus three things: copy
borrowed from enterprise product-management job posts, four structural edits to `/`, and the
observation that the two agent-readable surfaces — `/llms.txt` and `/northstar-self-serve.md` — have
been stale and generic since the day they shipped.

| Bet | Appetite | Displaced (the opportunity cost) |
|---|---|---|
| **#19 The public surface names the category** — "agentic product management" stated and defined once, the enterprise register borrowed without the enterprise motion, four structural edits to `/`, and `/northstar-self-serve.md` rebuilt from the real North Star methodology | **L** (multi-wave epic, re-bet at each sprint boundary) | The analytics charting-dependency spike and the Git & Releases discovery spike stay unfunded for a **third** consecutive wave. `cms-integration-spike` remains scaffolded and unstarted. |

**Decisions of record.**

- The bet is underwritten by the product owner's 2026-08-20 approval of
  `Roadmap/00-ideas/seeds/agentic-pm-public-surface.md`. The seed and the epic frontmatter point
  here.
- **Borrow the register, not the motion.** The source copy sells an up-market, sales-led product;
  `landing-maker-ops` repositioned this page onto "one maker, a whole operation" eight days ago
  across 21 stories. The *surface* the job post describes — identity, governance, security, spend
  control, admin tooling, the growth engine — is a literal description of our four Ops surfaces at
  a different scale, so the register transfers and the motion does not. Ruled at grooming so no
  story re-litigates it. Epic D1 carries the take/leave lists.
- **The category is defined, not just used.** "Agentic product management" currently reads in the
  market as *product management **of** agentic AI products*. Used bare, an agent summarising the
  page files us as an agent-building tool. One definition sentence, one module
  (`lib/positioning.ts`), five importers, one spec.
- **`§proof` is removed in full, and the product owner overruled the objection knowingly.**
  `LiveEngineProof` was the page's only non-illustrative evidence, on a page whose argument is
  evidence over assertion. The recorded mitigation is the hero prompt: a reader who pastes it sends
  their own agent to check us, which does not require being believed. **If the page later reads thin,
  the live read returns as a strip under the hero — it does not come back as a section.**
- **`landing-readability-pass` D1 is reversed on purpose.** That epic ruled two copy-a-prompt blocks
  read as a pattern rather than an invitation. It stands for two blocks asking the same thing; these
  ask different things at different moments. Recorded in epic D5 so it reads as a decision rather
  than as drift.
- **Attribution: our words, visible lineage.** The North Star Framework is Amplitude's (the
  *Playbook*, Cutler & McBride). The structure is theirs; the words and mechanics are ours; the
  credit is by name, with a link, once, near the top.
- **Sprint 1 is carved to ship standalone.** It touches no landing file. If the appetite is
  exhausted after it, the product owner's top-priority ask is live and `/` is untouched.

**Why this was worth the wave.** `/northstar-self-serve.md` is the destination of the page's own
"try it before you connect anything" pitch, and today it hands a practitioner eight sensible
questions that any model could have produced without us. The methodology is the thing this product
is actually selling — the page says so in its own words — and the one surface where we could
demonstrate it instead of describing it is the one we left generic. That is the cheapest kind of gap
to close and the most expensive kind to leave open on a URL we point strangers at.

The landing half is smaller and rides along because the register is the thing being unified: a copy
pass that lands on the page but not on the manifest an agent reads produces exactly the two-voices
problem this bet exists to end.

**Circuit breaker.** L is multi-wave by definition: each sprint boundary re-bets the remainder
rather than extending in flight. The named exhaustion risk is Sprint 1 — a facilitation document is
judged by a human running it, not by a suite, and Story 1.4 may send it back for a second pass. If
Sprint 1 consumes the wave, Sprints 2 and 3 are re-bet. Do not compress Sprint 1 to protect them.
