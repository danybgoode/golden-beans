---
title: "Semantic lint: Jev judges what deterministic checks select"
slug: semantic-lint
status: raw
area: "09"
type: feature
priority: "single-product-wave-B"
appetite: S
underwritten_by: null
risk: low
epic: null
build_order: 42
updated: 2026-09-28
---

# Seed: Semantic lint: Jev judges what deterministic checks select

**Portfolio-pass seed** (not yet deep-groomed), from the [single-product audit](../audits/single-product-and-grooming-2026-09-28.md). Class **feature**, appetite **S**,
to confirm at grooming.

## Problem

The rules that cost most have no check: AGENTS.md's cannot-be-violated rules on a diff, paraphrases of banned product
words (`vocabulary.ts` blocks exact words only), ✅ lines on the poster that the code doesn't enforce, suppression
comments whose reason has rotted, and CodeQL alerts a human triages by hand.

## Sketch

- A `semantic-lint` rail in the kit, rules as data in `golden-frijoles.config.json` → `lint.rules[]`: id, glob,
  candidate selector, question, answer type, threshold, severity, `mode: off | shadow | jev`, `shadowExpires`.
- Raise-only; "could not look" is never a pass; decisions logged to `.jev/decisions.jsonl` as `rail: lint:<id>`.
- Changed files only, pre-push and CI (≈ $0.0001 per PR at the audit's measured Jev price).
- Labels from cross-review findings fixed vs answered-not-a-bug, and `vocabulary.ts`'s examples; thresholds fitted
  with ReAnchor (depends on `jev-reanchor-thresholds`).

## First slice

AGENTS rule 1 (no parallel telemetry pipeline) on this repo's PRs, in shadow for two weeks.

## No-gos

Formatting, unused imports, anything a deterministic rule already decides; finding vulnerabilities (Jev judges, it
doesn't search).
