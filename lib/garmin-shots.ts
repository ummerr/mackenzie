/* The on-course shot half of the profile, in the shape this app needs it.
 *
 * Same seam, same rules as lib/round-history.ts: `buildGarminShots` reshapes
 * the pipeline's `data/garmin-rounds.json` (itself parsed from the Garmin
 * export bundle) at build time, and nothing here recomputes what the adapter
 * decided. Lies are Garmin's own strings (TeeBox/Fairway/Rough/Bunker/Green/
 * Unknown) and are never reclassified — an Unknown lie is carried and
 * counted, not guessed. Simulator rounds (roundType SIMULATION, the R50's
 * virtual courses) are part of the record but carry no AutoShot shots; every
 * analysis below reads only the shot-bearing on-course rounds and says so.
 *
 * The one number to distrust here is coverage: AutoShot sees full swings.
 * With no putter sensor most putts — and some chips — never become shots, so
 * "107 shots" against "189 strokes" is not sloppiness, it is what the watch
 * could hear. Every share is therefore a share OF RECORDED SHOTS, and the
 * evidence strings print the coverage beside it.
 */

export interface GarminShot {
  order: number | null;
  /** BAG_ORDER name resolved by the adapter, null when no club was recorded. */
  club: string | null;
  clubId: number | null;
  /** Garmin's own: TEE | APPROACH | CHIP | PUTT | RECOVERY | LAYUP | UNKNOWN. */
  shotType: string | null;
  meters: number | null;
  yards: number | null;
  /** Garmin's own lie strings, verbatim. */
  startLie: string | null;
  endLie: string | null;
  /** Pixel positions on Garmin's per-hole map frame (tee low, green high) —
   *  the shot's own geometry, which the diary draws its traces from. The
   *  map raster itself is Garmin's and is never fetched. */
  startMap: { x: number; y: number } | null;
  endMap: { x: number; y: number } | null;
  /** The same locations in WGS84 degrees (converted from Garmin semicircles
   *  by the adapter) — the frame the hole drawings are projected from. */
  startGeo: { lat: number; lon: number } | null;
  endGeo: { lat: number; lon: number } | null;
}

export interface GarminHole {
  number: number;
  strokes: number | null;
  putts: number | null;
  par: number | null;
  /** Garmin's own: HIT | LEFT | RIGHT — the tee ball's verdict on driven
   *  holes. Carried on the R50 screen rounds; the on-course cards rarely
   *  have it. */
  fairwayShotOutcome: string | null;
  /** The day's flag position in degrees, from the holeShots payload. */
  pin: { lat: number; lon: number } | null;
  shots: GarminShot[];
}

export interface GarminRound {
  scorecardId: string;
  /** YYYY-MM-DD. */
  date: string;
  /** Garmin's own — "SIMULATION" marks the R50 sim rounds. */
  roundType: string | null;
  courseName: string | null;
  teeBox: string | null;
  teeBoxRating: number | null;
  teeBoxSlope: number | null;
  holesRecorded: number;
  strokes: number | null;
  /** AutoShot shots recorded — the coverage denominator's numerator. */
  shotCount: number;
  holes: GarminHole[];
  flags: string[];
}

export interface GarminShots {
  capturedAt: string;
  source: string;
  rounds: GarminRound[];
}

/* The pipeline artifact's shape, narrowed to what is read here — a structural
 * record of the contract, same as lib/round-history.ts. */
export interface SourceGarminRound {
  scorecardId: string;
  date: string | null;
  roundType: string | null;
  courseName: string | null;
  teeBox: string | null;
  teeBoxRating: number | null;
  teeBoxSlope: number | null;
  holesRecorded: number;
  totals: { strokes: number | null; putts: number | null; shots: number };
  holes: {
    number: number;
    strokes: number | null;
    putts: number | null;
    par: number | null;
    fairwayShotOutcome: string | null;
    pin: { lat: number; lon: number } | null;
    shots: {
      order: number | null;
      club: string | null;
      clubId: number | null;
      shotType: string | null;
      meters: number | null;
      yards: number | null;
      startLie: string | null;
      endLie: string | null;
      startMap: { x: number; y: number } | null;
      endMap: { x: number; y: number } | null;
      startGeo: { lat: number; lon: number } | null;
      endGeo: { lat: number; lon: number } | null;
    }[];
  }[];
  flags: string[];
}

export interface SourceGarminRounds {
  capturedAt: string;
  rawFile: string;
  rounds: SourceGarminRound[];
}

export const GARMIN_THRESHOLDS = {
  /** A non-tee, non-putt shot at or inside this is short game. */
  shortGameYd: 50,
  /** Below this many shot-bearing rounds, the on-course shares are anecdotes;
   *  the unknowns stay, naming what exists and what is still needed. */
  minShotRounds: 5,
  /** Shots a club needs before its on-course median is worth comparing to
   *  its range median. */
  minShotsPerClub: 10,
  /** Screen-play (R50 sim) task guards. The screen's launch is measured and
   *  its flight is modelled, so screen numbers speak about club delivery,
   *  and only above these floors. */
  minScreenHolesPerPar: 15,
  /** Strokes-over-par gap between par types worth practising against. */
  screenParGapStrokes: 0.3,
  minScreenDriven: 50,
  /** One side must own this share of the misses to be a direction. */
  screenMissShare: 2 / 3,
  minScreenPuttHoles: 100,
} as const;

