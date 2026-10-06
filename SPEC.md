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
data/facilities.json      a physical place.       Machine-derived.   85 records
data/layouts.json         a playable routing.     From Grint.        96 records
data/facts.json           an external claim.      Hand-curated.      25 facilities
data/california-100.json  a compiled list.        Hand-kept, checked. 100 entries
```

The fourth file is a different kind of thing from the first three: a to-play
list, compiled from published rankings, that names spine courses where it
can (`facilitySlug`, `layoutSlug`) and otherwise describes courses the record
has never met. Its contract is in its own `_README` and in *Lists* below.

Two of the 96 layouts (and one of the 85 facilities) come from the round
record, not the paste — see *Courses the paste hasn't met* below. They carry
`origin: "rounds"` and the `rounds_only` flag; everything the paste alone
knows (rank, ratings, avgScore, locality) is null on them, never guessed.

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
| Grint export extension | per-round + hole-level scores, dates, putts, fairway codes, differentials | logged-in browser tab | one popup click | **in use** — `grint-extension/` captures, `parse-grint-export.mjs` emits `rounds.json`; the profile pages read it directly via `lib/round-history.ts` |
| Golf Digest / Golfweek / GOLF | published rankings, via the California 100 compilation | none | hand-kept, checked row by row | **in use** — 21 facilities carry a published ranking; `build.mjs` derives `publishedRankings` and feeds only US-scale ranks to `externalRanking` |
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

The export-extension parser is the second adapter: `grint-extension/` captures
a verbatim `grint-export-*.json` bundle into `data/raw/`, and
`parse-grint-export.mjs` parses it into per-round records — the new file
`data/rounds.json` (dates, per-hole strokes/putts/fairway codes, and the
handicap-differential series in chart order), never a change to these two.

### Asserted intent: data/goals.json

The one file that records what the golfer *means to do* — a week or two of
goals — because no ledger can know intent. Everything about how a week is
going is derived (`lib/goals.ts` metric registry), measured in **record
time**: a week is open until the newest capture outruns it, then achieved or
missed by what the record says. The engine proposes (`pnpm goals:propose`,
from the plan's ledger since 2026-09-29: the two biggest priced areas as
next-round targets, then the doubles line; `--legacy` keeps the old top-leak
+ top-task proposal); pasting into this file is the human's commit — the
`round-links.json` pattern applied to intent.

The `next-round-*` metrics (`doubles`, `gir`, `three-putts`, `up-and-downs`,
`troublesome-tees`) read the FIRST full 18-hole card dated inside the week —
the first, so a second round cannot rescue the first — and each needs what it
needs: par (through a confirmed link to the watch), putts (a full card), or
the watch itself. A week that ends with no eligible round is `unplayed`,
neither achieved nor missed. Every metric's `compute` receives the week as
`{ weekOf, weekEnd }`; the older metrics ignore it.

```json
{ "weeks": [ { "weekOf": "2026-08-24", "goals": [ {
  "id": "2026-08-24-1",          // any unique string
  "metricId": "next-round-doubles", // a key of METRICS in lib/goals.ts
  "target": 2,                    // the number to reach (direction is the metric's)
  "club": "Driver",              // only for club-scoped metrics (usable-shots)
  "leakId": "gir-ceiling",       // optional join to the leak it answers
  "taskId": "three-putts",       // optional join to the task it executes
  "note": "why this week"        // optional, printed verbatim
} ] } ] }
```

Weeks sort by `weekOf` and the newest is "this week" everywhere — position,
not the wall clock. Unknown metric ids, bad targets, or joins that no longer
resolve render as their own state (`invalid` / orphaned), never a crash.

### Benchmarks: data/benchmarks.json

The one file allowed to hold a number about other golfers. Every entry:
`{ id, metric, band, value, unit, definition, population, source (URL),
sourceTitle, quote?, checked, verified, confidence }`. `definition` is the
provider's own — the plan prints it beside the record's definition, because a
Shot Scope "up-and-down" (any score) is not a Grint "par save" (par or
better). `band` is the provider's grouping (a handicap band, or a scoring band
like `70s`), never mixed. `pnpm data:validate` refuses an entry without a
URL, a population or a definition, and prints the unverified count.
`lib/benchmarks.ts` `bench(file, metric, band)` is the only lookup and never
falls back to another band.

### Lists: data/california-100.json

The California Public 100 — the to-play list (DECISIONS.md 2026-10-06). One
compilation of published public-access rankings, 100 entries, each with the
compiled rank, the published ranks it came from (Golfweek 2026 CA/US, Golf
Digest 2025–26 score / state / national-public, GOLF 2024–25 You Can Play),
the back tee, an approximate posted fee band, access codes, a value grade,
the index's own nine-component "Amar" score with a drive estimate from SF and
a housing call, and a provenance block with one check per claim group
(`rankings`, `tee`, `fee`, `architect`: `{verified, source, note}`).
`provenance.verified` is true only when every check is; a verified check
names a URL or a key in the file's `_sources`. The join to the spine is
explicit — `facilitySlug` and, at a multi-layout facility, `layoutSlug`; a
layout the spine lacks reads as *facility played, this course not*; an entry
whose name sits inside a California facility's slug while naming nothing
must carry a `joinNote`. The Amar block is an opinion, not a claim: no check
applies, and validate re-does its arithmetic. `pnpm data:validate` enforces
all of it and prints `linked · verified · checks`. `lib/california100.ts`
parses and joins; `/california` renders; `build.mjs` derives the dossier's
published rankings from it. Unknown values are null, never guessed.

### Courses the paste hasn't met

`rounds-to-spine.mjs` (`data:spine`) closes the gap between the two adapters:
a course present in `data/rounds.json` but absent from the spine — played
after the last paste — is APPENDED to the two spine files with only what the
record can honestly say (verbatim name, a count of real rounds, the Grint
course id) and null for everything else, flagged `rounds_only`. Slug rules
and the facility-alias table stay in step with `parse-grint.mjs`, and the
alias table also maps a RENAMED course to its facility (Brambles → Hidden
Valley Lake G&CC, same property, OSM relation/3570262), so a rebrand becomes
a second layout rather than a second pin. The geocoder caches Nominatim's
addressdetails, and the build falls back to them for the place fields where
the paste is silent, stamped `placeFrom: "nominatim"`. A null rank is
*unknown, not last*: the rank scale normalizes over ranked layouts only, and
unranked courses render muted on the RANK lens and sit at the bottom of the
list view labelled as awaiting the next paste.

---

## 5. Pipeline

```
data/raw/grint-*.txt
        │  parse-grint.mjs      verbatim + flags; asserts 93/11/3 against Grint's header
        ▼
