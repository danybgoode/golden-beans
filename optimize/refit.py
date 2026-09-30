"""optimize/refit.py — refit the Jev guard thresholds with DSPy ReAnchor, offline (compiled-prompts S1.3).

    npm run optimize:refit          (runs extract.mjs first, then this)

Reads optimize/.cache/stats.json (written by extract.mjs from the REAL Node judges), fits each threshold with
ReAnchor behind a replay client that serves the recorded probabilities (no key, no egress, no cost), and compares
the hand thresholds, the ReAnchor fit and a plain grid fit on the spike's 5 seeded folds. Writes:

  optimize/reports/refit-<date>.md   the table, ReAnchor's own report, and a jev.config.json diff ONLY if held-out improves
  optimize/folds.json                the folds, keyed by fixture id per rail (wording.mjs scores on the same folds)

Dev-only (compiled-prompts D4): Python never ships in the kit. The one thing that crosses back is a reviewed
one-line jev.config.json diff, and only when a fit beats the hand values held-out.

The folds are DSPy's own (`reanchor.calibrate._folds`: `random.Random(0)` shuffle, every 5th): the only definition
of "the spike's 5 seeded folds" there is (D6).
"""

import contextlib
import datetime
import io
import json
import logging
import math
import pathlib
import sys


import dspy
from dspy.experimental import Noul, ReAnchor, TypeSafe
from dspy.teleprompt.reanchor.calibrate import _folds

HERE = pathlib.Path(__file__).resolve().parent
STATS = HERE / ".cache" / "stats.json"
REPORTS = HERE / "reports"
FOLDS = HERE / "folds.json"
FAMILY_FIELD = {  # a DSPy field name per prose family (field names must be identifiers)
    "unsupported-fix-claim": "fix",
    "invented-beneficiary": "beneficiary",
    "flag-state-claim": "live",
    "invented-commitment": "commitment",
}


class Replay(TypeSafe):
    """Serves the recorded probability for each (fixture, field). Never calls TypeSafe."""

    def __init__(self, table):
        super().__init__(model="replay", cache=False)
        self.table = table

    def __call__(self, state, questions):
        row = self.table[state["inputs"]["fixture_id"]]
        return {name: {"noul": row[name]} for name in questions}


def quiet():
    """ReAnchor.compile always draws a per-example progress bar (progress=True is hard-coded) — it buries the table."""
    return contextlib.redirect_stdout(io.StringIO())  # dspy's ParallelExecutor draws on stdout


# ── review: a three-way band, so two Noul fields over the same probability (spike sharp edge 4) ────────────────
# `real`: pass at P ≥ t. `above`: the not-real edge — the rail FAILS at P ≤ notReal, i.e. unless P ≥ nextafter(notReal).
class ReviewSig(dspy.Signature):
    fixture_id: str = dspy.InputField()
    real: Noul = dspy.OutputField(desc="Did the reviewer deliver a verdict on the change? (pass edge)")
    above: Noul = dspy.OutputField(desc="Did the reviewer deliver a verdict on the change? (not-real edge)")


def review_decision(s, real, not_real):
    if s["noul"] is None:
        return s["regexOk"]
    if s["noul"] >= real:
        return True
    if s["noul"] <= not_real:
        return False
    return s["regexOk"]


def prose_decision(s, claim):
    return sorted(c for c, v in s["stats"].items() if v is not None and v >= claim)


def review_right(rows, real, not_real):
    return sum(review_decision(s, real, not_real) == s["label"] for s in rows)


def prose_right(rows, claim):
    return sum(prose_decision(s, claim) == s["label"] for s in rows)


def fit_review(rows, hand):
    by_id = {s["id"]: s for s in rows}
    table = {s["id"]: {"real": s["noul"] or 0.0, "above": s["noul"] or 0.0} for s in rows}

    def metric(example, pred, trace=None):
        s = by_id[example.fixture_id]
        if s["noul"] is None:
            decision = s["regexOk"]
        elif pred.real.value:
            decision = True
        elif not pred.above.value:
            decision = False
        else:
            decision = s["regexOk"]
        return float(decision == s["label"])

    program = dspy.Predict(ReviewSig)
    program.fields = {
        "real": {"threshold": hand["real"]},
        "above": {"threshold": math.nextafter(hand["notReal"], 1.0)},  # ≤ notReal fails ⇔ not (≥ nextafter)
    }
    examples = [dspy.Example(fixture_id=s["id"]).with_inputs("fixture_id") for s in rows]
    optimizer = ReAnchor(metric, require_cache=False)
    with dspy.context(lm=Replay(table)), quiet():
        fitted = optimizer.compile(program, trainset=examples)
    real = fitted.fields["real"]["threshold"]
    not_real = math.nextafter(fitted.fields["above"]["threshold"], 0.0)
    return {"real": real, "notReal": not_real}, optimizer.report