/** Reshape the pipeline's garmin-rounds.json. Nothing is recomputed; the
 *  `raw` objects the adapter carries per shot are dropped at this seam — the
 *  app reads the surfaced fields, the artifact keeps the evidence. Undated
 *  rounds are dropped, same as buildRoundHistory. */
export function buildGarminShots(src: SourceGarminRounds): GarminShots {
  return {
    capturedAt: src.capturedAt,
    source: `data/garmin-rounds.json (${src.rawFile})`,
    rounds: src.rounds
      .filter((r) => r.date !== null)
      .map((r) => ({
        scorecardId: r.scorecardId,
        date: r.date as string,
        roundType: r.roundType,
        courseName: r.courseName,
        teeBox: r.teeBox,
        teeBoxRating: r.teeBoxRating,
        teeBoxSlope: r.teeBoxSlope,
        holesRecorded: r.holesRecorded,
        strokes: r.totals.strokes,
        shotCount: r.totals.shots,
        holes: r.holes.map((h) => ({
          number: h.number,
          strokes: h.strokes,
          putts: h.putts,
          par: h.par,
          fairwayShotOutcome: h.fairwayShotOutcome,
          pin: h.pin,
          shots: h.shots.map((s) => ({
            order: s.order,
            club: s.club,
            clubId: s.clubId,
            shotType: s.shotType,
            meters: s.meters,
            yards: s.yards,
            startLie: s.startLie,
            endLie: s.endLie,
            startMap: s.startMap,
            endMap: s.endMap,
            startGeo: s.startGeo,
            endGeo: s.endGeo,
          })),
        })),
        flags: r.flags,
      })),
  };
}

/** The rounds whose shots exist at all — the denominator of every claim. */
export function shotRounds(g: GarminShots): GarminRound[] {
  return g.rounds.filter((r) => r.shotCount > 0);
}

/** The R50 simulator rounds — played on a screen, so they carry no AutoShot
 *  shots, but their scorecards (strokes, putts, pars, tee-ball outcome) are
 *  real records of real swings whose flight was modelled. */
export function simRounds(g: GarminShots): GarminRound[] {
  return g.rounds.filter((r) => r.flags.includes("simulation"));
}

/** The date of the newest shot-bearing round — the shot record's "as of",
 *  anchored to the record, never the wall clock. */
export function asOfGarmin(g: GarminShots): string | null {
  let max: string | null = null;
  for (const r of shotRounds(g)) {
    if (max === null || r.date > max) max = r.date;
  }
  return max;
}

const allShots = (rounds: GarminRound[]): GarminShot[] =>
  rounds.flatMap((r) => r.holes.flatMap((h) => h.shots));

export interface StrokeCategorySplit {
  tee: number;
  approach: number;
  shortGame: number;
  putts: number;
  other: number;
  shots: number;
  strokes: number;
}

/** Recorded shots by category, plus the coverage that qualifies every share:
 *  how many strokes the scorecards say happened vs how many became shots. */
export function strokeCategorySplit(rounds: GarminRound[]): StrokeCategorySplit {
  const out = { tee: 0, approach: 0, shortGame: 0, putts: 0, other: 0, shots: 0, strokes: 0 };
  for (const r of rounds) out.strokes += r.strokes ?? 0;
  for (const s of allShots(rounds)) {
    out.shots += 1;
    if (s.shotType === "TEE") out.tee += 1;
    else if (s.shotType === "PUTT") out.putts += 1;
    else if (
      s.shotType === "CHIP" ||
      (s.yards !== null && s.yards <= GARMIN_THRESHOLDS.shortGameYd)
    )
      out.shortGame += 1;
    else if (s.shotType === "APPROACH" || s.shotType === "LAYUP" || s.shotType === "RECOVERY")
      out.approach += 1;
    else out.other += 1;
  }
  return out;
}

/** Where the non-tee shots were played from — Garmin's own lie strings,
 *  verbatim, "Unknown" carried as its own row rather than redistributed. */
