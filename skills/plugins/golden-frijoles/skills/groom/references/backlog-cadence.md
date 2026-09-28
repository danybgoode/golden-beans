# Groom reference — Stage 9: backlog cadence and the next-session handoff

Loaded on demand from `SKILL.md` Stage 9. Moved here verbatim (ways-of-work-lean-pass S3.2).

## Stage 9 — Close the loop: backlog cadence + next-session handoff

**The backlog keeps growing.** The product owner routinely drops a *batch* of prioritized asks at once.

> **Cadence updated (2026-08-08) — what batches, and what doesn't.** This stage used to read "we do
> **not** groom a batch in one session," which contradicted the consuming project's own
> WAYS-OF-WORKING (updated 2026-07-14): *with a strong planning model, the default is a **single-session
> groom** — one deep Definition-of-Ready groom for the front-of-queue epic plus a portfolio pass that
> seeds/resequences the rest of the funnel.* The skill was the stale half. Reconciled here.
>
> The discipline that does **not** change is **one *deep* ask per run** (Stage 0). What batches is the
> funnel bookkeeping — sequencing, appetite, lane, and a light scope pass on items that aren't at the
> front yet. Deep-groom later items when they *reach* the front.
>
> **The compaction call belongs to the agent, not the calendar.** A single-session groom that has
> produced several scaffolded epics is exactly the shape LEARNINGS warns about under *Working
> efficiently*. Say out loud when the session should compact or hand to a fresh one — the durable
> state (seeds, epic docs, the bets file) makes re-entry cheap by design, which is what makes calling
> it early free.

The cadence:

1. **Agree a consolidated build order first** (a separate evaluation pass — consolidate overlaps, sequence
   by dependency/leverage), and **persist it in the seed frontmatter** (`build_order` = the integer
   sequence; `priority` = the wave it's slated for) — that's the SSOT the board sorts by.
   `BUILD-ORDER.md` is **generated** from it (`node scripts/build-order.mjs`); never hand-edit the board.
2. **One deep groom per run, plus a portfolio pass over the rest.** Deep-groom the front-of-queue item
   to full Definition of Ready; for the others, set sequence, appetite, lane and enough scope to be
   bettable — then stop. A seed that is deep-groomed months before it is built is a seed that will be
   re-groomed anyway.
3. **Let a seed's own words reclassify it.** A raw seed that says "a spike is the honest first move"
   or "worth a discovery pass before it is bet" is telling you it is not a build epic. Scaffolding it
   as one is inventing scope the seed itself flagged as unvalidated — reclassify to `type: spike` and
   shape an investigation brief instead.
4. **Scaffolded ≠ bet.** An epic may be scaffolded with `underwritten_by: null` — docs ready, bet not
   yet placed — so the next betting table is a three-line decision rather than a fresh groom. The
   board shows it under *scaffolded, not started*, which is the truthful bucket. Only `status: queued`
   hard-requires an `appetite:`.
5. **At the end of every groom run, do BOTH:**
   - Emit the **Claude Code build/investigation handoff** for each item groomed to scaffold (Stage 8).
   - **Regenerate the board** (`node scripts/build-order.mjs`) so the groomed items move bucket from the
     frontmatter change — never hand-tick it — and emit a **next-session Cowork handoff prompt** for the
     **next ⬜ item** in the order. The handoff prompt references the docs that
     already exist (`BUILD-ORDER.md` as a generated read-only view, the relevant `seeds/` seed, the orientation
     files) so the next session re-enters with zero re-derivation. Template:

   ```
   We're working the agreed build order in Roadmap/00-ideas/BUILD-ORDER.md.
   The last groomed item was <#X · name> — <status>.

   Groom the next ⬜ item: <#Y · name>.
   Read first, in order: Roadmap/00-ideas/BUILD-ORDER.md, then Stage 0 orientation
   (README.md, WAYS-OF-WORKING.md, LEARNINGS.md), then the scope seed
   Roadmap/00-ideas/seeds/<seed>.md and any primitives it names.
   Then run /groom on <#Y> — one ask, the normal stages — and stop at the scope-doc gate for my sign-off.
   ```

If no `BUILD-ORDER.md` exists yet (a one-off ask, not a batch), skip this stage — just close normally.

---
