# → The design moved to `apps/web/design-system/`

**Nothing was deleted. This folder is a forward pointer.**

`CONSOLE-CONTRACT.md`, `measure-contract.mjs`, `extract-css.mjs`, `console-reference.css` (now
`reference.css`), `_harness.mjs` and `render-reference.mjs` all live in
**[`apps/web/design-system/`](../../../../apps/web/design-system/)** as of 2026-08-29
(`design-system-rails` Story 1.1).

A dangling link out of a shipped epic is how the next reader concludes the design was deleted, so
this file exists rather than an empty directory.

**Why it moved.** This folder is named after an epic that is `shipped`. That is *Mechanism F* in
[`design-system-rails`](../../design-system-rails/README.md): **the design has no home that outlives
the work that produced it.** Three design epics in a row ended that way, and the fourth had to
re-derive a visual contract from scratch eleven build-orders later.

## What is still here, deliberately

| File | Why it stayed |
|---|---|
| `flags-console-prototype.html` | This epic's own approved prototype — **nine** states, superseded on 2026-08-29 by `design-system/console-prototype.html`'s **32**. Kept as this epic's historical artefact; nothing generates from it any more. |
| `ia-audit.html` | The IA audit this epic was scoped from. |

The **live** design system — the one a new route must render from — is
`apps/web/design-system/`. Start at its `README.md`.
