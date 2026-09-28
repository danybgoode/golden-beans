---
title: "Template scripts run when invoked through a symlinked path"
slug: script-ismain-realpath
status: raw
area: "09"
type: chore
priority: unranked
updated: 2026-09-24
---

# Seed — `isMain` by realpath in every template script

## Problem

Eleven template scripts decide whether they were run directly with
`resolve(process.argv[1]) === fileURLToPath(import.meta.url)`. Under a symlinked directory the two sides differ
(macOS `/var` → `/private/var`, a symlinked checkout, a linked `scripts/`), the comparison is false, and the script
**does nothing and exits 0**. Found in golden-frijoles-plugin S4 while writing a spec for
`render-ways-of-working.mjs`, which is fixed; the other eleven share the form.

## Rough shape

Compare realpaths on both sides, as `config.mjs` and `render-ways-of-working.mjs` now do: one small helper in
`lib/`, used by all of them. A guard in CI that fails on the lexical form keeps it that way.
