---
title: "Daily standup - {{window.date}}"
styles:
  fontFamily: "Inter"
  baseFontSize: 15
  lineHeight: 1.55
  slideAspectRatio: "{{deck.aspectRatio}}"
  h1: { fontSize: 2.0, fontWeight: 700 }
  h2: { fontSize: 1.25, fontWeight: 600 }
---

# Daily standup - {{window.date}}

~~~slide
@extends cover
#title: Daily standup
#subtitle: {{window.date}}
#kicker: ops-nightly
#footer: The Telegram text stays the canonical read; this deck is the mobile artifact.
~~~

~~~slide
@extends title-body
#title: What changed
#body:
{{summary.bullets}}
#footer: Generated {{window.generatedDate}}
~~~

~~~slide
@extends title-body
#title: Repositories
#body:
{{repos.bullets}}
#footer: GitHub REST + the standup's incremental log.
~~~

~~~slide
@extends title-body
#title: Guards
#body:
- Browser smoke: **{{guards.browserSmoke}}**
- BUILD-ORDER.md: **{{guards.buildOrder}}**
- Stale previews: **{{guards.stalePreviews}}**
#footer: The same signals as the Telegram standup, ready to forward.
~~~
