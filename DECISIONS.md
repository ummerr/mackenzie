# Decisions

Reverse chronological. Same convention as `~/CodeProj/golf/DECISIONS.md`: what
was decided, why, and what was rejected — so a future session doesn't relitigate
a settled question or repeat a mistake that's already been paid for.

---

## 2026-08-14 — Two hue poles in the club ramp too

**Decided:** the bag chart's club ramp runs between two hue poles — warm 64°
OKLCH at the pale short end, blue 240° at the deep long end, hue falling
strictly through red and violet and never entering the turf's green band
(90°–200°). Lightness still carries the order, unchanged bands (light
0.735 → 0.295, dark 0.905 → 0.455, every adjacent step ≥ 0.06), chroma held at
0.14 until the gamut clips the ends. The hue steps widen through the irons,
where the cones actually overlap, and the four ordinal gates now run as a test
(`yardages/tests/palette.test.ts`) against `globals.css` itself instead of
living as prose.

**Why:** the same failure the lens ramp paid for on 2026-08-02, one section up
the same site. Every step of the one-hue club ramp read as "some brown", on
turf that is itself warm, and the compression was worst exactly where the
chart's whole job is separation: the 6/7/8 iron cones nest completely and drew
ramp steps 4/5/6 — three browns one lightness step apart, at 6% fill.
Measured, the worst adjacent pair moves from ΔE 6.2 (lightness alone) to
8.3–10.5 with hue on top, and the fully nesting 8i/6i pair to ~18. But as with
the lens, the number is not the argument: purple-vs-indigo-vs-navy is a
distinction you can *name* across a nested overlap, and coral-vs-violet names
itself from across the room.

**Rejected:** eight arbitrary hues — clubs have a real order and the ramp must
keep showing it. Also rejected: routing the sweep through green for more hue
room; the turf is scenery and nothing that carries a number may wear its
colour. The lens entry's rainbow objection — that many nameable hues make the
legend load-bearing — does not transfer here, because this chart's legend has
been load-bearing since the day it was drawn: identity never rests on hue,
every drawn club is direct-labelled with its own chip in the gutter and again
in the phone rail. The hue path is wider than the lens's precisely because the
labels were already paying the cost the lens refused.

