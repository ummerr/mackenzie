# THE PLAYER

A living spec of one golfer, derived from both halves of this repo: the shot
ledger in `data/`, and the course history the map keeps in the parent
directory. **Nothing here is written by hand.** `pnpm profile` regenerates it,
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
| Shots on file | **181** — of 255 logged |
| Range sessions | **7** |
| Rounds played | **166** |
| Courses played | **84** — 11 US states, 3 countries |
| Mean score | **88.4** — 79 layouts, 18 holes |
| Favourite | **Bethpage State Park (Black)** — own ranking, no. 1 |

## The read

Ranked by how much of the record is behind each line, never by how bad it
sounds. Every comparison is internal — this club against that club, these
courses against those — because a benchmark without a source is the one kind
of claim this repo refuses to print.

### 01. Nothing on this site was measured on a golf course. The played record and the measured record share no shots at all.

- **why** — 8 clubs measured, from the 5 Iron down to the Sand Wedge, over 181 trusted shots — every one of them hit off a mat in front of a monitor. 166 rounds played across 84 facilities, none of which put a single shot in this ledger.
- **gone when** — Any on-course shot data in the ledger — a round imported from the R50's on-course mode, or a hand-entered card with clubs.
- *both · high confidence*

### 02. There is no measured tee game. Every club with numbers is a club you reach for after the shot that decided where you were standing.

- **why** — 181 trusted shots across 7 sessions, and only 1 with a driver, wood, hybrid or long iron (Driver) — under the 15 a club needs to be drawn. The longest club measured is the 5 Iron, 195 yd, against 166 rounds played.
- **gone when** — Any tee club drawn on the bag page — 15+ usable shots with it.
- *both · high confidence*

### 03. Over 18 holes the record averages 88.4, weighted by how often each course was played.

- **why** — 79 layouts with comparable 18-hole averages across 166 rounds. Best average 76.7 at Rancho Park Golf Club, worst 102.0 at Las Vegas Paiute Golf Resort. 14 layouts held out as short or unscored rounds.
- **gone when** — A new snapshot of the map's course history with a different mean.
- *course · high confidence*

### 04. The bag is not evenly spaced: there are distances it cannot cover and distances it covers twice.

- **why** — Worst gap 31.1 yd between 5 Iron and 6 Iron · 3 overlapping pairs under 8 yd apart.
- **gone when** — No gap flagged as a hole, an inversion or an overlap on the bag page.
- *range · high confidence*

### 05. This is a collector's record, not a member's: most courses were played once and never again.

- **why** — 68 of 93 layouts played exactly once (73%). Most played: Rancho Park Golf Club at 10 rounds.
- **gone when** — A course history where under half the layouts are one-and-done.
- *course · high confidence*

### 06. The miss is two-way. Some clubs sit right of the target line by their median and others sit left, which is a different problem from one bias you could aim off.

- **why** — 3 of 8 drawn clubs miss right by their median (worst: 5 Iron, 17.6 yd right), 2 miss left (worst: Gap Wedge, 8.4 yd left).
- **gone when** — Every drawn club's median offline inside ±5 yd, or all of them on the same side.
- *range · high confidence*

### 07. Courses are rated for fun ahead of conditioning.

- **why** — Median fun 85.6, median conditioning 81.1, across 93 rated layouts.
- **gone when** — Median fun and conditioning ratings within a point of each other.
- *course · medium confidence*

### 08. 21 practice tasks are open, and the top one is aimed at the biggest blind spot above.

- **why** — First on the list: The 3 Hybrid has never been measured — Callaway UW is in the bag at 19° and has not one shot on file across 7 sessions. Both gaps beside it are guesses about a club nobody has hit at a monitor.
- **gone when** — An empty practice list.
- *range · high confidence*

### 09. 4 of 8 drawn clubs spray wider than a 30-yard fairway at their own median carry.

- **why** — Worst is the 5 Iron: eight in ten of its shots land inside a 40 yd corridor at 195 yd. A good fairway is 30 yd wide.
- **gone when** — Every drawn club's 80% aim band under 30 yd wide at its median carry.
- *range · high confidence*

### 10. Part of the bag has never been to a monitor. The chart is not a picture of what you carry, it is a picture of what you happened to hit.

- **why** — 13 clubs in the bag, 9 with any shots on file. Never recorded: 3 Hybrid, 3 Iron, 4 Iron, Lob Wedge. A further 1 — Driver (0 usable of 1) — sits under the threshold to be drawn.
- **gone when** — Every club in data/bag.json with at least one shot in the ledger.
- *range · high confidence*

### 11. Some clubs are a different club depending on the day. Their session medians move by more than the gaps between neighbouring clubs.

- **why** — 4 drawn clubs drift more than 10 yd between sessions. Worst: Pitching Wedge, 16.8 yd between its session medians over 3 sessions.
- **gone when** — Every drawn club's session spread under 10 yd.
- *range · medium confidence*

### 12. 29% of logged swings do not count toward any number on this site.

- **why** — 74 of 255 shots excluded — warmup 49, auto-flagged 23, possible-partial 2. Warmup and partials are deliberate exclusions, not bad swings.
- **gone when** — Under 20% of logged shots excluded.
- *range · high confidence*

