# Scenarios made PM-operable — Sprint 1: Define a scenario

**Status:** ✅ built in `013b404` + hardening through `00b1a86`; PR #98 awaits product-owner merge

> **Build contract (locked by the architect before the builder started).**
> **Run D9 before writing a line:** does a `synthetic`-cohort scenario run without
> `approve_definition`? If it does not, the approval flow is load-bearing for v1 and this epic's
> shape changes — amend the README out loud, do not reinterpret silently.
> **Answered:** D9 is safe for synthetic resilience; production security still needs its named
> approval. Cite D1, D2, D3, D5, D6, D8, D10, D12, D13 and D14.
> `SCENARIO_AUTHORING_ENABLED` must exist **DISABLED in every environment before this merges.**
> #13's form/dialog primitives and #15's percent seam are on `main`. `RuleBuilderRow` is not a
> scenario primitive (D14).
> **Amendment 1 approved 2026-08-13:** build the owner-session facade. The existing credential
> command still cannot be called from a signed-in session by pretending the identities are
> interchangeable (D13).

## Stories

### Story 1.1 — Rewrite the page around `ProductShell` and #13's primitives
**As a** PM, **I want** the scenarios page to read like the rest of the product,
**so that** the most consequential screen isn't also the least legible.

**Acceptance:**
- The six stacked tables become sectioned views using `Panel`, `StatCard` and #13's `DataTable`.
- The information shown is **the same information** — this story changes presentation only; the
  operating evidence and its caveats are preserved verbatim (D11).
- This is the route #13 deliberately skipped (D12): converted once, here, not converted then
  rewritten.
- `check:design-drift` passes; no raw hex.
**Risk:** high

### Story 1.2 — The define-a-scenario form
**As a** PM, **I want** to define a scenario by choosing from options rather than writing a
definition, **so that** I can run a resilience exercise without an engineer.

**Acceptance:**
- Kind, cohort, fault and (for `security`) template selects are populated from `ScenarioKind`,
  `SCENARIO_COHORTS`, `ScenarioFault` and `SCENARIO_SECURITY_TEMPLATES` — **imported, not listed** (D1).
- Numeric inputs for `requestCap`, `concurrencyCap`, `leaseTtlSeconds`,
  `abortAfterFailures` and duration are bounded by the SDK constants, **read from them** (D5). A test
  asserts each bound tracks its constant rather than a literal.
- The cross-field constraint **`concurrencyCap ≤ requestCap` is enforced live in the form**, shown
  before submit — not discovered as a server error after (named rabbit hole).
- `maxErrorRateBasisPoints` is entered as a **percent** and converted through #15's seam (D3).
- The form selects an existing immutable compatible fault-injector flag version. It does not expose
  `RuleBuilderRow`, invent a flag definition, or silently retain an incompatible version when the
  selected fault kind changes (D14).
- `external` cohort is **not offered** (D10).
**Risk:** high

### Story 1.3 — Save through the shared operation core
**As a** PM, **I want** the scenario I defined to be a real registered definition,
**so that** I can launch it in the next sprint.

**Acceptance:**
- Saving parses the existing `create_definition` operation in a gated server action, re-authenticates
  project ownership, then calls the service-role-only owner RPC. Credential and owner RPCs share the
  same private transaction core (D13); no public route or second invariant is introduced.
- The definition round-trips through `parseScenarioDefinition` unchanged.
- A parser rejection is **displayed on screen** with the field it concerns, never swallowed (D2).
- The operation's required `reason` field is captured from the PM in plain language, not
  auto-generated — the audit trail is only worth having if a human wrote the reason.
**Risk:** high

### Story 1.4 — Target state, honestly
**As a** PM, **I want** to see whether a target is verified and what to do if it isn't,
**so that** I don't define a scenario I can't run.

**Acceptance:**
- Registered targets show state: registered / **awaiting verification** / verified / revoked.
- "Awaiting verification" explains the challenge/response step and that it needs someone with access
  to the target's `/api/internal/resilience/ownership` path. It does **not** hide the step or imply
  the PM can complete it alone (D6).
- Revoke is wired to `ConfirmDialog` from #13 and names the specific target.
- With `SCENARIO_AUTHORING_ENABLED` unset, none of the write controls in this sprint are reachable
  and the page renders today's read-only view. A dark spec asserts it (D8).
**Risk:** high

## Sprint QA
- **specs:** `lib/scenario-authoring-draft.test.ts` pins definition round-trip, SDK-derived bounds,
  compatible immutable flag selection, cross-field refusal and percent conversion. The owner RPC
  path is exercised in `e2e/scenario-registry.spec.ts`; `scenario-authoring.authed.spec.ts` and
  `scenario-authoring-dark.authed.spec.ts` cover the rendered ON/OFF boundary.
- **Existing specs must pass unchanged:** `scenario-dark.spec.ts`,
  `scenario-dashboard.authed.spec.ts`, `scenario-registry.spec.ts`, `scenario-telemetry-sdk.spec.ts`,
  `breaker-contract.spec.ts`. A spec that needed editing means this epic changed scenario behaviour —
  stop and escalate.
- **browser smoke owed:** yes, to the product owner — **whether the caveats survived the rewrite**
  (D11). Story 1.1 moves a lot of text; a spec counts elements, a human reads meaning.
- **Mutation checks:** hardcode `100` for `MAX_SCENARIO_REQUEST_CAP` and change the constant → the
  bound test goes red. Remove the cross-field check → its spec goes red.
- **deterministic gate:** `npm run typecheck` (all four projects) + `npm run build` + Playwright
  `api` + `check:design-drift` green before merge.
- **Review:** HIGH tier — routed, two cross-family passes + fresh reviewer subagent. **Product owner
  merges.**

## Sprint 1 — Smoke walkthrough (do these in order)
Env: preview (pre-merge) · then production · https://golden-beans-gamma.vercel.app

> Use a **test project** throughout. Nothing in this sprint launches a run — that is Sprint 2 — but
> it writes real definitions.

1. With `SCENARIO_AUTHORING_ENABLED` unset, go to
   https://golden-beans-gamma.vercel.app/app/scenarios/<testProjectSlug>
   → The page is the **read-only evidence view**. No define, launch, kill or revoke control exists.
2. Read the impact-evidence section and the cohort caveats.
   → Every caveat that was there before the rewrite is still there, and still says the same thing.
     **If any caveat softened, that's the bug report** — this step matters more than it looks.
3. Set `SCENARIO_AUTHORING_ENABLED=true` for preview and reload.
   → A "Define a scenario" affordance appears.
4. Start a definition: kind `resilience`, cohort `synthetic`, fault `delay`.
   → The cohort select offers **synthetic and internal only** — no `external`.
   → The fault select offers exactly three options.
5. Set `requestCap` to 10 and `concurrencyCap` to 20.
   → The form tells you concurrency can't exceed the request cap, **before** you submit.
6. Fix it (concurrency 2), choose a compatible immutable delay flag version, enter a reason, and save.
   → It saves. The definition appears in the registry.
7. Change the fault kind.
   → The flag-version select moves to a compatible version or clears and asks for one; a hidden
     incompatible version is never submitted.
8. Look at the registered targets section.
   → Each target shows its state. An unverified one explains what the verification step is and who
     can do it — it doesn't just say "unverified".
9. Revoke a test target.
   → A confirmation dialog names **that target** before anything happens.
10. Unset `SCENARIO_AUTHORING_ENABLED` and reload.
    → Back to step 1's read-only view. The definition you created is **still listed** — the gate
      hides authoring, not evidence.

If any step fails, note the step number + what you saw — that's the bug report.
