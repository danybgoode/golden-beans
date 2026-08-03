# Wave 2026-08-03b — harness portability

The second wave of 2026-08-03. Same calendar day as `wave-2026-08-03.md` (Shape Up integration),
but a real boundary: that wave's work landed, and its own text parked this one as *"would otherwise
have been its own S bet next wave."* Wave files are named `wave-<date-or-slug>.md`, so the
same-date pair is fine.

Betting table: the product owner + the architect agent. Shaped in Cowork; built in Claude Code
against `~/dobby/dobby-foundation`.

| Bet | Appetite | Displaced (the opportunity cost) |
|---|---|---|
| Harness portability — clear the origin-project residue from the `ways-of-work` plugin (16 files: 5 deeply coupled skills, 4 thin leaks, the 3 groom templates, the plugin README, 2 template scripts, 1 git hook) and push the unshipped `145ec73` so golden-beans actually consumes the Shape Up economics layer | S (one builder session, fixed scope) | E4 signals-loop follow-ups and the E6 CMS spike stay parked a second consecutive wave — the cost of two harness waves back to back, accepted once, not twice |
| Session-kickoff polish for shape → bet → build (`Roadmap/SESSION-KICKOFFS.md`: new §1 Shape and §2 Bet, the Groom verb split by lane, `Roadmap/bets/` added to the orientation preamble) | folded into the above — done in Cowork this session, no builder time | — |

**Decisions of record.**

- **Lane is fixed scope, not shaped bet.** By WAYS-OF-WORKING this skips the betting table entirely.
  It is recorded here anyway because it is cross-repo and displaces product work — the
  opportunity-cost ledger should be able to answer *"what did the second harness wave in a row
  cost?"*, and it can't if fixed-scope work is invisible to it. Recording ≠ ceremony: two rows.
- **Genericize in place, don't split the plugin.** Moving the four origin-specific skills into a
  separate `miyagi-ops` plugin was considered and rejected: one distribution is worth more than a
  clean boundary right now, and the split stays available later. Project specifics become named
  `TEMPLATE FILL-IN` config the consuming project supplies.
- **The leak guard is explicitly next wave, not this one.** A `check-plugin-leaks.mjs` grep-to-zero
  guard mirroring golden-beans' `check-template-drift.mjs` would push S to M (it needs a CI wiring
  decision). Re-bet it once we can see what the cleaned text looks like — writing the guard against
  text that doesn't exist yet is how a guard ends up encoding the wrong invariant.
- **Circuit breaker.** S lane, so the only breaker is escalate-don't-guess. If genericizing
  `live-smoke` turns out to need a real second consuming project to validate against, that is a
  raised hand — stop and bring it back to shaping, don't invent a second project's specifics to
  fill the gap.

**Why this was worth a wave.** The plugin had drifted into a state where the harness and the
process contradicted each other: the betting table adopted an economics layer on 2026-08-03 and the
plugin every project actually loads still had no appetite stage, because the commit was never
pushed. A process the tooling doesn't implement decays to a document nobody follows.
