# NEXT

<!-- state:start -->
**State** (auto) · branch `main` · 0 unpushed · live https://courses.ummerr.com · updated 2026-10-15
Last commit 2026-10-15 — The last-ten table on /rounds is a table: label with its definition beneath, last 10, career
<!-- state:end -->

Where I left off. Read `SPEC.md` for what the system *is*; this is what to do
next.

**State as of 2026-10-06:** the two sites are one Next.js app — command
center at `/`, map at `/courses` — deploying as the single `mackenzie` Vercel
project. Newest capture 2026-10-06 (Garmin + Grint "last 10", the first
live recent-mode run — 2.5 MB): 6 shot-bearing watch rounds, 6 confirmed
links, the newest Meadow Club 2026-10-05 (88, differential 13.3, index
**13.1 → 12.7**; a Garmin↔Grint facility alias was needed). 174 Grint
rounds, 159 differentials. The week of 2026-09-29 is still open in record
time (ends 10-06): greens achieved, up-and-downs 0 of 6 and doubles 4
against the targets — the next capture closes it. `pnpm data:validate`
exits clean. **The guidance is now `/plan`** (2026-09-29): the record priced
against sourced break-80 benchmarks (`data/benchmarks.json`, 42 entries,
all verified) — short game 4.1 strokes a round, approach 2.1, putting 0.6,
tee 0.5, against an index gap of 6.6. `/practice` redirects into its foot.
The week's goals are next-round targets from the plan (`pnpm
goals:propose`), never range-data goals. The hand analysis behind it is in
`DECISIONS.md` 2026-09-29 (two entries).

**2026-10-15 — Scout.** `/scout/tpc-harding-park-golf-course` (nav:
Scout) is the hole-by-hole game plan: OSM's bunkers, green and centreline
outlined over the imagery, the tee club's landing band from the watch's own
bands, the aim line to a chosen pin, the last round ghosted under it, and
one blunt sentence per hole. Notes are `data/scout/<slug>.json` (sourced,
validated, no typed distances); the engine is `lib/scout.ts` (pure, 27
tests on the real files). `DECISIONS.md` 2026-10-15 has the rules. Presidio
followed the same day (`data/scout/presidio-golf-course.json`): published
reads are thin there — the course's own tour is video only — so eleven
greens are `unread` and the card's sand, tee positions and the two watch
rounds carry it; a sourced `layup: true` on a par 5 makes the second shot
always the lay-up (Presidio 2 and 10, Harding 4 and 12). To scout
the next course: `pnpm data:holes` must have its plan, then a notes file
after the Harding one, then `pnpm data:validate`. Open: feed today's round
back (which holes bled, against the plan's targets); read Garmin's raw
`holeHandicaps`/tee ratings so a notes file can borrow its card.

**2026-10-12 — the capture goes unattended.** A nightly GitHub Actions run
(`.github/workflows/nightly-capture.yml`, 04:00 Pacific) pulls what is new
from Garmin (bearer token via `python-garminconnect`, a Node port of the
extension's scraper) and Grint (the extension's own files in a headless
Playwright tab), runs `pnpm refresh`, gates on validate / typecheck / test /
build, and commits to `main` — live a minute later. One link rule confirms
(one candidate, same facility, date and strokes); the stale-reader line is
now a validate error. `DECISIONS.md` 2026-10-12 has the reasoning. **Until
the five secrets are set and the first `workflow_dispatch` run is green, the
loop is still the manual one below** — see "Nightly capture" under *Then*.

**2026-10-06 — the penalty row is read.** Grint's `Penalties` row (W/D/O/S/F,
legend found in the raw scorecard HTML) now prints hole by hole on `/rounds`:
an 18-cell strip under every recent round, a line on every hole the watch
heard, and a panel in "Where the strokes live" (2.4 penalty strokes + 1.9
bunker shots a card, floors). The leak engine and `/plan` do **not** read it
yet — see `DECISIONS.md` 2026-10-06 — which is the obvious next move: price
penalty strokes as a leak and feed bunker visits to the short-game entry.

**2026-10-15 (later) — the trips get pictures.** 35 Commons photographs
with credits in `data/california-100-photos.json` + `public/california/photos`
(validated: licence, author, page, subject, one hero per trip); the trip
map is Esri's National Geographic basemap; the unfurl card is the hero
photo with the title set into it. Nine of the 27 trip courses still have
no picture we may print (Pasatiempo, Poppy Hills, Spyglass, Bayonet, the
Truckee three, Grizzly Ranch, Whitehawk, Monarch Dunes, La Purisima,
Soule Park, SilverRock, PGA West Stadium) — a photo of your own, dropped
into the folder with a row in the file, is the fix. `DECISIONS.md`
2026-10-15 (second entry).

**2026-10-15 — trips are shareable.** Every trip has its own static URL
(`/california/trips/<slug>`) with an Open Graph unfurl card, a satellite map
of airport + courses in order (inline SVG of Esri tiles, `lib/tile-map.ts`,
no map library), a square of imagery per course, straight-line miles between
stops, and a share bar (share sheet / copy link / Google Maps directions
with the stops as waypoints). `/california/trips` is all nine on one page.
Points live in `data/california-100-geo.json` from `pnpm data:geocode:ca`
(all 100 courses + 8 airports, Nominatim); validate refuses a trip with a
missing point. The hundred's map pins (item 3) can now read the same file.
`DECISIONS.md` 2026-10-15.

**2026-10-13 — trips.** `/california` has a Trips section: nine weekends
with friends (the MacKenzie weekend, Pebble once, Truckee, the Lost Sierra,
the desert, Torrey both, Ojai, the Central Coast, the home game), each two
or three of the hundred with airport, bed, season, day plan and story, in
`data/california-100.json` under `_trips` and validated (slugs resolve,
open courses only, 2–3 each, days = nights + 1). An itinerary is an opinion
like the index; the fees are the rows' bands summed. `DECISIONS.md`
2026-10-13. Not done: a trip filter on the table, trips on the map.

**2026-10-06 — the California 100 lands.** `/california` (nav: CA 100) is
the to-play list: 100 public-access courses from a ChatGPT compilation of
Golfweek / Golf Digest / GOLF rankings plus its own nine-component "Amar"
index, in `data/california-100.json` under a validated contract, joined to
the record at layout level — 22 linked, 19 played, 21 facilities now carry
a published ranking on the map's dossier. The same day's check-by-row passes
verified **498 of 500 checks** (98 rows in full) and corrected some 260
values — slopes off by 1–4 on about half the rows, fee bands skewed high,
Poppy Hills and Yocha Dehe on stale pre-renovation yardages, Black Horse
credited to the wrong general, and 12 Golf Digest scores the paste
invented for courses Golf Digest never scored (dropped). The two still
open are item 1b. Reasoning in `DECISIONS.md` 2026-10-06.

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

### 1b. The California 100's two open checks, and the fees' clock

498 of 500 checks verified on 2026-10-06 (98 rows in full). Open: Pelican
Hill Ocean North's fee — holes 1–3 and 13–18 closed for restoration until
2026-11-01, the engine sells a 9-hole product only; re-read it in November
— and Indian Canyons South's fee, behind a login wall (CPS Golf engine;
call or book once to see it). Everything else closed by reading pages in a
headless browser: Golf Digest's California guide, 100 Greatest Public list
and every course page (the site refuses plain fetches), the SCGA course
directory for the last ratings, and each course's own booking engine for
the 43 fees no site posts as a number — those fee notes carry the dates
read, and desert courses were read on their post-overseeding reopening
dates. Fees move; the note's date is the claim's shelf life.

### 2. Capture Grint's bucket list

38 courses, none of them captured — the original paste covered played courses
only, and the California 100 is a compiled list, not Grint's. Paste the
bucket-list table and extend `parse-grint.mjs` to emit them with
`played: false`. The friends-activity feed at the bottom of
`data/raw/grint-played-2026-08-01.txt` already leaks several: Sand Valley,
Kiawah Ocean, Bandon Dunes / Pacific Dunes / Bandon Trails, Pebble Beach,
Spyglass Hill, Bethpage Red.

### 3. Draw the California 100 on the map

78 of the hundred are not in the spine and have no coordinate. The work:
export `nominatim`/`pickResult` from `scripts/geocode.mjs` (guard its main),
a `data:geocode:ca100` step with its own cache keyed by list slug and a
California bounding-box check before any hit is accepted (the Brambles
lesson), `build.mjs` emitting `public/data/california-100.json` with
coordinates (no `played` — the map reads that from courses.json), a hollow
TO PLAY layer and rail toggle in `map.js`, and a `/courses#<slug>` hash
deep-link so the list's played rows open their dossier. Published rankings
for the top 25 arrived with the list (2026-10-06): 21 facilities carry one.

