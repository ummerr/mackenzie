# MACKENZIE

One golfer profile site, built from the two halves of the record:

- **The shot ledger** — a longitudinal record of Garmin Approach R50 range
  exports. The R50 screen and the Garmin Golf app both answer questions about
  one shot or one session; nothing answers questions that span sessions. That
  gap is half the product.
- **The course history** — a mapped, sourced, multi-vector history of every
  golf course played, drawn on aerial imagery at `/courses`.

The front page is the golfer the two halves derive together. The site is one
Next.js app; the map inside it stays a zero-build static page, served from
`public/courses/`.

Named for Alister MacKenzie — whose first American course, Meadow Club, sits
3rd on the list the map is built from.

**[SPEC.md](SPEC.md) is the living document for the course half;
[PROFILE.md](PROFILE.md) is the generated golfer.** This file is how to run it.

## Run it

```bash
pnpm install
pnpm dev                            # http://localhost:3000
pnpm test
pnpm typecheck
```

The data commands, ledger half:

```bash
pnpm ingest                         # data/raw/*.csv -> data/shots.json
pnpm run profile                    # both halves -> PROFILE.md
pnpm flight                         # the ledger -> public/ball-flight.html
pnpm compare                        # old vs new stock yardages, side by side
```

`pnpm run profile` needs the `run`: `profile` is an npm builtin, and pnpm hands
unknown commands to npm, so `pnpm profile` opens the registry's 2FA help
instead.

And the map pipeline, course half:

```bash
pnpm data:all        # parse → geocode → osm → holes → build → validate
```

Or one stage at a time:

| Command | Reads | Writes |
|---|---|---|
| `pnpm data:parse` | `data/raw/grint-*.txt` | `layouts.json`, `facilities.json` |
| `pnpm data:geocode` | `facilities.json` | `geocache.json`, `geocode-unresolved.md` |
| `pnpm data:osm` | `facilities.json`, `geocache.json` | `public/data/course-polygons.geojson`, `osm-cache.json`, repairs `geocache.json` |
| `pnpm data:holes` | `facilities.json`, `osm-cache.json` | `public/data/holes/<slug>.geojson`, `holes/index.json` |
| `pnpm data:build` | all of the above + `facts.json`, `weights.json` | `public/data/courses.json` |
| `pnpm data:validate` | `public/data/courses.json` | nothing — prints coverage, exits non-zero on error |
| `pnpm data:rounds` | `data/raw/grint-export-*.json` | `data/rounds.json` |
| `pnpm data:inventory` | `data/raw/grint-export-*.json` | nothing — prints what the bundle holds |

The network stages are cached in git (`geocache.json`, `osm-cache.json`,
`public/data/holes/`), so a clean checkout rebuilds with zero API calls. Delete
a cache entry — or an individual `holes/<slug>.geojson` — to refetch it.
`pnpm data:holes --force` refetches everything.

