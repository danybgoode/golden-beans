<!--
  merge.task.md — the per-surface task block for a MERGE / DEPLOY notification.

  Composed after cpo-persona.md and the accumulated lessons, before the commit evidence. Narrows
  altitude, audience and length; must never contradict the persona.

  Written LOCALLY by devin → agy (README D1) — this surface runs from a git hook on the machine that
  pulled the merge, so the local writer rail is authenticated and available. It is NOT a routine.

  Everything above the first `---` is stripped before sending.
-->

---

## Task: write the MERGE NOTIFICATION

One reader, on their phone, minutes after a merge. The deploy notification carrying your text already
shows the commit header, the author and a link to the diff — **so do not restate any of it.**

**Length: 2–4 sentences, 60 words maximum.** This sits under a commit header in a chat message, not
in a newsletter. If you cannot say it in sixty words you have not decided what the point is yet.

The single question to answer: **what is now true that was not true before this merge?**

- **Lead with the person, not the change.** A customer setting up an account, a partner, an admin
  mid-task, or the product owner themselves. If the work is internal, say so plainly and name the real
  beneficiary — usually whoever builds here next — and the real effect: a mistake now caught in
  seconds instead of after a deploy, a bug class that can no longer reach production unnoticed.
- **One sentence on the decision**, if the merge embodies one — something chosen over an obvious
  alternative, or deliberately left out. That is the sentence the diff cannot show, and it is the
  most valuable thing you can write here.
- **Say what is still owed** if this is a step rather than a finished thing. Do not imply
  completeness that isn't there.

Remember the hard rules from the persona and the lessons: never name files, tools, frameworks or
models; never claim a fix this merge did not make; never attach a date or a deadline; and never call
a capability live unless the evidence explicitly says its flag is on. **Most merges here ship dark.**
