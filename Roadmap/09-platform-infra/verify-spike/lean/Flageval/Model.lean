/-
verify-spike S1.2 — a Lean 4 model of `evaluateFlag` and `explainFlagEvaluation`
(packages/sdk/src/flags.ts, read 2026-09-29 on main e20afca).

What is modelled, and what is abstracted:
  * Definitions are modelled AFTER `parseFlagDefinition` succeeded. The parser's guarantees become
    the `WF` hypothesis: the default and every rule's variantKey name a real variant. (It also
    guarantees unique priorities and type-correct variant values; the model does not need either.)
  * Variant VALUES are abstracted away: only keys are modelled. The parser already guarantees each
    value matches `valueType`, so the per-variant type check in `evaluateFlag` cannot fire.
  * The call-site checks (`validValueForType(defaultValue, expectedType)` and
    `definition.valueType === expectedType`) are one boolean, `callTypeOk`. The explanation has no
    such input, which is exactly the gap the `callSite_gap` theorem states.
  * Contexts are modelled AFTER the INVALID_CONTEXT check passed (every value a valid scalar).
  * The FNV-1a rollout hash is UNINTERPRETED: `Admits` is any function. Every theorem holds for
    every hash, so none of them depends on FNV, UTF-16 code units or `Math.imul`.
  * Numbers are `Int`: context and clause numbers are safe integers (validScalar), so JS `===` on
    them is integer equality.
-/
namespace Flageval

inductive Scalar where
  | str (s : String)
  | num (n : Int)
  | bool (b : Bool)
  deriving DecidableEq, Repr

/-- A validated evaluation context: field → scalar. -/
abbrev Context := List (String × Scalar)

def Context.get (c : Context) (f : String) : Option Scalar :=
  (c.find? (fun p => p.1 == f)).map (·.2)

inductive Clause where
  | equals (field : String) (value : Scalar)
  | oneOf (field : String) (values : List Scalar)
  deriving Repr

structure Rule where
  priority : Nat
  clauses : List Clause
  /-- `rollout.basisPoints`, when the rule has a rollout. -/
  rollout : Option Nat
  variantKey : String
  deriving Repr

structure Definition where
  defaultVariantKey : String
  variantKeys : List String
  rules : List Rule
  deriving Repr

/-- What `parseFlagDefinition` guarantees about variant references. -/
def WF (d : Definition) : Prop :=
  d.defaultVariantKey ∈ d.variantKeys ∧ ∀ r ∈ d.rules, r.variantKey ∈ d.variantKeys

/-- The rollout hash, uninterpreted: (targetingKey, flagKey, definitionVersion, priority, basisPoints)
    ↦ does the bucket admit? In TS: `rolloutFraction(JSON.stringify([...])) < basisPoints / 10_000`. -/
abbrev Admits := String → String → Nat → Nat → Nat → Bool

/-- ECMAScript WhiteSpace ∪ LineTerminator — what JS `String.prototype.trim` removes. Lean's own
    `Char.isWhitespace` is narrower (no U+00A0, U+FEFF, …), so it is NOT used here. -/
def jsWhitespace (c : Char) : Bool :=
  let n := c.toNat
  n == 0x09 || n == 0x0A || n == 0x0B || n == 0x0C || n == 0x0D || n == 0x20 || n == 0xA0 ||
  n == 0x1680 || (0x2000 ≤ n && n ≤ 0x200A) || n == 0x2028 || n == 0x2029 || n == 0x202F ||
  n == 0x205F || n == 0x3000 || n == 0xFEFF

/-- `value.trim().length > 0` in JS. -/
def nonBlank (s : String) : Bool := s.toList.any (fun c => !jsWhitespace c)

def clauseFails (ctx : Context) : Clause → Bool
  | .equals f v => match ctx.get f with
    | none => true
    | some a => a != v
  | .oneOf f vs => match ctx.get f with
    | none => true
    | some a => !(vs.contains a)

/-- `firstFailingClause` -/
def firstFailing (ctx : Context) (r : Rule) : Option Clause :=
  r.clauses.find? (clauseFails ctx)

inductive RolloutOutcome where
  | noRollout | admitted | excluded | missingKey
  deriving DecidableEq, Repr

