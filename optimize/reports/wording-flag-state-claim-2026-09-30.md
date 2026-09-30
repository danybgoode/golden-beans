# Wording run — `flag-state-claim` (live), 2026-09-30

Model `jev-1.13.0`, claim threshold 0.8 (configured), 163 labelled prose drafts on the spike's 5 seeded folds (`optimize/folds.json`). Every wording scored through the real `judgeProse`, the other three families replayed from the recordings. Candidate answers come from the wording cache (this invocation sent 0 request(s); 5 candidate(s) were fully cached). This file is REGENERATED on every run — commentary belongs in a sibling file.

**The rule (D6):** a candidate wins only if its held-out total beats the current wording by ≥ 2 drafts and it is worse on no more than 1 fold. The refit column is information only.

| Wording | Held-out right (folds 1–5) | **Total** | vs current | Family right | Decided | Refit column (per-fold t) | Verdict |
|---|---|---|---|---|---|---|---|
| current | 28 · 29 · 30 · 26 · 28 | **141/163** (86.5%) | — | 144/163 | 163/163 | 137 (0.8, 0.7, 0.7, 0.8, 0.8) | — |
| examples-extended | 30 · 30 · 30 · 26 · 30 | **146/163** (89.6%) | +5 | 149/163 | 163/163 | 146 (0.8, 0.8, 0.8, 0.8, 0.8) | **wins** |
| running-for-real | 26 · 29 · 24 · 24 · 26 | **129/163** (79.1%) | -12 | 132/163 | 163/163 | 126 (0.7, 0.5, 0.7, 0.65, 0.5) | **loses** |
| needs-production-proof | 27 · 27 · 27 · 25 · 25 | **131/163** (80.4%) | -10 | 134/163 | 163/163 | 129 (0.8, 0.7, 0.75, 0.7, 0.7) | **loses** |
| state-vs-history-short | 25 · 28 · 27 · 26 · 27 | **133/163** (81.6%) | -8 | 136/163 | 163/163 | 129 (0.85, 0.55, 0.85, 0.55, 0.55) | **loses** |
| reader-would-believe | 25 · 26 · 26 · 25 · 26 | **128/163** (78.5%) | -13 | 131/163 | 163/163 | 136 (0.7, 0.7, 0.7, 0.7, 0.7) | **loses** |

**Winner: `examples-extended`** (+5 held out). Adoption is a SEPARATE PR: edit `scripts/lib/jev-questions/prose.json` (and its `measured` block), re-record with `node scripts/jev-eval.mjs --live`, merge only with the product owner's OK.

## The wordings

### current (`7c641634e825b892`)

_Why:_ The committed wording (scripts/lib/jev-questions/prose.json).

> Does `sentence` claim that a capability has been SWITCHED ON for real use — its release state, not its behaviour? Examples of such claims: "is live", "went live", "is now enabled", "is rolled out to everyone", "is now available", "is running in production", "the switch has been flipped", "X can now do Y" (a newly usable capability), "as of this morning people can…".
>
> **true:** It states as fact that something is on / live / released / available for use now.
>
> **false:** It only describes what a change does or how something behaves ("now groups", "now checks", "no longer breaks", "now caught in seconds", "benefit from", "validates", "won't get stuck"); or it claims a fix or a benefit without claiming a release state; or it says the thing is NOT live, dark, off, or not yet available.

### examples-extended (`7d1e4f13603938a7`)

_Why:_ The smallest change: the current wording, with the missed state phrasings added to TRUE and the false-alarm shapes added to FALSE. Tests whether examples alone move the overlap.

> Does `sentence` claim that a capability has been SWITCHED ON for real use — its release state, not its behaviour? Examples of such claims: "is live", "went live", "is now enabled", "is rolled out to everyone", "is now available", "is running in production", "deployed to production", "serves 100% of traffic", "the flag is ON", "default-ON", "is redeemable", "now loads on every page", "the switch has been flipped", "X can now do Y" (a newly usable capability), "as of this morning people can…".
>
> **true:** It states as fact that something is on / live / deployed / serving / released / available for use now, in a real environment.
>
> **false:** It only describes what a change does or how something behaves ("now groups", "now checks", "no longer breaks", "benefit from", "validates"); or it is a shipped/merged/status line or date ("Shipped: 2026-06-23", "✅ shipped", "merged as #12"); or it describes an action someone took on something ("minted the live coupon"); or it is an instruction or template placeholder; or it says the thing is NOT live, dark, off, or not yet available.

### running-for-real (`6054aabf823d81cd`)

_Why:_ Reframes the question around the RUNTIME fact (what is running where) rather than release vocabulary — the misses are all runtime facts, the false alarms are all delivery/history facts.

> Does `sentence` state, as a present fact, that something is RUNNING or ON in a real environment right now — deployed and serving, a flag or switch set to ON, a page or container loading for real visitors, a code or coupon usable by real people?
>
> **true:** Yes: it asserts a current runtime state in a real environment — "serves 100% traffic", "deployed to Cloud Run", "the flag is ON in production", "now loads across every surface", "is redeemable", "reads activo", "is live".
>
> **false:** No: it reports delivery or history rather than a running state — built, merged, shipped on a date, a status line, a verification that was performed, an action someone took; or it describes what the code does; or it is a template, heading or instruction; or it says the thing is off, dark or not yet available.

### needs-production-proof (`cdfc656152feb727`)

_Why:_ Asks the question the guard exists for: would this sentence need production evidence to be true? That is exactly the corroboration the evidence gate (liveFlags) supplies.

> The draft may only say something is live if the evidence proves it. Would `sentence` be FALSE if the thing it talks about were merged but still switched off in production — i.e. does it assert that something is on, deployed, serving or usable by real people right now?
>
> **true:** Yes: the sentence is only true if the thing is actually on/serving/usable now — e.g. it is deployed and taking traffic, a flag is ON, a page or tag loads for real visitors, a coupon is redeemable, it "is live".
>
> **false:** No: the sentence stays true even if the thing were merged but switched off — it describes what was built, merged or shipped (with or without a date), a status line, what the code does or how it behaves, an action someone took, a plan, a template or heading, or it says the thing is off.

### state-vs-history-short (`c966eaffe8924dd6`)

_Why:_ A short, contrastive wording: the long example lists in the current question may be what drags plain state sentences into the uncertain band.

> Does `sentence` say that something IS on, live, deployed, serving or usable in a real environment now — as opposed to saying it was built, merged or shipped, or describing what it does?
>
> **true:** It says something is currently on, live, deployed, serving traffic, loading for visitors, or usable by real people.
>
> **false:** It says something was built, merged or shipped (including a dated or ✅ status line), describes behaviour or an action someone took, is a heading, template or instruction, or says the thing is off or not yet available.

### reader-would-believe (`65cc52ccb0dcf221`)

_Why:_ Puts the judgement in the reader's head — would a stakeholder reading this conclude users can use it today? — which is the harm the guard prevents, and may generalise past vocabulary.

> After reading `sentence`, would a stakeholder believe that something is switched on and working for real users or real traffic today?
>
> **true:** Yes: they would conclude it is on, deployed, serving, loading or usable for real people now — whether the sentence says "is live" or states it through a runtime detail (100% traffic, flag ON, redeemable, loads on every page).
>
> **false:** No: they would only learn that work was done, merged or shipped, what the code does, what someone did, or what is planned — or they would read it as off, dark or not yet available; a template or heading tells them nothing.

