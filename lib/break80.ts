/* The plan: where the strokes between this golfer and a 79 are.
 *
 * Research (DECISIONS.md 2026-09-29, sources in data/benchmarks.json): the
 * gap between a 13 and a 5–7 index is mostly greens hit and up-and-downs,
 * it arrives as double bogeys, and fairways and driving distance are not
 * separators. This module applies that to the record: for each area it
 * measures the golfer's own number (with its n and its definition), sets
 * the sourced 13-band and 5-band numbers beside it, and prices the gap to
 * the 5 band in strokes per round with the arithmetic printed.
 *
 * Rules of the module:
 *  - every "yours" carries a definition, because the benchmark carries one
 *    and the two are not always the same measurement;
 *  - a missing benchmark makes the price null, never a guess;
 *  - the ledger is not additive — the areas overlap (a chunked chip is a
 *    short-game miss and a double) — so the total is printed beside the
 *    index gap as a sanity check, not as a sum;
 *  - the pin-snap caveat: on many holes the last heard shot's end equals
 *    the hole's pin exactly (the watch has no putts, so Garmin's pin is
 *    where the last shot stopped). Any leave or short/long classification
 *    drops those shots; a chance to get up and down does not need them.
 */

import type { Benchmark, BenchmarkFile } from "./benchmarks";
import { bench } from "./benchmarks";
import type { GarminHole, GarminRound, GarminShot, GarminShots } from "./garmin-shots";
import { shotRounds } from "./garmin-shots";
import type { PlayedRound, RoundHistory } from "./round-history";

export const BREAK80 = {
  targetScore: 79,
  /** The index a 79 on a 71–73 rated course is, roughly — the 5–7 band the
   *  benchmarks describe. */
  targetIndex: 6.5,
  /** A shot starting inside this is a short-game chance. */
  shortGameYd: 50,
  /** A driver, wood or hybrid tee ball under this on a par 4/5 is a mishit. */
  troublesomeYd: 170,
  approachMinYd: 50,
  approachMaxYd: 200,
  /** Short of the hole: travelled under this share of the way and stopped
   *  more than `shortLeaveYd` away. */
  shortRatio: 0.9,
  shortLeaveYd: 10,
  /** Inside this many yards of the pin counts as "inside 6 ft". */
  insideSixFtYd: 2,
  trendWindow: 20,
} as const;

export type OpportunityId = "short-game" | "approach" | "putting" | "tee" | "doubles";

export interface Measured {
  value: number | null;
  /** The sample the value is a share or mean of. */
  n: number;
  unit: string;
  /** Where the number came from — "watch, 5 rounds" / "scorecards, last 20". */
  source: string;
  /** What exactly was counted. */
  definition: string;
}

export interface Opportunity {
  id: OpportunityId;
  label: string;
  /** Which way is better. */
  direction: "up" | "down";
  yours: Measured;
  bench13: Benchmark | null;
  bench5: Benchmark | null;
  /** Strokes per round between yours and the 5 band; null when either side
   *  is missing. */
  strokes: number | null;
  /** The arithmetic, printed. */
  formula: string;
  confidence: "high" | "medium" | "low";
  move: { course: string; practice: string };
  retiredWhen: string;
}

export interface Rule {
  id: string;
  text: string;
  /** The record's own number for the rule, when it has one. */
  yours: Measured | null;
  benchmark: Benchmark | null;
}

export interface TrendPt {
  label: string;
  value: number;
}

export interface Break80 {
  target: {
    score: number;
    indexApprox: number;
    /** What a 79 is worth at each course the watch has heard. */
    differentialAt: { course: string; tee: string | null; rating: number; slope: number; differential: number }[];
    breakShare: Benchmark | null;
  };
  yours: {
    index: number | null;
    girLast20: number | null;
    parSavesLast20: number | null;
    threePuttPct: number | null;
    threePuttsPerRound: number | null;
    watchRounds: number;
    linkedRounds: number;
  };
  /** Priced areas first by strokes, unpriced after, doubles always last. */
  ledger: Opportunity[];
  ledgerTotal: number | null;
  indexGap: number | null;
  rules: Rule[];
  trend: { gir: TrendPt[]; parSaves: TrendPt[]; threePutt: TrendPt[] };
  coverage: { holes: number; pinSnapped: number };
}

