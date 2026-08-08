# 00-ideas — the idea funnel

The front of the pipeline: raw ideas → scoped seeds → scaffolded epics. Lifecycle is tracked in
**frontmatter on each seed**, not in folder names.

```
00-ideas/
├── README.md         ← you are here
├── BUILD-ORDER.md    ← GENERATED status board (run `node scripts/build-order.mjs`) — do NOT hand-edit
├── seeds/            ← every idea/scope seed, flat, one .md each (with frontmatter)
└── audits/           ← UX/UI (or equivalent) audit findings (reference material, NOT seeds)
```

## Seed frontmatter (the lifecycle source)

Every file in `seeds/` starts with this block:

```yaml
---
title: "Example feature idea"
slug: example-feature-idea          # kebab; matches the filename
status: raw                          # raw | ready | queued | scaffolded | in-progress | shipped | archived
area: "01"                           # macro-section number, matching Roadmap/README.md's table
type: feature                        # feature | spike | chore | epic
priority: null                       # the wave this is SLATED for (intent), or null — see Ordering
appetite: null                       # S | M | L — the budget, set at shaping; REQUIRED before `queued`
underwritten_by: null                # wave that PAID for it (a Roadmap/bets/<wave>.md), or null
risk: low                            # low | high
epic: null                           # path to the scaffolded epic, or null until scaffolded
build_order: null                    # integer position in the one global sequence — see Ordering
updated: <date>
---
```

### status — definitions

| status | meaning |
|---|---|
| `raw` | unrefined idea, no scope yet |
| `ready` | Definition-of-Ready scope doc written |
| `queued` | accepted into `BUILD-ORDER.md` (⬜) |
| `scaffolded` | epic + sprint docs created (`epic:` set; poster 🚧) |
| `in-progress` | building (some sprint stories ticked) |
| `shipped` | epic done (epic ✅ + RETROSPECTIVE; poster ✅) |
| `archived` | dropped or superseded |

The enum should be **enforced, not advisory** — wire `scripts/build-order.mjs` (and any Notion/board
sync you add) to hard-fail on a present-but-unrecognized `status:` value, rather than falling back
silently to a derived status. A silent fallback makes drift undetectable exactly where it matters.

### Who owns `status` (seed vs. epic-README frontmatter)

One field is authoritative at each stage — they never both drive the board:

- **Before an epic exists** (`epic: null`) → the **seed's** `status` (`raw`/`ready`/`queued`) is
  authoritative; you set it by hand or the `groom` skill sets it. This is what the BUILD-ORDER
  **funnel** shows.
- **Once `epic:` is set** → the **epic README's frontmatter `status:` is the SSOT** (set at epic
  close: `scaffolded` → `in-progress` → `shipped`). The seed is now **funnel-only** — its `status:` is
  no longer read for the board, so it can't drift it. **`BUILD-ORDER.md` is a generated view — never
  hand-edit it; change the README `status:` and run `node scripts/build-order.mjs`.**

### Ordering — `build_order` sequences, `priority` labels the wave (adopted 2026-08-08)

Two fields had been carrying overlapping halves of "what comes next", and the board rendered the
*wrong one*. Corrected — each now has exactly one job:

| Field | Job | Values | Who owns it |
|---|---|---|---|
| `build_order` | **Position in the one global sequence.** The answer to *"what is next?"* | a **plain integer**, monotonic, never reused | **the epic README frontmatter** once `epic:` is set; the seed until then |
| `priority` | The wave this is **slated for** — intent, set before a bet exists | a wave label (`wave-2026-08-08`), or null | the seed, always |

`priority` is *intent* and `underwritten_by` is the *record*: the first says which wave we mean to
spend this in, the second names the `Roadmap/bets/<wave>.md` that actually paid. They agree once a
bet is placed; before that only `priority` is set. Neither is the sequence — that is `build_order`
alone.

**Plain integers, no letter suffixes.** The old scheme used `#1`, `#2a`, `#2b`. Three problems, all
of them live when this was corrected: `#1` was held by *two* epics (`commercial-shell` and
`app-shell-and-agent-rail`); `buildOrderNum()` in `roadmap-to-notion.mjs` reduces `#2` and `#2a` to
the same `2`, so the Notion numeric sort tied; and the `#`-prefixed string sorts `#10` before `#2`,
which is the bug the numeric property was added to fix in the first place. An integer has none of
these failure modes. To insert between 14 and 15, renumber — the sequence is cheap to rewrite and
expensive to read wrong.

**`build_order` is a sequence, not a priority score.** Shipped epics keep their number: `1…12` is
the ship history, in the order it actually happened, and the queue continues from there. That makes
the board readable as one list from "the first thing we built" to "the last thing we plan to" —
which is the whole point of having the field.

> **Known gap (owed to Claude Code, 2026-08-08):** `scripts/build-order.mjs` renders `r.priority`
> in its meta line, not `r.build_order` — which is why the board has been showing `#1`, `#2a` from
> the seed's `priority` while every epic README's `build_order` sat empty. The exact patch is in
> `Roadmap/00-ideas/seeds/build-order-render-fix.md`. Until it lands, the board's `·` badges show
> the wave label rather than the sequence.

### appetite & underwriting — the economics fields

`appetite` (S | M | L) is the **budget the idea is worth**, fixed at shaping *before* the solution
is designed — sessions + an implied token band, never a time estimate (see WAYS-OF-WORKING →
*Betting & appetite*). `underwritten_by` names the **wave that pays for it** (a
`Roadmap/bets/<wave>.md` file), set at the betting table. `null` means nobody has paid for it yet —
fine in the funnel, impossible on the board: `build-order.mjs` **hard-fails** a `queued` seed with
no `appetite`, and flags a missing `underwritten_by` as drift. Like `status`, `appetite` is an
enforced enum — a present-but-unrecognized value fails the board, it never falls back silently.

## How seeds flow (no file moves)

1. **Capture** — drop a raw idea as `seeds/<slug>.md` with `status: raw` (the `groom` skill does this
   from a brain-dump).
2. **Scope** — `groom` fills out the Definition-of-Ready (appetite included) and flips
   `status: ready`.
3. **Queue** — bet on it at a wave boundary (`appetite:` + `underwritten_by:` set, the wave's
   `Roadmap/bets/` file records what it displaced); `status: queued`.
4. **Scaffold** — on approval, `groom` runs its own `scaffold-epic.mjs` (ships inside the `groom`
   skill, `ways-of-work` plugin) to create the epic/sprint docs, then sets the seed's `epic:` +
   `status: scaffolded`. **No file ever moves between folders** — the frontmatter carries the state.

Filenames are kebab-case and match `slug`. Audits live in `audits/`, never in `seeds/`.
