# North Star workshop — sources and provenance

The material `/northstar-self-serve.md` is built from, landed here so the document has a source in
the repo rather than in a chat log (agentic-pm-public-surface · Sprint 1, Story 1.2).

These are **provenance records, not live sources.** The workshop route
(`apps/web/app/northstar-self-serve.md/route.ts`) is the only thing that ships, and it is written in
Golden Frijoles' words. Nothing generates from these files; nothing should be kept in step with
them. They exist so a reviewer can check a claim against what it came from.

| File | What it is |
|---|---|
| `amplitude-north-star-how-to-guide-2024.pdf` | *Amplitude — How-to Guide: Running Your North Star Workshop*, 2024. 28pp. |
| `northstar-workshop-skill.md` | The product owner's own `northstar-workshop` facilitation skill, verbatim as of 2026-08-20. |

**Attribution.** The North Star Framework is Amplitude's; *The North Star Playbook* is by John
Cutler and Jason McBride. The canonical path is `amplitude.com/resources/north-star-playbook`
(verified 200 on 2026-08-20 — the obvious guess, `amplitude.com/north-star-playbook`, is a 404).
The shipped document credits them once, near the top, per epic D6.

## Where each element came from

| Element | Source |
|---|---|
| The three languages — customer, product, business | skill |
| The three games; the single-game forced choice | skill + guide pp.8–10 |
| Value exchange over apparent transaction (the season-pass trap) | guide p.10 |
| The OpenTable warm-up brief | guide p.19 |
| The qualitative statement | skill + guide p.14 |
| The ladder — North Star → Inputs → Opportunities → Interventions, with character notes | guide pp.15–16 |
| Candidates before critique; progress over perfection; terrible candidates on purpose | guide pp.11, 24 |
| The "I would be more confident…" fill-in | guide p.25 |
| The seven-question checklist | guide p.11 |
| Netflix — three DVDs in the first session, 60%→90%, 88%→90% first-month retention | guide p.23 |
| Burger King; Dave (5.7×) | skill |
| Breadth · Depth · Frequency · Efficiency, with Instacart | skill + guide p.18 |
| The Spotify worksheet | guide p.21 |
| Inputs are 3–5 and independent; the greenfield test | skill |
| Converge; it is never done | guide pp.26–27 |

## One thing in the source is wrong, and we did not carry it

**Guide p.22 is labelled "Open Table" and is a byte-identical copy of the Spotify worksheet on
p.21** — same North Star ("Time spent listening to music by subscribers"), same premium-trial and
songs-per-session inputs, same "monthly subscriptions from premium users" impact. It is a production
error in the PDF, not an OpenTable example.

So the shipped document carries **one** completed worksheet, Spotify's, named as Spotify — and uses
p.19's real OpenTable brief as the warm-up exercise, which is what that material actually is. Epic
amendment A1.
