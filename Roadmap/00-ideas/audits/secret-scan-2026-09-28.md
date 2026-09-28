# Secret scan — full history, both repos (2026-09-28)

**public-monorepo S3.1.** GitHub push protection has been on since 2026-09-16 and covers pushes from that date. It never
scanned the history before it, and both repos have been public since July. This is the one-time full-history scan.

- **Tool:** gitleaks **8.30.1** (release binary, SHA-256 verified against the release checksums; not a repo dependency).
- **Scope:** `git log --all` of `danybgoode/golden-beans`. That's **576 commits**, and because `skills/` was
  subtree-merged unsquashed (public-monorepo D1), it includes **all of dobby-foundation's / golden-frijoles/skills'
  history**. Scanned about 22.8 MB.
- **Widened after review (codex, #183): every ref on GitHub**, including PR heads that never merged. That meant
  `git clone --mirror` plus `refs/pull/*` of both repos:
  - `danybgoode/golden-beans`: **1,518 commits, 209 refs, 36 findings**;
  - `golden-frijoles/skills`: **334 commits, 66 refs, 2 findings**.
  Everything the narrower scan found is included. The only new hits are two JWTs in PR #1's head (`f03464b`, never
  merged); see the table.
- **Handling:** `--redact=100`. The report stayed out of the repo, and no value was printed while triaging: each hit was
  read with every 10+ character token masked.

## Result: 0 live secrets, nothing to rotate

The first scan found 23 findings; the widened scan found 36 + 2, all dispositioned below.

| Rule | Where | Count | Disposition |
|---|---|---|---|
| generic-api-key | `scripts/lib/config.test.mjs`, `skills/template/scripts/lib/config.test.mjs` | 6 | **Test input.** A made-up `sk-live-…`-shaped token that the config secret guard must refuse, plus a redaction-test value. |
| generic-api-key | `apps/web/e2e/helpers/authed-fixture.ts` | 3 | **E2E fixture names** (`gb.e2e…` / `gb_e2e…` flag and scenario keys for the locally seeded project). Not credentials. |
| generic-api-key | `apps/web/e2e/{destinations,delivery-payload,webhook-signature}.spec.ts`, `apps/web/lib/webhook-signature.test.ts` | 6 | **Test webhook signing secrets** (`whsec_test…`), used only against the local server in CI. |
| generic-api-key | `apps/web/lib/flag-list-view.test.ts`, `scenario-impact-request.test.ts`, `e2e/_fixtures/tiendas-fundadoras-experiment.ts` | 4 | **Fixture identifiers** (flag keys, an idempotency UUID, an experiment key). |
| jwt, stripe-access-token | `apps/web/lib/signal-scrub.test.ts`, `packages/sdk/src/scrub.test.ts` | 3 | **Scrubber test inputs.** Fake JWT and `sk_live_…` strings the error scrubbers must redact. |
| curl-auth-header | `Roadmap/01-growth-engine/growth-engine-v1/sprint-4.md:116` | 1 | **Named local test key** (`local-test-key-do-not-use-in-prod`) against `localhost:3002`. |
| jwt | `apps/web/.env.local.example`, `.github/workflows/ci.yml` at `f03464b` (PR #1's head only) | 2 | **Supabase CLI's public local-dev key.** Only the claims were decoded (`iss: supabase-demo`, `role: service_role`). It's the key every `supabase start` prints and it grants nothing on a real project. |
| (skills repo) generic-api-key | `template/scripts/lib/config.test.mjs` | 2 | Same config-guard test inputs as above, seen through the skills repo's own refs. |

No finding is in a `.env*` file, a workflow, or a config that ships. There's nothing to rotate, so nothing was named to
Daniel for rotation.

## Follow-up (not done here)

- A `.gitleaks.toml` allowlist for these fixture paths, and a scan in CI, would keep this from being a one-off. It
  belongs to the review/security rails (`distribute-what-we-use`), not this epic.
- `.env.local` files exist in both local checkouts and are gitignored. The scan confirms that none was ever committed.
