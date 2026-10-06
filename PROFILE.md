# THE PLAYER

A living spec of one golfer, derived from every record this repo keeps: a
launch-monitor ledger, a watch that hears the course, five seasons of
scorecards, and a map of everywhere they happened.
**Nothing here is written by hand.** `pnpm profile` regenerates it,
and the diff is the point — this file exists so that a change in the golfer is
a commit rather than a page that quietly reads differently than it did.

Every finding carries the numbers that put it there and the condition that
takes it off. Hit the shots and the sentence retires itself.

## The spec

### From the range — Garmin R50 launch monitor

| | |
|---|---|
| Measured range | **92–195 yd** — Sand Wedge to 5 Iron |
| Clubs measured | **8** — of 13 owned · 15+ usable shots each |
| Shots on file | **217** — of 301 logged · 8 sessions |

### From the watch — Garmin S70 · AutoShot

| | |
|---|---|
| Rounds heard | **6** — of 13 — the rest are R50 simulator rounds with nothing to hear |
| Shots heard | **290** — 53% of the 546 strokes on the cards |
| Clubs with a course number | **7** — 10+ clear full swings each |

### From the scorecards — TheGrint

| | |
|---|---|
| Handicap index | **12.7** — WHS, from 23.9 at the record's start |
| Rounds | **174** — 2021-07-08 → 2026-10-05 |
| Recent scoring | **91.0** — last 5 rounds; career 90.4 over 145 |

### From the map — every course played

| | |
|---|---|
| Courses played | **89** — 173 rounds · 11 US states, 3 countries |
| Mean score | **88.4** — 79 layouts, 18 holes |
| Favourite | **Bethpage State Park (Black)** — own ranking, no. 1 |

## This week

The week of 2026-09-29, measured against the newest capture (2026-10-05) — record time, not wall time:
a goal is open until the record outruns its week, then achieved or missed
by what the record says. The engine proposes (`pnpm goals:propose`);
data/goals.json is the human's commit.

- **open** — up-and-downs in the week's first watch round: 0 holes → 3 holes (6 chances) — Chip on, one putt — the biggest line in the ledger (4.1 strokes a round): you get up and down 15% of the time, a 13 index 35%, a 5 index 47%. Three of the usual six or seven chances in the next watch round. Putt from the fringe; from rough, the club that lands on the green and runs; then a full routine on the 4–8 footer.
- **achieved** — greens in regulation in the week's first round: 6 greens → 5 greens (18 holes) — Greens from 100–175 (2.1 strokes a round): 5.1 a round now, a 13 index 5.3, a 5 index 7.6. Five greens in the next linked round. One more club — 45% of your classified misses stop short of the hole — and outside 140 yd the target is the middle of the green.
- **open** — doubles or worse in the week's first round: 4 holes → at most 2 holes (18 holes) — Doubles or worse: 6.2 a round over the five watch rounds, a 5 index 1.44. Two or fewer in the next linked round. Bogey is fine; the second dropped stroke is the one to refuse — sideways out of trouble, chip to the fat of the green, two-putt. All three goals need the round on the watch AND its Grint card captured; the 3 Hybrid range block is dropped, not carried — a club measured at a monitor is a number on the bag page, not a stroke.

Past weeks: 2026-09-09 (0/2 achieved) · 2026-09-16 (1/2 achieved)

## The plan

Break 80. A 79 is a differential of 6.9 / 5.4 / 6.8 / 4.9 / 5.7 at the rated tees the watch has heard; the 5–7 index the
benchmarks describe is ~6.5, and the record's index is 12.7 —
6.2 strokes a round by the index, 7.3 priced in the ledger below
(the areas overlap; the two are printed together, not summed).
A 5 index breaks 80 in 40.7% of rounds.

| Area | You | 13 band | 5 band | Strokes | Price |
|---|---|---|---|---|---|
| Chip on, one putt | 12.8% (n 39) | 35% | 47% | 4.4 | 12.9 missed greens a round × (47% − 12.8%) = 4.4 |
| Greens from 100–175 | 5.1 greens/round (n 20) | 5.3 greens/round | 7.6 greens/round | 2.2 | (7.6 − 5.1 greens) × (1 − 12.8% saved) = 2.2 |
| Lag speed | 8.4 % of holes (n 359) | 10% | 6% | 0.4 | (8.4% − 6%) × 18 holes = 0.4 |
| Contact off the tee | 2.5 per round (n 81) | 3.3 per round | 2 per round | 0.3 | (2.5 − 2 a round) × (+1.6 on those holes − +1.09 on the rest) = 0.3 |
| Doubles or worse | 5.8 per round (n 108) | 4.7 per round | 1.4 per round | — | the doubles carry 75 of 125 strokes over par on 108 holes — an outcome of the four areas above, not a fifth |

