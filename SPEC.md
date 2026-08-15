# MACKENZIE — the spec

A living document. It describes what this system *is*, not what it might become;
the roadmap at the bottom is explicitly separated from everything above it, which
is built and working.

Last substantive revision: **2026-08-01**.

---

## 1. What this is

Every golf course I've played, mapped, with every claim about it traceable to a
source, rankable through more than one lens.

The map is the visible part. The durable part is a **course-identity spine** that
survives being joined to new data — published rankings, terrain, shot telemetry —
without a rewrite. Every phase after this one is an additive join onto that spine.

Three properties are non-negotiable and everything else follows from them:

1. **Nothing is invented.** An unknown field is absent, not guessed.
2. **Every external claim carries its source.** Provenance is a field, not a
   comment.
3. **Ranking is a question, not a verdict.** There is no single score.

---

## 2. The model

Three files at three levels of trust. Keeping them apart is the whole design.

```
data/facilities.json   a physical place.       Machine-derived.   84 records
data/layouts.json      a playable routing.     From Grint.        94 records
data/facts.json        an external claim.      Hand-curated.      25 facilities
```

### Facility vs. layout

**A facility is the place. A layout is the thing you played and ranked.**

Ten facilities carry more than one layout: Hualalai (Ke'olu + Nicklaus),
Bethpage, Griffith Park, Brookside, Temecula Creek, Heron Lakes, Industry Hills,
TPC Toronto, Las Vegas Paiute, Legends on the Niagara, and Sepulveda.

The map plots facilities. The rankings list layouts. Collapsing the two puts two
pins forty feet apart in the ocean off Kona and makes "how many courses have you
played?" permanently unanswerable.

Grint's own header agrees the distinction is real: it reports **93 played
courses** while the ranking table runs to **94 rows**. The 94th is Scholl Canyon,
rated but never played — flagged `unplayed`, not dropped.

### Verbatim, then flagged

The spine transcribes Grint exactly and appends `flags[]`. It never edits a
value. Current flags:

| Flag | Count | Meaning |
|---|---|---|
| `nine_hole_suspected` | 12 | 18-hole average below 60 — almost certainly 9-hole rounds |
| `mixed_round_lengths_suspected` | 2 | Average between 60 and 72; may be mixing 9s and 18s |
| `unplayed` | 1 | Rated, never played |

This matters downstream: the scoring vector is computed against a mean of
**89.8 over 81 clean layouts**, not over all 93. Including a 9-hole 40 would drag
the baseline down ~8 strokes and make every real course look easy.

Name corrections are also *not* the spine's job. "Cherry Downs Golf & Count"
stays truncated and "Tpc Of Scottsdale" stays mis-cased in `layouts.json`;
`facts.json` supplies a sourced `displayName` that the build prefers.

### The provenance contract

Every field in `facts.json` is an object, never a bare value:

```jsonc
"architect": {
  "value": "A.W. Tillinghast",
  "source": "https://en.wikipedia.org/wiki/Bethpage_State_Park",
  "confidence": "high",          // high | medium | low
  "checked": "2026-08-01",
  "verified": false               // has a human/fetch confirmed the source says this?
}
```

`validate.mjs` errors on a missing source and on a confidence outside the
enum. It reports the unverified count on every run.

> **Current status: 88 claims, 86 unverified.** The seeded facts were written
> from general knowledge on 2026-08-01 to exercise the schema and give the
> marquee courses a dossier. **Do not treat them as fact until the verification
> pass has run.** The map labels each one `unverified` in the UI.

OSM tags (`holes`, `par`, `access`, `website`, `architect`) are kept *out* of
`facts.json` and attributed separately, so "OpenStreetMap says" and "I curated
this" never blur together.

---

## 3. Vectors

A vector is one comparable dimension, normalized 0–1, where 1 means more of the
thing. `null` means genuinely unknown and is **excluded** from any lens using it
rather than treated as zero.

| Vector | Source | Definition |
|---|---|---|
| `personalRank` | Grint | Your ordering, inverted so 1st = 1.0 |
| `rating` | Grint | Overall rating / 100 |
| `fun` | Grint | Fun rating / 100 |
| `condition` | Grint | Condition rating / 100 |
| `replayRate` | Grint | `sqrt(timesPlayed / max)` — revealed preference. Square-rooted so the 10-play home course doesn't flatten everything else to zero |
| `funMinusCondition` | Grint | Fun earned in spite of the turf. Centred at 0.5; ±20 points spans the range |
| `scoringDelta` | Grint | How much better than your mean you score here. **Null for `nine_hole_suspected`** |
| `externalRanking` | facts | Best position across every published list |
| `hasArchitect` | facts | 1 when a named architect is on record |

Physical vectors (acreage, water and bunker density, elevation relief) are
derivable from OSM and terrain but are **not yet computed** — only `areaAcres`
exists today.

### Lenses

A lens is a named weighting over vectors — a question you can ask of the data.
They live in `data/weights.json` as config, not code. A lens naming an unknown
vector is a validation error, not a silent zero.

| Lens | Question |
|---|---|
| `grint` | As I ranked them — the baseline |
| `scoring` | Where do I actually score well |
| `enjoyment` | Pure fun |
| `revealed` | What I did, not what I said — times played dominates |
| `conditioning` | Best kept |
| `underrated` | High fun despite poor turf |
| `architecture` | External recognition and named architects |

Scores are a weighted mean over the non-null vectors, **renormalized** by the
weight actually used, and each carries a `coverage` figure. A sparse facts layer
therefore degrades gracefully instead of silently ranking every uncurated course
last.

The interesting output is where lenses *disagree*. Rancho Park is 59th on the
Grint list and your single most-played course at 10 rounds; `revealed` and
`grint` will never agree about it, and that disagreement is the finding.

---

## 4. Sources

| Source | Gives | Auth | Cost | Status |
|---|---|---|---|---|
| Grint paste | rank, rounds, avg score, 3 ratings | none | manual | **in use** |
| Nominatim | coordinates | none, 1 req/s | free | **in use**, cached in git |
| Overpass / OSM | course polygons, `holes`, `par`, `access`, `website`, `operator`, `architect` | none | free | **in use**, cached in git |
| Overpass / OSM `golf=*` | greens, fairways, tees, bunkers, water, cart paths, numbered hole centrelines | none | free | **in use**, cached in git — 62 of 76 courses draw as a plan |
| Esri World Imagery | satellite basemap | none | free, attribution required | **in use** |
| Esri Boundaries & Places | label overlay | none | free, attribution required | **in use** |
| Hand curation | architect, year, championships, rankings, notes | — | time | **in use**, 25/84 |
| Grint export extension | per-round + hole-level scores, all stats views, handicap record, course/tee data | logged-in browser tab | one popup click | **capture built** — `grint-extension/`, bundle inventoried by `grint:inventory`; parser not yet built |
| Golf Digest / Golfweek / Top100 | published rankings | none | brittle scrape, licence gray | *not built* |
| Garmin R50 | shot telemetry | OAuth | unproven | *not built* |

### Adapter contract

`scripts/parse-grint.mjs` is one implementation of a **source adapter**. Any
adapter must emit these two files, and nothing downstream may depend on how they
were produced:

**`layouts.json`** → `{ source, adapter, capturedAt, rawFile, layouts: [...] }`
where each layout has `slug, facilitySlug, grintLayoutName, grintFacilityName,
personalRank, timesPlayed, avgScore, ratings{overall,fun,condition}, played,
flags[]`.

**`facilities.json`** → `{ capturedAt, facilities: [...] }` where each has
`slug, grintName, locality, region, country, layoutSlugs[], aliases[]`.

The export-extension parser becomes the second adapter: `grint-extension/`
captures a verbatim `grint-export-*.json` bundle into `data/raw/`, and
`parse-grint-export.mjs` (not yet built) parses it. It will add per-round records,
which is a new file (`rounds.json`) rather than a change to these two.

---

## 5. Pipeline

```
data/raw/grint-*.txt
        │  parse-grint.mjs      verbatim + flags; asserts 93/11/3 against Grint's header
        ▼
facilities.json ── layouts.json
        │  geocode.mjs          overrides → muni seeds → cache → Nominatim
        ▼
geocache.json  (each entry carries a `precision`)
        │  fetch-osm.mjs        batched Overpass; repairs coordinates; stitches relations
        ▼
course-polygons.geojson + repaired geocache.json
        │  fetch-holes.mjs      one Overpass pass per course bbox; keeps only what
        │                       falls inside the boundary; Douglas–Peucker at 0.5m
        ▼
holes/<slug>.geojson + holes/index.json   ──► fetched lazily by src/course.js
        │  build.mjs            join + compute vectors + score every lens
        ▼
courses.json ──► index.html
        │  validate.mjs         invariants + coverage; exits non-zero on error
```

Both network stages cache to git, so a clean checkout rebuilds with zero API
calls. Delete a cache entry to refetch it.

### Geocode precision

The pin's trustworthiness is a stored field, shown in the dossier. Never a
silent `0,0`.

| Value | Meaning |
|---|---|
| `seed` | Verified origin from `golf/muni` (4 facilities) |
| `manual` | Hand-entered in `geocode-overrides.json` |
| `osm_polygon` | Centroid of a matched OSM course boundary |
| `osm_bounds` | Centre of a matched OSM course's bounding box |
| `course_feature` | Nominatim returned an actual `leisure=golf_course` |
| `named_place` | Nominatim matched the name but not as a golf feature |
| `city_centroid` | **The town, not the course.** Warned about by `validate.mjs` |

---

## 6. Coverage

Printed by `npm run validate` on every run. See the terminal for current
figures; the shape of the table is:

- coordinate · OSM polygon · curated facts · architect (curated) · architect
  (OSM) · year opened · access · external ranking · hole count
- geocode precision distribution
- claims / unverified / sourceless

**The number that matters most right now is `unverified`.** Until the
verification pass runs, the facts layer is scaffolding with plausible content in
it.

---

## 7. Known gaps

- **86 of 88 curated claims are unverified.** Highest-priority debt.
- **Only 1 facility has an external ranking.** The `architecture` lens is
  effectively untested.
- **The bucket list (38 courses) isn't captured.** The paste covered played
  courses only. The friends-activity feed leaks a handful — Sand Valley, Kiawah
  Ocean, all four Bandon courses, Pebble, Spyglass, Bethpage Red — but the real
  list needs one more paste. Same schema, `played: false`.
- **No per-round or hole-level data.** The paste has averages only.
- **No physical vectors.** Water/bunker density and elevation relief are
  derivable from data already fetched, but aren't computed.
- **Facilities still on a town centroid** are listed by `validate.mjs` each run.

---

## 8. Roadmap

Everything above this line exists. Everything below does not.

**Phase 2 — verification and depth.** Run the fact-verification pass. Add
published rankings for the top 25. Capture the bucket list. Compute the physical
vectors from geometry already on disk.

**Phase 3 — rounds.** Capture side is built: `grint-extension/` scrapes the
classic client from a logged-in tab (trend views, scorecards, handicap,
`/ajax/get_course_data`) into a `grint-export-*.json` bundle in `data/raw/`.
Remaining: run the first capture, then write `parse-grint-export.mjs` against
the real markup. Adds `rounds.json`: dates, per-round scores, ideally
hole-level. This is the first data that makes the map a record of *when*
rather than only *whether*.

**Phase 4 — shots.** Garmin R50. Unproven: `gravityDopeRat/api/_lib/integrations/
garmin/` establishes the auth pattern worth copying — bootstrap MFA locally once,
persist OAuth tokens, never re-auth from password because Garmin rate-limits
repeat logins — but it pulls wellness data, not golf. The R50 export path needs
its own recon before any code. Worth heeding the note in `PROJECT_AUDIT.md` that
Rat "built Garmin OAuth before proving anyone opened the app daily."

**Phase 5 — strategy.** This is where `courseRender` stops being a rejected
alternative and becomes the base. It already has:

- `packages/course-schema` — Zod-validated GeoJSON, WGS84, and an `aim_point`
  feature type already in the schema
- `packages/course-discovery` — coordinate → canonical course with hole
  centerlines, tee centers and geodesic yardages, with explicit
  `missing_geometry` / `missing_green` slots rather than fabrication
- `packages/hole-catalog` — an architecture vocabulary already curated for 20
  great holes: `cape`, `heroic`, `penal`, `strategic`, `island_green`, `leven`…
- a PostGIS catalog whose `course_external_ids` table has a provider column that
  a `grint` row slots straight into

Note the asymmetry recorded in `golf/NEXT.md`: courseRender was rejected as a
base for the MUNI *game* because MapLibre at pitch 0 in lon/lat degrees has no
physics and no 3D. For a map and a strategy tool, every one of those traits is an
argument in favour. Its missing CI is the first thing to add.