export interface Break80Inputs {
  roundHistory: RoundHistory | null;
  garminShots: GarminShots | null;
  /** scorecardId → the Grint card, confirmed links only. */
  linked: Map<string, PlayedRound>;
  benchmarks: BenchmarkFile | null;
}

/* ── geometry ─────────────────────────────────────────────────────────── */

const YD_PER_M = 1.09361;

export function distanceYd(
  a: { lat: number; lon: number } | null,
  b: { lat: number; lon: number } | null,
): number | null {
  if (!a || !b) return null;
  const R = 6371000;
  const d = Math.PI / 180;
  const dLat = (b.lat - a.lat) * d;
  const dLon = (b.lon - a.lon) * d;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * d) * Math.cos(b.lat * d) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h)) * YD_PER_M;
}

/** The shot's end is the hole's pin to the adapter's own 1e-6° rounding. */
export function pinSnapped(shot: GarminShot, hole: GarminHole): boolean {
  if (!shot.endGeo || !hole.pin) return false;
  return (
    Math.abs(shot.endGeo.lat - hole.pin.lat) < 2e-6 &&
    Math.abs(shot.endGeo.lon - hole.pin.lon) < 2e-6
  );
}

const WOODS = /driver|wood|hybrid/i;

/* ── the record's own numbers ─────────────────────────────────────────── */

export interface HoleView {
  round: GarminRound;
  hole: GarminHole;
  par: number | null;
  /** Card strokes when linked, the watch's own otherwise. */
  strokes: number | null;
  /** Card putts when linked; the watch never has them. */
  putts: number | null;
}

/** Every hole of every shot-bearing round, joined to its card by the
 *  confirmed link when there is one. */
export function holeViews(g: GarminShots | null, linked: Map<string, PlayedRound>): HoleView[] {
  if (!g) return [];
  const out: HoleView[] = [];
  for (const round of shotRounds(g)) {
    const card = linked.get(round.scorecardId) ?? null;
    for (const hole of round.holes) {
      const i = hole.number - 1;
      out.push({
        round,
        hole,
        par: hole.par,
        strokes: card?.holeStrokes?.[i] ?? hole.strokes,
        putts: card?.holePutts?.[i] ?? null,
      });
    }
  }
  return out;
}

export interface Doubles {
  doubles: number;
  holes: number;
  rounds: number;
  perRound: number | null;
  /** Strokes over par carried by the double-or-worse holes, and by all. */
  overFromDoubles: number;
  over: number;
}

export function doublesPerRound(views: HoleView[]): Doubles {
  const usable = views.filter((v) => v.par !== null && v.strokes !== null);
  const rounds = new Set(usable.map((v) => v.round.scorecardId)).size;
  let doubles = 0;
  let over = 0;
  let overFromDoubles = 0;
  for (const v of usable) {
    const o = (v.strokes as number) - (v.par as number);
    over += Math.max(0, o);
    if (o >= 2) {
      doubles++;
      overFromDoubles += o;
    }
  }
  return {
    doubles,
    holes: usable.length,
    rounds,
    perRound: rounds > 0 ? doubles / rounds : null,
    overFromDoubles,
    over,
  };
}

export interface UpAndDowns {
  chances: number;
  made: number;
  madeForPar: number;
  rounds: number;
  pct: number | null;
}

/** A chance: the last heard shot on the hole started inside 50 yd of the
 *  pin from off the green and reached it. Made: the card says one putt or
 *  none followed. Needs the card, so linked rounds only. */
