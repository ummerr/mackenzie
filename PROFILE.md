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
| Rounds heard | **7** — of 15 — the rest are R50 simulator rounds with nothing to hear |
| Shots heard | **335** — 53% of the 634 strokes on the cards |
| Clubs with a course number | **7** — 10+ clear full swings each |

### From the scorecards — TheGrint

| | |
|---|---|
| Handicap index | **13.7** — WHS, from 23.9 at the record's start |
| Rounds | **175** — 2021-07-08 → 2026-10-14 |
| Recent scoring | **89.0** — last 5 rounds; career 90.4 over 146 |

### From the map — every course played

| | |
|---|---|
| Courses played | **90** — 174 rounds · 11 US states, 3 countries |
| Mean score | **88.4** — 79 layouts, 18 holes |
| Favourite | **Bethpage State Park (Black)** — own ranking, no. 1 |

## This week

The week of 2026-09-29, measured against the newest capture (2026-10-14) — record time, not wall time:
a goal is open until the record outruns its week, then achieved or missed
by what the record says. The engine proposes (`pnpm goals:propose`);
data/goals.json is the human's commit.

- **missed** — up-and-downs in the week's first watch round: 0 holes → 3 holes (6 chances) — Chip on, one putt — the biggest line in the ledger (4.1 strokes a round): you get up and down 15% of the time, a 13 index 35%, a 5 index 47%. Three of the usual six or seven chances in the next watch round. Putt from the fringe; from rough, the club that lands on the green and runs; then a full routine on the 4–8 footer.
- **achieved** — greens in regulation in the week's first round: 6 greens → 5 greens (18 holes) — Greens from 100–175 (2.1 strokes a round): 5.1 a round now, a 13 index 5.3, a 5 index 7.6. Five greens in the next linked round. One more club — 45% of your classified misses stop short of the hole — and outside 140 yd the target is the middle of the green.
- **missed** — doubles or worse in the week's first round: 4 holes → at most 2 holes (18 holes) — Doubles or worse: 6.2 a round over the five watch rounds, a 5 index 1.44. Two or fewer in the next linked round. Bogey is fine; the second dropped stroke is the one to refuse — sideways out of trouble, chip to the fat of the green, two-putt. All three goals need the round on the watch AND its Grint card captured; the 3 Hybrid range block is dropped, not carried — a club measured at a monitor is a number on the bag page, not a stroke.

Past weeks: 2026-09-09 (0/2 achieved) · 2026-09-16 (1/2 achieved)

## The plan

Break 80. A 79 is a differential of 6.9 / 5.4 / 6.8 / 4.9 / 5.7 at the rated tees the watch has heard; the 5–7 index the
benchmarks describe is ~6.5, and the record's index is 13.7 —
7.2 strokes a round by the index, 6.9 priced in the ledger below
(the areas overlap; the two are printed together, not summed).
A 5 index breaks 80 in 40.7% of rounds.

| Area | You | 13 band | 5 band | Strokes | Price |
|---|---|---|---|---|---|
| Chip on, one putt | 14% (n 43) | 35% | 47% | 4.2 | 12.8 missed greens a round × (47% − 14%) = 4.2 |
| Greens from 100–175 | 5.3 greens/round (n 20) | 5.3 greens/round | 7.6 greens/round | 2 | (7.6 − 5.3 greens) × (1 − 14% saved) = 2 |
| Lag speed | 8.1 % of holes (n 359) | 10% | 6% | 0.4 | (8.1% − 6%) × 18 holes = 0.4 |
| Contact off the tee | 2.4 per round (n 94) | 3.3 per round | 2 per round | 0.3 | (2.4 − 2 a round) × (+1.71 on those holes − +1.03 on the rest) = 0.3 |
| Doubles or worse | 5.7 per round (n 126) | 4.7 per round | 1.4 per round | — | the doubles carry 87 of 143 strokes over par on 126 holes — an outcome of the four areas above, not a fifth |

