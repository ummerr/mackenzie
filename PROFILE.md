# THE PLAYER

A living spec of one golfer, derived from both halves of this repo: the shot
ledger in `data/`, and the course history the map's pipeline builds.
**Nothing here is written by hand.** `pnpm profile` regenerates it,
and the diff is the point — this file exists so that a change in the golfer is
a commit rather than a page that quietly reads differently than it did.

Every finding carries the numbers that put it there and the condition that
takes it off. Hit the shots and the sentence retires itself.

## The spec

| | |
|---|---|
| Measured range | **92–195 yd** — Sand Wedge to 5 Iron |
| Clubs measured | **8** — 15+ usable shots |
| Clubs in the bag | **13** — 9 with any shots on file |
| Shots on file | **217** — of 301 logged |
| Range sessions | **8** |
| Rounds played | **170** |
| Courses played | **87** — 11 US states, 3 countries |
| Mean score | **88.4** — 79 layouts, 18 holes |
| Favourite | **Bethpage State Park (Black)** — own ranking, no. 1 |
| Handicap index | **13.5** — WHS, from 23.9 at the record's start |
| Scored span | **2021-07-08 → 2026-08-22** — 170 dated rounds |
| Recent scoring | **91.8** — last 5 rounds; career 90.5 over 141 |

## The read

Ranked by how much of the record is behind each line, never by how bad it
sounds. Every comparison is internal — this club against that club, these
courses against those — because a benchmark without a source is the one kind
of claim this repo refuses to print.

### 01. Nothing on this site was measured on a golf course. The played record and the measured record share no shots at all.

- **why** — 8 clubs measured, from the 5 Iron down to the Sand Wedge, over 217 trusted shots — every one of them hit off a mat in front of a monitor. 170 rounds played across 87 facilities, none of which put a single shot in this ledger.
- **gone when** — Any on-course shot data in the ledger — a round imported from the R50's on-course mode, or a hand-entered card with clubs.
- *both · high confidence*

### 02. There is no measured tee game. Every club with numbers is a club you reach for after the shot that decided where you were standing.

- **why** — 217 trusted shots across 8 sessions, and only 1 with a driver, wood, hybrid or long iron (Driver) — under the 15 a club needs to be drawn. The longest club measured is the 5 Iron, 195 yd, against 170 rounds played.
- **gone when** — Any tee club drawn on the bag page — 15+ usable shots with it.
- *both · high confidence*

### 03. Over 18 holes the record averages 88.4, weighted by how often each course was played.

- **why** — 79 layouts with comparable 18-hole averages across 170 rounds. Best average 76.7 at Rancho Park Golf Club, worst 102.0 at Las Vegas Paiute Golf Resort. 18 layouts held out as short or unscored rounds.
- **gone when** — A new snapshot of the map's course history with a different mean.
- *course · high confidence*

### 04. The golf got better over the whole record and worse over the recent stretch: the career arc and the last dozen differentials point opposite ways.

- **why** — Trending handicap 23.9 at the record's start, 13.5 now, across 154 differentials (mean of the first 20: 18.9; the last 20: 17.2). Meanwhile the raw 18-hole mean moved from 91.7 (2021, 26 rounds) to 90.6 (2026, 8). Over the last 12 chart points the trending handicap moved from 9.4 to 13.5 (mean differential 17.6).
- **gone when** — A capture whose last 12 differentials leave the trending handicap no higher than they found it.
- *course · high confidence*

### 05. Putting is the biggest single line item in the score: 39% of all strokes happen on the green.

- **why** — 138 eighteen-hole rounds carry putts: 35.7 per round against a 90.5 mean score. 364 holes took three or more putts, of 2681 recorded — one in 7.
- **gone when** — A capture with putts under 35% of strokes, or three-putts under one hole in 10.
- *course · high confidence*

### 06. The bag is not evenly spaced: there are distances it cannot cover and distances it covers twice.

- **why** — Worst gap 31.1 yd between 5 Iron and 6 Iron · 3 overlapping pairs under 8 yd apart.
- **gone when** — No gap flagged as a hole, an inversion or an overlap on the bag page.
- *range · high confidence*

### 07. The tee ball misses both ways in nearly equal measure — the course-side echo of the range's two-way miss, and the one pattern aiming off cannot fix.

- **why** — 1564 driven holes carry a fairway result: 62% hit, 17% missed left, 17% missed right, 5% marked missed without a side. 411 holes carry codes outside Grint's own legend and are excluded.
- **gone when** — A capture where one side owns two-thirds of the misses, or the hit rate moves by five points.
- *course · high confidence*

### 08. This is a collector's record, not a member's: most courses were played once and never again.

- **why** — 72 of 97 layouts played exactly once (74%). Most played: Rancho Park Golf Club at 10 rounds.
- **gone when** — A course history where under half the layouts are one-and-done.
- *course · high confidence*

### 09. Courses are rated for fun ahead of conditioning.

- **why** — Median fun 85.6, median conditioning 81.1, across 93 rated layouts.
- **gone when** — Median fun and conditioning ratings within a point of each other.
- *course · medium confidence*

