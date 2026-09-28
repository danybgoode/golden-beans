# golden-frijoles-plugin: wave 2 ("configure", S4–S5) retrospective, written at ship time

Wave 2 was re-bet on 2026-09-24 (`Roadmap/bets/wave-2026-09-24.md`), built, and shipped the same day. Its closing
verification is **still owed**: S5.5's walkthrough on a clean machine (Daniel), alongside wave 1's S3.5. The epic is
**not** closed. Its `RETROSPECTIVE.md` is written at epic close and will fold in this file and
`WAVE-1-RETROSPECTIVE.md`.

## What shipped

| Sprint | PRs | Live evidence |
|---|---|---|
| S4 One config file | skills#49 · #51 · #53 · #54 · golden-beans#165 · miyagi-product-management#196 | `v0.4.0` → `v0.5.2` cut by CI. `golden-frijoles.config.json` is layered over the seven legacy files (the new file wins per key, D9), `gf-kit config list/get/set/migrate`, and the `GF-NEEDS-SETTING` ask (D11). Both consumers carry the core byte-identical: 19 and 20 unmodified copies replaced, forks untouched (X16). |
| S5 Setup and adjust | skills#50 · #52 · golden-beans#164 · #166 | `v0.5.0`. The umbrella skill asks three questions (X18). Jev egress is `null` until answered, and never sends while unanswered (D12). CLI **0.2.1** is on npm (hand-published, D14): `gf setup`, `gf config`, and `gf doctor`'s module lines, on the kit's core (D10). `check-onboarding-parity --exec` passes against the published CLI, including `gf config list`. |

## What went well

- **One core, two front ends held.** The CLI never grew a second config implementation. Every finding about
  precedence, the secret guard or containment was fixed once in the kit and reached `gf` by re-pinning. The price:
  each fix to the core became a kit release plus a CLI re-pin (0.4.0 → 0.5.2, CLI 0.2.0 → 0.2.1).
- **Reviews ran on local diffs when GitHub was down.** Auth expired mid-wave. The fresh reviewer ran against local
  diffs and found both S5 blockers, including null egress turning back into `true` through the new file, before any
  PR existed.
- **Copy-ins were the last, best reviewer.** Running the consumers' own gates and reviews on the copied core found
  things the foundation can't see:
  - a spec that only passed where egress was unanswered;
  - an unused import (the consumers lint; this repo doesn't);
  - `REPORTING_CONFIG` refused by a containment check keyed on the wrong condition;
  - `config list` printing a legacy file's literal token.

## What we learned

- **A new file layered over old ones reopens every "absent means default" rule.** `egress` missing meant `true` in
  wave 1. A `null` in the new file means "unset", so the merge dropped it and the rail read `true` again. Any
  tri-state that crosses a merge needs its absent case decided at the loader, with a spec on the merge path, not
  just on the parser.
- **The security lens never ran out of findings on #49.** It took four rounds, each smaller than the last:
  - PR-controlled `securityPaths`;
  - `fillIns` escaping by symlink, then by `..` into an in-project secret;
  - config files symlinked out of the project;
  - the loader itself as a trigger.

  The rule that ended it: every finding is fixed or answered on the PR. A narrowed `securityPaths` is answered as
  policy, because the PR that narrows it always gets the lens.
- **A version fresh on npm can 404 for minutes.** golden-beans' first Vercel install failed on
  `kit-0.4.0.tgz 404` three minutes after publish. The fix was a re-run, not a code change. The release waits
  now include checking the tarball URL, not just `npm view`.
- **The review families ran out.** agy was capped all wave. vibe has no `MISTRAL_API_KEY` on this machine. Codex
  hit its usage limit mid-wave, until Daniel topped it up. No PR merged without its security pass.
- **Local-wins is wrong for any name a stranger's repo might own.** Wave 1 learned it for `init` and `preflight`.
  Wave 2 learned it again for `config`, where the GF-NEEDS-SETTING answer was saved through `scripts/config.mjs`.
  Every automatic or save path now calls the kit directly.

## Gaps / follow-ups

- **Owed to Daniel:** S5.5, the walkthrough on a clean machine (`sprint-5.md`), with wave 1's S3.5 walkthroughs
  and signed-in onboarding smoke.
- **Seeds:** `script-ismain-realpath` (11 scripts silently no-op under a symlinked path),
  `perf-probe-target-allowlist` (the SSRF answer on miyagi-product-management#196), and `foundation-lint-gate`
  (this repo doesn't lint what its consumers lint).
- medusa-bonsai's `lib/reporting-config.mjs` is a fork, so the new file's `reporting` section doesn't reach it
  (X16, answered on #196).
- `gf config list` reports sources per section, not per key (answered on golden-beans#164).
