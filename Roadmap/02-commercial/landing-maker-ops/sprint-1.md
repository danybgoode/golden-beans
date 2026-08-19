# Maker ops — Sprint 1: Shared surface

**Status:** in progress

> **Build contract (locked by the architect before any builder started).**
> This sprint is **shared surface**: the section registry, the Ops data module and `globals.css` are
> imported by every Sprint 2 story, so they are built first and by the architect
> (WAYS-OF-WORKING, "one architect, many builders"). `references/design/assets/tokens.css` is **not
> edited** — it is the byte-mirrored design handoff. Every new rule lands in
> `apps/web/app/globals.css` and uses tokens only.
> Cite the epic's D1–D7; do not re-derive them.

## Stories

### Story 1.1 — The repository stops carrying a build artefact
**As a** contributor, **I want** the packed SDK tarball out of the working tree and out of the
future, **so that** nobody mistakes a compiled snapshot for source or commits a stale copy of
`dist/`.

**Acceptance:**
- `packages/sdk/golden-frijoles-sdk-0.4.0.tgz` — an `npm pack` output containing only `dist/`
  (already ignored), `package.json` and `README.md` — is deleted rather than committed.
- `*.tgz` is ignored repo-wide, with a comment naming the failure mode it prevents.
- `references/golden-frijoles-maker-ops-landing-v0.2.html` is tracked (mode 644, not 600) — it is
  the signed-off mockup this epic is built against and every decision doc cites it.
- `git status` is clean of untracked files afterwards.
**Risk:** low

### Story 1.2 — The section registry describes the page that now exists
**As a** future agent reading `lib/landing-sections.ts` to find out what is on the landing page,
**I want** it to describe the maker-ops page rather than the one it replaced, **so that** the
registry stays the source of truth the badges read from instead of a second, stale narrative.

**Acceptance:**
- The registry is **rewritten** to the D1 section list, not extended (epic D6). No retired id
  survives.
- Every entry names the epic that lights it and its honest status.
- `getSection()` still throws on an unknown id — the mechanism that makes a typo in a section
  component a build-time failure rather than a missing badge.
- Every id in the registry is rendered by exactly one section component, and every section
  component reads its own entry. A unit test asserts the round trip, so an id that nothing renders
  fails rather than rots.
**Risk:** low

### Story 1.3 — The four Ops surfaces are data, and their status is computed
**As a** reader deciding whether this product covers my whole operation, **I want** each Ops
surface to state what it answers, what it gives me, and whether it is actually shipped, **so that**
I can tell the built part from the planned part without signing up to find out.

**Acceptance:**
- A new pure module `apps/web/lib/maker-ops.ts` holds the four surfaces (Product, Dev, Sec, Fin):
  eyebrow, title, description, the questions each answers, and its capability list. No imports that
  reach the database — it is content, and it is unit-testable without a server.
- **Status is not written down in the content.** The module exposes each surface's *gate* and the
  component resolves it per request via `lib/flags.ts` (epic D3). Flip
  `RESILIENCE_SCENARIOS_ENABLED` and the SecOps badge changes with no edit to this file.
- FinOps is marked `next` structurally — it cannot be given a `live` status by editing a string,
  because it has no gate to read (it isn't built).
- Unit tests cover: every surface has a non-empty question list and capability list; the FinOps
  surface is `next`; a surface whose gate reads false renders as gated.
**Risk:** low

### Story 1.4 — The stylesheet gains the maker-ops devices, in tokens only
**As a** builder starting a Sprint 2 section, **I want** the layout primitives the new spine needs
to already exist, **so that** five stories do not each invent their own grid and the drift guard has
nothing to catch.

**Acceptance:**
- `globals.css` gains: the maker-loop strip, the operating-context shell, the Ops tab-panel, the
  authority grid, the FinOps concept panel, the methodology kraft card, and the closing block.
- **Mobile-first, as the UX guidelines require**: the base rules are single-column and full-width;
  a `min-width` query *adds* the multi-column layout. Not a `max-width` block fighting desktop
  rules.
- Zero raw hex. Every colour is a token from `references/design/assets/tokens.css`.
- `npm run check:design-drift` passes.
**Risk:** low
