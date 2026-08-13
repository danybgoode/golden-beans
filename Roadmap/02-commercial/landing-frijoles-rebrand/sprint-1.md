# Golden Frijoles — Sprint 1: The name, the domain, and the broken controls

**Status:** 🟨 In progress

> **Build contract (locked by the architect before any builder started).**
> This sprint is **shared surface**: the brand strings, `globals.css`, the `Icon` map, the
> `SectionDivider` API and the drift guard are all imported by everything Sprint 2 touches, so it is
> built first and by the architect (WAYS-OF-WORKING, "one architect, many builders").
> `references/design/assets/tokens.css` is **not edited** — it is the byte-mirrored design handoff
> (epic D2). Every new or corrected rule lands in `apps/web/app/globals.css`.
> Cite the epic's D1–D8; do not re-derive them.

## Stories

### Story 1.1 — The product is called Golden Frijoles
**As a** reader who just landed from `goldenfrijoles.com`, **I want** the page, its tab title, its
link preview and the prompts it hands my agent to all use one name, **so that** I am not left
wondering which product I am actually looking at.

**Acceptance:**
- Every user-visible occurrence of "Golden Beans" / "golden beans" / "Golden Bean" on a **public**
  surface reads Golden Frijoles: the nav and footer lockups, all fifteen landing sections, the page
  `<title>`, `description`, OpenGraph and Twitter metadata, the OG/Twitter image routes, `/llms.txt`,
  `/northstar-self-serve.md`, `/install`, `/login`, `/signup`, the app shell and the loader phrases.
- The bag label's brand block reads `GOLDEN FRIJOLES`.
- §2's "Give your agent one Golden Bean" becomes "Give your agent one Golden Frijol" (singular, per
  the mockup).
- The mark keeps the bean silhouette — *frijol* is a bean — but its accessible name, its component
  doc comment and the `BrandLockup` wordmark are updated.
