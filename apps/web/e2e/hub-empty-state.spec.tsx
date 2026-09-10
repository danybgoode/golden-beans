/** @jsxImportSource react */
// The shim MUST be first: it declares the global `styles` that Playwright's transform strips out of
// every CSS-module import below it. See its own header for the measurement behind that.
import './helpers/css-module-shim'

import { test, expect } from '@playwright/test'
import { renderToStaticMarkup } from 'react-dom/server'
import { EmptyHubState } from '../app/hub/hub-components'

// mockups-as-built · Sprint 4, Story 4.4 — the hub's empty state, asserted where it stays reachable.
//
// ── Why this file exists, and what it replaced ────────────────────────────────────────────────
// `hub.authed.spec.ts` asserted this state end-to-end against a freshly provisioned tenant, on the
// reasoning that "a freshly provisioned tenant has pushed no roadmap, so this is the one moment the
// empty state is genuinely reachable". Story 4.4 pushes a real roadmap artifact into that fixture,
// because `/hub/[projectSlug]` and `/hub/…/horizon` are measured against approved states that
// describe POPULATED boards — a tenant with nothing pushed renders `head → list` where the design
// draws seven blocks.
//
// Report artifacts are APPEND-ONLY, so after any push the empty state is gone for that tenant
// forever. And it cannot move to `hub.spec.ts` either: the hub is behind `requireDashboardAccess`,
// only the demo slug is anonymously readable, and that tenant has an artifact by the time this
// suite runs — which is precisely what that file's own empty-state test says in its comment while
// asserting only a 404.
//
// So the state was about to lose its only content assertion. Rendering the component is what keeps
// it: the branch is pure — one prop in, one card out — and every claim below is about WORDS, which
// is the half a browser was adding nothing to.
//
// ⚠️ **What is NOT covered here, said out loud**: that the component is reached on a real request,
// and that it is visible rather than merely present. The route branch is asserted by
// `getHubRoadmap`'s `no_artifact` reason in `hub.spec.ts`, and `hub.authed.spec.ts`'s horizon test
// still takes the empty branch in a browser if a run ever meets a tenant with no artifact.

test('the hub empty state is an unplanted plot, and it says how to plant it', () => {
  const html = renderToStaticMarkup(<EmptyHubState projectSlug="acme-widgets" />)

  expect(html).toContain('No roadmap pushed yet')
  // ⚠️ **The instruction is the half that matters.** An empty state that only says "nothing here"
  // is the broken-looking zero this design exists to avoid — the reader has to be able to fix it.
  expect(html).toContain('roadmap-push.mjs')
  // Named, so a reader on the wrong tenant can tell. A generic "no roadmap" would leave somebody
  // who switched project unable to see that they are looking at a different one.
  expect(html).toContain('acme-widgets')
  // ⚠️ NOT a broken page and NOT a zero — the sentence that distinguishes this from an outage. The
  // repo's own rule: an empty state and a failed query must never render identically.
  expect(html).toContain('not a broken page and not a zero')
  // The test id every other spec locates it by, so this file and those cannot drift apart.
  expect(html).toContain('data-testid="hub-empty-state"')
})