### 10. 22 practice tasks are open, and the top one is aimed at the biggest blind spot above.

- **why** — First on the list: The 3 Hybrid has never been measured — Callaway UW is in the bag at 19° and has not one shot on file across 8 sessions. Both gaps beside it are guesses about a club nobody has hit at a monitor.
- **gone when** — An empty practice list.
- *range · high confidence*

### 11. The miss is two-way. Some clubs sit right of the target line by their median and others sit left, which is a different problem from one bias you could aim off.

- **why** — 3 of 8 drawn clubs miss right by their median (worst: 5 Iron, 17.6 yd right), 1 miss left (worst: Pitching Wedge, 5.8 yd left).
- **gone when** — Every drawn club's median offline inside ±5 yd, or all of them on the same side.
- *range · high confidence*

### 12. 4 of 8 drawn clubs spray wider than a 30-yard fairway at their own median carry.

- **why** — Worst is the 5 Iron: eight in ten of its shots land inside a 40 yd corridor at 195 yd. A good fairway is 30 yd wide.
- **gone when** — Every drawn club's 80% aim band under 30 yd wide at its median carry.
- *range · high confidence*

### 13. Part of the bag has never been to a monitor. The chart is not a picture of what you carry, it is a picture of what you happened to hit.

- **why** — 13 clubs in the bag, 9 with any shots on file. Never recorded: 3 Hybrid, 3 Iron, 4 Iron, Lob Wedge. A further 1 — Driver (0 usable of 1) — sits under the threshold to be drawn.
- **gone when** — Every club in data/bag.json with at least one shot in the ledger.
- *range · high confidence*

### 14. Some clubs are a different club depending on the day. Their session medians move by more than the gaps between neighbouring clubs.

- **why** — 4 drawn clubs drift more than 10 yd between sessions. Worst: Pitching Wedge, 16.8 yd between its session medians over 3 sessions.
- **gone when** — Every drawn club's session spread under 10 yd.
- *range · medium confidence*

### 15. 28% of logged swings do not count toward any number on this site.

- **why** — 84 of 301 shots excluded — warmup 55, auto-flagged 27, possible-partial 2. Warmup and partials are deliberate exclusions, not bad swings.
- **gone when** — Under 20% of logged shots excluded.
- *range · high confidence*

### 16. Two clubs in the bag are built to the same loft. Which of them goes further is a question about the heads, and nothing on file answers it.

- **why** — 3 Hybrid and 3 Iron are both 19°. Different head types — wood against iron — so this is not a duplicate club, but it is not a gap either, and the ledger has never had both on the same day.
- **gone when** — Both clubs measured, or one of them re-lofted. 3 Hybrid and 3 Iron carrying more than 8 yd apart settles it.
- *range · medium confidence*

### 17. The recent scorecards look like the career record; the recent differentials do not.

- **why** — Last 18 months (since 2025-02-22, 11 distinct 18-hole rounds): 90.5 mean strokes against 90.5 over the career's 141; 34.8 putts a round against 35.7. The last 12 differentials average 17.6 and moved the trending handicap from 9.4 to 13.5.
- **gone when** — A capture where the recent window and the career agree — the trending-handicap tail within 2 strokes flat, and the recent means within 2 strokes and 1.5 putts of career.
- *course · medium confidence*

## Recent form

The last 18 months (since 2025-02-22), measured from the newest
card (2026-08-22) — never from today, so this file reads the same until the
record changes. Quick-entry echoes of a card already on file are not counted twice.

| Date | Course | Strokes | Putts |
|---|---|---|---|
| 2026-07-26 | Battlefield \| Legends On The Niagara Golf Club | 91 | 33 |
| 2026-08-15 | Bennett Valley Golf Course | 89 | 38 |
| 2026-08-16 | Brambles Golf | 90 | 35 |
| 2026-08-20 | TPC Harding Park Golf Course | 91 | 33 |
| 2026-08-22 | Presidio Golf Course | 98 | 37 |

| | Recent | Career |
|---|---|---|
| Scoring | **90.5** (11 rounds) | 90.5 (141 rounds) |
| Putts / round | **34.8** (11 rounds) | 35.7 (138 rounds) |
| Three-putt share | **8%** (198 holes) | 14% (2681 holes) |
| Fairways hit | **73%** (148 holes) | 62% (1564 holes) |

## The roast

The same findings, unsoftened. Each one restates its own evidence and nothing
more — a roast that needs a fact you do not have is just an insult.

> 170 rounds. 217 measured shots. The two sets do not intersect: not one number on this site came from a golf course.
>
> — 8 clubs measured, from the 5 Iron down to the Sand Wedge, over 217 trusted shots — every one of them hit off a mat in front of a monitor. 170 rounds played across 87 facilities, none of which put a single shot in this ledger.

> 170 rounds played, 1 measured swing with anything that starts a hole. This is a very thorough study of the second shot.
>
> — 217 trusted shots across 8 sessions, and only 1 with a driver, wood, hybrid or long iron (Driver) — under the 15 a club needs to be drawn. The longest club measured is the 5 Iron, 195 yd, against 170 rounds played.

