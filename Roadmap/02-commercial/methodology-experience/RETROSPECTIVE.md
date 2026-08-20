# Retrospective — The methodology gets a room of its own

**Shipped:** 2026-08-20 · **PRs:** [#104](https://github.com/danybgoode/golden-beans/pull/104) ·
[#105](https://github.com/danybgoode/golden-beans/pull/105) ·
[#107](https://github.com/danybgoode/golden-beans/pull/107) ·
[#108](https://github.com/danybgoode/golden-beans/pull/108) (plus
[#106](https://github.com/danybgoode/golden-beans/pull/106), an agy version-pin bump)
**Live:** <https://goldenfrijoles.com/methodology> · 17 stories · 6 amendments · 4 production deploys

## What shipped

The landing sold a method and had nowhere to send the reader who said yes. Now:

- **The vocabulary is one word.** The maker loop is three portfolio moves — Consider / Operate /
  Exit — and the method's second move is *Design*, everywhere a reader can see it.
- **`/methodology` and six chapter URLs**, server-rendered, deep-linkable, crawlable, with the
  content in one typed module that the page, the index, the TOC, the metadata, the sitemap and the
  downloadable edition all derive from.
- **A reading room**: a phase-grouped sticky rail, a real measure, the work-block family as
  primitives with measured contrast, an Apple-materials pass with all three fallbacks, and read
  progress that says nothing when it knows nothing.
- **Readable by any agent**: per-route metadata, a generated markdown edition at 100% signal, a
  sitemap, and a `robots.txt` this repo owns.

## What went well

**Answering the circuit breaker's question before building it.** Story 3.3's breaker asked whether
translucency reads over kraft. That is a question with an answer, so it got a prototype over the
real tokens first. Two findings came out: D2's premise described the *mockup's* light page rather
than ours, and the first visual read ("invisible on dark") was **wrong** — measured, the dark ground
changes *more* (15.13/255 vs 10.44). Pulling the breaker on that impression would have cut a working
effect on false evidence.

**Shared surface first, and by the architect.** `lib/methodology-chapters.ts`, Story 3.1's CSS and
the drift-guard extension were all done before any builder started. Two delegated batches landed
cleanly against them.

**The product owner's question changed the epic.** "Make sure any agent can read it" was asked
mid-flight. Measuring rather than assuming found seven gaps, including one — no sitemap anywhere on
the site — that **no story owned**, under an acceptance criterion that read as though it were
already handled.

## What did not go well

**One cascade defect, three times, in one file.** A CSS rule that loses on source order because
media queries add no specificity: the shell grid never applying, the chapter animation running under
reduced motion, and the rail's desktop margins. All three found by review, none by the suite.

**And the second one was a finding I had explicitly rejected.** On PR #105, agy warned that
appending rules below the reduced-motion block reintroduces an ordering hazard. I rejected it —
correctly for transitions, which are switched off at the source by zeroing tokens. A `@keyframes`
animation does not consult those tokens for its *existence*, so the very next thing this epic built
fell into it: a reader asking for reduced motion could have landed on a chapter at `opacity: 0`.

**Guards that could not fail — four of them, all mine.** A contrast probe that parsed `rgb()` but
not `color(srgb …)` and silently measured an ancestor's background. A canonical-URL assertion that
could not fail locally because the harness builds with `SITE_URL` set. A mutation check that stayed
green and thereby exposed a false claim in my own comment. And a decorative `Record<>` assertion I
wrote and deleted in the same sitting.

**Four defects found only by opening the page.** Paragraphs with no vertical rhythm, chapter text
flush against the phone's edge, a kicker duplicating its own heading, one taxonomy member speaking
in a different voice. None is expressible as "the element exists".

## What was learned

1. **A finding rejected on sound reasoning can be a correct prediction about code you have not
   written yet.** Reject the instance; keep the hazard.
2. **`0 did not fit the budget` is not proof a reviewer read anything.** agy's *model* gives out
   well before its documented 256 KB argv cap, and fails as *garbage output* rather than an error.
3. **A mutation check that does not go red is itself a finding.**
4. **`async generateMetadata` does not make a page dynamic** — committed while citing the decision
   that describes exactly that failure.
5. **A full-page screenshot at small scale is not a measurement.**

## The owed ledger

- **Did the materials pass survive its circuit breaker?** Yes, and on evidence gathered before the
  build. It stayed armed for its other two criteria; neither tripped.
- **Did *Design* read better than *Shape*?** Mostly. The chapter titles are now parallel — Design
  it / Build it / Prove it — and "help me design it" is something a person says to an agent. The
  cost is grammatical: *Shape* has a usable participle and *Design* does not, so three of eight
  lines needed rewriting rather than swapping. One line the rename actively damaged (*"Fix the
  investment before designing the solution"*) was rebuilt and pinned with a test.
- **Does `/methodology` read as a different room?** Yes — and the difference comes overwhelmingly
  from **layout and density**, not the materials pass. If the glass were removed tomorrow it would
  still read as a different room.
- **Known gap, stated:** `north-star-sync.spec.ts` fails locally on accumulated fixture data
  (baselined against clean `main`; green in CI), and `design-system.browser.spec.ts` intermittently
  trips a local 429 from ~5,900 accumulated `rate_limit_counters` rows. Neither is this epic's
  code; both would be worth a cleanup step in those suites.