---

## Then

- **Nightly capture (2026-10-12).** Once live, nothing below this bullet is
  a chore — it is what the runner does. To make it live, once:
  `python3 -m pip install garminconnect==0.3.17 && python3
  scripts/capture/garmin-token.py --bootstrap` (MFA prompt if the account has
  it), then `gh secret set GARMIN_TOKENS < <(base64 <
  ~/.garminconnect/garmin_tokens.json)` and `gh secret set` for
  `GRINT_USERNAME`, `GRINT_PASSWORD`, `GARMIN_EMAIL`, `GARMIN_PASSWORD`
  (each prompts; never on the command line), then `gh workflow run
  nightly-capture.yml` and read the run. A failed night opens or updates a
  GitHub issue labelled `nightly-capture`; a Garmin failure means
  re-bootstrap the token and re-set the secret, a Grint failure means the
  password or the login page, a gate failure means run `pnpm refresh`
  locally and read the report. Locally the same loop is
  `GARMIN_AUTH_FILE=… GRINT_USERNAME=… GRINT_PASSWORD=… CAPTURE_NO_COMMIT=1
  pnpm capture:nightly` after `python3 scripts/capture/garmin-token.py
  --refresh --out .capture-state/garmin-auth.json`. The extensions remain
  the hand path and drop in beside the nightly bundles.