export function lieSplit(rounds: GarminRound[]): { lie: string; shots: number }[] {
  const counts = new Map<string, number>();
  for (const s of allShots(rounds)) {
    if (s.shotType === "TEE") continue; // the tee box is not a lie draw
    const lie = s.startLie ?? "Unknown";
    counts.set(lie, (counts.get(lie) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([lie, shots]) => ({ lie, shots }))
    .sort((a, b) => b.shots - a.shots || a.lie.localeCompare(b.lie));
}

/** Per-club on-course median yards over CLEAR full swings: tee shots
 *  included; putts, chips and short game excluded (a 12-yard chip with a
 *  9 Iron is not what the 9 Iron carries); recoveries excluded too — a
 *  punch-out from the trees is a full swing deliberately not hit the club's
 *  distance, and one of them can drag a ten-shot median for weeks. Only
 *  clubs at or above `minShots`. Distances are Garmin's point-to-point
 *  yards — where the ball came to REST, so nearer a range "total" than a
 *  carry. */
export function courseClubDistances(
  rounds: GarminRound[],
  minShots: number = GARMIN_THRESHOLDS.minShotsPerClub,
): { club: string; shots: number; medianYd: number }[] {
  const byClub = new Map<string, number[]>();
  for (const s of allShots(rounds)) {
    if (s.club === null || s.yards === null) continue;
    if (s.shotType === "PUTT" || s.shotType === "CHIP" || s.shotType === "RECOVERY") continue;
    if (s.yards <= GARMIN_THRESHOLDS.shortGameYd) continue;
    byClub.set(s.club, [...(byClub.get(s.club) ?? []), s.yards]);
  }
  const median = (xs: number[]): number => {
    const sorted = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  return [...byClub.entries()]
    .filter(([, xs]) => xs.length >= minShots)
    .map(([club, xs]) => ({ club, shots: xs.length, medianYd: median(xs) }))
    .sort((a, b) => b.medianYd - a.medianYd);
}

/** Strokes over par by par type, over holes that recorded both. The screen's
 *  scorecards are the only place this record has enough par-tagged holes to
 *  say anything — the Grint perHole arrays carry no pars. */
export function parTypeScoring(
  rounds: GarminRound[],
): { par: number; holes: number; meanOverPar: number }[] {
  const byPar = new Map<number, number[]>();
  for (const r of rounds) {
    for (const h of r.holes) {
      if (h.par === null || h.strokes === null) continue;
      byPar.set(h.par, [...(byPar.get(h.par) ?? []), h.strokes - h.par]);
    }
  }
  return [...byPar.entries()]
    .map(([par, overs]) => ({
      par,
      holes: overs.length,
      meanOverPar: overs.reduce((a, b) => a + b, 0) / overs.length,
    }))
    .sort((a, b) => a.par - b.par);
}

/** The tee ball's verdicts on driven holes, verbatim from Garmin's
 *  fairwayShotOutcome. Anything outside HIT/LEFT/RIGHT is carried in `other`
 *  rather than redistributed. */
export function fairwayOutcomes(rounds: GarminRound[]): {
  driven: number;
  hit: number;
  left: number;
  right: number;
  other: number;
} {
  const out = { driven: 0, hit: 0, left: 0, right: 0, other: 0 };
  for (const r of rounds) {
    for (const h of r.holes) {
      if (h.fairwayShotOutcome == null) continue;
      out.driven += 1;
      if (h.fairwayShotOutcome === "HIT") out.hit += 1;
      else if (h.fairwayShotOutcome === "LEFT") out.left += 1;
      else if (h.fairwayShotOutcome === "RIGHT") out.right += 1;
      else out.other += 1;
    }
  }
  return out;
}

/** Putting over holes that recorded putts — on this record, the screen's. */
export function puttingRecord(rounds: GarminRound[]): {
  holes: number;
  threePutts: number;
} {
  let holes = 0;
  let threePutts = 0;
  for (const r of rounds) {
    for (const h of r.holes) {
      if (h.putts === null) continue;
      holes += 1;
      if (h.putts >= 3) threePutts += 1;
    }
  }
  return { holes, threePutts };
}

/* ---------------------------------------------------------------------------
 * The on-course record as one object — what the watch has heard so far,
 * regardless of whether it clears the findings gate. A finding is a claim and
 * waits for minShotRounds; the record is just the record, and publishing it
 * with its sample sizes is how a thin sample stays honest instead of hidden.
 * The page and PROFILE.md both render this object, so they cannot drift.
 * ------------------------------------------------------------------------- */

export interface OnCourseRecord {
  /** Newest shot-bearing round — the record's "as of". */
  asOf: string;
  /** Shot-bearing rounds — the denominator of every claim-to-be. */
  rounds: number;
  /** Simulator rounds in the record, which carry no shots by nature. */
  simRounds: number;
  split: StrokeCategorySplit;
  lies: { lie: string; shots: number }[];
  /** Clubs with enough clear full swings for a median. */
  clubs: { club: string; shots: number; medianYd: number }[];
}

export function onCourseRecord(g: GarminShots): OnCourseRecord | null {
  const bearing = shotRounds(g);
  const asOf = asOfGarmin(g);
  if (bearing.length === 0 || asOf === null) return null;
  return {
    asOf,
    rounds: bearing.length,
    simRounds: g.rounds.filter((r) => r.flags.includes("simulation")).length,
    split: strokeCategorySplit(bearing),
    lies: lieSplit(bearing),
    clubs: courseClubDistances(bearing),
  };
}