def fit_prose(rows, hand, families):
    by_id = {s["id"]: s for s in rows}
    fields = [FAMILY_FIELD[c] for c in families]
    sig = dspy.Signature(
        {"fixture_id": (str, dspy.InputField())}
        | {f: (Noul, dspy.OutputField(desc=f"Does the sentence make a {f} claim?")) for f in fields}
    )
    # A family the judge never raises for a fixture is threshold-independent: the metric ignores its probability.
    table = {s["id"]: {FAMILY_FIELD[c]: (v if v is not None else 0.0) for c, v in s["stats"].items()} for s in rows}

    def metric(example, pred, trace=None):
        s = by_id[example.fixture_id]
        raised = sorted(c for c in families if s["stats"][c] is not None and getattr(pred, FAMILY_FIELD[c]).value)
        return float(raised == s["label"])

    program = dspy.Predict(sig)
    program.fields = {f: {"threshold": hand["claim"]} for f in fields}
    examples = [dspy.Example(fixture_id=s["id"]).with_inputs("fixture_id") for s in rows]
    optimizer = ReAnchor(metric, require_cache=False)
    with dspy.context(lm=Replay(table)), quiet():
        fitted = optimizer.compile(program, trainset=examples)
    return {c: fitted.fields[FAMILY_FIELD[c]]["threshold"] for c in families}, optimizer.report


# ── the no-DSPy control: an exhaustive grid refit, the overfit ReAnchor's fold check exists to refuse ──────────────
def midpoints(values):
    v = sorted(set(values))
    return [(a + b) / 2 for a, b in zip(v, v[1:])] + v


def grid_review(rows, hand):
    ps = [s["noul"] for s in rows if s["noul"] is not None] + [0.0, 1.0]
    cand = midpoints(ps)
    best = (review_right(rows, hand["real"], hand["notReal"]), 0.0, hand["real"], hand["notReal"])
    for r in cand:
        for n in (c for c in cand if c < r):
            score = review_right(rows, r, n)
            dist = -abs(r - hand["real"]) - abs(n - hand["notReal"])
            if (score, dist) > best[:2]:
                best = (score, dist, r, n)
    return {"real": best[2], "notReal": best[3]}


def grid_prose(rows, hand):
    ps = [v for s in rows for v in s["stats"].values() if v is not None] + [0.0, 1.0]
    best = (prose_right(rows, hand["claim"]), 0.0, hand["claim"])
    for t in midpoints(ps):
        score = prose_right(rows, t)
        if (score, -abs(t - hand["claim"])) > best[:2]:
            best = (score, -abs(t - hand["claim"]), t)
    return {"claim": best[2]}


def prose_right_per_family(rows, per_family):
    """Right with a threshold PER family (what ReAnchor fits) — only a shared one exists in jev.config.json."""
    return sum(
        sorted(c for c, v in s["stats"].items() if v is not None and v >= per_family[c]) == s["label"] for s in rows
    )


def held_out(rows, folds, fit, score):
    """Fit on every fold but one, score on the held-out fold, sum. The only numbers that count as evidence (D6)."""
    total = 0
    for fold in folds:
        out = set(fold)
        train = [s for i, s in enumerate(rows) if i not in out]
        test = [rows[i] for i in fold]
        total += score(test, fit(train))
    return total


def fmt(x):
    return f"{x:.3f}".rstrip("0").rstrip(".") if isinstance(x, float) else str(x)


