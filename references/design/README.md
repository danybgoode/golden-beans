# references/design — Golden Beans public-face design reference

Implementation reference for the landing build (E1 story 2.3). Produced from
`references/design-direction.md` + `references/landing-end-state.md`; layout descends from
`references/landing-end-state-mock.html`.

- `assets/tokens.css` — **the tokens, as CSS variables**, plus the component skin
  (agent window, brass gauge/toggle, kraft bag label, honesty badges, dividers, buttons).
  Implement against these class names or lift the variables into your own layer.
- `brand-system.html` — the brand sheet: binding rules, live component samples.
- `index.html` — the full **end-state** landing, all 8 sections, epic-badged.
- `e1.html` — the **E1 launch variant**: sections 1, 2, 3(①③), 6, 8 lit; 4, 5, 7 as
  honestly-badged teasers; waitlist instead of tiers.
- Mobile: `tokens.css` carries the ≤720px pass (stacked grids, full-width CTAs, compact
  agent window) — `e1.html` is the page to test at 390px.

Guardrails baked in: ✅ badges only for shipped capability · every number is demo-project
output (synthetic, no client data) · every joke sits beside a checkable claim · two CTAs
everywhere (Add to Claude primary) · max one brass instrument per section.
