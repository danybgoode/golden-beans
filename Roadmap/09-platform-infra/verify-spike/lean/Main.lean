import Flageval
import Lean.Data.Json

/-!
The differential-test driver: reads a JSON array of cases on stdin, runs the Lean model's
`evaluate` and `explain` on each, and prints a JSON array of results. The rollout hash stays
uninterpreted in the model — each case carries an `admits` table (priority → admitted?) computed by
the TypeScript side with the real FNV-1a, so the test exercises everything EXCEPT the hash.
-/
open Lean Flageval

def scalarOf (j : Json) : Except String Scalar := do
  match (← j.getObjValAs? String "t") with
  | "str" => return .str (← j.getObjValAs? String "v")
  | "num" => return .num (← j.getObjValAs? Int "v")
  | "bool" => return .bool (← j.getObjValAs? Bool "v")
  | t => throw s!"unknown scalar tag {t}"

def clauseOf (j : Json) : Except String Clause := do
  let f ← j.getObjValAs? String "field"
  match (← j.getObjValAs? String "operator") with
  | "equals" => return .equals f (← scalarOf (← j.getObjVal? "value"))
  | "one_of" => return .oneOf f (← (← j.getObjValAs? (Array Json) "values").toList.mapM scalarOf)
  | o => throw s!"unknown operator {o}"

def ruleOf (j : Json) : Except String Rule := do
  let rollout : Option Nat := match j.getObjValAs? Nat "rolloutBasisPoints" with
    | .ok n => some n
    | .error _ => none
  return {
    priority := ← j.getObjValAs? Nat "priority"
    clauses := ← (← j.getObjValAs? (Array Json) "clauses").toList.mapM clauseOf
    rollout := rollout
    variantKey := ← j.getObjValAs? String "variantKey" }

def reasonStr : Reason → String
  | .targetingMatch => "TARGETING_MATCH"
  | .static => "STATIC"
  | .default => "DEFAULT"

def outcomeStr : RuleOutcome → String
  | .matched => "matched"
  | .clauseFailed => "clause_failed"
  | .rolloutExcluded => "rollout_excluded"
  | .rolloutMissingKey => "rollout_missing_targeting_key"
  | .notReached => "not_reached"

def optStr : Option String → Json
  | some s => Json.str s
  | none => Json.null

def optNat : Option Nat → Json
  | some n => toJson n
  | none => Json.null

def runCase (j : Json) : Except String Json := do
  let flagKey ← j.getObjValAs? String "flagKey"
  let ver ← j.getObjValAs? Nat "definitionVersion"
  let dj ← j.getObjVal? "definition"
  let d : Definition := {
    defaultVariantKey := ← dj.getObjValAs? String "defaultVariantKey"
    variantKeys := (← dj.getObjValAs? (Array String) "variantKeys").toList
    rules := ← (← dj.getObjValAs? (Array Json) "rules").toList.mapM ruleOf }
  let ctx : Context ← (← j.getObjValAs? (Array Json) "context").toList.mapM fun p => do
    return (← p.getObjValAs? String "field", ← scalarOf (← p.getObjVal? "value"))
  let table : List (Nat × Bool) ← (← j.getObjValAs? (Array Json) "admits").toList.mapM fun p => do
    return (← p.getObjValAs? Nat "priority", ← p.getObjValAs? Bool "admitted")
  -- The oracle: the TS side's FNV answer for this case, looked up by rule priority.
  let adm : Admits := fun _ _ _ prio _ => (table.lookup prio).getD false
  let callTypeOk ← j.getObjValAs? Bool "callTypeOk"
  let v := evaluate adm flagKey ver d ctx callTypeOk
  let e := explain adm flagKey ver d ctx
  return Json.mkObj [
    ("id", ← j.getObjVal? "id"),
    ("verdict", Json.mkObj [
      ("variant", optStr v.variant), ("reason", reasonStr v.reason),
      ("rulePriority", optNat v.rulePriority)]),
    ("explanation", Json.mkObj [
      ("variantKey", optStr e.variantKey), ("reason", reasonStr e.reason),
      ("matchedPriority", optNat e.matchedPriority),
      ("rules", Json.arr (e.rules.map fun (p, o) =>
        Json.mkObj [("priority", toJson p), ("outcome", outcomeStr o)]).toArray)])]

def main : IO UInt32 := do
  let input ← (← IO.getStdin).readToEnd
  match Json.parse input with
  | .error err => IO.eprintln s!"bad JSON: {err}"; return 1
  | .ok j =>
    match j.getArr? with
    | .error err => IO.eprintln err; return 1
    | .ok cases =>
      match cases.toList.mapM runCase with
      | .error err => IO.eprintln s!"bad case: {err}"; return 1
      | .ok out => IO.println (Json.arr out.toArray).compress; return 0