export function upAndDowns(views: HoleView[]): UpAndDowns {
  let chances = 0;
  let made = 0;
  let madeForPar = 0;
  const rounds = new Set<string>();
  for (const v of views) {
    if (v.putts === null) continue;
    const shots = v.hole.shots;
    const last = shots[shots.length - 1];
    if (!last || last.shotType === "PUTT" || last.startLie === "Green") continue;
    const d0 = distanceYd(last.startGeo, v.hole.pin);
    if (d0 === null || d0 > BREAK80.shortGameYd || last.endLie !== "Green") continue;
    chances++;
    rounds.add(v.round.scorecardId);
    if (v.putts <= 1) {
      made++;
      if (v.par !== null && v.strokes !== null && v.strokes <= v.par) madeForPar++;
    }
  }
  return { chances, made, madeForPar, rounds: rounds.size, pct: chances ? (100 * made) / chances : null };
}

export interface Troublesome {
  teeShots: number;
  troublesome: number;
  unknownEnd: number;
  rounds: number;
  perRound: number | null;
  /** Mean strokes over par on holes with a troublesome tee ball, and on the
   *  rest — the record's own price of one. */
  overOnTrouble: number | null;
  overOnRest: number | null;
}

/** A par-4/5 tee ball that is a mishit (a driver, wood or hybrid under 170
 *  yd — an iron off the tee is a lay-up), finished in a bunker, or forced a
 *  recovery next. */
export function troublesomeTees(views: HoleView[]): Troublesome {
  let teeShots = 0;
  let troublesome = 0;
  let unknownEnd = 0;
  const rounds = new Set<string>();
  const overT: number[] = [];
  const overR: number[] = [];
  for (const v of views) {
    if (v.par === null || v.par < 4) continue;
    const shots = v.hole.shots;
    const tee = shots[0];
    if (!tee || tee.shotType !== "TEE") continue;
    teeShots++;
    rounds.add(v.round.scorecardId);
    const next = shots[1];
    const mishit =
      tee.yards !== null && tee.yards < BREAK80.troublesomeYd && WOODS.test(tee.club ?? "");
    const trouble = mishit || tee.endLie === "Bunker" || next?.shotType === "RECOVERY";
    if (tee.endLie === "Unknown") unknownEnd++;
    const over = v.strokes !== null ? v.strokes - v.par : null;
    if (trouble) {
      troublesome++;
      if (over !== null) overT.push(over);
    } else if (over !== null) {
      overR.push(over);
    }
  }
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  return {
    teeShots,
    troublesome,
    unknownEnd,
    rounds: rounds.size,
    perRound: rounds.size ? troublesome / rounds.size : null,
    overOnTrouble: mean(overT),
    overOnRest: mean(overR),
  };
}

export interface ApproachMisses {
  attempts: number;
  onGreen: number;
  short: number;
  long: number;
  lateral: number;
  /** Misses whose end was the pin itself — unclassifiable. */
  snapped: number;
  intoBunker: number;
  shortShareOfMisses: number | null;
  /** The 125–200 yd band on its own. */
  from125to200: { attempts: number; onGreen: number };
}

/** Approaches from 50–200 yd (a par-3 tee shot counts), classified by
 *  where they stopped relative to the hole. */
