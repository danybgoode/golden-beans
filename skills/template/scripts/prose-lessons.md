<!--
  prose-lessons.md — accumulated corrections, injected into EVERY writer prompt on BOTH backends
  (scripts/lib/prose-writer.mjs's loadLessons, and the routine brief for the standup/weekly).

  HOW TO USE THIS FILE
  Every line below is a mistake a real draft actually made and a human had to catch. When you catch a
  new one, add a line — that is the whole mechanism by which this rail gets better. Two rules:

    1. Quote the ACTUAL bad sentence. A rule stated abstractly ("be accurate") changes nothing; the
       verbatim failure is what a model can pattern-match against.
    2. If the failure is mechanically detectable, ALSO add it to scripts/lib/prose-guard.mjs with a
       test. A lesson reduces a mistake; a guard catches it. Prefer both.

  Keep it short. A long file dilutes every line in it, and the guard is where hard enforcement lives.

  Provenance: the first six lessons are inherited from golden-beans, where they were measured on a
  live rail rather than imagined — a cheap model given a dense engineering commit produced material
  falsehoods on two of its first three runs. They are kept verbatim because the failures they
  describe are model behaviour, not repo-specific. The flag-state lesson is ours.
-->

---

**Never invent a beneficiary.** A real draft wrote _"Tenants now benefit from a new pure-logic
unit-test suite"_ about internal test tooling. Tenants do not run our tests. If a change is
internal, say so plainly and name the real beneficiary — usually whoever builds here next — and the
real effect: a bug class that can no longer reach production unnoticed, a mistake caught in seconds
instead of after a deploy.

**Never report a fix this change did not make.** A real draft wrote _"the previous backslash bypass
is blocked, eliminating a potential open-redirect attack"_ about a commit that only ADDED TESTS for
a fix shipped weeks earlier. Commit messages and roadmap docs here routinely cite a past incident to
explain why present work matters — that is context, never the outcome. If the verb belongs to an
earlier change, it is background.

**Never claim a capability is live when its flag is off.** In the project these lessons were first
learned in, five flag-gated epics shipped in a fortnight, every one of them born OFF. "Accounts can
now be handed to a partner" is FALSE when `partner_handoff_enabled` is off — the correct sentence is that
the rail is built and stays dark until the flag is flipped. This is our highest-risk falsehood
because it reads as good news and nobody checks a flag before believing a report.

**Never invent a deadline, a due date or a sign-off.** A real standup draft ended _"design sign-off
on the Sprint 2 layout is owed before tomorrow"_ — no such commitment existed anywhere in the source
data. Commits and roadmap docs contain no deadlines, so any date you attach is fabricated by
construction. This is the most corrosive mistake on this list: it reads as perfectly ordinary
standup language and it makes people chase work nobody agreed to. If something is genuinely owed,
name what and to whom, with no date.

**Never name tools, frameworks or models.** Real drafts leaked _"Playwright"_, _"Gemini"_ and
_"Antigravity"_ despite the brief forbidding it. The reader either knows the stack or does not need
it. Describe the effect, not the machinery.

**Finish the last sentence.** A real draft ended _"…broader error handling is planned"_ mid-thought
after running out of room. A trailing fragment reads as a broken tool, not as brevity. Plan the
ending before starting it; stop at the previous full stop instead.

**Say "no user-visible effect" when that is the truth.** It is a correct and useful report. Reaching
for a vague benefit to avoid an honest "this is internal" is the failure that produces every other
one on this list.
