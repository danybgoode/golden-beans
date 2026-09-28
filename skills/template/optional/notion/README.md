# Optional: project the Roadmap onto a Notion board

**Opt-in.** Nothing in the copy-once skeleton depends on this. Copy it only if your project wants a Notion
board.

`roadmap-to-notion.mjs` pushes the rows that `scripts/roadmap-extract.mjs` projects from `Roadmap/` onto a
Notion database. The push is **one-way, docs → Notion**. The docs stay the only source of truth, and the
board is rebuilt from them on every sync. `BUILD-ORDER.md`, `doc-hygiene` and `pmo-report` read the same
extractor, so the board cannot disagree with them about an epic's status.

## Why it is not in the skeleton

It used to be `scripts/roadmap-to-notion.mjs`, the largest file every spawned project received, for an
integration most projects never use. But the *extractor* was the first half of that file, and
`build-order.mjs` reads it, so the Notion push couldn't be made optional without breaking the board. The
extractor now lives in `scripts/roadmap-extract.mjs` and ships to every project. Only the push lives here.

## Enable it

```
cp optional/notion/roadmap-to-notion.mjs scripts/     # it imports ./roadmap-extract.mjs
export NOTION_TOKEN=…   NOTION_DB_ID=…                 # an integration token + the target database id
node scripts/roadmap-to-notion.mjs --sync              # upsert every row (archives rows whose doc is gone)
```

`--pr <epic-slug> --status "In progress" --link <url>` sets a scope-limited overlay for an open PR
(`--dry` previews it). `--lifecycle` prints the label a PR workflow should send, based on `PR_ACTION` and
`PR_DRAFT`. The database needs the properties that `props()` writes: Name, Slug, Status, Area, Priority,
Type, Risk, Grain, Sprint progress, Build order ID, Doc link, Kickoff, Last synced, the Epic relation, and
for `--pr`, Lifecycle and PR link.

Run it from CI on pushes to `main` if you want the board always current. Keep the token in the CI
secret store, never in the repo.
