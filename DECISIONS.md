# Decisions

Reverse chronological. Same convention as `~/CodeProj/golf/DECISIONS.md`: what
was decided, why, and what was rejected — so a future session doesn't relitigate
a settled question or repeat a mistake that's already been paid for.

---

## 2026-08-03 — A second frame for the phone, not a smaller one

**Decided:** the bag chart carries two frames of the same drawing. The wide one
puts 10px labels on a 640-unit plot and stops shrinking at 700px; under 560px a
compact frame draws the identical geometry on a 236-unit plot, so the same type
is proportionally more than twice the size and survives being rendered at 340px.
The rest of the site went responsive around it: the sections drop into a tab
strip under the masthead, the fifteen-column table deals itself out as one card
per club, and the sessions table folds its three context columns away.

**Why:** the chart's whole claim is that it is isotropic — one yard sideways is
one yard long — and the frame was already refusing to shrink for good reason:
below 700px the axis renders at five pixels. But "scrolls sideways on a phone"
was never the answer to that, it was the absence of one. A viewBox scales type
*with* the plot, so the fix is not to shrink the drawing but to redraw it with
less plot per label. Nothing about the data changes: same quantiles, same cones,
same 30-yard fairway, still one to one both ways.

**Rejected: fitting the wide frame to the phone.** The axis becomes unreadable
at exactly the widths this is meant to serve.

**Rejected: stretching the carry axis to make the chart shorter.** It would fit
a screen and break the one promise the chart makes.

**Rejected: a horizontal scroll on the table.** Fifteen columns at 880px on a
390px screen is a scroll through a grid whose header has already left the
screen — you read a number with nothing to say which column it came from. The
cards carry every label with its own value and hold the same rows, held-back
clubs included.

**Also: hover is a mouse idea.** The cones now take a tap as a *selection* —
tap to hold, tap again to let go — gated on `pointerType` rather than on the
frame, so a touchscreen laptop does not select a club the cursor merely crossed.
A cone on a phone is still a target a few millimetres wide, so the compact frame
grows a club rail underneath: the same eight marks at 36px, in bag order, in the
same ramp, doubling as the legend the gutter gives a mouse.

**And the smaller traps:** iOS zooms the page when a focused input is under 16px
and does not zoom back out, so the one text field on the sessions page is 16px
on coarse pointers only. Every sideways-scrolling frame sets
`overscroll-behavior-x: contain`, or running out of table at the left edge hands
the gesture to the browser as a back swipe. `maximum-scale` is deliberately not
set — a to-scale plan view is exactly the thing somebody will want to pinch
into.

---

## 2026-08-02 — Draw the course, don't just point at it

**Decided:** from z13 the map stops being a photograph with dots on it and
becomes a routing plan. `scripts/fetch-holes.mjs` pulls OSM's `golf=*` geometry
— greens, fairways, tees, bunkers, water, cart paths, and the numbered hole
centrelines — into one file per facility under `data/holes/`. `src/course.js`
loads a course's file the first time it enters the viewport at that zoom, washes
the aerial down to a flat turf value inside the property, and redraws the course
on top of it.

**Why:** the aerial was carrying the whole map on its own and it cannot answer
questions. A satellite tile of Bethpage is a picture of Bethpage: no hole
numbers, no par, no line between a green and the fairway apron around it, and no
consistency — the same course is olive in one tile set and grey in another. A
drawing is legible at a glance, identical everywhere, and — this is the part
that made it worth the pipeline stage — it makes the map *about golf* at the
zoom where you actually care. 62 of 76 courses have enough mapped to draw. Rancho
Park comes back with 18 numbered holes; Bethpage with 90 across five courses.

**Rejected:** rendering the plan for every course. 14 of the 76 have only a
handful of stray features, and washing out a good photograph to draw three
bunkers on it is strictly worse than leaving the photograph alone. `index.json`
carries a `plan` flag — ≥9 greens or ≥9 fairways — and only those get the wash.
The rest still get their features drawn, over an untouched aerial.

**Rejected:** one bundled GeoJSON. The raw fetch is 11 MB; most sessions never
leave the continental view. Per-course files fetched on demand cost one request
each, at ~100 KB, exactly when you have asked to see that course.

**Rejected:** relations. `out geom` doesn't carry member geometry on either
working mirror (see *Overpass mirror list*), and golf features modelled as
multipolygons are rare enough not to justify a second pass. Ways only.

