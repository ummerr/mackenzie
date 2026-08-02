# NEXT

Where I left off. Read `SPEC.md` for what the system *is*; this is what to do
next.

**State as of 2026-08-01:** the full pipeline runs end to end, `npm run validate`
exits clean, and the map is live locally. Not yet deployed.

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

- **Deploy.** `vercel.json` is written and the site is fully static. Needs
  `vercel link`, a deploy, a subdomain (`courses.ummerr.com`), and a new `P-NN`
  row in `ummerr.github.io/index.html` next to the existing P-07 Golf card at
  line 109.
- **Physical vectors.** Water and bunker density and elevation relief are
  derivable from geometry already on disk plus a terrain fetch. `areaAcres` is
  the only one computed today. These would give the `underrated` and
  `architecture` lenses something objective to lean on.
- **Two facilities still on a town centroid**, both because OSM has nothing
  under their name: `serket-golf-club` (nothing called Serket within 9km of
  Henderson — probably a rebrand; find the former name) and
  `the-links-golf-club` (Marlton NJ). Each is a one-line entry in
  `data/geocode-overrides.json` once you know where they are.
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

- **Grint HAR extractor** — recon is done (`golf/pipeline/grint/RECON.md`), the
  adapter seam is in place, it just needs 5 minutes of logged-in clicking to
  produce the HAR.
- **Garmin R50** — no shot data exists anywhere in the tree and the export path
  is unproven. Needs its own recon before any code.
- **courseRender as a base** — the right move for the strategy phase, wrong move
  for drawing 84 dots. See `SPEC.md § Roadmap`.

## Auto session log
- **2026-08-01** — session ended: 13 file(s) dirty, 0 commit(s) unpushed. Last touched: `.claude/`. <!-- campfire:2026-08-01 -->
- **2026-08-02** — session ended: 18 file(s) dirty, 0 commit(s) unpushed. Last touched: `.claude/scheduled_tasks.lock`. <!-- campfire:2026-08-02 -->