facilities.json ── layouts.json
        │  rounds-to-spine.mjs  appends courses only the round record knows
        │                       (rounds_only, unranked); >10 additions = drift, fails
        ▼
facilities.json ── layouts.json
        │  geocode.mjs          overrides → muni seeds → cache → Nominatim
        │                       (also caches Nominatim addressdetails as the
        │                        place fallback for paste-less facilities)
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
- **All 100 rows of the California 100 are unverified** on arrival
  (2026-10-06): the verification pass is the next job, and the page says so
  on every row.
- **21 facilities carry a published ranking, all via the California 100.**
  The `architecture` lens is real for them and untested for the other 68.
- **Grint's own bucket list (38 courses) isn't captured.** The California
  100 is a compiled list, not Grint's; the Grint paste covered played
  courses only, and the friends-activity feed leaks a handful — Sand Valley,
  Kiawah Ocean, all four Bandon courses, Pebble, Spyglass, Bethpage Red.
  Same schema, `played: false`, one more paste.
- **The California 100 has no coordinates.** 78 of its courses are not in
  the spine, so the map cannot draw them yet — see NEXT.
- **No per-round or hole-level data.** The paste has averages only.
- **No physical vectors.** Water/bunker density and elevation relief are
  derivable from data already fetched, but aren't computed.
- **Facilities still on a town centroid** are listed by `validate.mjs` each run.

---

## 8. Roadmap

Everything above this line exists. Everything below does not.

**Phase 2 — verification and depth.** Run the fact-verification pass, now
over `facts.json` and the California 100 both. Published rankings arrived
with the list (2026-10-06). Capture Grint's bucket list. Compute the physical
vectors from geometry already on disk. Geocode the list's 78 unmet courses
and draw them hollow on the map.

**Phase 3 — rounds.** Done end to end on the data side: `grint-extension/`
scrapes the classic client from a logged-in tab into a `grint-export-*.json`
bundle, and `parse-grint-export.mjs` emits `data/rounds.json` — 166 rounds
with dates, per-hole strokes/putts/fairway codes, and 151 handicap
differentials. The profile reads it directly (`lib/round-history.ts`, since
the 2026-08-17 merge) and now answers "is the golf getting better" with
numbers. Since 2026-08-19 the record also feeds the map: courses played
after the last paste reach the spine via `rounds-to-spine.mjs` (unranked,
`rounds_only`), and the map's rail carries a LIST view — the full ranking
as a table, sorted by any lens. Still open: rounds themselves (dates,
scores) aren't drawn on the map, and no layout carries par or rating/slope
(the export's `get_course_data` calls need real tee ids, which the
scorecard page only loads by JS).

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