**Also:** the geometry is Douglas–Peucker'd at 0.5 m before it is written — below
the accuracy of the hand-tracing it thins, and a third of a pixel at z18. Cart
paths and woodland arrive at ~1 m vertex spacing and were most of the bytes.
11.13 MB → 6.92 MB with identical feature counts.

**And a trap worth naming:** `golf=penalty_area` is not water. Filed under the
water style, it drew Rustic Canyon — a dry arroyo course in Moorpark — as a
chain of four lakes. Penalty areas that aren't tagged `natural=water` get their
own quiet red-brown fill and a dashed edge, which is what the stakes are and
what every golfer already reads.

---

## 2026-08-02 — Tone the basemap, don't replace it

**Decided:** Esri World Imagery stays, but with `raster-saturation` pulled to
−0.72 and highlights capped at world zoom, easing back to untouched by z16.
Added a graticule below z9, a vignette, a scale bar and a compass rose.

**Why:** Esri's imagery is colour-balanced to look good on white — bright cyan
oceans, high-key greens. Dropped onto ink chrome it read as a browser window
someone had pasted a map into. Toning it makes it a *ground*: dark, low-contrast,
one material, and therefore a surface a cream label or an orange dot survives
being drawn on. The tone eases off approaching course zoom because down there the
photograph is being read rather than sat on.

The graticule earns its place at exactly one range. From space this map is
fourteen dots on a photograph of the Pacific, and a photograph has no scale —
nothing says Kona and Barbados are a third of the planet apart. Meridians say it
without a word of copy. They stop at z9, where the coastline takes over.

**Rejected:** a dark vector basemap. Settled on 2026-08-01 (*Esri World Imagery
over dark vector tiles*) and the plan layer makes it more settled, not less: the
aerial is now the texture underneath the drawing, which is a job no vector
basemap does better.

**Also fixed:** every label on the map was missing. `facility-label` asked for
the fontstack `Open Sans Regular`, which the demotiles glyph server 404s — it
serves `Open Sans Semibold` and `Noto Sans Regular` and nothing else. MapLibre
answers a missing fontstack by drawing nothing, silently, so the failure looked
like a design choice.

---

## 2026-08-02 — Two hue poles in the ramp, not one

**Decided:** the lens ramp crosses the cool/warm boundary — teal `#85f1f2`
through a near-neutral cream `#d1bba4` to the accent `#ff6b35`. OKLCH hue ≈196 →
≈39, lightness 0.894 → 0.705 strictly monotonic, chroma dipping at the midpoint
where the poles meet.

**Why:** the single-hue warm ramp was correct by the textbook and wrong on the
screen. Every step read as "some orange", and the basemap is *also* browns and
tans and greens, so a warm-on-warm scale had nothing to push against. Measured,
the old ramp spanned ΔE 27.7 end to end and the new one spans 34.4 — a real but
unremarkable gain. The gain that matters isn't in the number: teal-vs-orange is
a distinction you can *name*, and named differences sort instantly where
equal-magnitude within-hue differences don't. That's the whole argument.

Lightness is what keeps it a ramp rather than a rainbow. Chroma can't carry
order here — it necessarily falls and then rises again across a two-pole
ramp — so lightness has to stay monotonic end to end, and two poles is the
ceiling. A third would make it categorical.

**Rejected:** a wider sweep (cyan → blue → violet → pink → orange) measured
better still, at ΔE 32–34 with more even steps, and is a rainbow. Five nameable
hues have no intrinsic order, so the legend becomes load-bearing — the map stops
being readable on its own terms.

Also rejected: widening the lightness band to strengthen the ordering signal.
The band is deliberately narrow and high (L 0.705–0.894) because the basemap is
dark; a conventional light→dark ramp buries the low end, and a course shouldn't
vanish for ranking badly.

**Cost, accepted:** the cream midpoint is the weakest point of the ramp over
tan urban imagery — see the LA cluster, where mid-scoring pins sit on grey-beige
sprawl. The ink halo carries separation there, as it was always meant to. The
alternative was routing the midpoint through magenta, which buys contrast and
spends the two-pole discipline.

---

## 2026-08-02 — No database for Yardages; committed JSON instead

**Decided:** Supabase is dropped. `yardages/data/raw/*.csv` holds the exports
verbatim, `pnpm ingest` writes `data/shots.json` and `data/sessions.json`, and
both are committed. Overrides live in `data/exclusions.json`.

