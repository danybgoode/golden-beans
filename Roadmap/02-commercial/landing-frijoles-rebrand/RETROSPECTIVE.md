# Retrospective — Golden Frijoles: the rebrand, the material pass, and the controls that were broken

**Shipped 2026-08-13.** PR [#95](https://github.com/danybgoode/golden-beans/pull/95), merged as
`5544c06`, live on **https://goldenfrijoles.com**. One day after `landing-redesign-v2` closed.

## What shipped

The product is called **Golden Frijoles** and lives on its own domain. Two controls that were
genuinely broken on the live page are fixed. Two sections the new mockup adds are on the page, one
of them reading its own feature gates. The materials and motion are one system instead of six
shadows and three easings.

Three sprints, one PR, fifteen cross-family review rounds. No new dependency, no migration, no new
`lib/` seam — the whole epic is presentation over data and flags this repo already resolved.

## What went well

**The two bugs were both specificity accidents, and finding that changed the fix.** The CTA losing
its label was `a:hover` at (0,1,1) beating `.btn-gold` at (0,1,0) — nothing was wrong in isolation,
which is why it read to the product owner as "some of them, particularly the hero one" (it was
every *anchor*-based gold button, and no `<button>`-based one). Knowing that made the fix
structural: pin every variant's ink across every interactive state, so the class of bug is
unrepresentable rather than the one reported instance being patched.

**Reproducing the selection bug in two engines before touching it saved a wrong fix.** Triple-click
at 390px in both Chromium and WebKit showed the full-width extension is *UA selection painting* —
what a browser is supposed to do for a non-terminal line, and not changeable from CSS. The part
that was ours was the opaque fill and inverted ink. Had that not been checked first, the obvious
"fix the geometry" attempt would have burned the sprint and shipped nothing.

**The mockup was treated as a design, not as a spec.** Six divergences were deliberate and are now
recorded *in the mockup itself* rather than in someone's memory: a `npx golden-frijoles init` that
does not exist, a "live product context" label inside a frame marked as an illustration, ungated
resilience drills, hardcoded stat tiles, build instructions that are not page copy, and markdown
tildes that render as tildes.

**Every new spec was observed red by mutation, not by assertion.** Three CSS fixes were reverted to
their broken forms and rebuilt; exactly the three matching guards went red while nine stayed green.
That habit then caught two of my own tests that could not fail.

## What we learned

**Fifteen review rounds were worth it, and the reason is uncomfortable.** The findings did not
taper into nits — they stayed real for nine rounds. Three of them were defects in the *guards*, not
the product: a reduced-motion spec whose predicate could never see a transition, a selection
assertion satisfied by the broken rendering, and a drift guard that had been reporting the wrong
line number for its entire existence. A guard that looks like coverage and is not is worse than no
guard, because the next reader stops there — and I shipped three of them in one epic.

**A conclusion can be wrong while its observation is right — three times.** "Reduced motion is
broken" was false (tokens.css already handled it) but exposed that my motion rule had been *dead
for `.btn` all along*, losing to a token-file rule on specificity. "The domain change is missing"
was false (it was live, out-of-band, deliberately) but correctly noted the diff alone cannot show
it. The Dingbat codepoints given were wrong; the gap was real. **Verify before accepting and before
dismissing** — the reflex to do one or the other on the first factual error would have lost all
three.

**A reviewer repeating a finding you reasoned your way out of is a signal.** Trailing `//` comments
were raised twice. The first triage — that stripping them eats every `https://` — was a right
concern and a wrong conclusion, because the risk was avoidable with a lookbehind rather than
inherent. The second raise was the prompt to look for a third option instead of restating the
trade-off.

**Two families beat one family twice.** Codex ran nine rounds and never noticed the drift guard was
naming the wrong line; agy found it in one pass. Codex found the flag-honesty and accessibility
problems agy did not. The router's insistence on different families is doing real work, not
ceremony.

**Half a fix reads exactly like a whole one.** Removing the fake buttons' semantics (`aria-hidden`,
spans) without removing their *affordance* (`cursor: pointer`, hover) left mouse users invited to
click something screen-reader users could no longer find — strictly worse than before. Same shape
as fixing §Resilience's lead sentence and leaving the identical claim in the card copy one level
down.

## Gaps and what is owed

- **The authed mobile sweep** — still owed from `landing-redesign-v2` and untouched here. The
  `browser` project is anonymous by construction, so a signed-in route would be measured against
  its login redirect. `assertMobileClean` is exported and ready for an `*.authed.spec.ts`.
- **Both external review families capped** before a final full-scope round. Codex hit a hard quota
  after round 9 (its findings were all fixed; it did not see the fixes); agy exhausted its Gemini
  quota at round 6 and fell back to `gpt-oss-120b-medium`, which returned clean on Blocking and two
  factually wrong Should-fix items. Recorded in the PR body per the router's refund rule.
- **`RESILIENCE_SCENARIOS_ENABLED` and `SECURITY_SIMULATIONS_ENABLED` remain OFF.** That is the
  honest state and the page says so by reading them. Turning either on needs a new Git-tracked
  deployment, not just an env change.
- **`@golden-beans/sdk` is still the package name** (epic D1), so §9's install line still reads it.
  That is deliberate and checkable; it changes in the epic that republishes the package.
- **Two pre-existing api failures** (`event-context:683`, `north-star-sync:69`) are unrelated to
  this branch — verified by diffing both specs against `origin/main` — and are green on a fresh DB.