- **Re-capture both after every on-course round** (by hand, until the
  nightly run is green) — Garmin, then Grint's
  **Scrape last 10 rounds** (since 2026-09-29 the default: no baseline file,
  under a minute; the file input is the exact delta and refuses deltas, the
  checkbox is the full history). The downstream is one command since
  2026-08-24: extension → drop the bundle in `data/raw/` → **`pnpm refresh`** (it works out which pipelines the new
  files call for, re-proposes links, validates, rewrites PROFILE.md and the
  flight page) → confirm any proposed links in `data/round-links.json` →
  commit. Each capture retires or sharpens findings; the 5-round gate in
  `GARMIN_THRESHOLDS` was met 2026-09-26, so the short-game and lies
  unknowns are retired and the three watch findings print. The page prints
  the *split* (26% short game, 52% rough); the up-and-down count, the
  mishit count and the chip leave are still hand analysis in `DECISIONS.md`
  2026-09-29 — if one of them becomes a `lib/` finding, filter shots whose
  end equals the hole's pin first (28 of 90 holes; the watch has no putts,
  so the pin is often just where the last shot stopped). **Capture Grint
  with every Garmin capture** — the watch has no putts. **After every
  refresh, read the `pnpm data:rounds` line** — `differentials N handicap
  index X` and the five series counts. On 2026-09-09 a chart re-platform
  made all of them zero and validate did not notice; a zero there is a
  stale reader, not an empty record.
- **Auto-pull is built** (2026-10-12, above). What it does not do: capture
  the range (R50 CSVs are still a hand export), re-baseline Grint (a nightly
  bundle is always "recent"; tick **Full history** in the extension after
  deleting a round on Grint), or confirm an ambiguous link.
- **Keep the week.** Week three is committed (2026-09-29, rewritten from
  the plan): in the next round on the watch with its Grint card — 3
  up-and-downs, 5 greens, 2 doubles or fewer. The 3 Hybrid block goal is
  dropped. The practice order is the plan's ledger: chip on and one putt,
  then greens from 100–175, then contact, then lag speed — `/plan` prints
  it and `DECISIONS.md` 2026-09-29 has the why. When the record outruns
  the week, `pnpm goals:propose` drafts the next from the ledger; paste,
  `pnpm run profile`, commit. A week that ends with no eligible round is
  `unplayed`, not missed. **Every next-round metric needs the round on
  the watch AND its Grint card** — doubles and greens need par, which the
  card only knows through the link.
