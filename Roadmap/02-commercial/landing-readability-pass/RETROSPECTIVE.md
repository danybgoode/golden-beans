# Retrospective — landing-readability-pass

**Shipped:** 2026-08-20 · **PR:** [#102](https://github.com/danybgoode/golden-beans/pull/102) ·
**Live:** https://goldenfrijoles.com · **Appetite:** S (one sprint, one slice)

## What shipped

The maker-ops landing, cut down to what it claims. Four things:

1. **The hero opens at the mockup's scale and its graphics compose.** New copy, `clamp()`-scaled
   type scoped to `.hero`, and the bag label and agent window overlapping in one grid cell.
2. **No claim is made twice, and nothing is green.** Every `Badge status="live"` removed, every
   `tag-next` kept; two gate-restating paragraphs and `drillAvailabilitySentence` deleted.
3. **§connect and §sdk cut**, with `/install` absorbing both and the package-name assertion moving
   to a spec there.
4. **The mockup's copy** through §authority, §finops and §methodology, plus a pricing-intro
   alignment fix whose cause was a fully inert rule.

All 21 production smoke checks pass on the live site.

## What went well

**The subtractive frame held.** "The qualification stays; the second statement of it goes" was
decided before any code and it answered every judgement call the epic raised — including the two
that looked like exceptions (the green trend readings, which are measurements and were recoloured
rather than deleted; and the gated badges, which are the shorter of the two copies and stayed).
Six review rounds and not one finding was about the honesty rail weakening.

**Moving a guard instead of deleting it.** Deleting `drillAvailabilitySentence` would normally take
its spec with it. Instead the spec was re-pointed at the badge, against the same two real routes,
with the same deployment-proof probe. The property survived the copy that used to express it.

**Verifying by rendering, not by grepping.** "Remove all the green text" was checked by sweeping
computed styles over every element on the page — text and border — rather than by searching for
`tag-live`. That is what caught `.trend--up` and `.lift--up`, which no class-name search would
have found.

## What we learned

**A comment that documents an invariant is a claim, and it needs the same proof as code.** Round 3's
finding: `align-self: end` made the hero window's offset invariant *only when the window was the
taller object*, while the comment above it said "always … whatever either one's content does." The
fix was `align-self: start` — making the property real — and it was confirmed by forcing the bag
+200/+400/+800px and watching the offset stay at 166px. Softening the sentence would have been the
cheaper and worse option. This is the fifth time this epic family has recorded prose asserting a
property the code lacked.

**Fixing a defect class in one file does not immunise the same file.** This PR's headline CSS fix was
`.pricing__intro` — a rule sitting above its target at equal specificity, silently inert. Agy then
found *the same defect, in the same file, in the code this PR added*: the hero's overlap block placed
above the base rule it overrides, with `gap: 0` and `padding-top: 0` never applying. Writing the
explanation of a class does not stop you committing an instance of it an hour later.

**Deleting a component leaves a trail in CSS, and the trail is worth sweeping deliberately.** Removing
the platform pills left an orphaned `@media (max-width: 699px)` rule ~200 lines away, under a
confident comment explaining behaviour that no longer existed. Agy found the one instance; the fix
swept the whole removal set (`.agent-platforms`, `.platform-pill`, `.context-head`,
`.section-status`, `.pricing__intro`) plus the classes the two deleted sections used. Side effect:
that was the stylesheet's last `max-width` block, so the file's own mobile-first rule is now true by
inspection rather than by convention.

**A capped family is not a licence to run a one-pass layer.** Codex was quota-capped until
2026-09-16 — weeks, not the router's 30-minute fallback window. Rotating in the next two families in
the router's own preference order (agy + vibe) kept two independent non-Claude reads on the diff. The
downgrade is recorded in the PR body, as the router requires.

**Scope a reviewer at the file that carries the risk.** Rounds 1 could not attach `globals.css` —
it did not fit agy's 256 KB argv budget — and both families returned clean. Every real finding in
this epic came from a later round explicitly scoped with `--paths globals.css`. A clean review of a
diff whose riskiest file was withheld is not a clean review, and the tooling says so in its own
output if you read it.

## Gaps and what is owed

- **None owed to the product owner.** No money, auth or checkout path is involved.
- `design-system.browser.spec.ts` cannot run locally without Supabase (`fetch failed` from
  tars-query / north-star-query / ab-query). It passes in CI, which provisions it. Pre-existing.
- The nav still carries `Product · Ops · Proof · Pricing`; the mockup's "Methodology" link was left
  out of scope and remains a candidate.
- The second `@media (min-width: 900px)` block ~1500 lines above the hero's still holds a
  `.hero-grid` rule (`gap: 40px`). Not a defect — different property, no conflict — but the two
  blocks are a merge waiting for an epic that owns those rules.
