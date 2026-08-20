# Golden Frijoles --- Minimum Viable Field Guide v0.2

**Working edition --- learn by making something real**

This guide has one job:

> Help you take one real idea through one bounded, shipped, verified Bet
> and change how you operate based on what you learn.

Use your own project and your own agents. Golden Frijoles provides the
operating context and rails; it does not provide the AI model or replace
your coding environment.

You do not need to memorize the methodology before you begin.

## The loop

Your North Star provides **Direction**.

### CONSIDER

**Bring an idea → Shape it → Place the Bet**

Should we invest?

### OPERATE

**Build ↔ Prove**

Given that we invested, how should humans and agents make it real inside
explicit bounds?

### EXIT

**Reconsider → Learn**

What does the Evidence justify now, and what changes because of it?

That is enough to begin. The deeper practices appear when you need them.

------------------------------------------------------------------------

# 0. Before you begin

## Understand

You should already have: - a Golden Frijoles project; - the full
Direction produced by your North Star workshop; - a connected agent; -
Golden Frijoles project rails available where you intend to work.

If you completed first-run setup, you have this.

## Do

Open the real project you want to change. Do not create a tutorial
project.

## Look for

Your project agent should be able to orient to project
agents/instructions, ways of working, relevant learnings, team memory
where available, and the Golden Frijoles context it has permission to
read.

If not, finish setup before continuing.

------------------------------------------------------------------------

# 1. Bring an idea

## Understand

Start with the thing you want to make.

Do not turn it into tickets. Do not write acceptance criteria. Do not
solve it before understanding it.

An idea is not commitment.

A possibility worth understanding is an **Opportunity**. That does not
mean it deserves investment.

## Do

Write one real thing you want to make, fix, change, or learn.

Example:

> I want shops to see which customers look likely to return, without
> building another giant analytics dashboard.

Your ask can be messier.

## Use your agent

``` text
Help me groom this ask:

[DESCRIBE WHAT YOU WANT TO MAKE, CHANGE, FIX, OR EXPLORE]

Before shaping it, read the project agents and ways of working, review relevant learnings, and skim team memory so you understand the context first.
```

## Look for

The agent should understand the project before producing a solution.
Useful orientation may surface what already exists, architecture,
current behavior, prior decisions, constraints, relevant learnings,
contradictions, and missing information.

If the first response is merely a confident implementation plan,
orientation failed.

## What you just learned

**Before creating, orient.**

Agents make plausible implementation cheap. Golden Frijoles makes
context and coherence part of the work so makers can build more without
multiplying avoidable mistakes.

------------------------------------------------------------------------

# 2. Shape it

## Understand

Shaping asks:

> **How much is this Opportunity worth to us?**

The answer is the **Appetite**.

Appetite constrains the solution. The imagined solution does not dictate
the investment.

A useful Appetite is exhaustible. When it is consumed, the operation
must reconsider rather than silently expand.

## Do

Continue Groom. Work through the questions that require judgment.

By the end, the Bet candidate should make these things legible:

**Opportunity** --- what possibility are we considering?

**Outcome** --- what meaningful change in reality do we intend to cause?

**Baseline** --- what is true before the change?

**Appetite** --- how much attention, elapsed time, execution, compute,
money, review burden, operational risk, or disruption is this worth?

**Approach** --- what plausible path fits inside the investment?

**Boundaries** --- what are we deliberately not solving?

**Evidence** --- what would justify the claims we expect to make?

**Displacement** --- what receives less investment because we choose
this?

**Risk and Authority** --- what consequences matter, and who may
authorize them?

Do not fill fields merely because they exist. The point is the
investment decision.

## This part is yours

Your agent can orient, research, synthesize, challenge, propose, and
model tradeoffs.

It cannot own consequential judgment merely because it can produce an
answer.

**Capability does not imply Authority.**

You decide what the Opportunity is worth.

## Look for

A shaped Bet should be bounded enough to operate but open enough to
discover implementation.

Avoid both "Improve retention" and a giant implementation specification
produced before discovery.

## What you just learned

**Fix the investment before designing the solution.**

Shape creates a plausible bounded investment decision; it does not
predict the future.

------------------------------------------------------------------------

# 3. Place the Bet

## Understand

A scaffold is not commitment. A well-shaped idea can still deserve a
**no**.

The Bet is the unit of strategic commitment.

## Do

Review the Bet.

Ask: - Does the Opportunity matter? - Is the Outcome a change in reality
rather than merely an Output? - Is the Appetite explicit and
exhaustible? - Could the Evidence actually justify the claim? - What is
displaced? - What Authority are we granting? - Where must autonomous
action stop?

**Nothing is prioritized until something else is displaced.**

## This part is yours

Place the Bet only if the investment is justified.

"Do not build this" can be the correct result of shaping. Preventing
unjustified investment is progress.

## Look for

The placed Bet should carry enough coherence for decentralized execution
without constant central coordination.

## What you just learned

**Bounded bets over endless backlogs.**

A Bet is not a promise that the thesis is right. It is a bounded
commitment to find out.

------------------------------------------------------------------------

# 4. Build it

## Understand

Once the Bet is placed, the question changes.

You are deploying the investment against reality.

The learner-facing rule is:

> **Build one coherent piece at a time.**

Three deeper practices sit inside Build: **Route · Slice · Bound**.

They are practices, not ceremonies.

## Route

**Route uncertainty upward. Route certainty outward.**