**Why:** a shot is ~800 bytes of JSON. Two years of weekly range sessions is
~2000 shots, or 1.5 MB — smaller than `data/course-polygons.geojson` already in
this repo, and a group-by over it is sub-millisecond. Postgres was solving no
problem here. The one thing it did buy was a writable destination for an iOS
Shortcut POST, since Vercel has no persistent disk — and that path was
hypothetical; both fixtures arrived via `~/Downloads` on the desktop.

**The deciding argument:** `raw_imports` existed so a parser fix could be
replayed over history. Git already does that, with real diffs, no `bytea`
encoding, and better provenance. Committing generated JSON beside its verbatim
source is the contract this repo already runs on — see "The caches are committed
on purpose" in `NEXT.md`, and `courses.json` beside `data/raw/grint-*.txt`.

**Cost accepted:** no share-sheet import. Adding a session is drop the file, run
`pnpm ingest`, commit. If that friction ever bites, the endpoint comes back and
Supabase with it.

**Kept:** Next.js, TypeScript and Tailwind, because Phase 2's bag chart is
Recharts and the deploy still wants a build step. Dropping the database did not
change what the front end is.

**What made it cheap:** `lib/parse.ts` was written pure — no I/O, no framework —
so only the storage layer changed. All 38 parser tests were untouched, and
`lib/ledger.ts` added 13 more.

---

## 2026-08-02 — Yardages is its own Vercel project, not a route

**Decided:** the R50 shot ledger lives at `yardages/` inside this repo as a
Next.js + TypeScript + Tailwind + Supabase app, deployed as a **second** Vercel
project with Root Directory set to `yardages/`.

**Why:** the two invariants are incompatible. This site is deliberately
zero-build (see "Static-first, no bundler" below) and `vercel.json` pins
`framework`, `buildCommand` and `installCommand` to `null` because not doing so
broke the deploy once already. A Next.js app cannot be a route on that. One repo
keeps the two diffable and lets the header cross-link them; two Vercel projects
keep the static deploy from ever seeing a build step, because the second project
reads `yardages/vercel.json` and never the root one.

**Rejected:** converting the whole site to Next.js — it would move the working
MapLibre page and reverse a decision that is one day old. **Rejected:** building
Yardages in the static idiom — Vercel cannot write JSON to disk at runtime, so
Supabase is needed regardless, at which point the no-build argument stops paying
for itself.

---

## 2026-08-02 — R50 sign conventions, and the one column that lies

**Decided:** positive is **right of target** for a right-handed player on every
lateral column in the R50 export — `Club Face`, `Club Path` (positive =
in-to-out), `Launch Direction`, `Spin Axis`, and both deviation columns.
`Sidespin` is signed **backwards** and is stored verbatim anyway.

**Why the convention:** Garmin publishes no signed-metric glossary. The R50
screen shows `3.2R`/`3.2L` and the signs exist only in the CSV; the 20-page
owner's manual is hardware setup. So it rests on two independent lines:
third-party documentation of the R10, which shares the Garmin Golf app and the
same column names ("'In to out' … results in a positive club path"; open face
positive; spin axis "positive when the ball spins to the right"), **and** three
physical asymmetries in the fixtures that break if the convention is flipped —
`corr(Face to Path, Spin Axis) = +0.791` with a mean face 2.53° open producing a
mean +13.71 yd miss (a push-fade, right); `corr(Attack Angle, Club Path) =
+0.488`, the over-the-top signature, against 34/34 negative attack angles on a
7 iron; and 34/34 sign agreement between `Launch Direction` and `Club Face`.

**Why sidespin is stored uncorrected:** the export satisfies
`Spin Axis = −atan2(Sidespin, Backspin)` to 2×10⁻⁶ degrees across both fixtures,
so negative sidespin means a ball curving right. Flipping it on ingest would
make the stored number disagree with the Garmin app for no gain, since
`spin_axis_deg` already carries the same information the right way round and is
what every chart reads. Same rule as "Flags, never corrections" below.

**Falsifiable cheaply:** five deliberate slices in one session should come back
with strongly positive spin axis and positive carry deviation.

---

## 2026-08-02 — Dedupe shots on timestamp, not shot index

**Decided:** the uniqueness constraint is `(session_id, shot_timestamp)`.
`shot_index` is row order, kept for display only.

**Why:** the R50 export has no shot-number column at all. Row order is not a
key — it breaks if an export is ever reordered or if two exports overlap. The
per-shot `Date` cell is a full timestamp and is unique in both fixtures (34/34
and 23/23), so it is the only natural key the file actually provides.

**Also:** `session_started_at` comes from the earliest shot, never the filename.
Both fixtures are named for their **export** time, 2026-08-02, and contain shots
from 2026-07-03 and 2026-07-05. Sorting by filename puts them backwards.