**Cost accepted:** the warm end of the light ramp passes the accent's
neighbourhood — `--club-1` `#dc754c` sits ΔE 6.2 from `#ff6b35`, the 50-yd
range flags (and, in dark, the hole verdict). The flags differ in shape,
position and heat (chroma 0.19 against the ramp's 0.14), and verdicts ship
beside their word. If the rhyme ever misleads on screen, the fix is a chroma
dip on club-1 to ~0.12, which buys ΔE ≈ 8 without touching the ramp's shape.

---

## 2026-08-03 — The bag is asserted, because the ledger cannot say what you did not hit

**Decided:** `yardages/data/bag.json` names the thirteen clubs actually owned —
brand, model, head type, shaft, grip and loft — hand-written and committed. It
is the second hand-edited file in the app, after `exclusions.json`, and the club
vocabulary that was previously copied into four files now lives once in
`lib/clubs.ts`.

**Why:** every number on the bag page is derived from a shot, and that is
exactly the limitation. The chart can only draw what was hit, so a club with no
shots produces no region, no dot, no gap flag and no practice task — its absence
reads as *nothing to report* rather than *never measured*. On the current ledger
that hid four clubs out of thirteen: the utility wood, the 3 and 4 irons and the
58°. No amount of cleverness over `shots.json` recovers them, because they are
not in it. The bag is the one fact the record structurally cannot derive, so it
is the one fact that gets asserted.

Loft was the second half. `lib/tasks.ts` had two tasks reading "check loft and
shaft on both" and "get the lofts checked" — the only places the app reached for
equipment, both prose, because there were no numbers to check against. Now an
overlap says whether the two clubs were *built* 4° apart, which decides whether
the finding is a delivery problem or an equipment one. The chart already knew
what the bag does; this is what it was meant to do.

**Loft cross-checks bag order, it does not define it.** Sorting `BAG_ORDER` by
the new lofts was tempting and is wrong twice over: the order has to sort clubs
nobody owns and has no loft for, and in this bag it could not do the job anyway
— the utility wood and the 3 iron are both 19°. That collision is a finding the
profile now prints, not a defect in the sort key. Same reasoning as the existing
rule that gaps are compared in bag order and never sorted by measured distance.

**Two tiers per club, and the split is deliberate.** `brand`, `model`, `shaft`
and `grip` are bare values: they are owner-attested, readable off the club, and
no URL would make them more true. `loftDeg` carries the full `{value, source,
confidence, checked, verified}` claim from `data/facts.json`, because loft is
the field that can be wrong while you are looking straight at it — an adjustable
sleeve nobody has read, an iron bent a degree, a wedge ground to order. Every
loft is `verified: false` and the profile lists that as a standing unknown:
writing the file did not answer the question, it created it.

**The UW is keyed `"3 Hybrid"`.** The R50's `Club Type` list has no utility-wood
entry, so a 19° Callaway UW logs in the rescue slot; the key is the slot the
monitor records and `brand`/`model` say what the club is. That makes `headType`
(asserted, physical) and `family()` (read off the name, positional) two genuinely
different axes — the UW's head is a wood and its family is a rescue — so loft
comparisons ask the head and role grouping asks the name.

**Rejected:** deriving the bag from the ledger's distinct club names, which is
circular and produces exactly the blind spot the file exists to remove. Also
rejected: withholding a loft gap whose two clubs sit on different head types.
The degrees are real arithmetic either way, so the number is printed and the
*interpretation* is flagged with a dotted underline — flags, never corrections.
A loft gap that steps over unmeasured clubs is a different case and **is**
withheld: the gap table is built over measured clubs, so "Driver → 5 iron, 13°"
would describe no pair of clubs in the bag.

---

## 2026-08-03 — Split the miss into start line and curve

**Decided:** `lib/ball-flight.ts` splits every shot into where it *started* and
how far it *bent*, and `pnpm flight` renders the split to a committed static
page at `public/ball-flight.html`.

**Why:** the bag chart draws where shots finished, and that single number hides
the only distinction that changes what you would do about it. A club aimed 12 yd
left and a club that slices 12 yd right produce the same dispersion cone and
need opposite fixes — an alignment stick versus a lesson. The export has carried
both halves since Phase 1 and nothing read them.

**Nothing is modelled.** `start = carry × sin(launch_direction)` and
`curve = carry × (sin(carry_deviation_angle) − sin(launch_direction))`. They sum
to `carry × sin(carry_deviation_angle)`, which is the export's own offline
column, so the split is arithmetic on an identity the file already publishes —
and the tests hold it to reconstructing that column within 0.02 yd across the
whole ledger.

**Rejected: trusting the names.** Two columns that *look* like a start line and
a finish line could be swapped by a firmware change and every sentence on the
page would stay plausible while being wrong. So two independent checks are
tests, not comments: curvature must track the spin axis (r = 0.93, sign agreeing
on all 158 real curves), and start line must track the club face (r = 0.97) *and
not* the curvature. A relabelled column now fails the suite.

**What it found:** 8% of shots are genuinely straight, 76% curve more than 3 yd,
and two-thirds of curves bend right — stable at every threshold from 2 to 5 yd.
The bag holds two opposite faults at once: long irons bend right with the face
open to the path, short irons bend left with it closed. The Gap Wedge is neither
— face square to path within a tenth of a degree, the whole swing aimed 7.6°
left. That is the most actionable line the ledger has produced, and the
dispersion cone could never have shown it.

**The corroboration column is the honest half, and it hurts.** Curvature is
reported per session, and the clubs that look like they slice have the least
evidence behind them: the 5 and 7 iron appear once each, and the 6 iron produced
a 4 yd draw one day and a 20 yd slice another. Only the 8 iron, 9 iron and sand
wedge have been seen twice agreeing — and all three bend *left*. The aggregate
right bias is robust; the per-club long-iron slice is not established. Publishing
the per-session spread beside every median is what stops this page from becoming
the horoscope `PROFILE.md` was designed to avoid.

**Also worth recording, because it looks like a parser bug and is not:** four
shots genuinely stop shorter than they landed — one gap wedge at −2.2 yd and
three sand wedges, worst −5.2. High-spin wedges checking. A test pins the count
so a future exclusion change cannot quietly absorb them.

**Rejected: a route.** The report is a static file, so it costs the app nothing,
survives on its own, and prints. The trade is real and named in the script
header: its design tokens are a copy of `app/globals.css` rather than a
reference, and a copy can drift. If it grows a third chart that needs the app's
components, it should become `/flight` instead.

**And: generated, never hand-authored.** `pnpm flight --check` fails when the
committed page no longer matches the ledger, the same contract `PROFILE.md`
keeps. A one-off HTML file with today's numbers baked into it goes stale the
first time a session lands, and does it silently.

---

## 2026-08-03 — One golfer, derived from both halves

**Decided:** `/profile` and `yardages/PROFILE.md` read the shot ledger *and* the
map's course history and print one derived golfer: a ranked list of findings,
a roast, and an explicit list of what the record cannot say. Nothing in it is
written by hand, and every finding carries four things — the claim, the evidence
that put it there, a roast where that is honest, and the condition that retires
it.

**Why:** the two halves of this repo each answer half a question. Yardages knows
what a 7 iron does and has never seen a golf course; the map knows 166 rounds
across 84 facilities and has never seen a swing. The interesting sentences are
the ones only the join can say — *166 rounds played, one measured swing with
anything that starts a hole* — and neither app could reach them alone.

The `falsifiedBy` field is the whole design and not a flourish. A profile
without one is a horoscope: it describes you forever, ages into vagueness, and
nothing you do can argue with it. With one, the profile is a spec the next
session either confirms or deletes — the same contract `tasks.ts` already keeps
with `doneWhen`, for the same reason.

**Rejected: benchmarks.** No tour averages, no handicap model, no "good players
carry their 7 iron X". Every comparison is internal — this club against the one
beside it, the favourite courses against the rest, the measured record against
the played one. The moment an external average appears it needs a source, a
population and a conditions caveat, and an unsourced one is precisely the
"plausible, unverified" state `NEXT.md` calls the most dangerous a number can be
in.

**Rejected, twice, after writing it:** *smash factor spread across the bag* as a
strike finding. Smash falls with loft for everyone, so comparing a sand wedge to
a 5 iron flags physics and calls it a flaw. What replaced it is an **inversion**
— a longer club returning less smash than the shorter club right beside it,
which breaks the order rather than sitting on it. Same logic the gap chart
already applies to carries.

Also caught in review and worth naming: the first draft said "no tee shot in the
ledger at all" when the ledger holds exactly one driver shot. A rounder sentence
and a false one. The finding now counts it.

**Rejected: a live read of `../data/courses.json`.** Yardages deploys from its
own directory as its own Vercel project, so `../data` does not exist at build
time — a page reading it renders locally and 500s in production. `pnpm
ingest:courses` snapshots what the profile needs into
`yardages/data/course-history.json`, committed, the same contract the rest of
the repo keeps for generated files. The page treats a missing snapshot as a
state, not a crash: it renders the range half and says which half is absent.

**Also:** `PROFILE.md` exists so the profile has a history. A profile that lives
only as a rendered page reads differently in October than it did in July and
nothing records that it changed, which is the one thing a *living* spec has to
do. `pnpm run profile --check` fails when the committed file no longer matches
the data — and note the `run`: `profile` is an npm builtin, and pnpm forwards
unknown commands to npm.

**Nine-hole rounds stay the parent's call.** The Grint averages 9- and 18-hole
rounds into one number per layout; `courses.json` already flags those and the
`scoring` lens already excludes them. The snapshot carries the flag forward and
the profile splits on it rather than re-deriving it — 79 of 93 layouts are
comparable, and the mean score says which number it is quoting.

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

## 2026-08-03 — Carry or total, and the rollout the monitor never modelled

**Decided:** the bag reads to either distance. One toggle in the masthead of
`yardages/app/bag.tsx` governs the whole page — plan view, gap scorecard,
headline gap and the table twin move together. `lib/stats.ts` grew a
`DistanceBasis` and reads its three columns through one `BASIS` table, so a
profile is the same statistics over a different measured pair rather than a
second code path. `ClubProfile.medianCarryYd` became `medianDistanceYd`, and
both the profile and every `Gap` carry the basis they were built on, so a table
cannot label them wrong.

**Why the whole page and not just the chart:** the toggle's natural home is the
chart, and that is where it would have been worst. The gap scorecard sits beside
the chart and the card sits under it; a control inside the chart would have left
them reporting carry while the chart reported total. A page showing two bases at
once is worse than a page showing the wrong one.

**Decided:** a total that copies the carry is read as **absent**, not as zero
roll. On 51 of 255 shots — 40 of them otherwise trusted — the R50 wrote the
carry row into the total row verbatim: distance, deviation distance and
deviation angle all identical, to seven decimal places. That is not a ball that
stopped where it landed. `parse.ts` has flagged it as `total_is_carry_copy`
since Phase 1; this is the first consumer that had to decide what it means.

**Rejected:** counting them, which is what any naïve `median(totalYd)` does. It
would have published a five iron that rolls nothing off 21 of its 26 shots, and
the number would have looked like data. It is also not a small effect — the
copies cluster in two sessions (17 of 34 on 2026-07-05, 33 of 42 on 2026-08-03)
rather than scattering, so they bias particular clubs rather than adding noise.

**The cost, taken deliberately:** dropping them takes 5 Iron, 7 Iron and Sand
Wedge under the 15-shot display threshold, so three clubs that are drawn on
carry go dark on total. That is the honest outcome — a club that only clears the
bar on shots containing no rollout information has not been measured — and the
page says so above the chart and in the held-back panel rather than letting
three cones quietly vanish.

**Rejected:** deriving total as carry plus a rollout constant. Roll is not a
constant: 1.2 yd on a sand wedge, 10.3 on a five iron. And the export already
carries measured `total_deviation_distance` and `total_deviation_angle`, which
satisfy `deviation distance = distance × sin(deviation angle)` to under 0.02 yd
— the same identity the carry columns satisfy. So the cone construction works
unchanged on the total basis from its own measured pair, and nothing is a carry
number reused at a longer radius.

**Also:** the `Roll` column is the median of `total − carry` per swing, never
the difference of the two published medians. The bases are computed over
different shot sets, so differencing their medians subtracts one population from
another and calls the answer rollout.

**Also, and only found by reading the page back:** the chart is given one frame
for both bases instead of fitting itself to each. Refitting looked harmless and
was not. Total spans 115 yd where carry spans 126, so the axis rescaled and
absorbed the extra distance; and because three clubs drop out on total, the
longest label fell from `5i 195` to `6i 171`. The page therefore *read* as
"total is shorter than carry", which is the one thing rollout cannot be. No
number was ever wrong — every club is longer on total, by within a yard of its
measured roll — but a chart that has to be argued with is a chart that failed.
`mergeDomains` pins the axis to the union of both bases, so switching moves the
cones up the page by exactly their roll and moves nothing else.

Worth recording that four shots in the ledger genuinely do stop shorter than
they landed — one gap wedge at -2.2 yd and three sand wedges, worst -5.2. That
is a high-spin wedge checking, not a parsing fault, and none of them are carry
copies.

**And:** `/practice` stays on carry and is documented as staying there. Every
task in it is about a swing you have or have not measured, and rollout is the
turf's contribution — ranking practice by it would sort the list by something no
amount of range work changes.

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
