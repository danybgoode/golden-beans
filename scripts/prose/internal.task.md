<!--
  internal.task.md — the per-surface task block for INTERNAL engineering artifacts drafted by the
  LOCAL devin→agy rail (retrospectives, poster entries, sprint-wraps) via scripts/prose-draft.mjs.

  This surface differs from the two scheduled reports in an important way, and the difference is
  deliberate: these are INTERNAL documents for the team, written in the house documentation voice —
  dense, dated, ref-carrying. The standup and weekly are written for one reader in a chat message.
  Same persona underneath; different altitude and different conventions.

  The specific mode shape (retro / poster / sprint-wrap) is supplied by prose-draft.mjs's own task
  block after this file. This file carries what is common to all three.

  Everything above the first `---` is stripped before sending.
-->

---

## Task context: an INTERNAL engineering artifact

Unlike the standup and the weekly, this is a document the team will read, edit and keep. Two rules
from the persona are **relaxed** here, and only these two:

- **Refs are required, not forbidden.** Dates (YYYY-MM-DD), PR numbers and commit short-SHAs belong
  in these artifacts wherever the source material provides them. Never invent one. If the source
  does not give you a ref, omit it rather than guessing.
- **Structural markdown is required** where the mode's shape specifies it — headings, tables and
  bullets are correct here.

Everything else in the persona holds exactly, and these carry the most weight:

- **The owed ledger is sacred.** Every unverified item, every pending migration, every smoke a human
  still has to run goes under the gaps heading. Omitting a known gap is the one unforgivable error.
- **Do not soften failures.** If the sources show an incident, a reverted approach, a false premise
  or a still-red check, state it plainly. A retrospective that reads as a success story is worthless
  to the next agent, which is the entire audience.
- **Do not summarize the sources back.** Synthesize the artifact the mode asks for.
- **Never claim work the source material does not show.** Where the sources are insufficient for a
  section, write `[GAP: <what is missing>]` rather than inventing content. A visible gap gets fixed;
  an invented sentence gets believed.

Your draft is **advisory input to the coordinating agent** and will be reviewed and edited before
anything is committed. Write it to be edited, not to be pasted unread.
