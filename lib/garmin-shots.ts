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
}

export interface GarminHole {
  number: number;
  strokes: number | null;
  putts: number | null;
  par: number | null;
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

/** Recorded shots by category, plus the coverage that qualifies every share:
 *  how many strokes the scorecards say happened vs how many became shots. */
export function strokeCategorySplit(rounds: GarminRound[]): {
  tee: number;
  approach: number;
  shortGame: number;
  putts: number;
  other: number;
  shots: number;
  strokes: number;
} {
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

/** Per-club on-course median yards over full-swing shots (tee shots included,
 *  putts and short game excluded — a 12-yard chip with a 9 Iron is not what
 *  the 9 Iron carries). Only clubs at or above `minShots`. */
export function courseClubDistances(
  rounds: GarminRound[],
  minShots: number = GARMIN_THRESHOLDS.minShotsPerClub,
): { club: string; shots: number; medianYd: number }[] {
  const byClub = new Map<string, number[]>();
  for (const s of allShots(rounds)) {
    if (s.club === null || s.yards === null) continue;
    if (s.shotType === "PUTT" || s.shotType === "CHIP") continue;
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
