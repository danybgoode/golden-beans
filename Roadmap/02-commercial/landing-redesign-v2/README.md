---
status: in-progress   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: landing-redesign-v2
build_order: 16
---

# Epic: Landing redesign v2 — the agent harness for product managers

> **Area:** 02-commercial · **Risk:** low · **Class:** Feature · **Archetype:** Repositioning
> **Appetite:** M (one wave) · **Mockup (signed-off):** [`references/golden-beans-landing-v2.html`](../../../references/golden-beans-landing-v2.html)

## Why

The live landing sells an **engine**: *"The growth engine your agent operates"* — telemetry, TARS
funnels, North Star metrics, A/B experiments, as primitives. That is an accurate description of what
was built and a poor description of who buys it. It speaks to persona 3 (the application engineer)
in the headline slot reserved for persona 1 (the technical PM), and it asks a reader to care about
the primitive set before it has told them what the primitives are *for*.

The v2 mockup repositions the same product around the decision, not the plumbing: **your roadmap has
enough opinions — give your agent the goal your company agreed on, ask what to bet on, see the
evidence, make the call.** The engine becomes the thing that makes the receipts possible rather than
the thing being sold.

Second, equally load-bearing reason: **the site is not fully mobile-friendly.** The token file's own
comment says "Mobile is the base," and the landing honours that; most of what has been built since
does not. Rather than audit 27 routes, this epic installs mobile heuristics as **rails** — global
rules plus a guard that runs across routes — so the next screen inherits them instead of
re-litigating them.

## Platform-first note

**Nothing new is modelled.** No new table, no migration, no new `lib/` data seam, no new runtime
dependency. One new public route (`/northstar-self-serve.md`) is a static agent-readable document
served exactly like the existing `/llms.txt`. Everything else is presentation over data and flags
this repo already resolves.

## What already exists (reuse, don't rebuild)

*Verified against live `main` (`7cd0c67`) at kickoff, 2026-08-12.*

| Need | Already in the repo | What's actually missing |
|---|---|---|
| Design tokens | `references/design/assets/tokens.css`, imported first by `globals.css`. Already mobile-first ("Mobile is the base. Wider viewports only add space and columns.") | Nothing. It is a **byte-mirrored handoff artifact — do not edit it.** New classes go in `globals.css` (precedent: `app-component-kit-adoption` S1) |
| Component kit | `components/ui/` — 12 components incl. `AgentWindow`, `Badge`, `Button`, `Panel`, `SectionDivider`, `Icon` | The v2-specific display pieces: the copy-a-prompt card, the comparison table, the release-legibility list, the staged-proposal shell |
| Section↔epic registry | `lib/landing-sections.ts` — the SSOT for which section is lit by which epic | New section ids for the v2 map; the old 8-entry map is superseded, not extended |
| Live engine proof | `LiveProofSection.tsx` — real TARS/North Star/A-B from the demo tenant, in-process | Nothing. It is **kept** and folded into §6 Proof (product-owner decision, 2026-08-12) |
| Pod Report proof | `PodsProofSection.tsx` + `lib/pod-report-query.ts`, investor lens, honest fallback | Nothing. The mockup's hardcoded `+3.1×/−68%` stat tiles are **not** shipped — the real computed figures render in that layout instead |
| Signup gating | `lib/flags.ts` → `isSignupEnabled()`; `WaitlistForm`, `/signup` | Nothing. Pricing CTAs read the live flag, as they do today |
| Agent-readable doc route | `app/llms.txt/route.ts` | `/northstar-self-serve.md` — the same shape, new content |
| Clipboard client island | `components/landing/CopyUrlField.tsx` — the "one client component on an otherwise server-rendered page" precedent | A prompt-block variant (copies a `<pre>`'s text, not an input's value) |
| Drift guard | `scripts/check-design-drift.mjs` — sweeps `components/landing` with `disallowInlineStyle` ON | Nothing — but note the mockup is **built entirely from inline styles**, every one of which must become a class. See **D3** |
| Mobile overflow check | `e2e/landing.browser.spec.ts` — `/` and `/install` at 390px | The rail: a **reusable, multi-route** heuristics check rather than two hand-copied tests. See **D5** |

