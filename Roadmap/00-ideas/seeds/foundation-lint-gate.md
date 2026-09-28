---
title: "This repo lints its template scripts the way its consumers do"
slug: foundation-lint-gate
status: raw
area: "09"
type: chore
priority: unranked
updated: 2026-09-24
---

# Seed — a lint gate before the copy-in finds it

## Problem

The consumers run `eslint --max-warnings=0` and a Prettier check on changed files; this repo runs neither. In
golden-frijoles-plugin wave 2 an unused import (`review-route.mjs`) and six unformatted new files reached
golden-beans and failed its gate, which cost a fix PR here and a `.prettierignore` entry there. Wave 1 hit the same
class (13 orphaned bindings).

## Rough shape

Run the consumers' `no-unused-vars` (at least) over `template/scripts/` in CI, zero-dependency or via `npx`.
Decide once whether shared rails are Prettier-formatted at the source or ignored by every consumer; today it is the
second, one file at a time.