- **The D1 exceptions are enumerated, not missed:** `@golden-beans/sdk` (the real package name, so
  §9's install line stays checkable), the GitHub repo, the Vercel project, the Supabase project and
  every env-var name are unchanged. A sweep lists what remains and why.
**Risk:** low

### Story 1.2 — The domain is goldenfrijoles.com
**As a** reader who copies the handoff prompt, **I want** the URLs inside it to be the real product
domain, **so that** my agent fetches a document that exists at the address I was just shown.

**Acceptance:**
- The Vercel redirect is flipped so `www.goldenfrijoles.com` → `goldenfrijoles.com` (epic D8).
- `SITE_URL=https://goldenfrijoles.com` in the Production scope.
- Because `lib/landing-prompts.ts` builds every prompt from `getSiteUrl()`, no prompt string is
  edited — the change is one env var plus the deployment that snapshots it (AGENTS.md rule #4).
- Verified **by exercising the behaviour**: load the deployed page, read the URL rendered inside
  both copy-prompt blocks, and fetch each URL it names. Never by `vercel env ls`.
- `references/*.md` and the Roadmap docs that quote a URL are updated to the apex domain.
**Risk:** low

### Story 1.3 — A primary CTA never loses its label
**As** anyone with a pointer, **I want** the main call to action to stay readable while I am
hovering the thing I am about to click, **so that** I can tell what I am clicking.

**Acceptance:**
- Hovering **any** `.btn-gold` — anchor or button, in the nav, the hero, the pricing grid, the
  release room — keeps `--roast` ink on the gold face. The arrow glyph, which strokes
  `currentColor`, stays visible with it.
- The repair is **structural** (epic D2): one rule pins each variant's ink across
  `:hover`, `:focus`, `:focus-visible`, `:active` and `:visited`, so a future prose-link rule cannot
  reach a control. Not a one-state patch.
- `.btn-ghost` keeps its intended hover (ink and border both move to `--gold-hot`) — the fix must
  not flatten the variant that was already correct.
- **A spec asserts the rendered result, not the stylesheet:** it hovers a gold CTA and asserts the
  computed text colour still contrasts with the computed background. Observed **failing red**
  against the current implementation before the fix lands — this bug is live in production today,
  so the red run is free.
**Risk:** low

### Story 1.4 — Selecting a paragraph looks like a highlight, not a brick
**As** someone quoting a line from this page on my phone, **I want** the selection to read as a
highlighter pass over the words, **so that** I can still see what I selected.

**Acceptance:**
- `::selection` becomes a **translucent** gold wash that leaves `--crema` ink in place, instead of an
  opaque `--gold-hot` fill that inverts the ink to `--roast`. The selected text stays legible
  against both the page ground and the kraft bands.
- At 390px, a triple-click on a body paragraph no longer produces a solid edge-to-edge slab in
  **either** Chromium or WebKit. *(The UA still extends a non-terminal line's highlight to the
  containing block edge — that is selection painting and cannot be turned off. What changes is that
  the extension reads as a wash rather than a brick.)*
- The kraft surfaces get their own `::selection` so the wash stays legible on `--kraft` too — a
  single dark-ground rule would be invisible there.
- The `.prompt-copy` block's `pre-wrap` trailing whitespace no longer paints stub slabs on blank
  lines: prompt lines are emitted without trailing spaces.
- A spec captures the geometry at 390px so a future `::selection` change has something to fail.
**Risk:** low

### Story 1.5 — The section number is legible
**As a** reader scanning the page, **I want** the numbered section stamps to be readable, **so that**
the kraft dividers work as navigation rather than as texture.

**Acceptance:**
- `SectionDivider` takes `number: number` (not a `string` glyph — epic D4) and renders an
  ink-stamped disc: the numeral in mono, on the kraft ground, ringed in `--stamp` ink, at a size that
  reads at arm's length on a phone.
- Every `①…⑩` character is gone from `components/`, `lib/landing-sections.ts` and the Roadmap docs
  that mirror the section map.
- The stamp reuses the packaging material family already in `tokens.css` (`--kraft`, `--stamp`,
  `--stamp-dim`, the fibre texture) — it is not a new visual language.
- `HowItGrowsSection`'s three `① ② ③` kickers become "Step 1/2/3", matching the mockup.
**Risk:** low

### Story 1.6 — Icons where the mockup asks for icons
**As a** builder in Sprint 2, **I want** every glyph the new sections need to exist in the one icon
seam, **so that** no section reaches for a second library or an emoji.

**Acceptance:**
- `components/ui/Icon.tsx` gains the names Sprint 2 consumes — shield, flask, warning triangle,
  server, lock, refresh, help, database, code, group, check-circle — drawn from lucide, keeping the
  existing `<Icon name>` API (epic D3).
- `ICON_NAMES` stays the single exported source of truth; nothing imports `lucide-react` directly
  outside `Icon.tsx`.
- **No new runtime dependency.** `apps/web/package.json` is unchanged.
**Risk:** low

### Story 1.7 — Titles carry no terminal period
**As** the product owner, **I want** headings to read as titles rather than as sentences, **so that**
the page's typographic voice is consistent.

**Acceptance:**
- Every heading on the landing — the hero `.display`, each `h2.section-title`, each `h3.card-title`,
  every `SectionDivider` title — ends without a full stop (epic D7).
- Body copy, `.note`, `.micro` and `.takeaway` keep their punctuation: they are sentences.
- `scripts/check-design-drift.mjs` gains a rule that fails on a landing heading ending in `.`, and
  a second that fails on a bare circled numeral. Both were observed **failing red** against a
  deliberately reintroduced violation.
**Risk:** low

## Smoke walkthrough

1. `npm run dev`; open `http://localhost:3000` — the nav lockup reads **golden frijoles** and the
   browser tab reads **Golden Frijoles**. *(Expected: no occurrence of "Golden Beans" anywhere on
   screen except §9's `npm install @golden-beans/sdk`, which is the real package name — D1.)*
2. Hover the hero's **Connect your agent** button. *(Expected: the face brightens to `--gold-hot`
   and the dark label + arrow stay fully readable. Before this sprint they vanished.)*
3. Narrow the window to 390px and triple-click the paragraph beginning "Give your agent the goals".
   *(Expected: a translucent gold wash with the text still readable — not an opaque brick.)*
4. Scroll to the first kraft divider. *(Expected: a stamped disc reading **1**, legible without
   leaning in; no `①`.)*
5. Read any three headings. *(Expected: none ends in a full stop. The `.takeaway` lines below them
   still do.)*
6. `npm run check:design-drift` → passes. Reintroduce a period on one heading → it fails, naming the
   file and line.