To add recent rounds, run the extension **incrementally**: feed its popup the
previous bundle and it fetches only what's new, downloading a small delta
bundle (`grint-export-YYYY-MM-DD-HHMM.json`) instead of re-scraping all ~168
scorecards. Drop it in `data/raw/` beside the full bundle. A delta cannot
record a deletion — run a full **Scrape all** occasionally to re-baseline.
See `grint-extension/README.md` (and `garmin-extension/README.md` for the
watch's sibling loop).

**The whole loop is: capture → `pnpm refresh` → confirm links → commit.**
`pnpm refresh` reads `data/raw/`, works out which pipelines the new files
call for (range CSVs → `ingest`; a Grint bundle → `data:rounds` and, if the
spine appends a course, the map chain; a Garmin bundle → `data:garmin`),
then always re-proposes round links, validates, and rewrites `PROFILE.md`
and the ball-flight page. `pnpm refresh --dry-run` prints the plan. The one
thing it never does is confirm a round link — that edit in
`data/round-links.json` is yours, and the report names it when it's
pending.

## Public vs private data

`public/data/` is what the site serves: `courses.json`,
`course-polygons.geojson`, and `holes/`. Everything else in `data/` — the
verbatim raw exports, the caches, `rounds.json`, the ledger files — is read at
build time only and is **not** publicly reachable. The 26 MB Grint export
bundle in `data/raw/` in particular must never move under `public/`.

## Adding a session

1. Export the range session from the Garmin Golf app.
2. Drop the CSV in `data/raw/`, filename untouched.
3. `pnpm ingest` — or `pnpm ingest --dry-run` to see what would change first.
4. `pnpm run profile && pnpm flight` to regenerate what derives from it.
5. Commit the CSV and the regenerated files together.

`data/raw/` is verbatim and never edited — the same contract for the R50 CSVs
as for the Grint pastes and export bundles that share the directory. A
correction goes in `data/exclusions.json`, never in the source file.

There is no database. Shots are ~800 bytes of JSON each, so two years of weekly
sessions is under 2 MB — smaller than the GeoJSON this repo already commits.
Git gives better provenance than a `raw_imports` table would: every import is a
diff, and a parser fix can be replayed over the whole history by re-running
`pnpm ingest`. See `DECISIONS.md`.

Re-running is idempotent twice over. The same file twice is deduplicated by
`(session, shot timestamp)`; so is a re-export of the same session under a
different filename, which a content hash would miss.

### Exclusions

`data/exclusions.json` maps a shot timestamp to `{excluded, reason}` and is
applied after the automatic phantom flag, so a hand edit always wins.
Exclusions are reversible and reasoned, never deletions — set `excluded` to
`false` to bring a shot back. An override matching no shot is reported as
orphaned on every run rather than silently doing nothing.

An override is recorded on the shot as `manualOverride`, in **both**
directions. Without it, `{"excluded": false}` produces a shot byte-identical to
one nobody ever touched, and a hand-included shot could not survive a later
automatic flag — manual precedence would work one way only.

## Hand-editable files

Everything else is generated. These are yours:

- **`data/bag.json`** — the clubs you own, asserted not derived. See "The bag".
- **`data/exclusions.json`** — shot overrides, see above.
- **`data/wedge-blocks.json`** — deliberate partial-wedge blocks, labeled by
  hand. See "The wedge matrix".
- **`data/facts.json`** — external claims about courses. Every one carries a
  source. See the contract in the file's own `_README`.
- **`data/weights.json`** — the map's ranking lenses.
- **`data/geocode-overrides.json`** — hand-entered coordinates; wins over
  everything.

## The bag

`data/bag.json` is the clubs you own. It is one of two hand-edited ledger
files, and the only thing on the site that is asserted rather than derived —
because **a ledger of what you hit cannot tell you what you did not**. A club
with no shots produces no row, no dot and no gap flag, so its absence reads as
nothing to report rather than never measured. Today four of thirteen clubs have
never been on the monitor, and without this file the bag page could not say so.

Keyed by the club's R50 `Club Type` string, which must appear in `BAG_ORDER` in
`lib/clubs.ts`. A key matching nothing there is reported as orphaned on every
run, the same as an exclusions typo. The check runs the other way too: a club
in the ledger that the bag does not list is printed under the table.

Two tiers per club, and the split is the point:

| Field | Shape | Why |
|---|---|---|
| `brand` `model` `headType` `shaft` `grip` | bare values | Owner-attested. You read them off the club; there is no page to cite that would make them more true. |
| `loftDeg` | `{value, source, confidence, checked, verified}` | A claim, in the same shape as `data/facts.json` — because loft is the field that can be wrong while you are looking at it. |

Every loft in the file is what the club **left the factory as**, not what a
gauge has measured on that club: a driver's sleeve is adjustable, an iron bends
a degree in a car boot, a wedge is ground to order. All of them are
`verified: false` and the profile lists that as a standing unknown. Unknown
fields stay **absent, never guessed** — a blank shaft is a gap, a wrong one is a
lie the app repeats forever.

**Loft cross-checks bag order; it does not define it.** `BAG_ORDER` has to sort
clubs nobody owns, and in this bag it could not be derived anyway — the utility
wood and the 3 iron are both 19°, which is a finding rather than a bug. Note
also that the utility wood is keyed `"3 Hybrid"`: the R50 has no utility-wood
`Club Type`, so the key is the slot the monitor logs, and `brand`/`model` say
what the club actually is.

What this buys, all of it derived: the *N never measured* tile and the bag
table on `/bag`, a loft column beside every carry gap, a practice task per
unmeasured club, and two profile findings the range half cannot produce alone.
A gap in degrees is only printed for clubs genuinely adjacent in the bag — the
gap table is built over *measured* clubs, and a loft difference that steps over
three of them is not a fact about a pair.

## The wedge matrix

`data/wedge-blocks.json` is the second asserted ledger file, and it exists for
the same reason as the first: **the ledger cannot say which swing a shot was
meant to be**. The classifier can prove a partial happened — reduced club
speed, normal smash — but "shorter than full" is not a yardage, so every
deliberate half wedge has been silently dropped from every number on the site.
The matrix on `/bag` ("The scoring bag") shows each wedge at half,
three-quarter and full; the full column is the bag chart's own stock carry, and
the partial cells fill **only** from blocks labeled here.

To record a block, after a session lands in the ledger:

```json
{ "sessionId": "2026-08-14T19:52:12", "club": "Gap Wedge",
  "swing": "three-quarter", "from": "2026-08-14T20:10:00",
  "to": "2026-08-14T20:18:00" }
```

`sessionId` is the id in `data/sessions.json`, the club is the R50 `Club Type`
string, and `from`/`to` are the first and last `shotTimestamp` of the block,
inclusive — timestamps come from the CSV, so labels survive re-ingest. `swing`
is `half` or `three-quarter` only; a full swing is the stock yardage and is
never labeled. Shots inside a block leave the full-swing statistics entirely —
they neither poison the club median nor get flagged against it — and are
reviewed against their own cell: same warmup rule, same smash and carry-outlier
tests, at the cell's own 8-shot display gate (`WEDGE_MATRIX_THRESHOLDS` in
`lib/wedge-matrix.ts`). A block that matches no shots is reported as orphaned,
exactly like a stale exclusion override. An unlabeled partial block buys
nothing — hitting the shots is half the work; the label is the other half.