## Architecture decisions — locked before any code

**D1 — The mockup is the design, the repo's honesty rules are the copy editor.**
Where the two collide, the honesty rule wins and the layout survives. Three collisions were found
and resolved at kickoff, each with the product owner:
- The Pod Report stat tiles ship the **computed** figures from `getPodReport`, in the mockup's
  `.stat-grid` layout. `CODE-QUALITY.md` #8: never invent numbers to fill space.
- The `$49/mo` tier ships **with the price and an explicit line that billing is not live yet**, its
  CTA pointing at the same real free signup. A price nobody can pay is not a checkable claim
  (`CODE-QUALITY.md` #9).
- The two copy-prompt blocks reference `/northstar-self-serve.md`; that route **ships in this epic**
  rather than the page linking at a 404.

**D2 — Live proof is kept and folded into §6 "Proof".**
The mockup drops it. §6 is titled *Proof* and asserts "leverage should show up in the numbers," and
the only independently-checkable numbers on this page are the demo tenant's — the ones a reader can
`curl` from `/api/v1/public/north-star` mid-meeting. Dropping them would leave a page of narrative
and illustrated examples defending a claim about receipts. §6 therefore carries **both**: the Pod
Report (how fast the pod ships) and the live engine read (that the engine is real).

**D3 — Every inline style in the mockup becomes a class in `globals.css`.**
Not a stylistic preference: `check-design-drift.mjs` runs with `disallowInlineStyle: true` over
`components/landing`, and the mockup uses inline `style=` on roughly sixty elements. The guard is
the reason the current landing has none, and it stays that way.

**D4 — Illustrated agent conversations must be labelled as illustrations.**
The mockup already does this (`.surface-note` — "EXAMPLE CONVERSATION IN YOUR AGENT · Not a Golden
Beans chat screen"). That label is load-bearing, not decoration: the page also renders a **real**
agent window over live demo data in §6, and a reader who cannot tell the two apart learns nothing
from either. Every illustrative window keeps its surface note.

**D5 — Mobile heuristics ship as a rail, not as a per-page fix.**
The user's ask is explicitly "top-shelf heuristics as rails … we can build on top of them," without
auditing every route. So this epic ships (a) global base rules that make the failure modes
structurally hard — overflow containment, minimum tap targets, responsive table/`pre` behaviour,
safe-area padding, `prefers-reduced-motion` — and (b) **one parameterised spec that sweeps a list of
routes**, so covering the 28th route is appending a path, not copying a test. `CODE-QUALITY.md` #2:
make the failure unrepresentable, not merely fixed.

**D6 — The section registry is rewritten, not appended to.**
`lib/landing-sections.ts` describes an 8-section map that this epic replaces. Leaving the old
entries beside the new ones would produce exactly the drift the registry exists to prevent. The
`references/landing-end-state.md` section map is superseded in the same commit.

## Sprints

| # | Sprint | Ships |
|---|---|---|
| 1 | [Mobile rails + the v2 skin](sprint-1.md) | Global mobile heuristics, the multi-route guard spec, and the v2 component classes in `globals.css` |
| 2 | [The redesigned landing](sprint-2.md) | The ten-section narrative, wired to real data and flags; `/northstar-self-serve.md` |
| 3 | [Ship it](sprint-3.md) | Coupled specs updated, full gate, cross-family review, merge, production verification |

## Definition of Done (epic)

See `Roadmap/WAYS-OF-WORKING.md`. Epic-specific additions:
- `references/landing-end-state.md`'s section map reflects the v2 narrative (D6).
- The production landing is verified at 390px **and** desktop, signed-in state irrelevant (the page
  is public).
- Both copy-prompt blocks are exercised end-to-end: the prompt text copies, and every URL it names
  resolves 200.