/-- `rolloutOutcome`. Context strings are already ≤ 256 code points and NUL-free (validScalar), so
    `validText(targetingKey, 256)` reduces to the non-blank check. -/
def rolloutOutcome (adm : Admits) (flagKey : String) (ver : Nat) (ctx : Context) (r : Rule) :
    RolloutOutcome :=
  match r.rollout with
  | none => .noRollout
  | some bp =>
    match ctx.get "targetingKey" with
    | some (.str tk) =>
      if nonBlank tk then (if adm tk flagKey ver r.priority bp then .admitted else .excluded)
      else .missingKey
    | _ => .missingKey

/-- `matchesRule` = clausesMatch ∧ rolloutAdmits. -/
def matchesRule (adm : Admits) (flagKey : String) (ver : Nat) (ctx : Context) (r : Rule) : Bool :=
  (firstFailing ctx r).isNone &&
    (match rolloutOutcome adm flagKey ver ctx r with
     | .noRollout | .admitted => true
     | _ => false)

/-- `[...rules].sort((l, r) => l.priority - r.priority)`. Priorities are unique (parser), so the
    order is total and stability never matters. -/
def ordered (d : Definition) : List Rule :=
  d.rules.mergeSort (fun a b => decide (a.priority ≤ b.priority))

inductive Reason where
  | targetingMatch | static | default
  deriving DecidableEq, Repr

structure Verdict where
  variant : Option String
  reason : Reason
  rulePriority : Option Nat
  deriving DecidableEq, Repr

def refused : Verdict := ⟨none, .default, none⟩

/-- `evaluateFlag`, from the point the definition parsed and the context validated. -/
def evaluate (adm : Admits) (flagKey : String) (ver : Nat) (d : Definition) (ctx : Context)
    (callTypeOk : Bool) : Verdict :=
  if !callTypeOk then refused
  else
    match (ordered d).find? (matchesRule adm flagKey ver ctx) with
    | some r =>
      if d.variantKeys.contains r.variantKey then ⟨some r.variantKey, .targetingMatch, some r.priority⟩
      else refused
    | none =>
      if d.variantKeys.contains d.defaultVariantKey then ⟨some d.defaultVariantKey, .static, none⟩
      else refused

inductive RuleOutcome where
  | matched | clauseFailed | rolloutExcluded | rolloutMissingKey | notReached
  deriving DecidableEq, Repr

structure Explanation where
  variantKey : Option String
  reason : Reason
  matchedPriority : Option Nat
  rules : List (Nat × RuleOutcome)
  deriving Repr

/-- The `for (const rule of ordered)` loop in `explainFlagEvaluation`, transcribed. -/
def explainLoop (adm : Admits) (flagKey : String) (ver : Nat) (ctx : Context) :
    List Rule → Option Rule → List (Nat × RuleOutcome) → Option Rule × List (Nat × RuleOutcome)
  | [], m, acc => (m, acc)
  | r :: rs, some m, acc => explainLoop adm flagKey ver ctx rs (some m) (acc ++ [(r.priority, .notReached)])
  | r :: rs, none, acc =>
    if (firstFailing ctx r).isSome then
      explainLoop adm flagKey ver ctx rs none (acc ++ [(r.priority, .clauseFailed)])
    else
      match rolloutOutcome adm flagKey ver ctx r with
      | .excluded => explainLoop adm flagKey ver ctx rs none (acc ++ [(r.priority, .rolloutExcluded)])
      | .missingKey => explainLoop adm flagKey ver ctx rs none (acc ++ [(r.priority, .rolloutMissingKey)])
      | _ => explainLoop adm flagKey ver ctx rs (some r) (acc ++ [(r.priority, .matched)])

/-- `explainFlagEvaluation`, from the point the definition parsed and the context validated. -/
def explain (adm : Admits) (flagKey : String) (ver : Nat) (d : Definition) (ctx : Context) :
    Explanation :=
  let (m, entries) := explainLoop adm flagKey ver ctx (ordered d) none []
  { variantKey := some ((m.map (·.variantKey)).getD d.defaultVariantKey)
    reason := if m.isSome then .targetingMatch else .static
    matchedPriority := m.map (·.priority)
    rules := entries }

end Flageval