- **Chip on, one putt** — on course: Putt from the fringe. From rough, pick the club that lands on the green and runs — the lob wedge reaches the green 66% of the time from inside 50 yd. Then the 4–8 footer gets a full routine. Practice: Two 25-minute sessions a week from rough, 15–35 yd, scored by leaves inside 6 ft (8 of 23 measurable so far), each ending with twenty putts from 4–8 ft. External cue: the landing spot, not the hands. Retired when up-and-downs at 35% over 20 linked rounds.
- **Greens from 100–175** — on course: One more club. 44% of your classified misses from 50–200 yd stopped short of the hole; outside 140 yd the target is the middle of the green, never the pin. Practice: Random-order approaches 100–175 yd, one ball per target, club changes every swing, scored by "on the green" not by proximity. From 125–200 the record is 12 of 62. Retired when 6+ greens a round over 20 rounds.
- **Lag speed** — on course: Outside 20 ft every putt is a speed putt: pick the 3-ft circle past the hole, never the line. The miss that three-putts is short. Practice: The 20/30/40 ft ladder, every first putt inside 3 ft, ten minutes at the end of each session — not a session of its own. Retired when three-putts under 6% of holes over 20 cards.
- **Contact off the tee** — on course: Driver only where there is 60 yd of playable width; otherwise the 3 Hybrid, which flew 175+ on 8 of 9 tee balls at Lincoln. Distance is not the problem — the driver goes 251 when struck. Practice: The first blocked 15 minutes of every range session is low-point work: a line an inch behind the ball, strike the ground in front of it, half swings before full. No driver until the irons brush the line ten times running. Retired when 2 troublesome tee balls a round or fewer over 10 watch rounds.
- **Doubles or worse** — on course: A double is a mishit tee ball, a short-sided miss, or a chunked chip, then a three-putt. Bogey is fine; the second dropped stroke is the one to refuse — take the medicine shot sideways, chip to the fat of the green, two-putt. Practice: None. This line moves when the four above move. Retired when 1.44 doubles a round or fewer over 10 linked rounds.

On the course, for nothing:

- Take one more club into the green. The amateur miss is short, and a long miss costs less than a bunker. You: 44.2 % of misses (n 86). Source: Shot Scope — 5 stats to track to improve your game.
- Driver only with 60 yd of playable width from rough to rough. Otherwise the 3 Hybrid — it starts a hole as well as the driver does and mishits less. You: 2.4 per round (n 94). Source: Shot Scope — The Shot Scope Six: benchmarks for success.
- Outside 140 yd the target is the middle of the green. Nobody hits many greens from 175; the miss that costs is the short-sided one. You: 19.4 % greens (n 62). Source: Wicked Smart Golf — DECADE golf review.
- Miss on the fat side, away from sand. A bunker approach costs half a stroke more than a fairway lie. You: 6.7 % of approaches (n 135). Source: Shot Scope — Is there such a thing as a good miss?.
- Putt from the fringe. The lob wedge is the wrong default from inside 25 yd. You: 65.7 % reached the green (n 67). Source: Arccos — Putting from off the green.
- On par 5s advance the ball. Laying up to a number costs 0.6 a hole; the threshold that matters is getting the third shot inside 175. You: 1.0 over par per hole (n 24). Source: Shot Scope — Par 5s: go for it in two vs a lay-up.

37 of 126 watch holes end their last heard shot on the pin itself (no putts on the watch); those shots are excluded from every leave and short-of-the-hole call.

## The leaks

Where the strokes go, ranked by what each leak costs: leaks the record can
price come first, ranked in strokes; the ones whose cost is unknown by
construction follow, ranked by how much of the record says they exist.
Each move is the open practice task that addresses it, joined on render.

### 01. The approach game caps everything: 5.1 greens a round

- **fact** — 5.1 GIR per round career, 5.3 over the last 20; ~13 missed greens per round; the watch has heard 63 approaches from inside 150 yd on the course over 7 rounds — 28 found the green
- **cost** — the structural ceiling — at a 14.4% save rate, ~11 of those misses are bogey-or-worse before the putter or driver say anything
- **move** — the approach clubs are the practice list's whole top end — first up: The 3 Hybrid has never been measured
- **retired when** — a capture averaging 9+ GIR over 20 rounds
- *scorecards + watch*

### 02. The green gives back 2.6 strokes a round

- **fact** — 35.6 putts per round; 372 three-putts over 2770 recorded holes; own best round used 29
- **cost** — ~2.6 strokes/round in three-putts alone; the gap between mean and own-best putting is 6.6 strokes
- **move** — already on the practice list: A three-putt every 7 holes
- **retired when** — three-putts under one hole in 10, sustained over a season
- *scorecards*

