# NEXT

Where I left off. Read `SPEC.md` for what the system *is*; this is what to do
next.

**State as of 2026-08-02:** the full pipeline runs end to end, `npm run validate`
exits clean, and the map is deployed. The map now draws the courses themselves
from z13 — see `DECISIONS.md § Draw the course, don't just point at it`.

---

## Do these first

### 1. Verify the facts — highest-value, lowest-glamour

86 of 88 curated claims are `verified: false`. They were seeded from general
knowledge to exercise the schema. Until they're checked they are *plausible*,
which is the most dangerous state for data to be in.

The work: open each `source` URL in `data/facts.json`, confirm the page actually
states the claim, flip `verified` to `true` or fix the value. Watch particularly
for the ones already marked `confidence: "low"` or `"medium"` — Royal
Westmoreland's year, Griffith Park's Wilson-course attribution, the Sandpiper
"best public ocean course" line.

`npm run validate` prints the remaining count each run.

### 2. Capture the bucket list

38 courses, none of them captured — the original paste covered played courses
only. Paste the bucket-list table and extend `parse-grint.mjs` to emit them with
`played: false`. The friends-activity feed at the bottom of
`data/raw/grint-played-2026-08-01.txt` already leaks several: Sand Valley,
Kiawah Ocean, Bandon Dunes / Pacific Dunes / Bandon Trails, Pebble Beach,
Spyglass Hill, Bethpage Red.

This is what turns the map from a record into a plan.

### 3. Fill in published rankings

Exactly **one** facility has an `externalRanking`, so the `architecture` lens is
effectively untested. Adding Golf Digest / Golfweek / Top100 positions for the
top 25 would make cross-source ranking real rather than schematic.

Manual entry for now — the automated scrape was deliberately deferred (brittle
HTML, licence gray area, hard name-matching problem).

---

## Then

- **Re-capture Grint monthly-ish.** The loop is one click end to end now:
  extension → `data/raw/grint-export-*.json` → `npm run grint:inventory` →
  `npm run rounds` → `cd yardages && pnpm ingest:rounds && pnpm run profile`,
  commit what changed. Each capture retires or sharpens profile findings.
- **Deploy.** `vercel.json` is written and the site is fully static. Needs
  `vercel link`, a deploy, a subdomain (`courses.ummerr.com`), and a new `P-NN`
  row in `ummerr.github.io/index.html` next to the existing P-07 Golf card at
  line 109.
- **Physical vectors — now mostly a counting exercise.** `data/holes/` has the
  geometry: bunker count and area, water count and area, total yardage from the
  hole centrelines, green sizes. `areaAcres` is still the only one `build.mjs`
  computes. Feeding these into the `underrated` and `architecture` lenses would
  give them something objective to lean on, and `holes/index.json` already
  carries the per-course counts to start from. Elevation relief still needs a
  terrain fetch.
- **The 14 courses with no drawable plan.** `holes/index.json` flags them.
  Several are real gaps in OSM (Royal Westmoreland comes back with one pond,
  Sandy Lane with seven bunkers) and a few are worth fixing upstream in OSM
  itself, which fixes them here on the next `npm run holes --force`.
- **Two facilities still on a town centroid**, both because OSM has nothing
  under their name: `serket-golf-club` (nothing called Serket within 9km of
  Henderson — probably a rebrand; find the former name) and
  `the-links-golf-club` (Marlton NJ). Each is a one-line entry in
  `data/geocode-overrides.json` once you know where they are.
- **Feed the profile.** `yardages/PROFILE.md` and `/profile` derive one golfer
  from both halves of this repo, and its own "what the record cannot say"
  section is a to-do list for this file. Round-level scores with dates landed
  2026-08-15 (`data/rounds.json` → `pnpm ingest:rounds`), which retired "is
  the golf getting better". The one that would change it most now: par and
  rating/slope per tee, which would make an 88 mean something on the card's
  own terms. Re-run `cd yardages && pnpm ingest:courses && pnpm ingest:rounds
  && pnpm run profile` after any map pipeline change or new capture, or the
  profile quotes a record that has moved on.
- **Two overrides are inferred, not confirmed** — `tierra-rejada-golf-club`
  matched an OSM polygon tagged "Golf Development Complex" on the right road,
  and `lanier-islands-golf-course` is the centre of four *unnamed* golf ways on
  Lake Lanier Islands. Both are good enough for a pin and both say so in their
  `source`. Worth confirming.

---

## Watch out for

- **Overpass is flaky.** During the 2026-08-01 build, `overpass-api.de` returned
  504 and 429 repeatedly, `overpass.private.coffee` hung indefinitely rather than
  erroring (hence the `AbortSignal` on every request), and
  `overpass.kumi.systems` served data **50 days stale** — caught by the guard
  ported from muni. If a run looks wrong, check `osm_base` in the output first.
  Full reasoning in `DECISIONS.md`.
- **`out geom` does not return relation members** on either working mirror. 27 of
  the matched courses are multipolygon relations and need the second-pass
  `resolveRelation()` query plus ring stitching. Don't "simplify" that away.
- **The caches are committed on purpose.** `geocache.json` and `osm-cache.json`
  are in git so a clean checkout rebuilds with no API calls. Delete individual
  entries to refetch; don't delete the files unless you mean to re-run everything.
- **Don't let name corrections leak into the spine.** `parse-grint.mjs` is
  verbatim. "Cherry Downs Golf & Count" stays truncated there; the fix belongs in
  `facts.json` as a sourced `displayName`.

---

## Deliberately not doing yet

- **Tee ids for `get_course_data`** — the export's course-metadata calls used
  a guessed tee index of 1 and came back empty; the real tee ids are loaded
  by the scorecard page's JS at runtime. Finding where that JS gets them
  (another `/ajax/*` action, most likely) is the key to par, rating and
  slope per tee — the profile's last big unknown. Needs one DevTools session
  on a scorecard page, not more scraping code.
- **Garmin R50** — no shot data exists anywhere in the tree and the export path
  is unproven. Needs its own recon before any code.
- **courseRender as a base** — the right move for the strategy phase, wrong move
  for drawing 84 dots. See `SPEC.md § Roadmap`.

## Auto session log
- **2026-08-01** — session ended: 13 file(s) dirty, 0 commit(s) unpushed. Last touched: `.claude/`. <!-- campfire:2026-08-01 -->
- **2026-08-02** — session ended: 18 file(s) dirty, 0 commit(s) unpushed. Last touched: `.claude/scheduled_tasks.lock`. <!-- campfire:2026-08-02 -->
- **2026-08-03** — session ended: 3 file(s) dirty, 1 commit(s) unpushed. Last touched: `.claude/scheduled_tasks.lock`. <!-- campfire:2026-08-03 -->
- **2026-08-14** — session ended: 9 file(s) dirty, 0 commit(s) unpushed. Last touched: `DECISIONS.md`. <!-- campfire:2026-08-14 -->
- **2026-08-15** — session ended: 1 file(s) dirty, 2 commit(s) unpushed. Last touched: `yardages/NEXT.md`. <!-- campfire:2026-08-15 -->