export function approachMisses(views: HoleView[]): ApproachMisses {
  const out: ApproachMisses = {
    attempts: 0,
    onGreen: 0,
    short: 0,
    long: 0,
    lateral: 0,
    snapped: 0,
    intoBunker: 0,
    shortShareOfMisses: null,
    from125to200: { attempts: 0, onGreen: 0 },
  };
  for (const v of views) {
    for (const s of v.hole.shots) {
      if (s.shotType === "PUTT" || s.startLie === "Green") continue;
      if (s.shotType === "TEE" && v.par !== 3) continue;
      const d0 = distanceYd(s.startGeo, v.hole.pin);
      if (d0 === null || d0 < BREAK80.approachMinYd || d0 >= BREAK80.approachMaxYd) continue;
      out.attempts++;
      const band = d0 >= 125;
      if (band) out.from125to200.attempts++;
      if (s.endLie === "Bunker") out.intoBunker++;
      if (s.endLie === "Green") {
        out.onGreen++;
        if (band) out.from125to200.onGreen++;
        continue;
      }
      if (pinSnapped(s, v.hole)) {
        out.snapped++;
        continue;
      }
      const leave = distanceYd(s.endGeo, v.hole.pin);
      const yards = s.yards;
      if (yards === null || leave === null) {
        out.snapped++;
        continue;
      }
      if (yards < BREAK80.shortRatio * d0 && leave > BREAK80.shortLeaveYd) out.short++;
      else if (yards > d0 + BREAK80.shortLeaveYd) out.long++;
      else out.lateral++;
    }
  }
  const classified = out.short + out.long + out.lateral;
  out.shortShareOfMisses = classified ? (100 * out.short) / classified : null;
  return out;
}

export interface Chips {
  chips: number;
  reachedGreen: number;
  /** Leaves measured against a pin the watch actually placed. */
  measured: number;
  insideSixFt: number;
  medianLeaveYd: number | null;
  pinSnapped: number;
}

/** Every shot started inside 50 yd from off the green. */
export function chips(views: HoleView[]): Chips {
  const leaves: number[] = [];
  const out: Chips = { chips: 0, reachedGreen: 0, measured: 0, insideSixFt: 0, medianLeaveYd: null, pinSnapped: 0 };
  for (const v of views) {
    for (const s of v.hole.shots) {
      if (s.shotType === "PUTT" || s.startLie === "Green") continue;
      const d0 = distanceYd(s.startGeo, v.hole.pin);
      if (d0 === null || d0 > BREAK80.shortGameYd) continue;
      out.chips++;
      if (s.endLie !== "Green") continue;
      out.reachedGreen++;
      if (pinSnapped(s, v.hole)) {
        out.pinSnapped++;
        continue;
      }
      const leave = distanceYd(s.endGeo, v.hole.pin);
      if (leave === null) continue;
      out.measured++;
      leaves.push(leave);
      if (leave <= BREAK80.insideSixFtYd) out.insideSixFt++;
    }
  }
  if (leaves.length) {
    const s = [...leaves].sort((a, b) => a - b);
    out.medianLeaveYd = s[Math.floor(s.length / 2)];
  }
  return out;
}

export interface ThreePutts {
  rounds: number;
  holes: number;
  threePutts: number;
  pct: number | null;
  perRound: number | null;
  /** Per-round series, oldest first, for the trend. */
  series: TrendPt[];
}

/** The last N full 18-hole cards with putts per hole. */
export function threePutts(h: RoundHistory | null, window = BREAK80.trendWindow): ThreePutts {
  const cards = (h?.rounds ?? [])
    .filter((r) => r.entry === "full" && r.holes === 18 && r.holePutts !== null)
    .slice(-window);
  let holes = 0;
  let tp = 0;
  const series: TrendPt[] = [];
  for (const r of cards) {
    let rt = 0;
    let rh = 0;
    for (const p of r.holePutts as (number | null)[]) {
      if (p === null) continue;
      rh++;
      if (p >= 3) rt++;
    }
    holes += rh;
    tp += rt;
    if (rh) series.push({ label: r.date, value: (100 * rt) / rh });
  }
  return {
    rounds: cards.length,
    holes,
    threePutts: tp,
    pct: holes ? (100 * tp) / holes : null,
    perRound: cards.length ? tp / cards.length : null,
    series,
  };
}

function lastN(pts: { courseName: string | null; value: number }[] | undefined, n: number): TrendPt[] {
  return (pts ?? []).slice(-n).map((p) => ({ label: p.courseName ?? "", value: p.value }));
}