### 03. The tee ball is unmeasured and misses both ways

- **fact** — 38% of fairways missed, split 16/17 left/right; the driver has one launch-monitor swing on file
- **cost** — unknown by construction — a two-way miss can't be aimed off, and an unmeasured club can't be diagnosed
- **move** — on the practice list: Measure the Driver
- **retired when** — the driver drawn on the bag page, and one side owning two-thirds of the misses
- *scorecards + range*

### 04. 13 rounds in the last 18 months

- **fact** — 58 rounds in 2022 → 13 in the last 18 months
- **cost** — not strokes — proof. Every encouraging recent number rests on a sample one trip could overturn
- **move** — the cheapest fix on this list: play. 20 rounds makes every other line here trustworthy
- **retired when** — a season with 20+ posted rounds
- *scorecards*

### 05. The short game, located

- **fact** — par saved on 14.4% of missed greens; the watch heard 82 short-game shots — 24% of 335 recorded shots — across 7 rounds
- **cost** — every unsaved miss is a stroke; the save rate prices the approach leak above, and the watch now says where the saves die
- **move** — keep wearing the watch — the split now retires or confirms itself round by round
- **retired when** — par saved on a third of missed greens, sustained over a season
- *scorecards + watch*

## The read

Ranked by how much of the record is behind each line, never by how bad it
sounds. Every comparison is internal — this club against that club, these
courses against those — because a benchmark without a source is the one kind
of claim this repo refuses to print.

### 01. The range ledger and the scorecards still share no shots. The watch is the only seam between them, and it is 335 shots wide so far.

- **why** — 8 clubs measured over 217 trusted shots, every one hit off a mat in front of a monitor. 174 rounds played across 90 facilities, none with a shot in that ledger. The only measurements made on grass are the 335 AutoShot shots over 7 rounds on the diary.
- **gone when** — A shot in both ledgers — an R50 round-mode import, or enough watch rounds to read every drawn club's course number against its range number.
- *both · high confidence*

### 02. There is no measured tee game. Every club with numbers is a club you reach for after the shot that decided where you were standing.

- **why** — 217 trusted shots across 8 sessions, and only 1 with a driver, wood, hybrid or long iron (Driver) — under the 15 a club needs to be drawn. The longest club measured is the 5 Iron, 195 yd, against 174 rounds played.
- **gone when** — Any tee club drawn on the bag page — 15+ usable shots with it.
- *both · high confidence*

### 03. Over 18 holes the record averages 88.4, weighted by how often each course was played.

- **why** — 79 layouts with comparable 18-hole averages across 174 rounds. Best average 76.7 at Rancho Park Golf Club, worst 102.0 at Las Vegas Paiute Golf Resort. 22 layouts held out as short or unscored rounds.
- **gone when** — A new snapshot of the map's course history with a different mean.
- *course · high confidence*

### 04. The golf got better over the whole record and worse over the recent stretch: the career arc and the last dozen differentials point opposite ways.

- **why** — Trending handicap 23.9 at the record's start, 13.7 now, across 160 differentials (mean of the first 20: 18.9; the last 20: 17.2). Meanwhile the raw 18-hole mean moved from 91.7 (2021, 26 rounds) to 90.0 (2026, 13). Over the last 12 chart points the trending handicap moved from 11.3 to 13.7 (mean differential 17.4).
- **gone when** — A capture whose last 12 differentials leave the trending handicap no higher than they found it.
- *course · high confidence*

### 05. Putting is the biggest single line item in the score: 39% of all strokes happen on the green.

- **why** — 143 eighteen-hole rounds carry putts: 35.6 per round against a 90.4 mean score. 372 holes took three or more putts, of 2770 recorded — one in 7.
- **gone when** — A capture with putts under 35% of strokes, or three-putts under one hole in 10.
- *course · high confidence*

### 06. The bag is not evenly spaced: there are distances it cannot cover and distances it covers twice.

- **why** — Worst gap 31.1 yd between 5 Iron and 6 Iron · 3 overlapping pairs under 8 yd apart.
- **gone when** — No gap flagged as a hole, an inversion or an overlap on the bag page.
- *range · high confidence*

### 07. The tee ball misses both ways in nearly equal measure — the course-side echo of the range's two-way miss, and the one pattern aiming off cannot fix.