## The profile

`/` — the front page — is the one place that reads both halves of the repo. The
shot ledger says what the swing does; the course history says what it shoots
and where. Neither is a golfer on its own.

Every finding it prints carries four things and ships with none of them
optional: the **claim**, the **evidence** that put it there, a **roast** where
that is honest, and — the part that makes it a spec rather than a horoscope —
the condition that **retires** it. Hit fifteen drivers and the line about not
owning one deletes itself, because it was a measurement and not a personality.

Two rules it does not bend:

- **No benchmark without a source.** There are no tour averages here and no
  handicap model. Every comparison is internal — this club against the one next
  to it, these courses against those — for the same reason `facts.json` makes
  every claim carry a URL.
- **A roast may be sharp, never unsupported.** Each one restates its own
  evidence and nothing more.

`PROFILE.md` is the same object rendered to a file and committed, so a change in
the golfer is a diff rather than a page that quietly reads differently than it
did in July. `pnpm run profile --check` fails if the committed file no longer
matches the data.

The course half is read straight from the pipeline's own artifacts:
`lib/course-history.ts` reshapes `public/data/courses.json` and
`lib/round-history.ts` reshapes `data/rounds.json`, both at build time. (They
were committed snapshots while the app deployed separately from the map; the
merge retired that seam — see `DECISIONS.md`.) Without the artifacts the page
renders the range half and says so.

## The map

`/courses` is the course history drawn on aerial imagery: every facility a pin,
six ranking lenses, a dossier per course with per-claim provenance, and from
z13.5 the OSM hole geometry drawn as a course plan.

It is deliberately zero-build — plain script tags, CDN MapLibre, no modules —
and lives under `public/courses/` so the app serves it untouched:

```
public/courses/index.html   the map page
public/courses/css/map.css  chrome; dark, calibrated against the satellite basemap
public/courses/src/         shared.js, panel.js, course.js, map.js — globals, no modules
```

Its data is fetched from `/data/` (see "Public vs private data"). The
`grint-extension/` directory is the Chrome extension that captures the Grint
record the pipeline parses; it is a sibling subproject, not deployed.

## Deploy

One Vercel project: **`mackenzie`**. From the repo root:

```bash
vercel deploy          # preview
vercel deploy --prod
```

Things that will trip you up:

- **It is a CLI deploy, not a Git integration.** Pushing to `main` does
  **not** redeploy — run the command above.
- **`data/*.json` and `public/data/*` must be committed.** Pages read them at
  build time. Run the ingests and commit their output before deploying, or the
  live site shows the previous session's numbers.
