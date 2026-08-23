/* Ball flight: where the shot started, and how far it bent.
 *
 * A shot that finishes 15 yd right either *started* there or *curved* there,
 * and the two have nothing to do with each other. One is alignment and face at
 * impact; the other is face relative to path. The bag chart draws where shots
 * finished and cannot tell them apart — a club aimed 12 yd left and a club that
 * slices 12 yd right look equally "offline" in a dispersion cone.
 *
 * The export already carries both halves, so nothing here is modelled:
 *
 *   launch_direction        where the ball set off, degrees, + right
 *   carry_deviation_angle   where it finished, degrees, + right
 *
 * Curvature is the difference. In yards at the shot's own carry:
 *
 *   start = carry × sin(launch_direction)
 *   curve = carry × ( sin(carry_deviation_angle) − sin(launch_direction) )
 *
 * Those two sum to `carry × sin(carry_deviation_angle)`, which is the export's
 * own `carry_deviation_distance` — the offline column the bag chart plots. So
 * the split is arithmetic on a published identity, not a decomposition anyone
 * invented, and `tests/ball-flight.test.ts` holds it to reconstructing that
 * column to within 0.02 yd across the whole ledger.
 *
 * Two independent checks that the halves mean what they are named: curvature
 * must track the spin axis (with the sign agreeing on the real curves), and
 * start line must track the club face. Neither is used to compute anything —
 * the report carries the live values (`validation`) and the page prints them,
 * so a future firmware change that redefines a column fails loudly instead of
 * quietly relabelling aim as curve, and the prose can never outlive its own
 * numbers.
 */

import type { LedgerShot } from "./ledger";
import { median, sortByBag } from "./stats";

const rad = (d: number) => (d * Math.PI) / 180;

/** A shot this decomposition can read: it needs both angles and a carry. */
export function isReadable(s: LedgerShot): boolean {
  return (
    !s.isExcluded &&
    s.launchDirectionDeg !== null &&
    s.carryDeviationAngleDeg !== null &&
    s.carryYd !== null
  );
}

/** Yards left/right of target the ball was ALREADY travelling when it launched. */
export function startYd(s: LedgerShot): number {
  return (s.carryYd as number) * Math.sin(rad(s.launchDirectionDeg as number));
}

/** Yards the ball bent in the air, relative to its own start line. */
export function curveYd(s: LedgerShot): number {
  return (
    (s.carryYd as number) *
    (Math.sin(rad(s.carryDeviationAngleDeg as number)) -
      Math.sin(rad(s.launchDirectionDeg as number)))
  );
}

/**
 * Inside this many yards the ball is called straight, on either axis.
 *
 * Three yards, and the headline splits barely move between 2 and 5 — the
 * right-bending share of curves holds at 66–67% across that whole range. A
 * finding that survives its own threshold is worth more than a sharper one that
 * does not, so the number is reported with the threshold attached.
 */
export const STRAIGHT_YD = 3;

export type Corroboration = "agree" | "disagree" | "single";

export interface SessionCurve {
  date: string;
  n: number;
  curve: number;
}

export interface ClubFlight {
  club: string;
  n: number;
  /** Median of each half. They sum to the club's median total miss. */
  start: number;
  curve: number;
  /** Typical size of each half, ignoring side — which one actually dominates. */
  absStart: number;
  absCurve: number;
  /** The mechanism, where the monitor tracked the club. Null where it did not. */
  face: number | null;
  path: number | null;
  f2p: number | null;
  /** Per-session medians, so a one-day finding cannot pass as a tendency. */
  sessionCurves: SessionCurve[];
  status: Corroboration;
}

/** Sessions under this many shots of a club do not get a median. */
const MIN_SHOTS_PER_SESSION = 5;

const r1 = (v: number) => Math.round(v * 10) / 10;
const medOf = (xs: number[]): number | null => (xs.length === 0 ? null : r1(median(xs)));

function corroboration(curves: SessionCurve[]): Corroboration {
  if (curves.length < 2) return "single";
  const allRight = curves.every((c) => c.curve > 1);
  const allLeft = curves.every((c) => c.curve < -1);
  return allRight || allLeft ? "agree" : "disagree";
}