- **why** — 1629 driven holes carry a fairway result: 62% hit, 16% missed left, 17% missed right, 5% marked missed without a side. 436 holes carry codes outside Grint's own legend and are excluded.
- **gone when** — A capture where one side owns two-thirds of the misses, or the hit rate moves by five points.
- *course · high confidence*

### 08. This is a collector's record, not a member's: most courses were played once and never again.

- **why** — 76 of 101 layouts played exactly once (75%). Most played: Rancho Park Golf Club at 10 rounds.
- **gone when** — A course history where under half the layouts are one-and-done.
- *course · high confidence*

### 09. Courses are rated for fun ahead of conditioning.

- **why** — Median fun 85.6, median conditioning 81.1, across 93 rated layouts.
- **gone when** — Median fun and conditioning ratings within a point of each other.
- *course · medium confidence*

### 10. 24 practice tasks are open, and the top one is aimed at the biggest blind spot above.

- **why** — First on the list: The 3 Hybrid has never been measured — Callaway UW is in the bag at 19° and has not one shot on file across 8 sessions. Both gaps beside it are guesses about a club nobody has hit at a monitor. AutoShot has meanwhile heard 44 full swings with it on the course — median 216 yd point-to-point — a number to check the monitor against, not a substitute for it.
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

- **why** — Last 18 months (since 2025-04-14, 13 distinct 18-hole rounds): 90.0 mean strokes against 90.4 over the career's 146; 34.8 putts a round against 35.6. The last 12 differentials average 17.4 and moved the trending handicap from 11.3 to 13.7.
- **gone when** — A capture where the recent window and the career agree — the trending-handicap tail within 2 strokes flat, and the recent means within 2 strokes and 1.5 putts of career.
- *course · medium confidence*

### 18. 5 clubs have enough on-course shots to face their range numbers, and on grass they run 1.9 yd longer than off the mat.

- **why** — 7 Iron 174 yd on course (16 shots) vs 159 yd range · 8 Iron 148 yd on course (16 shots) vs 157 yd range · 9 Iron 133 yd on course (15 shots) vs 138 yd range · Pitching Wedge 128 yd on course (16 shots) vs 122 yd range · Gap Wedge 101 yd on course (22 shots) vs 98 yd range
- **gone when** — A capture where the mean course-vs-range gap crosses zero or shrinks under 3 yd.
- *both · medium confidence*

### 19. The ledger knows its lies now: 50% of the recorded non-tee shots start from the rough.

- **why** — 236 non-tee shots with a start lie, Garmin's own strings: Rough 118, Fairway 58, TeeBox 32, Bunker 14, Unknown 13, Green 1.
- **gone when** — A capture where the leading lie changes or its share moves by ten points.
- *course · medium confidence*

### 20. The record finally has on-course shots, and 24% of the recorded ones are short game — inside 50 yd or chips.

- **why** — 335 AutoShot shots over 7 rounds: 99 tee, 134 approach/layup/recovery, 82 short game, 1 putts, 19 unclassified. The scorecards count 634 strokes, so the watch heard 53% of them — without a putter sensor, putts and some chips never become shots.
- **gone when** — A capture moving the short-game share by ten points, or putter-sensor data closing the coverage gap.
- *course · medium confidence*

## The last 10 rounds

The last 10 distinct 18-hole cards, 2026-07-26 → 2026-10-14, measured from the
newest card — never from today, so this file reads the same until the record
changes. Quick-entry echoes of a card already on file are not counted twice.
The watch heard 7 of the 10 through a confirmed link; pars come from the
watch, so over par, double bogeys and the worst hole print only on those. A blank
penalty cell is Grint's "not counted" — clean, or never entered — so every penalty
figure is a floor.