High-uncertainty or consequential work may require human judgment, a
reasoning/coordinating agent, adversarial review, or explicit Authority.

Well-understood reversible execution can move outward to bounded
execution agents or deterministic systems.

Assign work according to cognition and Authority, not job title.

## Slice

Do not default to frontend/backend/database decomposition when none can
independently demonstrate useful behavior.

**Slice for coherent behavior.**

A Slice is a coherent piece of the Bet that can be independently owned,
integrated, and verified.

## Do

Ask the project agent to identify the smallest coherent Slice that
materially reduces uncertainty or creates usable behavior.

Build it. Integrate it. Prove what can already be proved. Then choose
the next Slice.

## Bound

A Boundary answers:

> **Where must autonomous action stop or escalate?**

It may cover Appetite, solution limits, WIP, merge/release behavior,
flags, production access, spend, security consequences, irreversible
actions, and human authorization.

**Autonomy expands with reversibility and contracts with consequence.**

## This part is yours

Do not micromanage reversible execution merely to feel in control.

Do not grant consequential Authority merely because an agent is capable
of exercising it.

## Look for

Healthy operation makes visible what is being attempted, what remains
uncertain, what has been integrated, what Evidence exists, what boundary
was reached, and what decision needs a human.

## What you just learned

**Centralize coherence. Decentralize execution.**

The Bet carries coherence. Bounded agents carry execution. Humans
concentrate on decisions that actually require them.

------------------------------------------------------------------------

# 5. Prove it

## Understand

Prove is not "after Build." It happens throughout Build.

**Claims require Evidence proportional to their consequences.**

Use three questions.

## Did we build it correctly?

Use deterministic verification where the fact is knowable: tests, type
checks, linting, schema validation, build checks, reproducible
assertions.

**Never ask judgment to do the work of determinism.**

## Is it good enough?

Some claims require judgment: UX quality, coherence, architectural
fitness, copy quality, whether the result solves the shaped problem.

Use genuinely independent review where independence matters.

Another agent repeating the author's reasoning is not automatically
independent Evidence.

**Confidence comes from independent Evidence, not repeated agreement.**

## Did it work in reality?

Shipping proves something became real. It does not prove the Outcome
occurred.

Look for Evidence where the claim lives: customer behavior, runtime
behavior, production telemetry, business results, observed workflow
changes, or direct experiential verification.

## Do

Write down the claims you expect to make about the current Slice or Bet.

For each ask:

> **What Evidence would actually justify saying this is true?**

Then obtain it.

## This part is yours

Where consequence requires human authorization, an agent cannot turn
Evidence into permission by itself. Risk acceptance and accountability
remain Authority decisions.

## Look for

Keep these distinct:

**Output** --- what changed.

**Evidence** --- what we observed.

**Outcome** --- the change in reality we hoped to cause.

## What you just learned

**Done means shipped and verified, not merged.**

Progress is reduction of meaningful uncertainty through Evidence.
Conclusive Evidence that tells you to stop is progress.

------------------------------------------------------------------------

# 6. Decide what happens next

## Understand

A Bet does not earn continued investment because you already placed it.

Exit means ending the current investment decision, not deleting the
capability produced by it.

Begin with Evidence:

> **Knowing what we know now, would we still make this Bet with the
> Appetite remaining?**

## Do

Make one explicit judgment.

**Continue** --- thesis holds and remaining Appetite justifies
continuing.

**Change** --- Opportunity matters, but approach or Boundaries should
change.

**Reduce** --- remaining value justifies a smaller investment.

**Increase** --- new Evidence justifies deliberately increasing
Appetite. This is a new investment judgment, not silent expansion.

**Exit** --- stop the current investment.

Success, failure, and conclusive negative Evidence can all justify Exit.

## Learn

Ask:

> What did reality teach us?

Then:

> **What changes because of it?**

A Learning can change project instructions, guardrails, an agent skill,
architecture, verification requirements, operating heuristics,
Direction, a future Bet, or something the organization stops doing.

If nothing changes, you recorded an observation.

## Look for

The system should behave differently next time.

That is Evidence that the lesson survived the conversation in which it
was discovered.

## What you just learned

**A lesson is not learned until the system behaves differently.**

Golden Frijoles compounds when each completed Bet improves the system
that will operate the next one.

------------------------------------------------------------------------

# You completed the loop

You started with a rough idea.

You **Considered** whether it deserved investment.

You **Operated** a bounded human-agent system to make it real and
establish Evidence.

You **Exited** the investment according to what reality justified.

You do not need to memorize nine practices to do it again.

Remember:

## CONSIDER

**Bring an idea → Shape it → Place the Bet**

## OPERATE

**Build ↔ Prove**

## EXIT

**Reconsider → Learn**

Your North Star provides Direction around the loop.

The deeper vocabulary is there when you need precision. The loop is
there when you need to make something.

------------------------------------------------------------------------

# Practitioner checkpoint

The guide succeeds if you can now: - turn a raw ask into a bounded
investment decision; - set Appetite before allowing a solution to
expand; - distinguish Outcome from Output; - displace something when
prioritizing something else; - route work according to uncertainty and
Authority; - grant autonomy inside explicit Boundaries; - build coherent
Slices rather than technical task piles; - demand Evidence appropriate
to the claim; - distinguish shipping from proving; - reconsider without
sunk-cost loyalty; - turn Learning into a change in the operating
system.

Terminology recall is not the test.

**Better operation is.**