> The career took 10 strokes off the handicap; the last 12 differentials gave 4.1 back.
>
> — Trending handicap 23.9 at the record's start, 13.5 now, across 154 differentials (mean of the first 20: 18.9; the last 20: 17.2). Meanwhile the raw 18-hole mean moved from 91.7 (2021, 26 rounds) to 90.6 (2026, 8). Over the last 12 chart points the trending handicap moved from 9.4 to 13.5 (mean differential 17.6).

> 35.7 putts a round, and a three-putt every 7 holes. The greens are charging a second green fee.
>
> — 138 eighteen-hole rounds carry putts: 35.7 per round against a 90.5 mean score. 364 holes took three or more putts, of 2681 recorded — one in 7.

> 3 pairs of clubs land within 8 yd of each other — 5 clubs doing the work of 3 — and none of them covers the 31 yd hole between the 5 Iron and the 6 Iron.
>
> — Worst gap 31.1 yd between 5 Iron and 6 Iron · 3 overlapping pairs under 8 yd apart.

> 263 fairways missed left, 260 missed right. At least the misses are fair.
>
> — 1564 driven holes carry a fairway result: 62% hit, 17% missed left, 17% missed right, 5% marked missed without a side. 411 holes carry codes outside Grint's own legend and are excluded.

> 74% of the courses in this record got exactly one chance to make an impression, which is also how many chances they got to be learned.
>
> — 72 of 97 layouts played exactly once (74%). Most played: Rancho Park Golf Club at 10 rounds.

> The 5 Iron goes right and the Pitching Wedge goes left, so aiming off fixes exactly half your bag and breaks the other half.
>
> — 3 of 8 drawn clubs miss right by their median (worst: 5 Iron, 17.6 yd right), 1 miss left (worst: Pitching Wedge, 5.8 yd left).

> Eight in ten 5 Irons finish inside 40 yd of each other. That is not a target, that is a postcode.
>
> — Worst is the 5 Iron: eight in ten of its shots land inside a 40 yd corridor at 195 yd. A good fairway is 30 yd wide.

> You own 13 clubs and have measured 9. The Lob Wedge is carried around every round as a decoration.
>
> — 13 clubs in the bag, 9 with any shots on file. Never recorded: 3 Hybrid, 3 Iron, 4 Iron, Lob Wedge. A further 1 — Driver (0 usable of 1) — sits under the threshold to be drawn.

> Your Pitching Wedge has a 17 yd opinion about what day of the week it is. A yardage book cannot help with that.
>
> — 4 drawn clubs drift more than 10 yd between sessions. Worst: Pitching Wedge, 16.8 yd between its session medians over 3 sessions.

> Same scores, worse handicap: the recent courses were easier, and the scorecards didn't notice.
>
> — Last 18 months (since 2025-02-22, 11 distinct 18-hole rounds): 90.5 mean strokes against 90.5 over the career's 141; 34.8 putts a round against 35.7. The last 12 differentials average 17.6 and moved the trending handicap from 9.4 to 13.5.

## What the record cannot say

Gaps in the data, not gaps in the analysis. Listed so that silence is never
mistaken for a finding.

### How much of the score is the chipping and the sand?

The scorecards now carry putts per hole, so the green's share of the score is a finding rather than a gap. Everything between the fairway and the green is still invisible: chips, pitches, bunker shots and penalties all hide inside the strokes column with nothing to separate them.

**Needs:** Shot-level on-course data, or a hand-kept ups-and-downs card.

### What happens from a real lie?

Every measured shot was hit off a mat to a flat range with a monitor watching. Nothing in the ledger has been hit from rough, sand, a slope or under pressure.

**Needs:** On-course tracking, which the R50 does not export.

### How much of each number is the weather?

The R50 records environmentals per session, not per shot, and nothing here is altitude-, temperature- or wind-adjusted. A summer session at sea level and a cold one are averaged together as if they were the same day.

**Needs:** Per-shot environmentals, or enough sessions to model the correction.

### Are the lofts on this page the lofts in the bag?

13 clubs carry a loft and 0 of them have been verified. Every number is what the club left the factory as: the driver's sleeve is adjustable and its setting has never been read, irons bend a degree in a car boot, and a wedge is ground to order. Any finding below that compares degrees is comparing spec sheets, not clubs.

**Needs:** One session on a loft-and-lie gauge, then `verified: true` in data/bag.json.

### Is a score of 88 good on this course?

The rounds carry a course, a tee name and a differential, but still no par or yardage per layout, so a raw score is only comparable through the handicap math, never on the card's own terms.

**Needs:** Par and rating/slope per tee. The export's get_course_data calls came back empty for guessed tee ids — the real tee ids the scorecard page loads by JS are the missing key.

## Read from

- **Range** — 301 shots over 8 Garmin R50 sessions, 2026-07-02 to 2026-08-14
- **Courses** — 170 rounds over 97 layouts, from The Grint, captured 2026-08-01
- **Rounds** — 170 dated scorecards, 2021-07-08 to 2026-08-22, from the Grint export bundle, captured 2026-08-23

Regenerate with `pnpm profile`. The course half comes from
`public/data/courses.json`, the map pipeline's artifact — `pnpm data:build`.