- `/courses` and `/ball-flight` are static files served through rewrites in
  `next.config.ts` (not Vercel `cleanUrls`), so they work identically in
  `next dev` and production.
- The per-deployment URL 302s to Vercel SSO; that is normal. The stable alias
  is public.
- The old `yardages` Vercel project is retired; do not deploy to it.

## What the R50 export actually looks like

Recon against the real exports in `data/raw/`. Read this before touching
`lib/parse.ts`.

- **Two header rows.** Row 1 is names, row 2 is units (`[mph]`, `[Yards]`,
  `[deg]`, `[ft]`, `[rpm]`). Row 3 is the first shot.
- **The club is in `Club Type`.** `Club Name` and `Brand/Model` are 100% empty.
  The R10 alias table that this project's mapping was lifted from maps the club
  off `Club Name`, which here would produce a bag chart with no clubs in it.
- **`Backspin` and `Sidespin` are separate columns.** The R10 table collapses
  both into one `spin_rate`. Don't.
- **14 of 42 columns are always empty**: the two target-distance columns, the
  eight tempo/stroke-length fields, `Note`, `Tag`, and the two club-name fields.
- **Five columns are exactly derived**, verified to floating point across both
  fixtures: `Face to Path = Club Face − Club Path`;
  `Spin Rate = hypot(Backspin, Sidespin)`;
  `Spin Axis = −atan2(Sidespin, Backspin)`;
  both deviation distances `= distance × sin(deviation angle)`.
- **No shot-index column and no session ID.** `shot_index` is row order.
  Identity comes from the per-shot timestamp, which is unique within a session
  in both fixtures.
- **The filename is the export time, not the session time.** Both fixtures were
  exported on 2026-08-02; the shots are from 2026-07-03 and 2026-07-05.
- **`Total Distance` is unreliable.** In one fixture it equals `Carry Distance`
  to the last decimal on 17 of 34 rows — the R50 declined to model rollout and
  copied carry. In the other it happens on 0 of 23. Session-dependent, so
  `total_is_carry_copy` flags it and any statistic over `total_yd` must exclude
  those rows or it blends two different quantities. Across the whole ledger it
  is 51 of 255 shots, 40 of them otherwise trusted. `lib/stats.ts` reads them as
  absent on the total basis — see *Carry or total*.
- **Environmentals are session-level.** Constant within a session, different
  between sessions.
- **`descent_angle_deg` has no source column** in any observed export. The
  field exists so a firmware change doesn't need a migration; until then it is
  permanently null and the UI must never imply otherwise.

Only range/practice sessions export at all. Home Tee Hero and on-course
practice do not, and no UI here should suggest they might.

## Sign conventions

Resolved 2026-08-02. **Positive is RIGHT of target** for a right-handed player
on every lateral column: `face_angle_deg`, `club_path_deg` (positive =
in-to-out), `launch_direction_deg`, `spin_axis_deg`, and both deviation
columns.

**`sidespin_rpm` is the exception — the device signs it backwards.** Because
`spin_axis = −atan2(sidespin, backspin)` holds to 2×10⁻⁶ degrees across both
fixtures, negative sidespin pairs with positive spin axis and means a ball
curving *right*. It is stored verbatim so the value matches what the Garmin app
displays, and nothing analytical reads it — `spin_axis_deg` carries the same
information the right way round.

Garmin publishes no signed-metric glossary; the R50 screen shows `3.2R`/`3.2L`
and the signs exist only in the CSV. The convention above rests on two
independent lines of evidence, recorded in `DECISIONS.md`.

## Layout

