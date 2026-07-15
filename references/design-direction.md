# Golden Beans — design direction (branding/marketing consultant read)

> High-level direction for the public surface (landing → product UI over time). Written 2026-07-14
> from two PostHog homepage reference screenshots Daniel provided in-session (retro-desktop
> homepage + "Shameless CTA" section). The screenshots live in the session chat; fresh captures
> land in `references/posthog/` at E1 story 2.3 build time. This doc is the direction; the
> screenshots are just evidence. Companion: `landing-end-state.md` (sections/content),
> `landing-end-state-mock.html` (layout skeleton — layout survives, skin evolves per this doc).

## What the references actually do (mechanics, not surface)

1. **The site is an artifact, not a brochure.** PostHog's homepage is a retro desktop OS: the page
   content lives inside a windowed document (`home.mdx`) with a toolbar; nav is desktop icons
   (`customers.mdx`, `demo.mov`, Trash). The medium performs the message — "built by people who
   live in editors" — before a single claim is read.
2. **Real product inside a fictional frame.** The playful chrome frames *actual UI screenshots*
   (session replay, logs, error tracking) in tabbed showcases. Fiction never replaces evidence;
   it stages it.
3. **Material honesty.** Cream paper texture + flat/isometric illustration (hedgehogs gardening a
   diorama that spells the brand) + crisp product UI. Two or three material families, used
   consistently — not a style soup.
4. **Self-aware marketing as trust.** The "Shameless CTA": boxed "PostHog 3000" software with CD,
   "NOT ENDORSED BY KIM K" starburst, fake scarcity ("$0 FREE — >1 left at this price!!",
   "Hurry: 2005 companies signed up today"), footnote gags (the floppy-disk rickroll). Mocking
   marketing *while doing it* flatters a skeptical technical buyer — jokes are precise and
   footnoted, never sloppy.
5. **Agent-native CTAs already normalized.** Their hero carries "Install with AI" and an MCP link.
   Validates our connector-first hero — we're not early, we're on time; our edge is making it the
   *headline*, not a link.

## The Golden Beans translation (steal mechanics, invert the world)

**World: the roastery, not the garden.** PostHog grows a garden; we run a specialty roastery. Raw
events are green beans; the engine roasts them into insight. One metaphor family, disciplined:
ingest = intake hopper · registry = the label on the bag · TARS funnel = the pour · North Star =
the cupping score · experiments = batch A / batch B. If a coffee joke needs explaining, cut it.

**Frame device: the agent window, not the file window.** Their content lives in `home.mdx`; ours
lives in **an agent conversation window** — the landing's live-proof panels render inside a
chat/terminal chrome where "your agent" asks the engine for the funnel and gets the real answer.
The medium performs *our* message: BYO-agent. (This is the single most important translation —
it turns the demo section into the differentiator.)

**Material palette (three families, fixed):**
- **Kraft + foil:** kraft-paper texture, roast-stamp typography, gold-foil accent — packaging,
  section dividers, the "bag label" primitives list (a coffee-bag nutrition label listing shipped
  primitives, with honest 🔜 lines — our Shameless-CTA-grade gag that doubles as the feature grid).
- **Dark roast UI:** the product panels keep the current dark `--roast`/`--gold` scheme —
  deliberately inverted from PostHog's cream so screenshots of *us* are recognizable at a glance.
- **Brass instruments:** skeuomorphic gauges/toggles/dials for flags and experiment splits (the
  original PRD's "tactile toggles" note, promoted to brand signature). Sparingly: one hero
  instrument per section max.

**Mascot posture:** a bean character exists but works — weighing, tasting, pulling levers in an
isometric roastery diorama that doubles as the architecture diagram (events flowing hopper →
roaster → cupping table). Never decorative-only; every appearance explains a data flow. Ship the
diorama at E1 only if it carries the architecture; otherwise defer to E3 (don't block launch on
illustration).

**Voice:** self-aware, footnote-loving, honesty-as-bit. Our fake-scarcity equivalent inverts
theirs: *"Unlimited seats. Scarcity is for beans, not software."* The registry-declared-Targeted
caveat stays styled as a tasting note, not fine print. Rule: every joke sits next to a real,
checkable claim.

## Guardrails

- **Steal mechanics, never assets or jokes.** No hedgehogs, no boxed-CD gag, no Kim K. Parallel
  construction, our world.
- **Evidence-first ratio:** at least half of every viewport is real product UI or real numbers;
  fiction frames, never fills.
- **Two CTAs everywhere:** "Add to Claude" (primary) + waitlist (secondary until E2 flips it).
- **Honesty badges are load-bearing** (poster rule extends to the landing): ✅ only for shipped.
- **Heuristics rail:** medusa-bonsai `frontend-design` skill checklist runs at S2.3; this doc sets
  direction, that skill sets quality.