export function clubFlight(shots: LedgerShot[], club: string): ClubFlight {
  const mine = shots.filter((s) => s.club === club);
  const pick = (f: (s: LedgerShot) => number | null): number[] =>
    mine.map(f).filter((v): v is number => v !== null);

  const sessionCurves = [...new Set(mine.map((s) => s.sessionId))]
    .sort()
    .map((sid) => ({ sid, rows: mine.filter((s) => s.sessionId === sid) }))
    .filter((x) => x.rows.length >= MIN_SHOTS_PER_SESSION)
    .map((x) => ({
      date: x.sid.slice(0, 10),
      n: x.rows.length,
      curve: r1(median(x.rows.map(curveYd))),
    }));

  return {
    club,
    n: mine.length,
    start: r1(median(mine.map(startYd))),
    curve: r1(median(mine.map(curveYd))),
    absStart: r1(median(mine.map((s) => Math.abs(startYd(s))))),
    absCurve: r1(median(mine.map((s) => Math.abs(curveYd(s))))),
    face: medOf(pick((s) => s.faceAngleDeg)),
    path: medOf(pick((s) => s.clubPathDeg)),
    f2p: medOf(pick((s) => s.faceToPathDeg)),
    sessionCurves,
    status: corroboration(sessionCurves),
  };
}

/** The live versions of the report's own honesty checks — computed from the
 *  current ledger so the page's prose can never quote a number the data has
 *  outgrown. */
export interface FlightValidation {
  /** Distinct sessions among readable shots. */
  sessions: number;
  /** Curvature vs spin axis, over real curves only. */
  spinAxis: { r: number; signAgreementPct: number; curves: number } | null;
  /** Start line vs club face, over shots where the club was tracked. */
  startFace: { r: number; slope: number; n: number } | null;
  /** Median |start + curve − the export's own offline column|, yards. */
  reconstructionErrYd: number | null;
}

export interface FlightReport {
  n: number;
  threshold: number;
  totalLogged: number;
  trusted: number;
  shots: { c: string; s: number; v: number; y: number; p: number | null }[];
  /** Least-squares fit of curvature on face-to-path, and its correlation. */
  fit: { r: number; slope: number; intercept: number; n: number } | null;
  validation: FlightValidation;
  clubs: ClubFlight[];
  tally: Record<string, number>;
  straightPct: number;
  curvedPct: number;
  offlinePct: number;
  rightOfCurves: number;
  medAbsStart: number;
  medAbsCurve: number;
}

/** Every shot named by its shape, the way a golfer would say it. */
export function shapeOf(s: LedgerShot, t = STRAIGHT_YD): string {
  const st = startYd(s);
  const cv = curveYd(s);
  const dir = st > t ? "push" : st < -t ? "pull" : "on line";
  const bend = cv > t ? "slice" : cv < -t ? "hook" : "straight";
  return `${dir}|${bend}`;
}

/**
 * How much of the curve the face-to-path gap explains.
 *
 * Reported rather than relied on. Face-to-path is the textbook cause of
 * curvature, but it is only recorded on the shots where the monitor tracked the
 * club, and curvature also scales with speed and spin — so this is evidence for
 * the mechanism, not a predictor, and the report says so beside the number.
 */
export function fitCurveOnFaceToPath(
  shots: LedgerShot[],
): { r: number; slope: number; intercept: number; n: number } | null {
  const rows = shots.filter((s) => s.faceToPathDeg !== null);
  if (rows.length < 3) return null;
  const xs = rows.map((s) => s.faceToPathDeg as number);
  const ys = rows.map(curveYd);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    sxy += a * b;
    sxx += a * a;
    syy += b * b;
  }
  if (sxx === 0 || syy === 0) return null;
  const slope = sxy / sxx;
  return {
    r: Math.round((sxy / Math.sqrt(sxx * syy)) * 1000) / 1000,
    slope: Math.round(slope * 1000) / 1000,
    intercept: Math.round((my - slope * mx) * 1000) / 1000,
    n,
  };
}