```
app/
  page.tsx            the golfer, derived from both halves — the front page
  bag/page.tsx        server: builds both bases in full and hands them over
  bag.tsx             the bag: masthead, scoreboard, gap scorecard, table twin.
                      Owns the one piece of state on the page — carry or total
  bag-chart.tsx       the plan view. Every shot a dot, one region per club
  palette.ts          turf, the ordinal club ramp, the gap verdict tokens
  globals.css         the tokens themselves, both themes, one line each
  theme-toggle.tsx    day / dusk / auto
  practice/           what to hit next, generated from the ledger
  scratch/            the road from 12.9 to scratch, on the record's arithmetic
  sessions/           exclusion hygiene, deliberately unstyled
  site-nav.tsx        the sections, inline above `sm` and a tab strip below
  use-media.ts        a media query as a boolean, SSR-safe
lib/
  aliases.ts          header -> canonical field. Add a locale here, never in the parser
  units.ts            conversion driven by the file's own units row
  clubs.ts            the club vocabulary: order, families, and the bag's shape. Pure
  bag-file.ts         data/bag.json off the disk. The one impure file in lib/
  parse.ts            one CSV -> one session. Pure
  ledger.ts           many sessions -> one deduplicated ledger. Pure
  stats.ts            medians, bands, gap flags, the carry/total basis. Pure
  tasks.ts            practice tasks derived from all of the above. Pure
  ball-flight.ts      start line vs curvature, and what corroborates. Pure
  course-history.ts   reshapes public/data/courses.json, and the arithmetic over it
  round-history.ts    reshapes data/rounds.json — the round-by-round record
  profile.ts          the golfer: findings, roasts, and what cannot be known. Pure
  yardages/
    thresholds.ts     every tunable number, in one documented object
    robust-stats.ts   median, MAD, weighted median, percentile intervals
    recency-weighting.ts  exponential decay and the per-session weight cap
    classify-shot.ts  shot review status, reasons and explanations
    club-profile.ts   stock yardages per club
scripts/
  ingest.ts           the R50 ingest — the only ledger file that touches the filesystem
  profile.ts          PROFILE.md, regenerated
  ball-flight.ts      public/ball-flight.html, regenerated
  ball-flight.template.html  the report's shell; one __DATA__ slot
  compare.ts          before/after table for a heuristic change. Writes nothing
  *.mjs               the map pipeline, ESM, zero runtime dependencies
public/
  courses/            the map — zero-build static, see "The map"
  data/               the published course artifacts the site serves
  ball-flight.html    generated report, served at /ball-flight
data/
  raw/                real exports, verbatim, never edited — R50 CSVs and Grint bundles
  bag.json            hand-editable — the clubs you own, asserted not derived
  exclusions.json     hand-editable overrides
  facts.json          hand-editable — sourced claims about courses
  weights.json        hand-editable — the map's ranking lenses
  sessions.json       generated
  shots.json          generated
  rounds.json         generated — the Grint round record
  facilities.json     generated — the spine, verbatim Grint + flags
  layouts.json        generated — same contract
  geocache.json       committed network cache
  osm-cache.json      committed network cache
grint-extension/      Chrome extension that captures the Grint record. Not deployed
tests/                vitest
```

## Shot review

Every shot gets a status, machine-readable reasons, and one sentence saying why.
Nothing is deleted; a flagged shot stays in the ledger and explains itself.

**Low carry alone does not mean a bad shot.** The discriminator is the
relationship between club speed and smash factor:

- **partial** — low carry, low club speed, smash normal for the club. Less
  energy went in, so less came out. The player meant this.
- **mishit** — low carry, normal club speed, smash low. The energy went in and
  the ball did not.

Carry ratio alone cannot tell those apart, and a rule built on it throws away
every deliberate three-quarter wedge as a miss. Wedges get a more permissive
carry threshold because partials are ordinary there, but the test they enter is
the same one — the physics does not change for a knocked-down 8 iron.

Two cases from the real ledger show why both halves are needed. A 116 yd six
iron at 103% of median club speed with smash 0.979 is a mishit and nothing else.
A 95 yd six iron at 100% club speed with smash 1.279 is *also* a mishit, but
smash cannot see it: the ball speed was fine and the launch angle was 4.3°
instead of 18°. It was thinned. The classifier names that case rather than
diagnosing it, because launch and spin are not part of the test.

Where club speed is missing — a quarter of this ledger, from one export that
tracked the ball but not the club — the classification falls back to smash alone
and is marked lower certainty. Where both are missing it says so. **No shot is
ever excluded for a metric the monitor failed to record.** Absence can widen a
verdict or lower its certainty; it can never be the whole of one.

Manual exclusion wins over any automatic verdict, in both directions. A hand-
included shot keeps its automatic reasons rather than having them erased, so a
shot you kept that the heuristics dislike is still visible as exactly that.