- **Chip on, one putt** — on course: Putt from the fringe. From rough, pick the club that lands on the green and runs — the lob wedge reaches the green 68% of the time from inside 50 yd. Then the 4–8 footer gets a full routine. Practice: Two 25-minute sessions a week from rough, 15–35 yd, scored by leaves inside 6 ft (7 of 21 measurable so far), each ending with twenty putts from 4–8 ft. External cue: the landing spot, not the hands. Retired when up-and-downs at 35% over 20 linked rounds.
- **Greens from 100–175** — on course: One more club. 45% of your classified misses from 50–200 yd stopped short of the hole; outside 140 yd the target is the middle of the green, never the pin. Practice: Random-order approaches 100–175 yd, one ball per target, club changes every swing, scored by "on the green" not by proximity. From 125–200 the record is 9 of 53. Retired when 6+ greens a round over 20 rounds.
- **Lag speed** — on course: Outside 20 ft every putt is a speed putt: pick the 3-ft circle past the hole, never the line. The miss that three-putts is short. Practice: The 20/30/40 ft ladder, every first putt inside 3 ft, ten minutes at the end of each session — not a session of its own. Retired when three-putts under 6% of holes over 20 cards.
- **Contact off the tee** — on course: Driver only where there is 60 yd of playable width; otherwise the 3 Hybrid, which flew 175+ on 8 of 9 tee balls at Lincoln. Distance is not the problem — the driver goes 251 when struck. Practice: The first blocked 15 minutes of every range session is low-point work: a line an inch behind the ball, strike the ground in front of it, half swings before full. No driver until the irons brush the line ten times running. Retired when 2 troublesome tee balls a round or fewer over 10 watch rounds.
- **Doubles or worse** — on course: A double is a mishit tee ball, a short-sided miss, or a chunked chip, then a three-putt. Bogey is fine; the second dropped stroke is the one to refuse — take the medicine shot sideways, chip to the fat of the green, two-putt. Practice: None. This line moves when the four above move. Retired when 1.44 doubles a round or fewer over 10 linked rounds.

On the course, for nothing:

- Take one more club into the green. The amateur miss is short, and a long miss costs less than a bunker. You: 45.2 % of misses (n 73). Source: Shot Scope — 5 stats to track to improve your game.
- Driver only with 60 yd of playable width from rough to rough. Otherwise the 3 Hybrid — it starts a hole as well as the driver does and mishits less. You: 2.5 per round (n 81). Source: Shot Scope — The Shot Scope Six: benchmarks for success.
- Outside 140 yd the target is the middle of the green. Nobody hits many greens from 175; the miss that costs is the short-sided one. You: 17 % greens (n 53). Source: Wicked Smart Golf — DECADE golf review.
- Miss on the fat side, away from sand. A bunker approach costs half a stroke more than a fairway lie. You: 7.8 % of approaches (n 115). Source: Shot Scope — Is there such a thing as a good miss?.
- Putt from the fringe. The lob wedge is the wrong default from inside 25 yd. You: 67.8 % reached the green (n 59). Source: Arccos — Putting from off the green.
- On par 5s advance the ball. Laying up to a number costs 0.6 a hole; the threshold that matters is getting the third shot inside 175. You: 1.2 over par per hole (n 19). Source: Shot Scope — Par 5s: go for it in two vs a lay-up.

32 of 108 watch holes end their last heard shot on the pin itself (no putts on the watch); those shots are excluded from every leave and short-of-the-hole call.

## The leaks

Where the strokes go, ranked by what each leak costs: leaks the record can
price come first, ranked in strokes; the ones whose cost is unknown by
construction follow, ranked by how much of the record says they exist.
Each move is the open practice task that addresses it, joined on render.

### 01. The approach game caps everything: 5.1 greens a round

- **fact** — 5.1 GIR per round career, 5.1 over the last 20; ~13 missed greens per round; the watch has heard 53 approaches from inside 150 yd on the course over 6 rounds — 24 found the green
- **cost** — the structural ceiling — at a 14.5% save rate, ~11 of those misses are bogey-or-worse before the putter or driver say anything
- **move** — the approach clubs are the practice list's whole top end — first up: The 3 Hybrid has never been measured
- **retired when** — a capture averaging 9+ GIR over 20 rounds
- *scorecards + watch*

