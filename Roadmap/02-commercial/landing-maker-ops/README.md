---
status: in-progress   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: landing-maker-ops
build_order: 20
---

# Epic: Maker ops — the landing repositions from a growth engine to an operating context

> **Area:** 02-commercial · **Risk:** low · **Class:** Feature · **Archetype:** Repositioning
> **Appetite:** M (one wave) · **Mockup (signed-off):**
> [`references/golden-frijoles-maker-ops-landing-v0.2.html`](../../../references/golden-frijoles-maker-ops-landing-v0.2.html)
> **Predecessors:** [`landing-redesign-v2`](../landing-redesign-v2/README.md) (2026-08-12) →
> [`landing-frijoles-rebrand`](../landing-frijoles-rebrand/README.md) (2026-08-13). This epic
> replaces the *spine* of what those two shipped, and keeps their evidence sections intact.

## Why

See [the seed](../../00-ideas/seeds/landing-maker-ops.md) for the full pitch. In one line: the live
page sells a primitive set to a reader whose question is *"can I operate a whole product on my
own"*, and it never names the four operating surfaces the product already spans.

## Platform-first note

**Nothing new is modelled.** No migration, no new table, no new database-reaching `lib/` seam, no
new runtime dependency, no new env var. One new pure data module (the Ops-surface content) and one
rewritten section registry. Everything else is presentation over flags this repo already resolves.

## The mockup is the argument, not the skin

The signed-off mockup was authored outside this repo's design system and introduces elements that
are **superseded on contact**. Recorded here so no story re-litigates it, and so a reviewer can
check the substitution rather than guess at it:

| The mockup ships | What actually ships | Why |
|---|---|---|
| `<span class="bean">` — a CSS-shaped div logo | `GoldenFrijolMark` + `BrandLockup` | The mark is canonical brand, decided in `landing-frijoles-rebrand`. A second lockup is a second brand. |
| Its own `:root` hex palette (`--roast:#16120d`…) | `references/design/assets/tokens.css` | Near-identical values, different file — which is the whole problem. `check-design-drift` rejects a raw hex in `.tsx` **and** in `globals.css`; tokens are the only sanctioned source. |
| Letters as icons — `<i>A</i>`, `<i>✓</i>`, `<i>R</i>`, `<i>S</i>`, `<i>E</i>` | `Icon` (the lucide map) | `check-design-drift`'s `ui-pictograph` rule bans `✓` outright, and a bare letter in an icon slot is the "I placeholder" that `landing-frijoles-rebrand` D3 already removed once. |
| `Archivo` / `IBM Plex Mono` declared inline | The same two faces, already loaded by `app/layout.tsx` via `next/font` | Same typefaces — so this is a no-op, not a compromise. The mockup simply restates what the app already does. |
| `<i class="barx" style="height:33%">` bar charts | `FunnelBars` / `StatCard` | Inline `style={}` is banned in `components/landing` by the drift guard, and an unlabelled bar is a number a reader cannot check (CODE-QUALITY #8). |
| `<div class="stamp">`, `.magicline`, `.method-card` kraft devices | The existing kraft family (`.divider`, the bag label, `tag-stamp-*`) | The material families are already defined; these are new names for devices that exist. |

Two mockup elements are kept **as-is** because they are content, not skin: the kraft bag label's
four-Ops list, and the numbered maker loop.

## Architecture decisions — locked before any code

### D1. The maker-ops narrative replaces the spine; the evidence sections stay
*Decided by the product owner, 2026-08-19.*

The mockup's section list drops §6 Proof (the computed Pod Report **and** the live demo-tenant
read), §8 Connect, §9 SDK and §10 Pricing. Those are the page's only live numbers and both of its
conversion paths. The new page is therefore:

```
hero → maker loop → operating context → Ops (4 surfaces) → agent authority → FinOps (next)
     → methodology → proof → connect → sdk → pricing → closing → footer
```

The repositioning owns everything above `methodology`; everything below it is re-woven, not
rewritten. `TryItSection`, `HowItGrowsSection`, `InfomercialSection`, `OpinionsSection`,
`ArgumentSection`, `ProductContextSection`, `ResilienceSection`, `PrincipleSection` and
`LeverageSection` are **retired** — their arguments are absorbed by the new spine, and keeping them
alongside would leave the page arguing the same point twice in two different voices.

### D2. "Run your first Bet" goes to signup, through the gate that already exists
*Decided by the product owner, 2026-08-19.*