- **Unlock doubles over the whole record.** `lib/pars.ts` knows par only
  through the five links. The step that changes that: par per course and
  tee from a source — the watch's `holePars` for any course played on the
  watch (borrowing was designed and cut at 0 of 173 today), or Grint's
  `get_course_data` tee ids (the "Deliberately not doing yet" item below).
  With par on the LA courses the doubles line, the next-round GIR and the
  scramble rate stop being five-round numbers.
- **Verify the benchmarks stay true.** `data/benchmarks.json` was read on
  2026-09-29; providers restate their tables. Re-check yearly, and when a
  page moves, fix `source` rather than the number. The standing practice shape — three short sessions,
  blocked only for measurement, random for the rest, lag speed on the green,
  chips from rough measured by the leave — is in `DECISIONS.md` 2026-09-09.
- **Hit the first labeled wedge blocks.** The wedge matrix on `/bag` is 0 of 6
  partial cells measured, and the 21.8 yd PW→GW hole names where to start: a
  three-quarter Pitching Wedge block for the middle of that window. One length,
  one wedge, ~13 swings in a single block, then record it in
  `data/wedge-blocks.json` (session, club, swing, first and last shot time) and
  `pnpm ingest`-adjacent surfaces pick it up on the next render. The hole task
  retires itself once measured cells split the window under 15 yd — see
  `WEDGE_MATRIX_THRESHOLDS` in `lib/wedge-matrix.ts`.
- **Deploys are automatic since 2026-09-09.** The Vercel project is
  Git-connected to `github.com/ummerr/mackenzie`, so every push to `main` is
  a production build, and a local `.git/hooks/post-commit` (unversioned —
  re-create it on a fresh clone) pushes `main` after each commit. Commit on
  main = live at `https://courses.ummerr.com` a minute later; branch for
  anything half-done. `vercel deploy --prod` still works out of band.
  `courses.ummerr.com` resolves and is aliased to production. Still pending:
  a new `P-NN` row in `ummerr.github.io/index.html` next to the existing
  P-07 Golf card at line 109.
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
- **2026-08-24** — session ended: 0 file(s) dirty, 9 commit(s) unpushed. Last touched: `(committed, unpushed)`. <!-- campfire:2026-08-24 -->
- **2026-09-09** — session ended: 2 file(s) dirty, 2 commit(s) unpushed. Last touched: `app/rounds/watch.tsx`. <!-- campfire:2026-09-09 -->
- **2026-09-16** — session ended: 1 file(s) dirty, 0 commit(s) unpushed. Last touched: `app/rounds/watch.tsx`. <!-- campfire:2026-09-16 -->
- **2026-09-29** — session ended: 1 file(s) dirty, 0 commit(s) unpushed. Last touched: `app/rounds/watch.tsx`. <!-- campfire:2026-09-29 -->
- **2026-09-30** — session ended: 2 file(s) dirty, 0 commit(s) unpushed. Last touched: `app/rounds/watch.tsx`. <!-- campfire:2026-09-30 -->
- **2026-10-06** — session ended: 1 file(s) dirty, 0 commit(s) unpushed. Last touched: `app/rounds/watch.tsx`. <!-- campfire:2026-10-06 -->
- **2026-10-12** — session ended: 1 file(s) dirty, 0 commit(s) unpushed. Last touched: `(committed, unpushed)`. <!-- campfire:2026-10-12 -->
- **2026-10-13** — session ended: 1 file(s) dirty, 0 commit(s) unpushed. Last touched: `(committed, unpushed)`. <!-- campfire:2026-10-13 -->
- **2026-10-15** — session ended: 1 file(s) dirty, 0 commit(s) unpushed. Last touched: `(committed, unpushed)`. <!-- campfire:2026-10-15 -->