Below `minSampleForClubRelativeRules` shots, only the deterministic rules run —
warmup, phantom, missing data. Computing a club median off a handful of shots
and then excluding shots against it is circular, and it distorts precisely the
small samples least able to survive it.

Every threshold lives in `lib/yardages/thresholds.ts` with its reasoning beside
it. Two deserve mention here:

- **`recencyHalfLifeDays` is not a half-life.** `exp(-age/45)` decays to 1/e at
  45 days, not to one half. The name came from the brief and is kept verbatim
  rather than silently corrected.
- **A lateral outlier annotates a shot; it never excludes one.** In this ledger
  the pitching wedge shots 19-30 yd left carried *above* the club median.
  Dropping them would bias the carry number downward on the assumption that a
  crooked shot is a short one, and would erase the very signal that tells a
  systematic pull from one bad day.

Stock yardages carry a weighted and an unweighted median, always both. Recency
weighting is capped so no session contributes more than
`max(0.6, its share of the club's shots)` of the total weight — recency can
shrink a session's influence but never inflate it past what its sample size
already justified. Possible partials are excluded from full-swing stock
yardages and counted separately.

## Carry or total

The bag reads to either distance, and the toggle in the masthead governs the
whole page at once — chart, gap scorecard, headline gap and the table twin all
move together. A page showing carry in one panel and total in another would be
worse than a page showing the wrong one.

Neither basis is the real number. Carry is what clears the bunker; total is what
runs through the back of the green. They are not a rescale of each other either:
rollout in this ledger runs from 1.2 yd on a sand wedge to 10.3 on a five iron,
so the short end of the bag compresses and the long end stretches. A bag that
gaps cleanly on carry can gap badly on total, which is a finding about how the
ball behaves once it lands and not an inconsistency between two views. The
9i → PW gap is 12.1 yd on carry and 15.3 on total; PW → GW is 24.1 and 25.7.

**Both bases are measured, never derived.** The export carries its own deviation
distance and deviation angle for total as well as carry, and both satisfy
`deviation distance = distance × sin(deviation angle)` to under 0.02 yd across
the ledger. So the total view is drawn from the total columns — the same cone
construction over its own measured pair, not carry angles reused at a longer
radius.

**A total that copies the carry is read as absent.** On 40 otherwise-trusted
shots the R50 wrote the carry row into the total row verbatim: distance, offline
and angle all identical. That is a rollout it never modelled, not a ball that
stopped where it landed, and counting it as total would publish clubs that roll
nothing — the five iron would be 21 of its 26 shots. Those shots drop out of the
total basis entirely, which takes 5 Iron, 7 Iron and Sand Wedge below the
15-shot display threshold. They go dark on total and the page says why, above
the chart and in the held-back panel. A club that only clears the threshold on
shots carrying no rollout information has not been measured.

**One frame, both bases.** The chart is handed a distance axis wide enough for
carry *and* total, rather than fitting itself to whichever is showing. Left to
refit, it rescaled: total spans 115 yd against carry's 126, so the axis quietly
absorbed the extra distance and the drawing looked much the same. Worse, three
clubs drop out on total, so the longest label fell from `5i 195` to `6i 171` and
the bag read *shorter* — the exact opposite of what rollout does. Pinned to the
union, switching bases moves every shared club visibly up the page: the 6 iron
climbs 50 px, which is its 7.5 yd of roll at 1:1. The axis holds still and the
data moves, which is the comparison the toggle exists to make.

**Rollout is measured per swing, never as a difference of medians.** The `Roll`
column is the median of `total − carry` on each shot that has both. Subtracting
the two published medians would difference two different shot sets — total drops
the copies and carry does not — and call the answer roll.

**`/practice` stays on carry, deliberately.** Every task there is about a swing
you have or have not measured, and a swing is measured at the point of landing.
Rollout is the turf's contribution; ranking practice by it would sort the list
by something no amount of range work changes.

## Ball flight: start line vs curve

A shot that finishes 15 yd right either *started* there or *bent* there, and the
fix is not the same one. The bag chart draws where shots finished and cannot
tell those apart &mdash; a club aimed 12 yd left and a club that slices 12 yd
right make the same shape in a dispersion cone. `lib/ball-flight.ts` splits
them, and `pnpm flight` renders the split to `public/ball-flight.html`, served
at `/ball-flight` via a rewrite in `next.config.ts`.

