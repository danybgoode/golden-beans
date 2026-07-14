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
priority: null                       # a wave/priority label, or null
risk: low                            # low | high
epic: null                           # path to the scaffolded epic, or null until scaffolded
build_order: null                    # BUILD-ORDER id, or null
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

## How seeds flow (no file moves)

1. **Capture** — drop a raw idea as `seeds/<slug>.md` with `status: raw` (the `groom` skill does this
   from a brain-dump).
2. **Scope** — `groom` fills out the Definition-of-Ready and flips `status: ready`.
3. **Queue** — add it to `BUILD-ORDER.md`; `status: queued`.
4. **Scaffold** — on approval, `groom` runs its own `scaffold-epic.mjs` (ships inside the `groom`
   skill, `ways-of-work` plugin) to create the epic/sprint docs, then sets the seed's `epic:` +
   `status: scaffolded`. **No file ever moves between folders** — the frontmatter carries the state.

Filenames are kebab-case and match `slug`. Audits live in `audits/`, never in `seeds/`.
