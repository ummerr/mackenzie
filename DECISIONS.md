# Decisions

Reverse chronological. Same convention as `~/CodeProj/golf/DECISIONS.md`: what
was decided, why, and what was rejected — so a future session doesn't relitigate
a settled question or repeat a mistake that's already been paid for.

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