| Date | Course | Score | ± par | Putts | 1-putts | 3-putts | Fairways | Pen | Bunker | Dbl+ | Worst hole | Heard |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-07-26 | Battlefield \| Legends On The Niagara Golf Club (White) | **91** | — | 33 | 3 | 0 | 8/14 | 3 | 8 | — | — | — |
| 2026-08-15 | Bennett Valley Golf Course (White) | **89** | — | 38 | 2 | 4 | 10/12 | 1 | 1 | — | — | — |
| 2026-08-16 | Brambles Golf (Middle) | **90** | — | 35 | 3 | 2 | 3/9 | 5 | 1 | — | — | — |
| 2026-08-20 | TPC Harding Park Golf Course (White) | **91** | +19 | 33 | 5 | 2 | 7/11 | 1 | 0 | 6 | 7 on H4 (par 5) | 52 shots |
| 2026-08-22 | Presidio Golf Course (White) | **98** | +26 | 37 | 1 | 2 | 6/11 | 3 | 9 | 8 | 8 on H2 (par 5) | 58 shots |
| 2026-09-08 | Presidio Golf Course (White) | **93** | +21 | 36 | 2 | 2 | 5/12 | 3 | 3 | 6 | 6 on H3 (par 4) | 45 shots |
| 2026-09-15 | Lake \| The Olympic Club (Blue) | **99** | +28 | 38 | 1 | 3 | 5/11 | 0 | 2 | 9 | 7 on H6 (par 4) | 53 shots |
| 2026-09-26 | Lincoln Park Golf Course (Blue) | **77** | +9 | 29 | 5 | 0 | 9/13 | 1 | 0 | 2 | 7 on H18 (par 4) | 40 shots |
| 2026-10-05 | Meadow Club Fairfax (Blue) | **88** | +17 | 36 | 1 | 1 | 12/14 | 4 | 3 | 4 | 7 on H3 (par 4) | 42 shots |
| 2026-10-14 | Ocean \| Half Moon Bay Golf Links (White) | **88** | +16 | 35 | 3 | 2 | 10/15 | 3 | 3 | 5 | 7 on H6 (par 4) | 45 shots |

Fairways are hit over Grint's classified codes; Pen is penalty strokes (W, D, O) and
Bunker is bunker shots (S, F) off the card's penalty row; Dbl+ is holes at double bogey
or worse against the watch's par.

### The read

- 10 cards from 2026-07-26 to 2026-10-14: 90.4 a round, from 77 at Lincoln Park Golf Course to 99 at Lake | The Olympic Club; 4 of the 10 under 90, 1 under 80. The career runs 90.4.
- Double bogey or worse 5.7 times a round on the 7 rounds the watch heard, carrying 61% of the strokes dropped over par — the score is made on the blow-up holes, not on the bogeys.
- Fairways 61% (75 of 122 classified holes; career 62%): 15 missed left, 25 right, 7 unspecified — the miss leans right, so there is a side to aim away from.
- 2.4 troublesome tee balls a round on the watch's 7 rounds — a mishit wood, a bunker, or a punch-out next — and those holes went +1.7 against +1.0 on the rest.
- 4.9 greens a round on Grint's last 10 charted rounds. The watch saw 49 of 135 approaches from 50–200 yd finish on the green (36%); of the 86 misses it could place, 44% were short.
- Up and down 6 of 43 (14%) when the last shot started inside 50 yd; chips that reach the green stop a median 5.6 yd from the hole, 8 of 23 inside 6 ft.
- 35.0 putts a round (career 35.6): 1.8 three-putts a round, 10% of holes, against 2.6 one-putts.
- 2.4 penalty strokes a card on the row — 24 drops, 0 penalty areas, 0 out of bounds — and 3.0 bunker shots a card; 0 of 10 cards blank throughout. Career: 2.4 and 1.9 a card. A blank cell is Grint's "not counted", so every one of these is a floor.
- The chart's last 10 differentials average 17.6 (career 17.6) and moved the trending handicap from 12.9 to 13.7.

### Last 10 against the record

Grint's chart rows are sliced by position and never joined to the cards; their last 10 course names do match the cards' in order.

