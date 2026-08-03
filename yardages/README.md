# YARDAGES

A longitudinal shot ledger for Garmin Approach R50 range exports. The R50 screen
and the Garmin Golf app both answer questions about one shot or one session.
Nothing answers questions that span sessions. That gap is the whole product.

Lives inside the `mackenzie` repo but deploys as its own Vercel project —
Mackenzie is a deliberately zero-build static site (`DECISIONS.md`,
"Static-first, no bundler"), and a Next.js app cannot be a route on it.

**Live: [yardages.vercel.app](https://yardages.vercel.app)**

**Status: Phase 1 (ingest) and Phase 2 (the bag chart) complete, plus a
derived practice list.** Everything in
the brief's Deferred list is still deferred and deliberately unscaffolded.

## Run it

```bash
pnpm install
pnpm ingest                         # data/raw/*.csv -> data/shots.json
pnpm dev                            # http://localhost:3000
pnpm test                           # 212 tests over the real exports
pnpm typecheck
pnpm compare                        # old vs new stock yardages, side by side
```

## Adding a session

1. Export the range session from the Garmin Golf app.
2. Drop the CSV in `data/raw/`, filename untouched.
3. `pnpm ingest` — or `pnpm ingest --dry-run` to see what would change first.
4. Commit the CSV and the regenerated JSON together.

`data/raw/` is verbatim and never edited, the same contract as
`../data/raw/grint-*.txt` in the parent repo. A correction goes in
`data/exclusions.json`, never in the source file.

There is no database. Shots are ~800 bytes of JSON each, so two years of weekly
sessions is under 2 MB — smaller than the GeoJSON the parent repo already
commits. Git gives better provenance than a `raw_imports` table would: every
import is a diff, and a parser fix can be replayed over the whole history by
re-running `pnpm ingest`. See `DECISIONS.md`.

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

## Deploy

**Live: [yardages.vercel.app](https://yardages.vercel.app)**

Its own Vercel project (`yardages`), separate from `mackenzie`. Deploy from
*this* directory, not the repo root:

```bash
cd yardages && vercel deploy --prod
```

Things that will trip you up:

- **It is a CLI deploy, not a Git integration.** Pushing to `main` does
  **not** redeploy — run the command above. Same as the parent project. If you
  want push-to-deploy instead, connect the repo in the dashboard and set Root
  Directory to `yardages`, or the build will run against the static map at the
  repo root and fail.
- **Deploying from the repo root would deploy the map, not this.** The root
  `vercel.json` pins `framework`, `buildCommand` and `installCommand` to `null`;
  this directory's `vercel.json` sets `framework: nextjs`. Two projects, two
  configs, one repo.
- **`data/*.json` must be committed.** The build reads `data/shots.json` at
  render time. Run `pnpm ingest` and commit its output before deploying, or the
  live page shows the previous session's numbers.
- The per-deployment URL (`yardages-<hash>-…`) 302s to Vercel SSO; that is
  normal. The stable alias is public.

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
  those rows or it blends two different quantities. The bag chart uses carry.
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
  page.tsx            the bag: masthead, scoreboard, gap scorecard, table twin
  bag-chart.tsx       the plan view. Every shot a dot, one region per club
  palette.ts          turf, the ordinal club ramp, the gap verdict tokens
  practice/           what to hit next, generated from the ledger
  sessions/           exclusion hygiene, deliberately unstyled
lib/
  aliases.ts          header -> canonical field. Add a locale here, never in the parser
  units.ts            conversion driven by the file's own units row
  parse.ts            one CSV -> one session. Pure
  ledger.ts           many sessions -> one deduplicated ledger. Pure
  stats.ts            medians, bands, gap flags. Pure
  tasks.ts            practice tasks derived from all of the above. Pure
  yardages/
    thresholds.ts     every tunable number, in one documented object
    robust-stats.ts   median, MAD, weighted median, percentile intervals
    recency-weighting.ts  exponential decay and the per-session weight cap
    classify-shot.ts  shot review status, reasons and explanations
    club-profile.ts   stock yardages per club
scripts/
  ingest.ts           the only file that touches the filesystem
  compare.ts          before/after table for a heuristic change. Writes nothing
data/
  raw/                real exports, verbatim, never edited
  exclusions.json     hand-editable overrides
  sessions.json       generated
  shots.json          generated
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

## The plan view

The bag chart is drawn as the hole it is — mown fairway, rough either side,
distance flags up the left edge — and every piece of that scenery sits at a
position that means something. Each mow stripe boundary is a gridline. The
fairway edges are a real 30-yard corridor, so a club whose 80% lateral band
overruns them is a club that misses fairways, and you can see which side.
Nothing decorative is placed where it could be read as data.

Two layers, answering different questions. Every trusted shot is a dot at its
actual carry and actual offline — that is the dispersion, with nothing
summarised away. Over it, one region per club. The dots came second on purpose,
because a summary cannot show you that a club's miss is two clusters rather
than one spread, and this ledger contains exactly that.

**The region is a cone, because the miss is angular.** The export derives
`deviation distance = carry × sin(deviation angle)`, so offline yards are two
things multiplied together and only one of them is the club: the same aim error
puts a 6 iron further offline than a wedge purely because the ball went
further. A rectangle with parallel sides says the miss is a fixed number of
yards wide at every distance, which is not what the club did. So each club is
the region between rays at its measured p10 and p90 *deviation angle*, cut off
at its p25 and p75 carries — still exactly two measured quantile ranges, just
with the lateral one in the units the error is actually made in. Both are in the
table twin, in degrees and in yards.

The plot's y is the radial carry the export reports and its x is that carry's
offline component, which is what makes a ray of constant angle a straight line
here rather than a curve. Nothing is reprojected and no dot moves; the sides of
the region simply converge on the tee the way the shots did. Because that
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
order, so swapping two of them would change the meaning — one hue with monotone
lightness steps is right and eight arbitrary hues are wrong. The ramp is
validated rather than eyeballed: monotone lightness, every adjacent step ≥ 0.06
apart in OKLCH, hue spread 1°, dim end above the contrast floor against the
turf. It spans the clubs actually *drawn*, so no step is spent on a mark nobody
can see. Every club is direct-labelled with its own chip in the right-hand
gutter, which is the legend and the label at once, so identity never rests on
hue. Gap verdicts wear reserved status tokens and are never a series colour.

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