/** Plain least squares, shared by the honesty checks. */
function lsq(xs: number[], ys: number[]): { r: number; slope: number } | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    sxy += a * b;
    sxx += a * a;
    syy += b * b;
  }
  if (sxx === 0 || syy === 0) return null;
  return {
    r: Math.round((sxy / Math.sqrt(sxx * syy)) * 100) / 100,
    slope: Math.round((sxy / sxx) * 100) / 100,
  };
}

export function buildValidation(shots: LedgerShot[], t = STRAIGHT_YD): FlightValidation {
  const sessions = new Set(shots.map((s) => s.sessionId)).size;

  const curved = shots.filter((s) => Math.abs(curveYd(s)) > t && s.spinAxisDeg !== null);
  let spinAxis: FlightValidation["spinAxis"] = null;
  const spinFit = lsq(
    curved.map((s) => s.spinAxisDeg as number),
    curved.map(curveYd),
  );
  if (spinFit) {
    const agree = curved.filter(
      (s) => Math.sign(s.spinAxisDeg as number) === Math.sign(curveYd(s)),
    ).length;
    spinAxis = {
      r: spinFit.r,
      signAgreementPct: Math.round((100 * agree) / curved.length),
      curves: curved.length,
    };
  }

  const faced = shots.filter((s) => s.faceAngleDeg !== null);
  const faceFit = lsq(
    faced.map((s) => s.faceAngleDeg as number),
    faced.map((s) => s.launchDirectionDeg as number),
  );
  const startFace = faceFit ? { r: faceFit.r, slope: faceFit.slope, n: faced.length } : null;

  const withOffline = shots.filter((s) => s.offlineYd !== null);
  const reconstructionErrYd =
    withOffline.length === 0
      ? null
      : Math.round(
          median(withOffline.map((s) => Math.abs(startYd(s) + curveYd(s) - (s.offlineYd as number)))) *
            1000,
        ) / 1000;

  return { sessions, spinAxis, startFace, reconstructionErrYd };
}

/** Everything the report draws, from classified shots. Pure. */
export function buildFlightReport(all: LedgerShot[], t = STRAIGHT_YD): FlightReport {
  const shots = all.filter(isReadable);
  const clubs = sortByBag(
    [...new Set(shots.map((s) => s.club))].map((club) => ({ club })),
  ).map((x) => clubFlight(shots, x.club));

  const tally: Record<string, number> = {};
  for (const s of shots) {
    const k = shapeOf(s, t);
    tally[k] = (tally[k] ?? 0) + 1;
  }

  const curved = shots.filter((s) => Math.abs(curveYd(s)) > t);
  /* A ledger with nothing readable in it is a state, not a crash: an export
   * that dropped the launch-direction column would otherwise take the whole
   * page down inside `median([])` rather than rendering an honest empty. */
  const pct = (n: number) => (shots.length === 0 ? 0 : Math.round((100 * n) / shots.length));
  const medAbs = (f: (s: LedgerShot) => number) =>
    shots.length === 0 ? 0 : r1(median(shots.map((s) => Math.abs(f(s)))));

  return {
    n: shots.length,
    threshold: t,
    totalLogged: all.length,
    trusted: all.filter((s) => !s.isExcluded).length,
    shots: shots.map((s) => ({
      c: s.club,
      s: r1(startYd(s)),
      v: r1(curveYd(s)),
      y: Math.round(s.carryYd as number),
      p: s.faceToPathDeg === null ? null : r1(s.faceToPathDeg),
    })),
    fit: fitCurveOnFaceToPath(shots),
    validation: buildValidation(shots, t),
    clubs,
    tally,
    straightPct: pct(
      shots.filter((s) => Math.abs(curveYd(s)) <= t && Math.abs(startYd(s)) <= t).length,
    ),
    curvedPct: pct(curved.length),
    offlinePct: pct(shots.filter((s) => Math.abs(startYd(s)) > t).length),
    rightOfCurves:
      curved.length === 0
        ? 0
        : Math.round((100 * curved.filter((s) => curveYd(s) > 0).length) / curved.length),
    medAbsStart: medAbs(startYd),
    medAbsCurve: medAbs(curveYd),
  };
}