### 02. The green gives back 2.6 strokes a round

- **fact** — 35.6 putts per round; 370 three-putts over 2752 recorded holes; own best round used 29
- **cost** — ~2.6 strokes/round in three-putts alone; the gap between mean and own-best putting is 6.6 strokes
- **move** — already on the practice list: A three-putt every 7 holes
- **retired when** — three-putts under one hole in 10, sustained over a season
- *scorecards*

### 03. The tee ball is unmeasured and misses both ways

- **fact** — 38% of fairways missed, split 17/17 left/right; the driver has one launch-monitor swing on file
- **cost** — unknown by construction — a two-way miss can't be aimed off, and an unmeasured club can't be diagnosed
- **move** — on the practice list: Measure the Driver
- **retired when** — the driver drawn on the bag page, and one side owning two-thirds of the misses
- *scorecards + range*

### 04. 12 rounds in the last 18 months

- **fact** — 58 rounds in 2022 → 12 in the last 18 months
- **cost** — not strokes — proof. Every encouraging recent number rests on a sample one trip could overturn
- **move** — the cheapest fix on this list: play. 20 rounds makes every other line here trustworthy
- **retired when** — a season with 20+ posted rounds
- *scorecards*

### 05. The short game, located

- **fact** — par saved on 14.5% of missed greens; the watch heard 72 short-game shots — 25% of 290 recorded shots — across 6 rounds
- **cost** — every unsaved miss is a stroke; the save rate prices the approach leak above, and the watch now says where the saves die
- **move** — keep wearing the watch — the split now retires or confirms itself round by round
- **retired when** — par saved on a third of missed greens, sustained over a season
- *scorecards + watch*

## The read

Ranked by how much of the record is behind each line, never by how bad it
sounds. Every comparison is internal — this club against that club, these
courses against those — because a benchmark without a source is the one kind
of claim this repo refuses to print.

### 01. The range ledger and the scorecards still share no shots. The watch is the only seam between them, and it is 290 shots wide so far.

- **why** — 8 clubs measured over 217 trusted shots, every one hit off a mat in front of a monitor. 173 rounds played across 89 facilities, none with a shot in that ledger. The only measurements made on grass are the 290 AutoShot shots over 6 rounds on the diary.
- **gone when** — A shot in both ledgers — an R50 round-mode import, or enough watch rounds to read every drawn club's course number against its range number.
- *both · high confidence*

### 02. There is no measured tee game. Every club with numbers is a club you reach for after the shot that decided where you were standing.

- **why** — 217 trusted shots across 8 sessions, and only 1 with a driver, wood, hybrid or long iron (Driver) — under the 15 a club needs to be drawn. The longest club measured is the 5 Iron, 195 yd, against 173 rounds played.
- **gone when** — Any tee club drawn on the bag page — 15+ usable shots with it.
- *both · high confidence*

### 03. Over 18 holes the record averages 88.4, weighted by how often each course was played.

- **why** — 79 layouts with comparable 18-hole averages across 173 rounds. Best average 76.7 at Rancho Park Golf Club, worst 102.0 at Las Vegas Paiute Golf Resort. 21 layouts held out as short or unscored rounds.
- **gone when** — A new snapshot of the map's course history with a different mean.
- *course · high confidence*

### 04. The golf is getting better, and the raw scores hide it: the handicap fell while the scorecards stood still, which is what improvement looks like when the courses get harder too.

- **why** — Trending handicap 23.9 at the record's start, 12.7 now, across 159 differentials (mean of the first 20: 18.9; the last 20: 16.8). Meanwhile the raw 18-hole mean moved from 91.7 (2021, 26 rounds) to 90.2 (2026, 12). Over the last 12 chart points the trending handicap moved from 12.9 to 12.7 (mean differential 17.5).
- **gone when** — A capture whose trending handicap ends no lower than it starts.
- *course · high confidence*

### 05. Putting is the biggest single line item in the score: 39% of all strokes happen on the green.

- **why** — 142 eighteen-hole rounds carry putts: 35.6 per round against a 90.4 mean score. 370 holes took three or more putts, of 2752 recorded — one in 7.
- **gone when** — A capture with putts under 35% of strokes, or three-putts under one hole in 10.
- *course · high confidence*

### 06. The bag is not evenly spaced: there are distances it cannot cover and distances it covers twice.

- **why** — Worst gap 31.1 yd between 5 Iron and 6 Iron · 3 overlapping pairs under 8 yd apart.
- **gone when** — No gap flagged as a hole, an inversion or an overlap on the bag page.
- *range · high confidence*

