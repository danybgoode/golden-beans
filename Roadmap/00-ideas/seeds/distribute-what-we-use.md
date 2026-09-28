---
title: "Distribute what we use: review rail, Jev and notify setup, schedulers, build view"
slug: distribute-what-we-use
status: raw
area: "09"
type: feature
priority: "single-product-wave-B"
appetite: M
underwritten_by: null
risk: high
epic: null
build_order: 40
updated: 2026-09-28
---

# Seed: Distribute what we use: review rail, Jev and notify setup, schedulers, build view

**Portfolio-pass seed** (not yet deep-groomed), from the [single-product audit](../audits/single-product-and-grooming-2026-09-28.md). Class **feature**, appetite **M**,
to confirm at grooming.
**Decisions:** E3, E4 (approved 2026-09-28).

## Problem

A plugin-only user gets no Jev review guard, a Jev prose guard that is always off and never asks, a one-line Telegram
guide, no routines, a silent build view, and a kickoff whose review step stops (see the audit §0.3).

## Sketch

1. Ship the review rail through the kit, after dobby-foundation's `review-rail-one-implementation` collapses the forks.
2. A Jev setup route in the umbrella skill: one sentence on what leaves the machine, TypeSafe signup link, key into
   `.env.local`, a 10-fixture `jev-eval --live` as proof, then the `jev` config section. Fix the loader so
   "key present, egress unanswered" asks instead of staying silent.
3. A notify setup route: BotFather steps, chat-id discovery from the bot's first message, a test send; port the Slack
   webhook sender from this repo's `notification-rails`; ship the reporting example config.
4. Two schedulers: routine prompts as kit assets with a paste-ready bootstrap, and GitHub Actions cron templates for the
   parts that need no model.
5. `build-state.mjs` into the kit so the build view renders outside our projects.
6. `gf doctor`: one line per module (configured / not configured / could not look).

## No-gos

A hosted "Connect Telegram" (E4: later, an account feature).
