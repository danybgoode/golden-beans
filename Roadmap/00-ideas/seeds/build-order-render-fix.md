---
title: "Board renders priority where it should render build_order"
slug: build-order-render-fix
status: queued
area: "09"
type: chore
priority: "wave-2026-08-08"
appetite: S
underwritten_by: "Roadmap/bets/wave-2026-08-08.md"
risk: low
epic: null
build_order: null
updated: 2026-08-08
---

# Chore — make the board render the sequence field

> **Class:** Chore · **Lane:** fixed scope · **Appetite:** S · **Risk:** low
> `build_order: null` on purpose: tooling chores do not occupy a slot in the *product* build
> sequence. The sequence numbers what the product ships, not what maintains the board.

## Problem

`scripts/build-order.mjs` pushes `r.priority` into each row's meta line, so `BUILD-ORDER.md` has been
showing `#1`, `#2a`, `#6` from the **seed's `priority`** field — while `build_order`, documented in
`roadmap-to-notion.mjs` as epic-README-frontmatter-authoritative, sat `null` on **all thirteen**
epics. The SSOT path was dead code; every displayed value came from the fallback.

Fixed in docs on 2026-08-08 (`00-ideas/README.md` → *Ordering*, and `build_order` backfilled onto
every epic README as plain integers `1…18`). The renderer was **not** changed, because that is code
and Cowork's lane is `Roadmap/` docs. Until this lands, the board's `·` badges show the wave label
rather than the sequence.

## The change

In `scripts/build-order.mjs`, the meta-line builder (~line 48):

```js
// before
if (r.priority) meta.push(r.priority);

// after — the sequence is what the board is FOR; the wave label is context
if (r.build_order !== null && r.build_order !== undefined) meta.push(`#${r.build_order}`);
if (r.priority) meta.push(r.priority);
```

And the funnel sort (~line 92), which currently sorts by `priority` string with a `'zzz'` fallback —
so unnumbered seeds sorted alphabetically and numbered ones sorted lexically (`#10` before `#2`):

```js
// after — numeric sequence first, unsequenced items last, name as the tiebreak
const funnel = seeds.filter((s) => SEED_FUNNEL.has(s.status))
  .sort((a, z) =>
    (a.build_order_num ?? Infinity) - (z.build_order_num ?? Infinity) ||
    a.name.localeCompare(z.name));
```

`build_order_num` is already emitted by the extractor (`roadmap-to-notion.mjs`, `buildOrderNum()`),
so no new plumbing is needed — the value is present on every row and simply unused by this renderer.

## Acceptance

1. `node scripts/build-order.mjs` regenerates `BUILD-ORDER.md` with `#1 … #18` sourced from
   `build_order`, in numeric order, `#2` before `#10`.
2. The epic buckets render in sequence order, not alphabetical.
3. The funnel section sorts numerically, with unsequenced seeds last.
4. `scripts/build-order.mjs`'s existing hard-fail on a `queued` seed with no `appetite` still fires —
   verify by temporarily blanking one, observing the failure, and restoring it. (The
   observed-failing-once rule: this is the mutation check.)
5. No hand-edit to `BUILD-ORDER.md` — the file is generated.

## Notes

- **Do not remove `priority`.** It now carries the wave label (`wave-2026-08-08`) and pairs with
  `underwritten_by`: intent vs. record. Both still project to Notion.
- `PRIORITY_LABEL` in `roadmap-to-notion.mjs` maps `wave-0`…`wave-4`, which **no seed has ever
  used** — every value passes through unchanged. Either extend it to the dated wave labels actually
  in use or delete it; a lookup table with a 0% hit rate is a trap for the next reader. Reader's
  choice, but say which in the PR.
