<!--
Accumulated corrections for the prose rail (scripts/lib/prose-writer.mjs injects everything below
the `---` into every writer prompt).

HOW TO USE THIS FILE
Every line below is a mistake a real draft actually made and a human had to catch. When you catch a
new one, add a line — that is the whole mechanism by which this rail gets better. Two rules:

  1. Quote the ACTUAL bad sentence. A rule stated abstractly ("be accurate") changes nothing; the
     verbatim failure is what a model can pattern-match against.
  2. If the failure is mechanically detectable, ALSO add it to scripts/lib/prose-guard.mjs with a
     test. A lesson reduces a mistake; a guard rule catches it. Prefer both.

Keep it short. A long file dilutes every line in it, and the guard is where hard enforcement lives.
-->

---

**Never invent a beneficiary.** A real draft wrote _"Tenants now benefit from a new pure-logic
unit-test suite"_ about internal test tooling. Tenants do not run our tests. If a change is
internal, say so plainly and name the real beneficiary — usually whoever builds here next — and the
real effect: a bug class that can no longer reach production unnoticed, a mistake caught in seconds
instead of after a deploy.

**Never report a fix this change did not make.** A real draft wrote _"the previous backslash bypass
is blocked, eliminating a potential open-redirect attack"_ about a commit that only ADDED TESTS for
a fix shipped weeks earlier. Commit messages here routinely cite a past incident to explain why
present work matters — that is context, never the outcome. If the verb belongs to an earlier
change, it is background.

**Finish the last sentence.** A real draft ended _"…broader error handling is planned"_ mid-thought
after running out of room. A trailing fragment reads as a broken tool, not as brevity. Plan the
ending before starting it; stop at the previous full stop instead.

**Never name tools, frameworks or models.** Real drafts leaked _"Playwright"_, _"Gemini"_ and
_"Antigravity"_ despite the brief forbidding it. The reader either knows the stack or does not need
it. Describe the effect, not the machinery.

**Never invent a deadline, a due date or a sign-off.** A real standup draft ended _"design sign-off
on the Sprint 2 layout is owed before tomorrow"_ — no such commitment existed anywhere in the source
data. Commits and roadmap docs contain no deadlines, so any date you attach is fabricated by
construction. This is the most corrosive mistake on this list: it reads as perfectly ordinary
standup language and it makes people chase work nobody agreed to. If something is genuinely owed,
name what and to whom, with no date.

**Say "no user-visible effect" when that is the truth.** It is a correct and useful report. Reaching
for a vague benefit to avoid an honest "this is internal" is the failure that produces every other
one on this list.
