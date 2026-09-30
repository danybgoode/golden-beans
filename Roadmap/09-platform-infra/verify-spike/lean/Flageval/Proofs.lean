import Flageval.Model

/-!
verify-spike S1.2 — the theorems.

  * `agreement`: for every parsed definition, every validated context, every hash, and a
    type-correct call, the explanation names the same variant, the same reason and the same rule
    as the verdict.
  * `callSite_gap`: when the CALL is type-incorrect (wrong `expectedType` or a `defaultValue` of
    the wrong type), the verdict is always DEFAULT with no variant, while the explanation always
    names a variant and never says DEFAULT. The preview screen cannot know the caller's types, so
    this disagreement is structural, not a bug in either function.
  * `explain_covers_every_rule`: the explanation has exactly one entry per rule.
  * `at_most_one_matched`: at most one rule is ever reported as `matched`.
-/
namespace Flageval

variable (adm : Admits) (flagKey : String) (ver : Nat) (ctx : Context)

/-- Once a rule has matched, the loop's answer never changes. -/
theorem explainLoop_some_fst (rs : List Rule) (m : Rule) (acc : List (Nat × RuleOutcome)) :
    (explainLoop adm flagKey ver ctx rs (some m) acc).1 = some m := by
  induction rs generalizing acc with
  | nil => rfl
  | cons r rs ih => simp only [explainLoop]; exact ih _

/-- Before any rule has matched, the loop finds exactly what `find? matchesRule` finds. -/
theorem explainLoop_none_fst (rs : List Rule) (acc : List (Nat × RuleOutcome)) :
    (explainLoop adm flagKey ver ctx rs none acc).1 = rs.find? (matchesRule adm flagKey ver ctx) := by
  induction rs generalizing acc with
  | nil => rfl
  | cons r rs ih =>
    simp only [explainLoop, List.find?_cons]
    by_cases hf : (firstFailing ctx r).isSome
    · have hm : matchesRule adm flagKey ver ctx r = false := by
        simp [matchesRule, Option.isNone_iff_eq_none, Option.isSome_iff_ne_none] at hf ⊢
        simp [hf]
      simp [hf, hm, ih]
    · have hn : (firstFailing ctx r).isNone = true := by
        simpa [Option.isNone_iff_eq_none, Option.isSome_iff_ne_none] using hf
      simp only [hf, Bool.false_eq_true, ↓reduceIte]
      cases ho : rolloutOutcome adm flagKey ver ctx r with
      | noRollout =>
        simp [matchesRule, hn, ho, explainLoop_some_fst]
      | admitted =>
        simp [matchesRule, hn, ho, explainLoop_some_fst]
      | excluded =>
        simp [matchesRule, hn, ho, ih]
      | missingKey =>
        simp [matchesRule, hn, ho, ih]

theorem mem_ordered {d : Definition} {r : Rule} (h : r ∈ ordered d) : r ∈ d.rules := by
  unfold ordered at h
  exact (List.mem_mergeSort).mp h

/-- **Explanation ⇔ verdict agreement** for a type-correct call. Holds for EVERY rollout hash. -/
theorem agreement (d : Definition) (wf : WF d) :
    let e := explain adm flagKey ver d ctx
    let v := evaluate adm flagKey ver d ctx true
    e.variantKey = v.variant ∧ e.reason = v.reason ∧ e.matchedPriority = v.rulePriority := by
  simp only [explain, evaluate]
  rw [explainLoop_none_fst]
  cases hfind : (ordered d).find? (matchesRule adm flagKey ver ctx) with
  | none =>
    have hdef : d.defaultVariantKey ∈ d.variantKeys := wf.1
    simp [hdef]
  | some r =>
    have hmem : r ∈ ordered d := List.mem_of_find?_eq_some hfind
    have hkey : r.variantKey ∈ d.variantKeys := wf.2 r (mem_ordered hmem)
    simp [hkey]

/-- **The call-site gap.** A type-incorrect call always gets DEFAULT and no variant; the
    explanation of the same flag and context always names a variant and never says DEFAULT. -/
theorem callSite_gap (d : Definition) :
    evaluate adm flagKey ver d ctx false = refused ∧
    (explain adm flagKey ver d ctx).reason ≠ .default ∧
    (explain adm flagKey ver d ctx).variantKey.isSome := by
  refine ⟨by simp [evaluate], ?_, by simp [explain]⟩
  simp only [explain]
  split <;> simp

theorem explainLoop_length (rs : List Rule) (m : Option Rule) (acc : List (Nat × RuleOutcome)) :
    (explainLoop adm flagKey ver ctx rs m acc).2.length = acc.length + rs.length := by
  induction rs generalizing m acc with
  | nil => simp [explainLoop]
  | cons r rs ih =>
    cases m with
    | some m => simp only [explainLoop]; rw [ih]; simp; omega
    | none =>
      simp only [explainLoop]
      split
      · rw [ih]; simp; omega
      · split <;> (rw [ih]; simp; omega)

/-- Every rule gets exactly one line in the explanation. -/
theorem explain_covers_every_rule (d : Definition) :
    (explain adm flagKey ver d ctx).rules.length = d.rules.length := by
  simp only [explain]
  rw [explainLoop_length]
  simp [ordered, List.length_mergeSort]

def matchedCount (l : List (Nat × RuleOutcome)) : Nat :=
  (l.filter (fun p => p.2 == .matched)).length

theorem explainLoop_some_count (rs : List Rule) (m : Rule) (acc : List (Nat × RuleOutcome)) :
    matchedCount (explainLoop adm flagKey ver ctx rs (some m) acc).2 = matchedCount acc := by
  induction rs generalizing acc with
  | nil => rfl
  | cons r rs ih =>
    simp only [explainLoop]; rw [ih]; simp [matchedCount, List.filter_append]

theorem explainLoop_none_count (rs : List Rule) (acc : List (Nat × RuleOutcome)) :
    matchedCount (explainLoop adm flagKey ver ctx rs none acc).2 ≤ matchedCount acc + 1 := by
  induction rs generalizing acc with
  | nil => simp [explainLoop]
  | cons r rs ih =>
    simp only [explainLoop]
    split
    · have := ih (acc ++ [(r.priority, .clauseFailed)])
      simp [matchedCount, List.filter_append] at this ⊢; omega
    · split
      · have := ih (acc ++ [(r.priority, .rolloutExcluded)])
        simp [matchedCount, List.filter_append] at this ⊢; omega
      · have := ih (acc ++ [(r.priority, .rolloutMissingKey)])
        simp [matchedCount, List.filter_append] at this ⊢; omega
      · rw [explainLoop_some_count]; simp [matchedCount, List.filter_append]

/-- At most one rule is ever reported as the match. -/
theorem at_most_one_matched (d : Definition) :
    matchedCount (explain adm flagKey ver d ctx).rules ≤ 1 := by
  simp only [explain]
  have := explainLoop_none_count adm flagKey ver ctx (ordered d) []
  simpa [matchedCount] using this

end Flageval