---

## 2026-08-01 — Region rail instead of marker clustering

**Decided:** at low zoom, the "11 states, 3 countries" story is told by a
clickable region list in the left rail (state → count, click to fit bounds),
not by MapLibre's cluster layer.

**Why:** clustering fights the colour encoding. A cluster bubble has to
aggregate 20 lens scores into one number, and whatever it picks is a claim the
data doesn't support. The region list says the same thing — where you've played
and how much — in text, which is unambiguous, and doubles as navigation.

**Rejected:** `cluster: true` on the points source. Revisit if the list ever
exceeds ~150 facilities, where dot overlap in LA becomes genuinely unreadable
rather than merely dense.

---

## 2026-08-01 — Batch the Overpass queries

**Decided:** one query per 12 facilities (a union of `around` clauses), with
polygon→facility assignment done locally by distance then name.

**Why:** 84 individual queries took over ten minutes and completed 3 of 84,
because `overpass-api.de` was intermittently returning 504 and 429. Seven
batched queries do the same work. The assignment step was already local — we
were name-matching candidates anyway — so batching cost nothing in accuracy.

**Also decided:** a failed batch leaves its facilities *uncached*, so a re-run
retries them. Caching `null` on a network failure would permanently record "no
polygon exists here" from what was actually a gateway timeout.

---

## 2026-08-01 — Overpass mirror list, and why kumi stays in it

**Decided:** `overpass-api.de` → `maps.mail.ru` → `overpass.kumi.systems`, with
a 75s `AbortSignal` on every request and the staleness guard from muni.

**Why each:**
- `overpass.private.coffee` **removed.** It hangs indefinitely rather than
  erroring — a 45s curl returned HTTP 000. A mirror that never answers is worse
  than one that 500s, because nothing downstream ever gets to fail over. This is
  why every request now carries its own abort signal regardless of mirror.
- `overpass.kumi.systems` **kept, deliberately, in last place.** On the
  2026-08-01 probe it answered `200` with data **50 days stale**
  (`osm_base 2026-06-12`). It stays because the staleness guard catches it and
  refuses the response. If the first two mirrors are down, failing loudly is the
  correct outcome; silently baking June's data is not.

**Provenance:** the guard is ported from
`~/CodeProj/golf/muni/scripts/fetch-golf-holes.mjs`. `golf/DECISIONS.md:437`
records mirrors serving 2-month-old data and 3 of 18 courses baking wrong as a
result. It caught the same failure on the first run here.

---

## 2026-08-01 — OSM repairs the geocode

**Decided:** when a facility geocodes only to its town centroid, and Overpass
then finds a name-matching `leisure=golf_course` polygon nearby, the polygon's
centroid replaces the coordinate and `precision` becomes `osm_polygon`.

**Why:** Nominatim resolved 84/84 but 20 of them to the town, not the course —
Rancho Park landed in downtown LA, ~14km from the course. Rather than
hand-entering 20 overrides, the OSM pass we already needed for outlines produces
a better coordinate for free.

**Kept:** `precision` is stored and shown in the dossier. "We know where this is"
and "we know what town it's near" are different claims and the map says which.
`repairedFrom` records the downgrade it came from.

---

## 2026-08-01 — Sequential ramp, not a categorical palette

*(The specific colours here were superseded on 2026-08-02 — see below. The
reasoning about magnitude, validator scope, and the halo still stands.)*

**Decided:** pin colour is a 5-step ramp in the accent hue — `#6e3b22` →
`#ff6b35`, OKLCH hue 39–47, lightness 0.411 → 0.705 monotonic, chroma rising.
Every mark carries an ink stroke and a dark halo.

**Why:** the encoded value (a lens score) is a magnitude, so the rule is one hue
with monotonic lightness. The categorical CVD-separation checks don't apply —
the palette validator says so itself in its scope note. The ink stroke and halo
exist because a photographic basemap has no predictable background: a bright dot
on a bright bunker is invisible without one.

**Also:** `-1` is the sentinel for "this lens has no value here" (e.g.
`scoringDelta` on a 9-hole average). Those render muted, not at the bottom of the
scale — placing them at zero would be a claim we haven't earned.

---

## 2026-08-01 — Esri World Imagery over dark vector tiles

**Decided:** Esri World Imagery raster + Esri World Boundaries and Places as a
50%-opacity label overlay. Keyless, attribution required and given.

