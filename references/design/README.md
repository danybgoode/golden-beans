# references/design — Golden Beans public-face design reference

Canonical implementation reference for the landing and shared product skin. The approved polish
and behavior handoff is preserved verbatim in:

- `../golden-beans-design-system-proposal/`
- `../golden-beans-mark-exploration-round2.html`

`polish-pass-proposal.html` and `../ux-guidelines.md` are compatibility copies at the exact paths
named by the implementation brief. The design-drift guard requires them to remain byte-identical to
the supplied source folder.

- `assets/tokens.css` — **the tokens, as CSS variables**, plus the component skin
  (agent window, brass gauge/toggle, kraft bag label, honesty badges, dividers, buttons).
  Implement against these class names or lift the variables into your own layer.
- `brand-system.html` — the brand sheet: binding rules, live component samples.
- `index.html` — the full **end-state** landing, all 8 sections, epic-badged.
- `e1.html` — the **E1 launch variant**: sections 1, 2, 3(①③), 6, 8 lit; 4, 5, 7 as
  honestly-badged teasers; waitlist instead of tiers.
- Mobile: `tokens.css` is mobile-first, with wider composition layered at 640px and 900px.
- The app imports `tokens.css` directly from `app/globals.css`; there is no hand-maintained port.
- React consumes the skin through `components/ui/` primitives and `components/brand/`.
- `npm run check:design-drift` rejects UI pictographs and raw colors in app components, plus
  landing inline styles.

Guardrails baked in: `live` badges only for shipped capability · every number is demo-project
output (synthetic, no client data) · every joke sits beside a checkable claim · two CTAs
everywhere (Add to Claude primary) · max one brass instrument per section.
