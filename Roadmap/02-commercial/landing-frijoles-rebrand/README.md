---
status: shipped   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: landing-frijoles-rebrand
build_order: 17
---

# Epic: Golden Frijoles — the rebrand, the material pass, and the controls that were broken

> ✅ **SHIPPED & LIVE 2026-08-13** — PR [#95](https://github.com/danybgoode/golden-beans/pull/95),
> merged as `5544c06`, serving on **https://goldenfrijoles.com**. Verified in production by
> exercising behaviour: the apex serves 200 and `www` 308s to it, the tab reads Golden Frijoles,
> both copy-prompt blocks name the apex domain, `/llms.txt` and `/northstar-self-serve.md` both
> return 200, and the full 18-spec browser suite passes against the live site.

> **Area:** 02-commercial · **Risk:** low · **Class:** Feature · **Archetype:** Rebrand + repair
> **Appetite:** M (one wave) · **Mockup (signed-off):**
> [`references/golden-frijoles-landing-v2.html`](../../../references/golden-frijoles-landing-v2.html)
> **Predecessor:** [`landing-redesign-v2`](../landing-redesign-v2/README.md) — shipped 2026-08-12,
> one day before this epic opened.

## Why

Three things happened at once, and they are one epic because they touch the same twenty files.

**1. The product has a new name and a real domain.** *Golden Beans* becomes **Golden Frijoles**, and
`goldenfrijoles.com` is registered, assigned to the Vercel project and already serving the current
build. `SITE_URL` still points at `golden-beans-gamma.vercel.app`, so the page currently hands a
reader's agent a `golden-beans` URL while calling itself something else. The copy-a-prompt blocks
are the sharpest version of that: they are the one thing on this page a stranger pastes into their
own agent, and they name the host in plain text.

**2. Two controls on the live page are actually broken**, and both were shipped by the epic that
closed yesterday:

- **The primary CTA loses its label on hover.** `tokens.css` sets `a{color}`/`a:hover{color}` for
  prose links and `.btn-gold{color:var(--roast)}` for the button. `a:hover` has specificity (0,1,1)
  and `.btn-gold` has (0,1,0), so on hover an **anchor-based** gold button takes `--gold-hot` ink on
  a `--gold-hot` background and the label — and its arrow, which strokes `currentColor` —
  disappears completely. Reproduced on the live hero CTA. It is invisible on `<button>`-based gold
  controls, which is exactly why it read as "some of them."
- **Selecting a paragraph paints a full-width slab.** Reproduced at 390px in **both** Chromium and
  WebKit: triple-click (the "select this paragraph" gesture) produces a selection whose range
  includes the trailing block break, so no line is terminal and the UA extends every line's
  highlight to the containing block's right edge. On a phone the containing block *is* the
  viewport. `::selection` then fills that with **opaque** `--gold-hot` and inverts the ink to
  `--roast`, so the artefact lands as a solid gold brick rather than a highlight.

**3. The mockup asks for a material upgrade the last epic did not have time for** — a legible
section stamp instead of a 12px `①` glyph, chat-shaped agent surfaces instead of log lines, icons
where "I" placeholders sit, and an overall feel the product owner describes as *smooth, not flaky or
jumpy*.

## Platform-first note

**Nothing new is modelled, and no new runtime dependency is added.** No migration, no new `lib/`
data seam, no new table. One env var changes value (`SITE_URL`) and one Vercel domain redirect is
flipped. Everything else is presentation over data and flags this repo already resolves.

## What already exists (reuse, don't rebuild)

*Verified against live `main` (`601a5ac`) at kickoff, 2026-08-12.*

| Need | Already in the repo | What's actually missing |
|---|---|---|
| Design tokens | `references/design/assets/tokens.css`, imported first by `globals.css`. **Byte-mirrored handoff artifact — do not edit it** (landing-redesign-v2 D3) | Nothing. The `.btn-gold` hover defect is *repaired in `globals.css`*, at higher specificity, with the reason written down — see **D2** |
| Icon seam | `components/ui/Icon.tsx` — a 20-name lucide map with one `<Icon name>` API | ~10 more glyph names. **No second icon library** — see **D3** |
| Section divider | `components/ui/SectionDivider.tsx` — takes `number` + `title` | The number is a `①` character. It becomes a real stamped disc — see **D4** |
| Honesty badge that reads a flag | `ProductContextSection.tsx`'s RISK row reads `isResilienceScenariosEnabled()` and renders "not switched on yet" | Nothing — the new §Resilience reuses exactly this pattern (**D5**) |
| Agent window frame | `components/ui/AgentWindow.tsx` + `ActivityFeedItem.tsx` + `SurfaceNote.tsx` | The chat-thread *variant* (bubbles, context card, platform pills). The `SurfaceNote` contract is unchanged and still mandatory |
| Prompts as functions of the site URL | `lib/landing-prompts.ts` + `e2e/landing-prompts.spec.ts` | Nothing. Changing `SITE_URL` changes every prompt with no code edit — which is why the domain move is one env var |
| Drift guard | `scripts/check-design-drift.mjs` — pictograph / raw-hex / inline-style rules | Two new rules: no trailing period on a landing heading, and no bare circled-numeral glyph |
| Mobile rails + sweep | `globals.css` `:where()` floors + `e2e/mobile-heuristics.browser.spec.ts` | Nothing structural. Two new assertions ride the existing harness |

## Architecture decisions — locked before any code

**D1 — The rename is PUBLIC SURFACES ONLY.** *(Product-owner decision, 2026-08-12.)*
Every user-visible string, the page title and all metadata, the brand lockup, `/llms.txt`,
`/northstar-self-serve.md`, both copy-prompts, and the docs. **Not** renamed: the npm workspace
(`@golden-beans/sdk`), the GitHub repository, the Vercel project, the Supabase project, or any
env-var name. Rationale: those are addresses other systems already resolve, and breaking them buys
a landing epic nothing. The consequence is visible and accepted — §9's install line still reads
`npm install @golden-beans/sdk`, because that is the package that actually exists and
`CODE-QUALITY.md` #9 says a public claim must be checkable. When the package is republished under a
new name, that line changes in the epic that republishes it.

**D2 — The hover defect is repaired in `globals.css`, and the repair is structural.**
`tokens.css` is not edited (it is the byte-mirrored design handoff). The fix is not "add a colour to
`.btn-gold:hover`" — that patches one state of one variant and leaves the next one to be discovered
in production. Instead every `.btn` variant pins its ink across **all** interactive states in one
rule, so a link-coloured hover can never reach a control again (`CODE-QUALITY.md` #2: make the
failure unrepresentable). A spec asserts the rendered hover contrast, so the class of bug is
catchable and not merely fixed.

**D3 — One icon system. Iconoir is NOT added.** *(Product-owner decision, 2026-08-12.)*
The mockup's implementation notes ask for Iconoir glyphs. The repo already runs exactly one icon
seam (`components/ui/Icon.tsx`, lucide-backed) which `/app` and the landing both import, and adding
a second library for the same job is the second-path failure `CODE-QUALITY.md` #1 exists to prevent
— while migrating the whole seam would restyle 27 signed-off `/app` routes for a landing change.
So the mockup's *intent* (real icons, no emoji, in the journey nodes / drill rows / section stamps)
ships, drawn from the seam that already exists. The mockup's two "Implementation note:" paragraphs
are build instructions, not page copy, and do not render.

**D4 — The section number becomes a stamped disc, not a bigger glyph.**
`①` is a single character at 12px inside a kraft band: it is illegible at any size a text run
tolerates, and it is a *pictograph-adjacent* character in a codebase whose drift guard bans
pictographs. The divider takes a plain integer and renders it as an ink-stamped disc — the
packaging material family the brand already owns — at a size that reads. `SectionDivider`'s prop
type changes from `string` to `number`, so a stray glyph cannot be passed.

**D5 — §Resilience ships flag-honest, or it does not ship.**
`RESILIENCE_SCENARIOS_ENABLED` is **OFF** in production — confirmed by exercising the behaviour, not
by reading `vercel env ls`: `GET /api/v1/scenarios/snapshot` returns 404 while `POST` to the same
path returns 405, so the route is deployed and only the gate makes the GET 404. The mockup's
"Break glass · on purpose" section describes that capability in the present tense. It therefore
renders its badge from `isResilienceScenariosEnabled()` exactly as §3's RISK row already does
(`CODE-QUALITY.md` #2 and #9: a value that must not go stale is computed, and a capability is not
described as live while its gate is off). Flipping the gate clears the badge with no code change.

**D6 — The infomercial band is parody, and it labels itself.**
The fake testimonials carry "†They are not. We wrote these." and the struck-through consultant price
sits next to the real "starts at $0". This is the one place on the page where invented content is
allowed, and it is allowed *only* because it is marked. The footnote ledger gains a line naming it,
in the same sentence order the reader met it.

**D7 — Titles carry no terminal period.** *(Product-owner instruction, 2026-08-12.)*
Headings — `h1`/`h2`/`h3`, `.card-title`, `.display`, the section-divider titles — end without a
full stop. Body copy, `.note`, `.micro` and `.takeaway` are sentences and keep their punctuation:
`.takeaway` is a closing line of prose, not a title, and stripping its stop would make it read as a
fragment. A drift-guard rule pins the heading half so it cannot come back.

**D8 — `goldenfrijoles.com` (apex) is canonical.** *(Product-owner decision, 2026-08-12.)*
Vercel currently 308s apex → `www`. That is flipped so `www` → apex, then
`SITE_URL=https://goldenfrijoles.com`. Apex matches what the mockup's prompts already write and
keeps the pasted prompt short. **Both are only live after a new deployment** — Vercel snapshots env
values at build time (AGENTS.md rule #4), so setting the var is half the job.

## Sprints

| # | Sprint | Ships |
|---|---|---|
| 1 | [The name, the domain, and the broken controls](sprint-1.md) | The rebrand across every public surface; the hover repair; the selection material; the section stamp; the icon names; the heading-period sweep + its guard |
| 2 | [The product-feel surfaces](sprint-2.md) | The chat-thread agent surface, §Infomercial, §Resilience (flag-honest), the journey comparison, the release room |
| 3 | [Material, motion, and ship](sprint-3.md) | The elevation/motion pass, the specs, the registry, the full gate, cross-family review, merge, production verification |

## Definition of Done (epic)

See `Roadmap/WAYS-OF-WORKING.md`. Epic-specific additions:
- **No public surface says "Golden Beans"** — a repo-wide sweep proves it, with the deliberate
  exceptions from **D1** enumerated rather than missed.
- **The hover defect is gone in production and a spec would catch its return** — verified by
  rendering, not by reading CSS.
- **Selecting a paragraph at 390px no longer paints an opaque full-width slab**, verified in both
  Chromium and WebKit at the same triple-click gesture that reproduced it.
- **`SITE_URL` is `https://goldenfrijoles.com` in production and a deployment has picked it up** —
  verified by loading the page and reading the URL inside the copy-prompt block, never by
  `vercel env ls`.
- Both copy-prompt blocks are exercised end-to-end: the text copies, and every URL it names
  resolves 200 on the new domain.
- `references/landing-end-state.md` and `lib/landing-sections.ts` describe the section map this
  epic ships, including the two new sections.