function mean(pts: TrendPt[]): number | null {
  return pts.length ? pts.reduce((a, p) => a + p.value, 0) / pts.length : null;
}

function parScoring(views: HoleView[], par: number): { holes: number; over: number | null } {
  const v = views.filter((x) => x.par === par && x.strokes !== null);
  return {
    holes: v.length,
    over: v.length ? v.reduce((a, x) => a + ((x.strokes as number) - par), 0) / v.length : null,
  };
}

/* ── the plan ─────────────────────────────────────────────────────────── */

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

export function buildBreak80(inp: Break80Inputs): Break80 {
  const { roundHistory: h, garminShots: g, linked, benchmarks: B } = inp;
  const views = holeViews(g, linked);
  const watchRounds = g ? shotRounds(g).length : 0;
  const linkedRounds = g ? shotRounds(g).filter((r) => linked.has(r.scorecardId)).length : 0;
  const watchSrc = `watch, ${watchRounds} round${watchRounds === 1 ? "" : "s"}`;
  const linkedSrc = `watch + card, ${linkedRounds} linked round${linkedRounds === 1 ? "" : "s"}`;

  const gir = lastN(h?.series?.girPerRound, BREAK80.trendWindow);
  const saves = lastN(h?.series?.parSavesPct, BREAK80.trendWindow);
  const girLast20 = mean(gir);
  const parSavesLast20 = mean(saves);
  const tp = threePutts(h);
  const dbl = doublesPerRound(views);
  const ud = upAndDowns(views);
  const tee = troublesomeTees(views);
  const app = approachMisses(views);
  const ch = chips(views);
  const par5 = parScoring(views, 5);

  const index = h?.handicapIndex ?? null;
  const indexGap = index === null ? null : r1(index - BREAK80.targetIndex);

  // pin-snap coverage: holes whose last heard shot ended exactly on the pin.
  let pinSnappedHoles = 0;
  for (const v of views) {
    const last = v.hole.shots[v.hole.shots.length - 1];
    if (last && pinSnapped(last, v.hole)) pinSnappedHoles++;
  }

  const ud5 = bench(B, "up-and-down-pct", "5");
  const ud15 = bench(B, "up-and-down-pct", "15");
  const gir5 = bench(B, "gir-per-round", "5-7");
  const gir13 = bench(B, "gir-per-round", "11-13");
  const tp5 = bench(B, "three-putt-pct", "5");
  const tp15 = bench(B, "three-putt-pct", "15");
  const tee70 = bench(B, "troublesome-tees-per-round", "70s");
  const tee80 = bench(B, "troublesome-tees-per-round", "80s");
  const dbl5 = bench(B, "doubles-per-round", "5");
  const dbl15 = bench(B, "doubles-per-round", "15");

  // ── short game ──
  const missedGreens = girLast20 === null ? null : 18 - girLast20;
  const udShare = ud.pct === null ? null : ud.pct / 100;
  const shortStrokes =
    missedGreens !== null && udShare !== null && ud5
      ? r1(missedGreens * (ud5.value / 100 - udShare))
      : null;
  const shortGame: Opportunity = {
    id: "short-game",
    label: "Chip on, one putt",
    direction: "up",
    yours: {
      value: ud.pct === null ? null : r1(ud.pct),
      n: ud.chances,
      unit: "%",
      source: linkedSrc,
      definition:
        "the last heard shot started inside 50 yd from off the green and reached it, then the card shows one putt or none — any score on the hole",
    },
    bench13: ud15,
    bench5: ud5,
    strokes: shortStrokes,
    formula:
      missedGreens !== null && udShare !== null && ud5
        ? `${r1(missedGreens)} missed greens a round × (${ud5.value}% − ${r1(ud.pct as number)}%) = ${shortStrokes}`
        : "needs greens hit, a linked watch round, and the 5-band up-and-down rate",
    confidence: ud.chances >= 30 ? "medium" : "low",
    move: {
      course: `Putt from the fringe. From rough, pick the club that lands on the green and runs — the lob wedge reaches the green ${ch.chips ? Math.round((100 * ch.reachedGreen) / ch.chips) : "?"}% of the time from inside 50 yd. Then the 4–8 footer gets a full routine.`,
      practice: `Two 25-minute sessions a week from rough, 15–35 yd, scored by leaves inside 6 ft (${ch.insideSixFt} of ${ch.measured} measurable so far), each ending with twenty putts from 4–8 ft. External cue: the landing spot, not the hands.`,
    },
    retiredWhen: `up-and-downs at ${ud15?.value ?? 35}% over 20 linked rounds`,
  };

  // ── approach ──
  const approachStrokes =
    girLast20 !== null && gir5 && udShare !== null
      ? r1((gir5.value - girLast20) * (1 - udShare))
      : null;
  const approach: Opportunity = {
    id: "approach",
    label: "Greens from 100–175",
    direction: "up",
    yours: {
      value: girLast20 === null ? null : r1(girLast20),
      n: gir.length,
      unit: "greens/round",
      source: `scorecards, last ${gir.length}`,
      definition: "greens in regulation per round from Grint's own chart, last 20 charted rounds (positional, not dated)",
    },
    bench13: gir13,
    bench5: gir5,
    strokes: approachStrokes,
    formula:
      girLast20 !== null && gir5 && udShare !== null
        ? `(${gir5.value} − ${r1(girLast20)} greens) × (1 − ${r1(ud.pct as number)}% saved) = ${approachStrokes}`
        : "needs greens hit, the 5-band GIR, and an up-and-down rate",
    confidence: gir.length >= 20 ? "medium" : "low",
    move: {
      course: `One more club. ${app.shortShareOfMisses === null ? "The watch cannot classify the misses yet" : `${Math.round(app.shortShareOfMisses)}% of your classified misses from 50–200 yd stopped short of the hole`}; outside 140 yd the target is the middle of the green, never the pin.`,
      practice: `Random-order approaches 100–175 yd, one ball per target, club changes every swing, scored by "on the green" not by proximity. From 125–200 the record is ${app.from125to200.onGreen} of ${app.from125to200.attempts}.`,
    },
    retiredWhen: `${gir13 ? Math.round(gir13.value + 1) : 7}+ greens a round over 20 rounds`,
  };

  // ── putting ──
  const puttingStrokes = tp.pct !== null && tp5 ? r1(((tp.pct - tp5.value) / 100) * 18) : null;
  const putting: Opportunity = {
    id: "putting",
    label: "Lag speed",
    direction: "down",
    yours: {
      value: tp.pct === null ? null : r1(tp.pct),
      n: tp.holes,
      unit: "% of holes",
      source: `scorecards, last ${tp.rounds}`,
      definition: "holes with three or more putts, last 20 full 18-hole cards",
    },
    bench13: tp15,
    bench5: tp5,
    strokes: puttingStrokes,
    formula:
      tp.pct !== null && tp5
        ? `(${r1(tp.pct)}% − ${tp5.value}%) × 18 holes = ${puttingStrokes}`
        : "needs three-putt share and the 5-band rate",
    confidence: tp.holes >= 300 ? "high" : tp.holes >= 100 ? "medium" : "low",
    move: {
      course: "Outside 20 ft every putt is a speed putt: pick the 3-ft circle past the hole, never the line. The miss that three-putts is short.",
      practice: "The 20/30/40 ft ladder, every first putt inside 3 ft, ten minutes at the end of each session — not a session of its own.",
    },
    retiredWhen: `three-putts under ${tp5?.value ?? 6}% of holes over 20 cards`,
  };

  // ── tee ──
  const teePrice =
    tee.overOnTrouble !== null && tee.overOnRest !== null ? tee.overOnTrouble - tee.overOnRest : null;
  const teeStrokes =
    tee.perRound !== null && tee70 && teePrice !== null ? r1((tee.perRound - tee70.value) * teePrice) : null;
  const teeOpp: Opportunity = {
    id: "tee",
    label: "Contact off the tee",
    direction: "down",
    yours: {
      value: tee.perRound === null ? null : r1(tee.perRound),
      n: tee.teeShots,
      unit: "per round",
      source: watchSrc,
      definition:
        "par-4/5 tee balls that were a driver, wood or hybrid under 170 yd, finished in a bunker, or forced a recovery next — a lay-up with an iron is not one",
    },
    bench13: tee80,
    bench5: tee70,
    strokes: teeStrokes,
    formula:
      tee.perRound !== null && tee70 && teePrice !== null
        ? `(${r1(tee.perRound)} − ${tee70.value} a round) × (+${r2(tee.overOnTrouble as number)} on those holes − +${r2(tee.overOnRest as number)} on the rest) = ${teeStrokes}`
        : "needs a troublesome-tee rate, the 70s-band rate, and hole scores",
    confidence: tee.teeShots >= 60 ? "medium" : "low",
    move: {
      course: "Driver only where there is 60 yd of playable width; otherwise the 3 Hybrid, which flew 175+ on 8 of 9 tee balls at Lincoln. Distance is not the problem — the driver goes 251 when struck.",
      practice: "The first blocked 15 minutes of every range session is low-point work: a line an inch behind the ball, strike the ground in front of it, half swings before full. No driver until the irons brush the line ten times running.",
    },
    retiredWhen: `${tee70?.value ?? 2} troublesome tee balls a round or fewer over 10 watch rounds`,
  };

  // ── doubles (outcome view) ──
  const doubles: Opportunity = {
    id: "doubles",
    label: "Doubles or worse",
    direction: "down",
    yours: {
      value: dbl.perRound === null ? null : r1(dbl.perRound),
      n: dbl.holes,
      unit: "per round",
      source: linkedSrc,
      definition: "holes scored two or more over par — score from the card, par from the watch, linked rounds only",
    },
    bench13: dbl15,
    bench5: dbl5,
    strokes: null,
    formula:
      dbl.holes > 0
        ? `the doubles carry ${dbl.overFromDoubles} of ${dbl.over} strokes over par on ${dbl.holes} holes — an outcome of the four areas above, not a fifth`
        : "needs a linked watch round",
    confidence: dbl.rounds >= 5 ? "medium" : "low",
    move: {
      course: "A double is a mishit tee ball, a short-sided miss, or a chunked chip, then a three-putt. Bogey is fine; the second dropped stroke is the one to refuse — take the medicine shot sideways, chip to the fat of the green, two-putt.",
      practice: "None. This line moves when the four above move.",
    },
    retiredWhen: `${dbl5?.value ?? 1.5} doubles a round or fewer over 10 linked rounds`,
  };

  const priced = [shortGame, approach, putting, teeOpp].sort((a, b) => {
    if (a.strokes === null && b.strokes === null) return 0;
    if (a.strokes === null) return 1;
    if (b.strokes === null) return -1;
    return b.strokes - a.strokes;
  });
  const ledger = [...priced, doubles];
  const pricedValues = priced.map((o) => o.strokes).filter((s): s is number => s !== null);
  const ledgerTotal = pricedValues.length ? r1(pricedValues.reduce((a, b) => a + b, 0)) : null;

  // ── rules ──
  const rules: Rule[] = [
    {
      id: "club-up",
      text: "Take one more club into the green. The amateur miss is short, and a long miss costs less than a bunker.",
      yours:
        app.shortShareOfMisses === null
          ? null
          : {
              value: r1(app.shortShareOfMisses),
              n: app.short + app.long + app.lateral,
              unit: "% of misses",
              source: watchSrc,
              definition: "approaches from 50–200 yd that missed the green and stopped short of the hole, of the misses the watch could classify",
            },
      benchmark: bench(B, "approach-short-share", "15"),
    },
    {
      id: "driver-corridor",
      text: "Driver only with 60 yd of playable width from rough to rough. Otherwise the 3 Hybrid — it starts a hole as well as the driver does and mishits less.",
      yours:
        tee.perRound === null
          ? null
          : { value: r1(tee.perRound), n: tee.teeShots, unit: "per round", source: watchSrc, definition: teeOpp.yours.definition },
      benchmark: tee70,
    },
    {
      id: "centre-of-green",
      text: "Outside 140 yd the target is the middle of the green. Nobody hits many greens from 175; the miss that costs is the short-sided one.",
      yours:
        app.from125to200.attempts > 0
          ? {
              value: r1((100 * app.from125to200.onGreen) / app.from125to200.attempts),
              n: app.from125to200.attempts,
              unit: "% greens",
              source: watchSrc,
              definition: "approaches from 125–200 yd that finished on the green",
            }
          : null,
      benchmark: bench(B, "centre-of-green-yd", "all"),
    },
    {
      id: "fat-side",
      text: "Miss on the fat side, away from sand. A bunker approach costs half a stroke more than a fairway lie.",
      yours:
        app.attempts > 0
          ? {
              value: r1((100 * app.intoBunker) / app.attempts),
              n: app.attempts,
              unit: "% of approaches",
              source: watchSrc,
              definition: "approaches from 50–200 yd that finished in a bunker",
            }
          : null,
      benchmark: bench(B, "bunker-approach-cost", "all"),
    },
    {
      id: "fringe-putter",
      text: "Putt from the fringe. The lob wedge is the wrong default from inside 25 yd.",
      yours:
        ch.chips > 0
          ? {
              value: r1((100 * ch.reachedGreen) / ch.chips),
              n: ch.chips,
              unit: "% reached the green",
              source: watchSrc,
              definition: "shots started inside 50 yd from off the green that finished on it",
            }
          : null,
      benchmark: bench(B, "putter-from-fringe-gain", "mid-high"),
    },
    {
      id: "par5-advance",
      text: "On par 5s advance the ball. Laying up to a number costs 0.6 a hole; the threshold that matters is getting the third shot inside 175.",
      yours:
        par5.over === null
          ? null
          : { value: r2(par5.over), n: par5.holes, unit: "over par per hole", source: watchSrc, definition: "mean strokes over par on par 5s" },
      benchmark: bench(B, "par5-layup-cost", "all"),
    },
  ];

  // ── target ──
  const differentialAt = g
    ? shotRounds(g)
        .filter((r) => r.teeBoxRating !== null && r.teeBoxSlope !== null)
        .map((r) => ({
          course: r.courseName ?? "",
          tee: r.teeBox,
          rating: r.teeBoxRating as number,
          slope: r.teeBoxSlope as number,
          differential: r1(((BREAK80.targetScore - (r.teeBoxRating as number)) * 113) / (r.teeBoxSlope as number)),
        }))
        .filter((x, i, a) => a.findIndex((y) => y.course === x.course && y.tee === x.tee) === i)
    : [];

  return {
    target: {
      score: BREAK80.targetScore,
      indexApprox: BREAK80.targetIndex,
      differentialAt,
      breakShare: bench(B, "break-80-share", "5"),
    },
    yours: {
      index,
      girLast20: girLast20 === null ? null : r1(girLast20),
      parSavesLast20: parSavesLast20 === null ? null : r1(parSavesLast20),
      threePuttPct: tp.pct === null ? null : r1(tp.pct),
      threePuttsPerRound: tp.perRound === null ? null : r2(tp.perRound),
      watchRounds,
      linkedRounds,
    },
    ledger,
    ledgerTotal,
    indexGap,
    rules,
    trend: { gir, parSaves: saves, threePutt: tp.series.slice(-BREAK80.trendWindow) },
    coverage: { holes: views.length, pinSnapped: pinSnappedHoles },
  };
}