Nothing is modelled. The export carries `launch_direction` (where the ball set
off) and `carry_deviation_angle` (where it finished); curvature is the
difference, and in yards at the shot's own carry:

```
start = carry × sin(launch_direction)
curve = carry × ( sin(carry_deviation_angle) − sin(launch_direction) )
```

Those sum to `carry × sin(carry_deviation_angle)`, which is the export's own
offline column &mdash; so the split is arithmetic on a published identity, and the
tests hold it to reconstructing that column within **0.02 yd** across the ledger.
Two more tests check the halves are named right: curvature must track the spin
axis (r = 0.93, sign agreeing on all 158 real curves) and start line must track
the club face (r = 0.97) *and not* the curve. A firmware change that redefines a
column fails loudly instead of quietly relabelling aim as curve.

What it found, on 181 trusted shots: only **8%** are genuinely straight, **76%**
curve more than 3 yd, and **two-thirds of the curves bend right** &mdash; a ratio
stable at every threshold from 2 to 5 yd. But the bag holds two opposite faults:
long irons bend right with the face open to the path, short irons bend left with
it closed. The Gap Wedge is neither &mdash; its face sits square to its path to a
tenth of a degree and the whole swing is aimed 7.6&deg; left, which is an
alignment problem no swing work will touch.

**The corroboration column is the point.** Per-club curvature is reported per
session, and the clubs that look like they slice are exactly the ones with the
least evidence: the 5 and 7 iron appear in one session each, and the 6 iron
produced a 4 yd draw one day and a 20 yd slice another. Only the 8 iron, 9 iron
and sand wedge have been seen twice agreeing. The aggregate right bias is solid;
the per-club long-iron slice is not established yet.

The page is generated and committed, the same contract `PROFILE.md` keeps &mdash;
`pnpm flight --check` fails when it no longer matches the ledger. It is served
as a static file rather than a route, so it costs the app nothing and can be
opened or printed on its own; the trade is that its design tokens are a copy of
`app/globals.css` rather than a reference, and a copy can drift.

## The plan view

The bag chart is drawn as the hole it is — mown fairway, rough either side,
distance flags up the left edge — and every piece of that scenery sits at a
position that means something. Each mow stripe boundary is a gridline. The
fairway edges are a real 30-yard corridor, so a club whose 80% lateral band
overruns them is a club that misses fairways, and you can see which side.
Nothing decorative is placed where it could be read as data.

Two layers, answering different questions. Every trusted shot is a dot at its
actual distance and actual offline — that is the dispersion, with nothing
summarised away. Over it, one region per club. The dots came second on purpose,
because a summary cannot show you that a club's miss is two clusters rather
than one spread, and this ledger contains exactly that.

**The region is a cone, because the miss is angular.** The export derives
`deviation distance = distance × sin(deviation angle)`, so offline yards are two
things multiplied together and only one of them is the club: the same aim error
puts a 6 iron further offline than a wedge purely because the ball went
further. A rectangle with parallel sides says the miss is a fixed number of
yards wide at every distance, which is not what the club did. So each club is
the region between rays at its measured p10 and p90 *deviation angle*, cut off
at its p25 and p75 distances — still exactly two measured quantile ranges, just
with the lateral one in the units the error is actually made in. Both are in the
table twin, in degrees and in yards.

The plot's y is the radial distance the export reports and its x is that
distance's offline component, which is what makes a ray of constant angle a
straight line here rather than a curve. Nothing is reprojected and no dot moves;
the sides of the region simply converge on the tee the way the shots did. Because that
convergence is about a yard across one club's interquartile band, the rays are
drawn on past the region and fade out toward the tee. They are angle
references, not a claim about where any ball was in mid-flight — a ball that
curves does not fly down the ray it lands on, and nothing here says it did.

The frame covers every dot rather than clipping to the boxes. Trimming an
outlier to keep the frame tidy would hide the misses, which are the reason to
plot shots at all. Below 700 px the chart scrolls sideways instead of shrinking:
the viewBox scales tick labels with the frame, and a five-pixel axis is worse
than a scrollbar. The scale stays 1:1 both ways at every size.