**Why:** for golf specifically, the aerial *is* the information — at z15+ you
read the routing, the bunkering, the water and the coastline. A dark vector
basemap renders 84 identical dots in 84 identical grey rectangles. The label
overlay is non-optional: satellite imagery without place names is beautiful and
unnavigable.

**Cost accepted:** photography is visually noisy under the chrome, which is why
every panel is opaque ink rather than translucent.

---

## 2026-08-01 — Every claim carries its own source

**Decided:** `facts.json` stores `{value, source, confidence, checked,
verified}` per field, not bare values. `validate.mjs` errors on a missing source
and on a confidence outside `high|medium|low`.

**Why:** the goal is ranking courses across vectors *from different resources*.
That's only meaningful if each vector can be traced to where it came from. A
bare `"architect": "A.W. Tillinghast"` is indistinguishable from a guess six
months later.

**Generalized from:** `sf/src/data/golf-annotations.ts`, which does this for
rankings only. Here every field gets it.

**Consequence accepted:** the 25 seeded facilities are all `verified: false`.
They were written from general knowledge to exercise the schema, and
`validate.mjs` reports the unverified count on every run so the debt stays
visible. **None of it should be treated as fact until the verification pass runs.**

---

## 2026-08-01 — Flags, never corrections

**Decided:** the parser transcribes Grint verbatim and appends a `flags[]`
array. It never edits a value.

**Why:** 12 layouts have an "18-hole average" under 60, which is a 9-hole score
in an 18-hole column. Silently doubling them would invent data; dropping them
would lose the round. Flagging them lets `build.mjs` exclude them from the
scoring vector (mean is computed over 81 clean layouts, not 93) while the raw
number stays visible in the dossier.

**Same rule for names:** "Cherry Downs Golf & Count" stays truncated and
"Tpc Of Scottsdale" stays mis-cased in the spine. Display corrections live in
`facts.json` as `displayName` — with a source — because a name correction is an
external claim like any other.

---

## 2026-08-01 — Facility is the place, layout is the thing you played

**Decided:** two entities. `facilities.json` gets the map pin; `layouts.json`
gets the rank, rounds and ratings. 94 layouts across 84 facilities.

**Why:** 10 facilities have more than one layout in the list — Hualalai
(Ke'olu + Nicklaus), Bethpage, Griffith Park, Brookside, Temecula Creek, Heron
Lakes, Industry Hills, TPC Toronto, Las Vegas Paiute, Legends on the Niagara,
Sepulveda. Modelling layouts as places puts two pins 40 feet apart in the ocean
off Kona and makes "how many courses have I played" permanently ambiguous.

**Sepulveda note:** Grint files the Balboa layout under "Sepulveda Golf Club" and
the Encino layout under "Sepulveda Golf Complex". Merged via an explicit alias,
not fuzzy matching — with 94 rows the full list is inspectable, and fuzzy
matching will eventually merge two courses that genuinely are different places.

**Validated against Grint's own header:** 93 played, 11 states, 3 countries. All
three match exactly. Grint says "93 played" while listing 94 rows because Scholl
Canyon is rated but never played — flagged `unplayed`, not dropped.

---

## 2026-08-01 — Paste adapter now, HAR extractor later

**Decided:** v1 parses the pasted ranking table. `parse-grint.mjs` is documented
as one *adapter* behind a contract (see `SPEC.md § Adapter contract`); the HAR
extractor becomes a second adapter emitting the same two files.

**Why:** the data was already in hand and blocks nothing. `golf/pipeline/grint/
RECON.md` establishes there is no usable Grint API — "TheGrint Connect" is
partner-only — and that the viable path is a HAR capture from a logged-in
session, which needs 5 minutes of the user's clicking.

**Rejected:** waiting on the HAR before building anything. **Rejected:** treating
the paste as permanent — per-round and hole-level data is what the eventual
strategy tool needs, and the paste has neither.

---

## 2026-08-01 — Static-first, no bundler

**Decided:** plain `<script>` tags, CDN MapLibre, globals in `shared.js`, ESM
`.mjs` pipeline scripts with zero runtime dependencies, `npx serve .`.

**Why:** matches `/tmp/archetypes-audit` exactly, which is the closest existing
precedent for this shape of project. Nothing here needs a build step, and a
build step is a thing that rots between sessions.

**Rejected:** building on `courseRender`'s pnpm workspace. It has the better
machinery long-term — `course-schema`, `course-discovery`, PostGIS — but it has
no CI, and importing a monorepo to draw 84 dots is the wrong trade today. Noted
in `SPEC.md § Roadmap` as the natural base for the strategy phase.