def main():
    logging.getLogger("dspy").setLevel(logging.WARNING)
    dspy.settings.configure(disable_history=True)
    if not STATS.exists():
        sys.exit("refit: optimize/.cache/stats.json is missing — run `node optimize/extract.mjs` (or npm run optimize:refit)")
    stats = json.loads(STATS.read_text())
    if stats["parity"]["mismatches"]:
        sys.exit("refit: extract.mjs's parity check failed — the reduction does not match the judge; refusing to fit")
    hand = stats["thresholds"]
    families = stats["families"]
    review, prose = stats["review"], stats["prose"]
    folds = {"review": _folds(len(review)), "prose": _folds(len(prose))}

    FOLDS.write_text(
        json.dumps(
            {
                "$comment": "DSPy reanchor.calibrate._folds (random.Random(0), every 5th), keyed by fixture id per rail — written by optimize/refit.py; optimize/wording.mjs scores on the same folds (compiled-prompts D6). Regenerate with npm run optimize:refit when the fixtures change.",
                "model": stats["model"],
                **{
                    rail: {rows[i]["id"]: k for k, fold in enumerate(folds[rail]) for i in fold}
                    for rail, rows in (("review", review), ("prose", prose))
                },
            },
            indent=2,
        )
        + "\n"
    )

    # Fit on ALL fixtures (what would be proposed), then 5-fold held-out for hand, ReAnchor and the grid.
    r_fit, r_report = fit_review(review, hand)
    p_fit, p_report = fit_prose(prose, hand, families)
    r_grid, p_grid = grid_review(review, hand), grid_prose(prose, hand)

    r_hand_all = review_right(review, hand["real"], hand["notReal"])
    p_hand_all = prose_right(prose, hand["claim"])
    held = {
        "review": {
            "hand": held_out(review, folds["review"], lambda t: hand, lambda rows, t: review_right(rows, t["real"], t["notReal"])),
            "reanchor": held_out(review, folds["review"], lambda t: fit_review(t, hand)[0], lambda rows, t: review_right(rows, t["real"], t["notReal"])),
            "grid": held_out(review, folds["review"], lambda t: grid_review(t, hand), lambda rows, t: review_right(rows, t["real"], t["notReal"])),
        },
        "prose": {
            "hand": held_out(prose, folds["prose"], lambda t: hand, lambda rows, t: prose_right(rows, t["claim"])),
            "reanchor": held_out(prose, folds["prose"], lambda t: fit_prose(t, hand, families)[0], prose_right_per_family),
            "grid": held_out(prose, folds["prose"], lambda t: grid_prose(t, hand), lambda rows, t: prose_right(rows, t["claim"])),
        },
    }

    review_kept = math.isclose(r_fit["real"], hand["real"]) and math.isclose(r_fit["notReal"], hand["notReal"])
    prose_kept = all(math.isclose(v, hand["claim"]) for v in p_fit.values())
    improves = {rail: held[rail]["reanchor"] > held[rail]["hand"] for rail in held}
    today = datetime.date.today().isoformat()

    table = [
        "| Rail | Hand thresholds (all) | ReAnchor fit (all) | Grid fit (all) | **Held-out, 5-fold: hand · ReAnchor · grid** |",
        "|---|---|---|---|---|",
        f"| review ({len(review)}) | {r_hand_all} right at {fmt(hand['real'])} / {fmt(hand['notReal'])} | "
        f"{'**kept** ' if review_kept else ''}{fmt(r_fit['real'])} / {fmt(r_fit['notReal'])} | "
        f"{fmt(r_grid['real'])} / {fmt(r_grid['notReal'])} → {review_right(review, r_grid['real'], r_grid['notReal'])} right | "
        f"**{held['review']['hand']} · {held['review']['reanchor']} · {held['review']['grid']}** correct |",
        f"| prose ({len(prose)}, exact code set) | {p_hand_all} right at {fmt(hand['claim'])} | "
        f"{'**kept** ' + fmt(hand['claim']) + ' for all four families' if prose_kept else ', '.join(f'{FAMILY_FIELD[c]} {fmt(v)}' for c, v in p_fit.items())} | "
        f"{fmt(p_grid['claim'])} → {prose_right(prose, p_grid['claim'])} right | "
        f"**{held['prose']['hand']} · {held['prose']['reanchor']} · {held['prose']['grid']}** correct |",
    ]
    proposal = []
    if improves["review"]:
        proposal.append(f'rails.review.thresholds: {{ "real": {fmt(r_fit["real"])}, "notReal": {fmt(r_fit["notReal"])} }}')
    if improves["prose"]:
        proposal.append(
            "rails.prose: ReAnchor's per-family fit beats the hand value held-out, but jev.config.json has ONE shared "
            f"claim threshold (spike sharp edge 6) — fitted {', '.join(f'{FAMILY_FIELD[c]} {fmt(v)}' for c, v in p_fit.items())}"
        )
    verdict = (
        "**Proposed `jev.config.json` change (a reviewed PR, product owner's OK first):**\n\n"
        + "\n".join(f"- {p}" for p in proposal)
        if proposal
        else "**No change proposed.** No fit beats the hand thresholds held-out, so `jev.config.json` stays as it is."
    )
    report = "\n".join(
        [
            f"# ReAnchor refit — {today}",
            "",
            f"Offline, {len(review) + len(prose)} recorded fixtures, `{stats['model']}`, DSPy {dspy.__version__}. "
            f"Statistics from the real Node judges (`optimize/extract.mjs`); parity check **{stats['parity']['checks']} "
            f"checks, {stats['parity']['mismatches']} mismatches**. Folds: DSPy's `_folds` (seed 0), written to "
            "`optimize/folds.json`.",
            "",
            *table,
            "",
            verdict,
            "",
            "## ReAnchor's own report (fit on all fixtures)",
            "",
            "```json",
            json.dumps({"review": r_report, "prose": p_report}, indent=2, default=str),
            "```",
            "",
        ]
    )
    REPORTS.mkdir(exist_ok=True)
    path = REPORTS / f"refit-{today}.md"
    path.write_text(report)
    print("\n".join(table))
    print()
    print(verdict)
    print(f"\nreport → {path.relative_to(HERE.parent)}")


if __name__ == "__main__":
    main()
