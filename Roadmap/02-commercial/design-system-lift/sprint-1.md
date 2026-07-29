# Sprint 1 — Brand foundation and public lift

**Status:** ✅ Shipped — Golden Beans PRs [#51](https://github.com/danybgoode/golden-beans/pull/51)
and [#53](https://github.com/danybgoode/golden-beans/pull/53), 2026-07-28

## Story 1.1 — A bean that looks worth planting

> **As a** visitor, **I want** a distinctive golden-bean mark, **so that** I understand the product
> as magic growth infrastructure rather than coffee software.

**Acceptance:** The Lucide `Bean` silhouette appears in the app with a layered `#FFD700` ingot
finish, has a reduced/monochrome fallback, and ships as a reusable SVG asset pack.

## Story 1.2 — One set of design rails

> **As a** builder, **I want** shared tokens and components, **so that** every new page starts inside
> the same visual, responsive, accessible system.

**Acceptance:** `references/design/assets/tokens.css` is the canonical imported token/skin file;
typed `Button`, `Badge`, `Panel`, `SectionDivider`, `AgentWindow`, and `Icon` primitives carry the
approved interaction and state vocabulary into React.

## Story 1.3 — The story reads as magic beans

> **As a** buyer, **I want** the landing, install, and auth surfaces to communicate compounding
> growth, **so that** the brand promise and the product’s real capabilities reinforce each other.

**Acceptance:** The public, install, and auth routes consume the supplied dark-roast/kraft/foil
system; the hero reads “The growth engine your agent operates.” with foil on `your agent` only; and
capability honesty remains represented by typed `live` / `next` / `blocked` badges.

## Shipped evidence

- The reusable Lucide `Bean` mark, asset pack, tokens, and shared UI primitives are in the app.
- Public, install, login, signup, and landing surfaces consume the approved material system and
  retain typed capability badges.
- The approved handoff follow-up corrected visual drift and formalized the canonical reference
  sources so the implementation has one durable visual contract.