### 07. The tee ball misses both ways in nearly equal measure — the course-side echo of the range's two-way miss, and the one pattern aiming off cannot fix.

- **why** — 1614 driven holes carry a fairway result: 62% hit, 17% missed left, 17% missed right, 5% marked missed without a side. 433 holes carry codes outside Grint's own legend and are excluded.
- **gone when** — A capture where one side owns two-thirds of the misses, or the hit rate moves by five points.
- *course · high confidence*

### 08. This is a collector's record, not a member's: most courses were played once and never again.

- **why** — 75 of 100 layouts played exactly once (75%). Most played: Rancho Park Golf Club at 10 rounds.
- **gone when** — A course history where under half the layouts are one-and-done.
- *course · high confidence*

### 09. Courses are rated for fun ahead of conditioning.

- **why** — Median fun 85.6, median conditioning 81.1, across 93 rated layouts.
- **gone when** — Median fun and conditioning ratings within a point of each other.
- *course · medium confidence*

### 10. 24 practice tasks are open, and the top one is aimed at the biggest blind spot above.

- **why** — First on the list: The 3 Hybrid has never been measured — Callaway UW is in the bag at 19° and has not one shot on file across 8 sessions. Both gaps beside it are guesses about a club nobody has hit at a monitor. AutoShot has meanwhile heard 39 full swings with it on the course — median 216 yd point-to-point — a number to check the monitor against, not a substitute for it.
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

### 17. 5 clubs have enough on-course shots to face their range numbers, and on grass they run 0.6 yd shorter than off the mat.

- **why** — 7 Iron 174 yd on course (14 shots) vs 159 yd range · 8 Iron 143 yd on course (14 shots) vs 157 yd range · 9 Iron 132 yd on course (14 shots) vs 138 yd range · Pitching Wedge 121 yd on course (14 shots) vs 122 yd range · Gap Wedge 101 yd on course (18 shots) vs 98 yd range
- **gone when** — A capture where the mean course-vs-range gap crosses zero or shrinks under 3 yd.
- *both · medium confidence*

### 18. The ledger knows its lies now: 50% of the recorded non-tee shots start from the rough.

- **why** — 204 non-tee shots with a start lie, Garmin's own strings: Rough 102, Fairway 48, TeeBox 27, Bunker 14, Unknown 12, Green 1.
- **gone when** — A capture where the leading lie changes or its share moves by ten points.
- *course · medium confidence*

### 19. The record finally has on-course shots, and 25% of the recorded ones are short game — inside 50 yd or chips.

- **why** — 290 AutoShot shots over 6 rounds: 86 tee, 113 approach/layup/recovery, 72 short game, 1 putts, 18 unclassified. The scorecards count 546 strokes, so the watch heard 53% of them — without a putter sensor, putts and some chips never become shots.
- **gone when** — A capture moving the short-game share by ten points, or putter-sensor data closing the coverage gap.
- *course · medium confidence*

## Recent form

The last 18 months (since 2025-04-05), measured from the newest
card (2026-10-05) — never from today, so this file reads the same until the
record changes. Quick-entry echoes of a card already on file are not counted twice.

| Date | Course | Strokes | Putts |
|---|---|---|---|
| 2026-08-22 | Presidio Golf Course | 98 | 37 |
| 2026-09-08 | Presidio Golf Course | 93 | 36 |
| 2026-09-15 | Lake \| The Olympic Club | 99 | 38 |
| 2026-09-26 | Lincoln Park Golf Course | 77 | 29 |
| 2026-10-05 | Meadow Club Fairfax | 88 | 36 |

| | Recent | Career |
|---|---|---|
| Scoring | **90.2** (12 rounds) | 90.4 (145 rounds) |
| Putts / round | **34.8** (12 rounds) | 35.6 (142 rounds) |
| Three-putt share | **9%** (215 holes) | 13% (2752 holes) |
| Fairways hit | **63%** (149 holes) | 62% (1614 holes) |

## On the course

