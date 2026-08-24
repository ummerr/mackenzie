# NEXT

Where I left off. Read `SPEC.md` for what the system *is*; this is what to do
next.

**State as of 2026-08-17:** the two sites are one Next.js app — profile at `/`,
map at `/courses` — deploying as the single `mackenzie` Vercel project. The
pipeline runs end to end, `pnpm data:validate` exits clean. The map draws the
courses themselves from z13 — see `DECISIONS.md § Draw the course, don't just
point at it`.

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

`pnpm data:validate` prints the remaining count each run.

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

- **Re-capture Grint monthly-ish, Garmin after every on-course round.** The
  downstream is one command since 2026-08-24: extension → drop the bundle in
  `data/raw/` → **`pnpm refresh`** (it works out which pipelines the new
  files call for, re-proposes links, validates, rewrites PROFILE.md and the
  flight page) → confirm any proposed links in `data/round-links.json` →
  commit. Each capture retires or sharpens findings; at 5 shot-bearing
  rounds (2 as of 2026-08-23) the short-game and lies unknowns retire and
  three new findings switch on — see `GARMIN_THRESHOLDS`.
- **Path to true auto-pull** (when the manual capture grates): both captures
  are deliberately browser extensions riding the user's own authenticated
  session — headless authenticated fetch would fight the capture-verbatim
  grain and both sites' terms. The honest next step is **extension-side
  scheduling**: `chrome.alarms` firing the existing capture on a cadence and
  auto-downloading into `data/raw/` (the verbatim-bundle contract is
  untouched; `pnpm refresh` is already the whole downstream half). Garmin
  also has an official API programme (consumer OAuth) that could replace the
  extension for the watch if access is ever granted; Grint has no API.
- **Commit a first week of goals.** `pnpm goals:propose` prints the engine's
  draft (top leak + top open task as paste-ready JSON); paste into
  `data/goals.json`, edit to taste, `pnpm run profile`, commit. The front
  page and PROFILE.md then track the week in record time.
- **Hit the first labeled wedge blocks.** The wedge matrix on `/bag` is 0 of 6
  partial cells measured, and the 21.8 yd PW→GW hole names where to start: a
  three-quarter Pitching Wedge block for the middle of that window. One length,
  one wedge, ~13 swings in a single block, then record it in
  `data/wedge-blocks.json` (session, club, swing, first and last shot time) and
  `pnpm ingest`-adjacent surfaces pick it up on the next render. The hole task
  retires itself once measured cells split the window under 15 yd — see
  `WEDGE_MATRIX_THRESHOLDS` in `lib/wedge-matrix.ts`.
- **Confirm the two proposed round links** in `data/round-links.json` —
  Harding Park 91 → 62185587 and Presidio 98 → 62319577, both matched on
  facility, date and strokes; flip `status` to `confirmed` and commit.
  `pnpm data:validate` reminds until then.
- **Deploy.** One Vercel project now (`mackenzie`), `vercel deploy --prod`
  from the repo root. Still pending: the `courses.ummerr.com` DNS record, and a
  new `P-NN` row in `ummerr.github.io/index.html` next to the existing P-07
  Golf card at line 109.
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
  itself, which fixes them here on the next `pnpm data:holes --force`.
- **Two facilities still on a town centroid**, both because OSM has nothing
  under their name: `serket-golf-club` (nothing called Serket within 9km of
  Henderson — probably a rebrand; find the former name) and
  `the-links-golf-club` (Marlton NJ). Each is a one-line entry in
  `data/geocode-overrides.json` once you know where they are.
- **Feed the profile.** `PROFILE.md` and the front page derive one golfer
  from both halves of this repo, and its own "what the record cannot say"
  section is a to-do list for this file. Round-level scores with dates landed
  2026-08-15 (`data/rounds.json`), which retired "is the golf getting better".
  The one that would change it most now: par and rating/slope per tee, which
  would make an 88 mean something on the card's own terms. The pages read the
  pipeline's artifacts directly since the merge, so a rebuild is enough —
  just re-run `pnpm run profile` and commit `PROFILE.md` after any pipeline
  change or new capture.
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
- **courseRender as a base** — the right move for the strategy phase, wrong move
  for drawing 84 dots. See `SPEC.md § Roadmap`.

## Auto session log
- **2026-08-01** — session ended: 13 file(s) dirty, 0 commit(s) unpushed. Last touched: `.claude/`. <!-- campfire:2026-08-01 -->
- **2026-08-02** — session ended: 18 file(s) dirty, 0 commit(s) unpushed. Last touched: `.claude/scheduled_tasks.lock`. <!-- campfire:2026-08-02 -->
- **2026-08-03** — session ended: 3 file(s) dirty, 1 commit(s) unpushed. Last touched: `.claude/scheduled_tasks.lock`. <!-- campfire:2026-08-03 -->
- **2026-08-14** — session ended: 9 file(s) dirty, 0 commit(s) unpushed. Last touched: `DECISIONS.md`. <!-- campfire:2026-08-14 -->
- **2026-08-15** — session ended: 1 file(s) dirty, 2 commit(s) unpushed. Last touched: `yardages/NEXT.md`. <!-- campfire:2026-08-15 -->
- **2026-08-16** — session ended: 1 file(s) dirty, 0 commit(s) unpushed. Last touched: `yardages/NEXT.md`. <!-- campfire:2026-08-16 -->
- **2026-08-19** — session ended: 14 file(s) dirty, 0 commit(s) unpushed. Last touched: `DECISIONS.md`. <!-- campfire:2026-08-19 -->
- **2026-08-20** — session ended: 11 file(s) dirty, 0 commit(s) unpushed. Last touched: `DECISIONS.md`. <!-- campfire:2026-08-20 -->
- **2026-08-21** — session ended: 4 file(s) dirty, 0 commit(s) unpushed. Last touched: `DECISIONS.md`. <!-- campfire:2026-08-21 -->
- **2026-08-22** — session ended: 5 file(s) dirty, 0 commit(s) unpushed. Last touched: `DECISIONS.md`. <!-- campfire:2026-08-22 -->
- **2026-08-23** — session ended: 7 file(s) dirty, 0 commit(s) unpushed. Last touched: `data/garmin-rounds.json`. <!-- campfire:2026-08-23 -->