**Club colour is an ordinal ramp, not a categorical palette.** Clubs have a real
order, so swapping two of them would change the meaning — eight arbitrary hues
are wrong. Monotone lightness steps carry that order, and the ramp runs between
two hue poles — warm orange at the short end, blue at the long end, through
rose and violet, never through the turf's green — so two clubs a step apart
differ by a *nameable* hue and not just a shade (`DECISIONS.md`, "Two hue poles
in the club ramp too"). The ramp is validated rather than eyeballed, and the
gates run in `pnpm test` (`tests/palette.test.ts`): monotone lightness, every
adjacent step ≥ 0.06 apart in OKLCH, one monotone hue path clear of the green
band, and the end nearest the turf above the contrast floor against it. It spans the clubs actually *drawn*, so no step is
spent on a mark nobody can see. Every club is direct-labelled with its own chip
in the right-hand gutter, which is the legend and the label at once, so identity
never rests on hue. Gap verdicts wear reserved status tokens and are never a
series colour.

## Two themes

Light is the default and dark is the palette the app's first pages shipped
with. Both are one hole drawn on two grounds. The fairway stays lighter than
the rough in either theme — mown grass reflects and long grass does not, which
is a fact about grass and not about the page. The club ramp likewise keeps its
two hue poles and its direction in both; only the lightness band moves, because
the pale end has to survive a pale fairway in one theme and a black one in the
other.

The mechanism is `light-dark()` in `app/globals.css` — every token is one
declaration carrying both values, so the two themes stay diffable by eye and
there is no second block to drift out of step. Switching is `color-scheme` and
nothing else, keyed off a `data-theme` attribute that an inline script in
`app/layout.tsx` stamps before first paint. The toggle in the header is three
states: Day, Dusk, and Auto, where Auto hands it back to the OS.

The map at `/courses` is the exception and stays dark in both: `map.css` is
calibrated against a satellite basemap, which does not have a light mode.

Because the chart's colours are custom properties rather than constants,
they are set through `style` and never as SVG presentation attributes —
`fill="var(--x)"` is not reliably resolved and fails silently to no fill.

Every text token clears 4.5:1 on every ground it is used on, in both themes.

The gap rulers in the scorecard put the thresholds on the page instead of making
you do the arithmetic on every row: the shaded band is the 8–15 yd window where
a gap is fine, and a bar drawn left of the zero mark is an inversion.

## Practice tasks

`/practice` is generated from the ledger, never hand-written — a static checklist
is wrong the moment you hit balls, and goes on claiming things the data has
already disproved. Each task carries the numbers that put it on the list and the
condition that retires it, so hitting the shots removes it on the next ingest.

Ranked by **information gain, not effort**. The obvious ordering is "top up
whatever is closest to the threshold", and it is wrong: a club with four shots is
not a noisy measurement, it is a blind spot, because `detectGaps` cannot compare
against a club that isn't there. A 30-shot wedge session found a 23.9 yd hole
that four sessions of irons never could. So unmeasured outranks under-measured,
which outranks biased, which outranks already-confirmed.

`lib/parse.ts` and `lib/ledger.ts` are pure — no filesystem, no Next, no React.
That is deliberate, and it is why swapping storage cost an hour rather than a
rewrite. Phase 2's stats attach to `ledger.ts`'s output, and nothing analytical
should ever live in a component.

## Provenance

Two patterns were lifted from
[jgamblin/golf](https://github.com/jgamblin/golf), a Garmin **R10** pipeline:

- **`field_aliases.yaml`'s column mapping** — raw header → canonical field,
  many-to-one, so a rename is a data change. Departed from in two ways: units
  are read from the file's own units row rather than encoded in alias keys, and
  backspin/sidespin are kept separate.
- **`validate_shot()`'s phantom handling** — a zero in ball speed, club speed
  or carry means the monitor saw a swing but never tracked a ball. Those fields
  are nulled with a recorded reason rather than dropped, because zeros drag
  every median down. The ≥10%-per-session data-quality flag comes across too.

Both fixtures have zero phantoms, so that path is covered by synthetic tests
only until a real one shows up.

## Attribution

Imagery © Esri, Maxar, Earthstar Geographics. Course geometry ©
[OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL).
Geocoding by [Nominatim](https://nominatim.openstreetmap.org/). Personal
scores and ratings from [The Grint](https://thegrint.com).
