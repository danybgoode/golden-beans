# Approved states — the design contract for `design-system-rails`

> **Binding.** These 32 states are the contract for every route this epic touches. They are not
> "inspiration". WAYS-OF-WORKING was amended on 2026-08-29 to say so:
> *where the product owner has approved a design, the design IS the contract.*

## The approval

| | |
|---|---|
| **Approved by** | Daniel (product owner) |
| **Approved** | 2026-08-29, in four reviewed batches |
| **Source** | `console-prototype.html` in this folder |
| **SHA-256 (first 16)** | `5bc7e24ed5e3d0aa` |
| **States** | 32, rendered by `render-reference.mjs` — verified running, zero page errors |

**The hash is the point.** Rail 2 says approval is recorded as a file with the state's content hash,
not as a memory of a conversation. If `console-prototype.html` changes and this hash is not
updated with a new approval line, the design is **unapproved** and the gate should say so. Editing
the prototype and quietly leaving the hash alone is the one move this file exists to prevent.

## How it was approved

Nine states were approved 2026-08-27 with `console-ia-overhaul` and re-rendered unchanged on
2026-08-29. The remaining twenty-three were designed and approved in four batches on 2026-08-29,
each published as a clickable prototype and reviewed screen by screen:

| Batch | States | Approved |
|---|---|---|
| — (inherited) | `ship-features` · `ship-features-dormant` · `feature-value` · `feature-environments` · `feature-funnel` · `setup-connect` · `setup-keys` · `ship-activity` · `ship-compare` | 2026-08-27 |
| **1 · Measure** | `measure-north-star` · `measure-journeys` · `measure-journey` · `measure-scenarios` · `funnel-standalone` | 2026-08-29 |
| **2 · Today, Ship, Setup** | `today` · `tasks-standalone` · `ship-experiments` · `experiment-ready` · `experiment-blocked` · `setup-destinations` · `setup-shares` | 2026-08-29 |
| **3 · The hub** | `hub-roadmap` · `hub-epic` · `hub-horizon` · `hub-report` | 2026-08-29 |
| **4 · The doors** | `door-login` · `door-signup-closed` · `door-signup-open` · `public-install` · `public-share` · `public-gone` · `public-talk` | 2026-08-29 |

## Design decisions settled at approval — the lock does NOT reopen these

Each was put to the product owner and answered. A builder cites them; the architecture lock verifies
the *code* claims around them, not the design call itself.

**DD1 — Tasks lives on Today, as its missing third band.** A task's real states are
`open | claimed | resolved | dismissed` and `claimedBy` names the actor. Today already asked
"waiting on you" and "what changed" — the two ends of that lifecycle with the middle missing. So
Today gains **Your agent is working**, and `/app/tasks` is the same three bands mounted as its own
page. Today gets no rail; giving it one to hold Tasks would break the thing that makes Today *Today*.

**DD2 — The hub is a peer view of the project, not a fifth section.** The console answers "how is
the product doing"; the hub answers "how is the work doing". The switch lives in the **project
switcher menu**, so tier 1 stays *switcher · ⌘K · account, nothing else* and "four destinations"
survives. `⌘K` reaches every hub surface and every epic by slug — required, because the epic's own
outcome test is "every surface in three clicks or one ⌘K".

**DD3 — Chrome appears when there is something to navigate.** Three frames, one language:
**door** (one centred column, no nav — login, signup), **public** (a slim bar, the mark and at most
one action — install, a shared report, the 404, talk), **console** (the three tiers).

**DD4 — The chart colour rules, computed rather than chosen.** Validated against the dark surface:
- **Magnitude → `--gold` alone**, light to dark. Never a rainbow.
- **Two-way identity → `--gold` + `--blue`** (or grey + blue for control/treatment). CVD ΔE 23.4
  protan, 23.2 tritan, normal-vision 25.3. Safe.
- **Status → `--green` / `--red`, always with a word and a shape**, never colour alone. Deutan
  ΔE 9.9 is above the floor but only just, and red/green is the classic CVD pair.
- **Never four categorical hues.** The brand's four accents **fail** as a four-way set. Beyond two
  series: small multiples, or fold into "Other".
- **Never a dual axis.** The North Star and its leading inputs are different scales, so they are
  small multiples, not two lines on one plot.
- **A nonzero value never rounds to zero pixels.** 3 failures of 1,843 draws under a pixel and reads
  as "nothing failed"; failure segments carry a 4px minimum and the exact count sits beside them.

**DD5 — One design, two mounts.** `/app/funnel/…` and `/app/tasks` render the *same* design as
the tab and the band they also live in. A standalone route is a mount, never a fifth place to look.

## Findings raised at design time — for the architecture lock to settle

**F1 — The approved design contains a glyph the CI guard bans.** `check-design-drift.mjs` forbids
`↗` inside `/app`, and the approved Setup › Connect carries **"Add to Claude ↗"**. The design and
a live CI rail are in direct conflict on one button. Every other glyph in this prototype is inline
SVG, which proves D4's `Icon` route works; this one is left exactly as approved rather than quietly
edited. **D4 says do not disable the rule**, so the answer is almost certainly an SVG arrow.

**F2 — There is no expired state for a share link, and that is a decision.**
`app/s/[token]/page.tsx` calls `notFound()` for unknown, malformed, expired **and** revoked
alike, so the page cannot tell an attacker which one a token is. `sprint-6.md` originally asked for
"the expired state" as a designed page; it is corrected to `public-gone`, the one 404 all four
cases land on. The copy deliberately does not say which.

**F3 — One epic has no build-order number.** There are 27 epic directories and the sequence runs to
26. `hub-roadmap` shows 26 positions and says so rather than padding the track to make the
arithmetic work. Worth fixing in the frontmatter; the board is generated from those numbers.