| | Last 10 | Career | What was counted |
|---|---|---|---|
| **Scoring** | | | |
| Strokes | **90.4 (10 rounds)** | 90.4 (146 rounds) | mean over distinct 18-hole cards; a quick-entry echo of a card on file is not counted twice |
| Best / worst | **77 / 99** | 77 / 102 |  |
| Cards under 90 / under 80 | **4 / 1 of 10** | 58 / 2 of 146 |  |
| Over par | **+19.4 (7 rounds the watch heard)** | +19.4 (7 rounds) | card strokes against the watch's pars, on confirmed links only |
| Double bogey or worse | **5.7 a round (7 rounds heard)** | 5.7 a round (7 rounds) | holes two or more over the watch's par |
| Over-par strokes those holes carry | **61%** | 61% | of every stroke dropped over par on an over-par hole |
| Par 3 / 4 / 5, over par | **+0.9 / +1.2 / +1.0 (126 holes)** | +0.9 / +1.2 / +1.0 (126 holes) | mean strokes over par by hole par, same join |
| **Off the tee** | | | |
| Fairways hit | **61% (75 of 122 holes)** | 62% (967 of 1571 holes) | Grint's own codes — hit, left, right, missed; a code outside its legend is carried as unclassified, never read as a miss |
| Misses left / right / unspecified | **15 / 25 / 7** | 258 / 269 / 77 | leans right |
| Fairways hit, Grint's chart | **44.3% (last 10 charted)** | 50.4% (113 charted) | Grint's own per-round figure, sliced by position — its denominator is Grint's, not the codes' |
| Troublesome tee balls | **2.4 a round (17 of 94 par-4/5 tee shots, 7 rounds)** | 2.4 a round (17 of 94, 7 rounds) | a driver, wood or hybrid under 170 yd, a tee ball into a bunker, or a recovery shot next |
| What one costs | **+1.7 on those holes vs +1.0 on the rest** | +1.7 vs +1.0 | mean strokes over par |
| **Into the green** | | | |
| Greens in regulation | **4.9 a round (last 10 charted)** | 5.1 a round (153 charted) | Grint's own chart, sliced by position and never joined to the cards |
| Par-3 greens hit | **32.0% (last 10 charted)** | 39.3% (153 charted) | Grint's chart, same slice |
| Approaches 50–200 yd on the green | **36% (135 approaches)** | 36% (135 approaches) | the watch: a shot started 50–200 yd from the pin, a par-3 tee shot included, that ended on the green |
| Misses short / long / lateral | **38 / 23 / 25** | 38 / 23 / 25 | 0 unclassifiable (the shot's end is the pin itself); 9 into a bunker |
| From 125–200 yd | **19% on (62)** | 19% on (62) |  |
| **Around the green** | | | |
| Up and down | **6 of 43 (14%)** | 6 of 43 (14%) | the last heard shot started inside 50 yd off the green and reached it; made = one putt or none on the card |
| Chips reaching the green | **66% (67 chips)** | 66% (67 chips) | every shot started inside 50 yd from off the green |
| Chip leave | **median 5.6 yd · 8 of 23 inside 6 ft** | median 5.6 yd · 8 of 23 inside 6 ft | 21 leaves unmeasurable (ended on the pin) |
| **On the green** | | | |
| Putts | **35.0 a round (10 rounds)** | 35.6 a round (143 rounds) | the card's total |
| One-putts | **2.6 a round (10 cards)** | 2.7 a round (143 cards) | holes with exactly one putt on the card |
| Three-putts | **1.8 a round · 10% of 179 holes** | 2.4 a round · 13% of 2564 holes | holes with three or more putts |
| **Penalties** | | | |
| Penalty strokes | **2.4 a card (10 cards)** | 2.4 a card (146 cards) | W, D and O on the penalty row; a blank cell counts as clean, so a floor |
| By type: drop / penalty area / OB | **24 / 0 / 0** | 312 / 7 / 29 |  |
| Bunker shots | **3.0 a card · 26 greenside, 4 fairway** | 1.9 a card · 208 greenside, 71 fairway | S and F on the row — a lie, not a penalty stroke; same floor |
| Cards with a blank row | **0 of 10** | 19 of 146 | clean, or never filled in — the record cannot tell which |
| **Handicap** | | | |
| Differential | **17.6 (last 10 charted)** | 17.6 (160 charted) | Grint's handicap chart, sliced by position |
| Trending handicap | **12.9 → 13.7** | 23.9 → 13.7 | where the chart's trending line stood at the slice's first and last point |

## On the course

What AutoShot heard over 7 rounds (as of 2026-10-14;
the record's other 8 rounds are simulator rounds with nothing to hear).
Findings from this data switch on at 5 shot-bearing rounds —
until then this is the record, not a claim. The watch caught 335 of the
634 strokes the scorecards count (53%); putts and some
chips never become shots, so every share below is a share of recorded shots.

| | Shots | Of recorded |
|---|---|---|
| Tee | 99 | 30% |
| Approach | 134 | 40% |
| Short game | 82 | 24% |
| Putts | 1 | 0% |
| Unclassified | 19 | 6% |

Lies (non-tee, Garmin's own strings): Rough 118 · Fairway 58 · TeeBox 32 · Bunker 14 · Unknown 13 · Green 1.

Clubs the course has measured — clear full swings only (no chips, no punch-outs)
at 10+ shots; course yards are point-to-point, where the ball
came to rest, so nearer a range total than a carry:

| Club | On course | On the range |
|---|---|---|
| Driver | **258 yd** (63 swings) | unmeasured — this is the club's first number |
| 3 Hybrid | **216 yd** (44 swings) | unmeasured — this is the club's first number |
| 7 Iron | **174 yd** (16 swings) | 159 yd |
| 8 Iron | **148 yd** (16 swings) | 157 yd |
| 9 Iron | **133 yd** (15 swings) | 138 yd |
| Pitching Wedge | **128 yd** (16 swings) | 122 yd |
| Gap Wedge | **101 yd** (22 swings) | 98 yd |

## The roast

The same findings, unsoftened. Each one restates its own evidence and nothing
more — a roast that needs a fact you do not have is just an insult.

> 174 rounds and 217 measured shots that have still never met — the watch is carrying the entire introduction.
>
> — 8 clubs measured over 217 trusted shots, every one hit off a mat in front of a monitor. 174 rounds played across 90 facilities, none with a shot in that ledger. The only measurements made on grass are the 335 AutoShot shots over 7 rounds on the diary.

> 174 rounds played, 1 measured swing with anything that starts a hole. This is a very thorough study of the second shot.
>
> — 217 trusted shots across 8 sessions, and only 1 with a driver, wood, hybrid or long iron (Driver) — under the 15 a club needs to be drawn. The longest club measured is the 5 Iron, 195 yd, against 174 rounds played.

> The career took 10 strokes off the handicap; the last 12 differentials gave 2.4 back.
>
> — Trending handicap 23.9 at the record's start, 13.7 now, across 160 differentials (mean of the first 20: 18.9; the last 20: 17.2). Meanwhile the raw 18-hole mean moved from 91.7 (2021, 26 rounds) to 90.0 (2026, 13). Over the last 12 chart points the trending handicap moved from 11.3 to 13.7 (mean differential 17.4).

> 35.6 putts a round, and a three-putt every 7 holes. The greens are charging a second green fee.
>
> — 143 eighteen-hole rounds carry putts: 35.6 per round against a 90.4 mean score. 372 holes took three or more putts, of 2770 recorded — one in 7.

> 3 pairs of clubs land within 8 yd of each other — 5 clubs doing the work of 3 — and none of them covers the 31 yd hole between the 5 Iron and the 6 Iron.
>
> — Worst gap 31.1 yd between 5 Iron and 6 Iron · 3 overlapping pairs under 8 yd apart.

> 267 fairways missed left, 275 missed right. At least the misses are fair.
>
> — 1629 driven holes carry a fairway result: 62% hit, 16% missed left, 17% missed right, 5% marked missed without a side. 436 holes carry codes outside Grint's own legend and are excluded.

> 75% of the courses in this record got exactly one chance to make an impression, which is also how many chances they got to be learned.
>
> — 76 of 101 layouts played exactly once (75%). Most played: Rancho Park Golf Club at 10 rounds.

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
> — Last 18 months (since 2025-04-14, 13 distinct 18-hole rounds): 90.0 mean strokes against 90.4 over the career's 146; 34.8 putts a round against 35.6. The last 12 differentials average 17.4 and moved the trending handicap from 11.3 to 13.7.

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

- **Scorecards** — 175 dated scorecards, 2021-07-08 to 2026-10-14, from the Grint export bundle, captured 2026-10-15
- **Courses** — 174 rounds over 101 layouts, from The Grint, captured 2026-08-01
- **Range** — 301 shots over 8 Garmin R50 sessions, 2026-07-02 to 2026-08-14
- **Shots on course** — 335 AutoShot shots over 7 of 15 rounds (the rest are R50 simulator rounds, which carry no shots), from the Garmin export bundle, captured 2026-10-19

Regenerate with `pnpm profile`. The course half comes from
`public/data/courses.json`, the map pipeline's artifact — `pnpm data:build`.