The mockup's CTAs all point at a `#start` anchor with nothing behind it. Every one of them becomes
a real destination, resolved through `isSignupEnabled()` exactly as `PricingSection` already does:
gate on → `/signup`; gate off → the honest waitlist fallback. **Verified in production 2026-08-19:
`GET https://goldenfrijoles.com/signup` returns 200, so the gate is on there.** No new flag, no
second copy of the routing decision — one helper, read fresh per request.

### D3. Every Ops surface states its real status, and the status is computed
The four surfaces are not equally shipped. Written down, this list is wrong within a month
(CODE-QUALITY #2), so the page reads it:

| Surface | Status on the page | Where it comes from |
|---|---|---|
| Product Ops | live | shipped and serving |
| DevOps | live | shipped and serving |
| SecOps | **partly gated** | `isResilienceScenariosEnabled()` / `isSecuritySimulationsEnabled()`, read per request |
| FinOps | **next** | not built. A `next` badge and a "concept" label, in the vocabulary the page already owns |

**Verified against production, by exercising behaviour rather than reading a listing:**
`GET /api/v1/scenarios/snapshot` → **404** while `POST` to the same path → **405**. The route is
deployed; only the gate makes the GET 404 instead of the 401 an unauthenticated call would get. So
both scenario gates are OFF in production today, and the SecOps card must say so *by reading them*.

### D4. The FinOps section ships as an explicit concept or not at all
It is the one section describing something that does not exist. It keeps the mockup's own honesty
line ("next build, not a shipped capability"), carries a `next` badge, and every figure inside it is
visibly hypothetical. This is the same rule `PricingSection` follows for the $49 tier: publish the
direction, state plainly that you cannot have it yet.

### D5. The methodology section loses its placeholder and its dead link
The mockup's methodology block links to `#` and admits, on the page, *"Read online / download
experience placeholder — to be designed in a focused session."* That sentence is scaffolding
addressed to the designer, not copy addressed to the reader, and the link goes nowhere. The section
keeps its content — the nine-step field guide and the "practice earns doctrine" line — and its CTA
becomes the page's real one. When a methodology document exists, the epic that writes it adds the
link.

### D6. The section registry is rewritten, not extended
`lib/landing-sections.ts` is the single source of truth for which section is lit by which epic.
Leaving the retired ids beside the new ones produces a registry that no longer describes the page —
precisely the drift it exists to prevent. Same call `landing-redesign-v2` made for the same reason.

### D7. Copy gets an adversarial pass from two foreign model families before it ships
*Instructed by the product owner, 2026-08-19.*

The mockup's copy was written by a single model family, and single-family prose has a house style
that the family that wrote it cannot see. Sprint 3 runs the full page's copy through **agy** and
**vibe** — brand compliance, cliché detection, sentence rhythm, emotional resonance, filler
transitions — and then a de-slop sweep for buzzwords. Advisory, print-only: the orchestrator is the
editor, exactly as `cross-panel` and `prose-draft` already work. The findings and what was
accepted/rejected are recorded in `sprint-3.md`, so a rejected note is visible as a decision rather
than as an omission.

## Sprints

| # | Sprint | Outcome |
|---|---|---|
| 1 | [Shared surface](sprint-1.md) | Hygiene, the section registry, the Ops data module, the stylesheet the new sections need |
| 2 | [The new spine](sprint-2.md) | Hero → maker loop → operating context → Ops → authority → FinOps → methodology → closing, and the page recomposed |
| 3 | [Copy, adversarially](sprint-3.md) | Two foreign-family polish passes + the de-slop sweep, applied |
| 4 | [Verify and ship](sprint-4.md) | Specs, the full gate, cross-family review to clean, PR, merge (= deploy), production smoke |

## Definition of Done (epic)

- [ ] Every story's acceptance checks pass, run and reported with real output.
- [ ] `npm run typecheck && npm run lint && npm run test:unit && npm run test:e2e` green locally.
- [ ] `npm run check:design-drift` green — no raw hex, no inline style in `components/landing`, no
      pictograph, no heading ending in a full stop.
- [ ] Two cross-family review rounds minimum, and **the last round is clean from both families** —
      a count is not the stopping condition.
- [ ] Merged to `main` (= the deploy), and the deployed SHA confirmed via
      `gh api repos/danybgoode/golden-beans/deployments`.
- [ ] Production smoke on `https://goldenfrijoles.com`: the new spine renders, every CTA resolves,
      the SecOps gate badge reflects the real flag state, no horizontal scroll at 390px.
- [ ] `Roadmap/README.md` poster updated, `RETROSPECTIVE.md` written, durable learnings promoted to
      `Roadmap/LEARNINGS.md`.
