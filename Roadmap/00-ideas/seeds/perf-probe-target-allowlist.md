---
title: "perf-probe only requests the hosts a project names"
slug: perf-probe-target-allowlist
status: raw
area: "09"
type: chore
priority: unranked
updated: 2026-09-24
---

# Seed — bound where a smoke probe may point

## Problem

`perf-probe.mjs` takes `baseUrl` from config (`perf-probe.config.json`, and since golden-frijoles-plugin S4 the
`smoke.perf` section of `golden-frijoles.config.json`), checks only for an `http(s)` prefix, and then follows
`/_next/static/…` asset URLs the returned HTML names. A PR that edits the config could point a runner at an internal
address (`169.254.169.254`). Raised by the security lens on miyagi-product-management#196; answered there as a trust
boundary S4 did not change, since the legacy file always allowed it.

## Rough shape

Refuse link-local, loopback and private ranges unless the project opts in, and fetch assets only from the
`baseUrl`'s own origin. Tests for each refusal.