What AutoShot heard over 6 rounds (as of 2026-10-05;
the record's other 7 rounds are simulator rounds with nothing to hear).
Findings from this data switch on at 5 shot-bearing rounds —
until then this is the record, not a claim. The watch caught 290 of the
546 strokes the scorecards count (53%); putts and some
chips never become shots, so every share below is a share of recorded shots.

| | Shots | Of recorded |
|---|---|---|
| Tee | 86 | 30% |
| Approach | 113 | 39% |
| Short game | 72 | 25% |
| Putts | 1 | 0% |
| Unclassified | 18 | 6% |

Lies (non-tee, Garmin's own strings): Rough 102 · Fairway 48 · TeeBox 27 · Bunker 14 · Unknown 12 · Green 1.

Clubs the course has measured — clear full swings only (no chips, no punch-outs)
at 10+ shots; course yards are point-to-point, where the ball
came to rest, so nearer a range total than a carry:

| Club | On course | On the range |
|---|---|---|
| Driver | **252 yd** (53 swings) | unmeasured — this is the club's first number |
| 3 Hybrid | **216 yd** (39 swings) | unmeasured — this is the club's first number |
| 7 Iron | **174 yd** (14 swings) | 159 yd |
| 8 Iron | **143 yd** (14 swings) | 157 yd |
| 9 Iron | **132 yd** (14 swings) | 138 yd |
| Pitching Wedge | **121 yd** (14 swings) | 122 yd |
| Gap Wedge | **101 yd** (18 swings) | 98 yd |

## The roast

The same findings, unsoftened. Each one restates its own evidence and nothing
more — a roast that needs a fact you do not have is just an insult.

> 173 rounds and 217 measured shots that have still never met — the watch is carrying the entire introduction.
>
> — 8 clubs measured over 217 trusted shots, every one hit off a mat in front of a monitor. 173 rounds played across 89 facilities, none with a shot in that ledger. The only measurements made on grass are the 290 AutoShot shots over 6 rounds on the diary.

> 173 rounds played, 1 measured swing with anything that starts a hole. This is a very thorough study of the second shot.
>
> — 217 trusted shots across 8 sessions, and only 1 with a driver, wood, hybrid or long iron (Driver) — under the 15 a club needs to be drawn. The longest club measured is the 5 Iron, 195 yd, against 173 rounds played.

> Five years took 11 strokes off the handicap and 1.5 off the scorecard. You did not learn to score, you learned to lose by the same amount at harder courses.
>
> — Trending handicap 23.9 at the record's start, 12.7 now, across 159 differentials (mean of the first 20: 18.9; the last 20: 16.8). Meanwhile the raw 18-hole mean moved from 91.7 (2021, 26 rounds) to 90.2 (2026, 12). Over the last 12 chart points the trending handicap moved from 12.9 to 12.7 (mean differential 17.5).

> 35.6 putts a round, and a three-putt every 7 holes. The greens are charging a second green fee.
>
> — 142 eighteen-hole rounds carry putts: 35.6 per round against a 90.4 mean score. 370 holes took three or more putts, of 2752 recorded — one in 7.

> 3 pairs of clubs land within 8 yd of each other — 5 clubs doing the work of 3 — and none of them covers the 31 yd hole between the 5 Iron and the 6 Iron.
>
> — Worst gap 31.1 yd between 5 Iron and 6 Iron · 3 overlapping pairs under 8 yd apart.

> 267 fairways missed left, 271 missed right. At least the misses are fair.
>
> — 1614 driven holes carry a fairway result: 62% hit, 17% missed left, 17% missed right, 5% marked missed without a side. 433 holes carry codes outside Grint's own legend and are excluded.

> 75% of the courses in this record got exactly one chance to make an impression, which is also how many chances they got to be learned.
>
> — 75 of 100 layouts played exactly once (75%). Most played: Rancho Park Golf Club at 10 rounds.

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

## What the record cannot say

Gaps in the data, not gaps in the analysis. Listed so that silence is never
mistaken for a finding.

### What do the wedges carry at less than a full swing?

0 of 6 partial-wedge cells are measured. Between a full wedge and a chip lives most of the scoring window, and the ledger cannot see a partial's length — the classifier can prove a shorter swing happened, never which one was meant.

**Needs:** Labeled blocks — hit one length of one wedge in a single block (8 usable shots light a cell), then record it in data/wedge-blocks.json.

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

- **Scorecards** — 174 dated scorecards, 2021-07-08 to 2026-10-05, from the Grint export bundle, captured 2026-10-06
- **Courses** — 173 rounds over 100 layouts, from The Grint, captured 2026-08-01
- **Range** — 301 shots over 8 Garmin R50 sessions, 2026-07-02 to 2026-08-14
- **Shots on course** — 290 AutoShot shots over 6 of 13 rounds (the rest are R50 simulator rounds, which carry no shots), from the Garmin export bundle, captured 2026-10-06

Regenerate with `pnpm profile`. The course half comes from
`public/data/courses.json`, the map pipeline's artifact — `pnpm data:build`.