### 13. Two clubs in the bag are built to the same loft. Which of them goes further is a question about the heads, and nothing on file answers it.

- **why** — 3 Hybrid and 3 Iron are both 19°. Different head types — wood against iron — so this is not a duplicate club, but it is not a gap either, and the ledger has never had both on the same day.
- **gone when** — Both clubs measured, or one of them re-lofted. 3 Hybrid and 3 Iron carrying more than 8 yd apart settles it.
- *range · medium confidence*

## The roast

The same findings, unsoftened. Each one restates its own evidence and nothing
more — a roast that needs a fact you do not have is just an insult.

> 166 rounds. 181 measured shots. The two sets do not intersect: not one number on this site came from a golf course.
>
> — 8 clubs measured, from the 5 Iron down to the Sand Wedge, over 181 trusted shots — every one of them hit off a mat in front of a monitor. 166 rounds played across 84 facilities, none of which put a single shot in this ledger.

> 166 rounds played, 1 measured swing with anything that starts a hole. This is a very thorough study of the second shot.
>
> — 181 trusted shots across 7 sessions, and only 1 with a driver, wood, hybrid or long iron (Driver) — under the 15 a club needs to be drawn. The longest club measured is the 5 Iron, 195 yd, against 166 rounds played.

> 3 pairs of clubs land within 8 yd of each other — 5 clubs doing the work of 3 — and none of them covers the 31 yd hole between the 5 Iron and the 6 Iron.
>
> — Worst gap 31.1 yd between 5 Iron and 6 Iron · 3 overlapping pairs under 8 yd apart.

> 73% of the courses in this record got exactly one chance to make an impression, which is also how many chances they got to be learned.
>
> — 68 of 93 layouts played exactly once (73%). Most played: Rancho Park Golf Club at 10 rounds.

> The 5 Iron goes right and the Gap Wedge goes left, so aiming off fixes exactly half your bag and breaks the other half.
>
> — 3 of 8 drawn clubs miss right by their median (worst: 5 Iron, 17.6 yd right), 2 miss left (worst: Gap Wedge, 8.4 yd left).

> Eight in ten 5 Irons finish inside 40 yd of each other. That is not a target, that is a postcode.
>
> — Worst is the 5 Iron: eight in ten of its shots land inside a 40 yd corridor at 195 yd. A good fairway is 30 yd wide.

> You own 13 clubs and have measured 9. The Lob Wedge is carried around every round as a decoration.
>
> — 13 clubs in the bag, 9 with any shots on file. Never recorded: 3 Hybrid, 3 Iron, 4 Iron, Lob Wedge. A further 1 — Driver (0 usable of 1) — sits under the threshold to be drawn.

> Your Pitching Wedge has a 17 yd opinion about what day of the week it is. A yardage book cannot help with that.
>
> — 4 drawn clubs drift more than 10 yd between sessions. Worst: Pitching Wedge, 16.8 yd between its session medians over 3 sessions.

## What the record cannot say

Gaps in the data, not gaps in the analysis. Listed so that silence is never
mistaken for a finding.

### How much of the score is the short game?

A range export has no putts, no chips and no bunker shots. On any ordinary scorecard those are around half the strokes, and none of them are here.

**Needs:** Shot-level on-course data, or a hand-kept putts-and-ups card.

### What happens from a real lie?

Every measured shot was hit off a mat to a flat range with a monitor watching. Nothing in the ledger has been hit from rough, sand, a slope or under pressure.

**Needs:** On-course tracking, which the R50 does not export.

### How much of each number is the weather?

The R50 records environmentals per session, not per shot, and nothing here is altitude-, temperature- or wind-adjusted. A summer session at sea level and a cold one are averaged together as if they were the same day.

**Needs:** Per-shot environmentals, or enough sessions to model the correction.

### Are the lofts on this page the lofts in the bag?

13 clubs carry a loft and 0 of them have been verified. Every number is what the club left the factory as: the driver's sleeve is adjustable and its setting has never been read, irons bend a degree in a car boot, and a wedge is ground to order. Any finding below that compares degrees is comparing spec sheets, not clubs.

**Needs:** One session on a loft-and-lie gauge, then `verified: true` in data/bag.json.

### Is the golf getting better?

The course snapshot carries an average per layout, not a round-by-round history with dates, so nothing here can be plotted against time or against a practice session.

**Needs:** Round-level scores with dates — the Grint HAR extractor in the parent repo's NEXT.md.

### Is a score of 88 good on this course?

The snapshot has no par, no yardage and no tee for any layout, so every average is compared against every other average as though all 18-hole golf were equal.

**Needs:** Par and rating/slope per layout, which The Grint has and the paste did not carry.

## Read from

- **Range** — 255 shots over 7 Garmin R50 sessions, 2026-07-02 to 2026-08-03
- **Courses** — 166 rounds over 93 layouts, from The Grint, captured 2026-08-01

Regenerate with `pnpm profile`. The course half comes from
`data/course-history.json`, itself a snapshot — `pnpm ingest:courses`.
