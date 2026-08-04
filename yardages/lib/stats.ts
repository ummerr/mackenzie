/* Pure statistics over the ledger. No I/O, no React, no chart library.
 *
 * Everything the bag chart draws is computed here and unit-tested against
 * distributions with known answers. Nothing analytical belongs in a component.
 *
 * Medians throughout, never means. A range session's carry distribution has a
 * long left tail — chunks and thins go short, nothing goes 40 yards long — so
 * the mean of a club sits below its typical shot and moves with how badly you
 * were striking it that day. The median doesn't.
 */

import type { LedgerShot } from "./ledger";
import { classifyShots, isTrusted } from "./yardages/classify-shot";
import { REVIEW_THRESHOLDS, type ReviewThresholds } from "./yardages/thresholds";

// ── primitives ──────────────────────────────────────────────────────────────

/* One implementation, in lib/yardages/robust-stats.ts. Re-exported here
 * because every existing caller and test imports them from this module. */
import { mad, median, quantile } from "./yardages/robust-stats";

export { mad, median, quantile };

// ── bag order ───────────────────────────────────────────────────────────────

/* Loft order, longest first. Gap flags compare clubs that are adjacent *here*,
 * not adjacent by measured carry — the question is "what do I reach for next",
 * and a club that carries out of loft order is the finding, not the sort key. */
const BAG_ORDER = [
  "Driver",
  "3 Wood", "4 Wood", "5 Wood", "7 Wood",
  "2 Hybrid", "3 Hybrid", "4 Hybrid", "5 Hybrid", "6 Hybrid",
  "1 Iron", "2 Iron", "3 Iron", "4 Iron", "5 Iron", "6 Iron",
  "7 Iron", "8 Iron", "9 Iron",
  "Pitching Wedge", "Gap Wedge", "Sand Wedge", "Lob Wedge",
  "Putter",
];

const BAG_INDEX = new Map(BAG_ORDER.map((c, i) => [c, i]));

/** Unknown clubs sort to the end, in name order, rather than throwing. */
export function bagRank(club: string): number {
  return BAG_INDEX.get(club) ?? BAG_ORDER.length;
}

export function sortByBag<T extends { club: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => bagRank(a.club) - bagRank(b.club) || a.club.localeCompare(b.club),
  );
}

// ── distance basis ──────────────────────────────────────────────────────────

/**
 * Which distance the bag is measured to: where the ball landed, or where it
 * stopped.
 *
 * Neither one is the real number. Carry is what clears the bunker; total is
 * what runs through the back of the green. A bag gapped on carry and a bag
 * gapped on total are different bags, because rollout is not a constant — it is
 * 2.9 yd on a gap wedge and 12.3 on a six iron in this ledger, so switching
 * basis compresses the short end and stretches the long one. That is a finding,
 * not a display preference, which is why both are computed the same way and
 * neither is derived from the other.
 */
export type DistanceBasis = "carry" | "total";

/**
 * The three columns a basis reads: how far, how far offline, at what angle.
 *
 * The total basis reads *nothing* from a shot the parser flagged as a carry
 * copy. On those rows the entire total block — distance, deviation distance and
 * deviation angle — is the carry block repeated verbatim, which is not a ball
 * that stopped where it landed but a rollout the monitor never modelled.
 * Reading it as total would publish a five iron that rolls zero yards, on 21 of
 * that club's 26 shots, and the number would look like data. Absent is the
 * truthful reading, and a club that falls under the display threshold once its
 * copies are dropped is meant to fall under it.
 */
const BASIS: Record<
  DistanceBasis,
  {
    distance: (s: LedgerShot) => number | null;
    offline: (s: LedgerShot) => number | null;
    deviation: (s: LedgerShot) => number | null;
  }
> = {
  carry: {
    distance: (s) => s.carryYd,
    offline: (s) => s.offlineYd,
    deviation: (s) => s.carryDeviationAngleDeg,
  },
  total: {
    distance: (s) => (s.totalIsCarryCopy ? null : s.totalYd),
    offline: (s) => (s.totalIsCarryCopy ? null : s.totalDeviationYd),
    deviation: (s) => (s.totalIsCarryCopy ? null : s.totalDeviationAngleDeg),
  },
};

/** The word for a basis, wherever prose needs one. */
export const BASIS_WORD: Record<DistanceBasis, string> = {
  carry: "carry",
  total: "total",
};

/**
 * One shot as the dispersion layer plots it, or null when this basis cannot
 * place it. The only route to a plotted point, so the carry-copy rule above
 * governs the dots exactly as it governs the medians — a chart that drew 51
 * shots the summary refuses to count would be two different answers on one
 * frame.
 */
export function plotPoint(
  s: LedgerShot,
  basis: DistanceBasis,
): { distanceYd: number; offlineYd: number } | null {
  const read = BASIS[basis];
  const distanceYd = read.distance(s);
  const offlineYd = read.offline(s);
  if (distanceYd === null || offlineYd === null) return null;
  return { distanceYd, offlineYd };
}

// ── exclusion heuristics ────────────────────────────────────────────────────

/**
 * Compatibility shim over `classifyShots`.
 *
 * The classifier is the single implementation of review status; this narrows
 * its six statuses back down to the boolean the bag chart, the practice list
 * and the session table were written against, so those keep working unchanged
 * while reading the better classification underneath.
 *
 * `possible-partial` maps to excluded, deliberately: a partial is a real shot
 * but not evidence about a full-swing stock yardage. The status it came from
 * is preserved in `exclusionReason` rather than flattened away, so nothing is
 * lost that the run-3 review UI will want.
 *
 * Never mutates, never deletes. Returns copies.
 */
export function applyHeuristics(
  shots: LedgerShot[],
  t: ReviewThresholds = REVIEW_THRESHOLDS,
): LedgerShot[] {
  return classifyShots(shots, t).shots.map((s) => ({
    ...s,
    isExcluded: !isTrusted(s),
    exclusionReason: isTrusted(s) ? null : (s.explanation ?? s.reviewStatus),
  }));
}

// ── club profiles ───────────────────────────────────────────────────────────

export interface ClubProfile {
  club: string;
  /** Which distance every number below is measured to. */
  basis: DistanceBasis;
  /** Every shot with this club, including excluded ones. */
  n: number;
  /** Shots actually behind the numbers below. */
  active: number;
  /**
   * Trusted shots this basis cannot read a distance from, so `active + unusable`
   * is the trusted count. Always 0 on the carry basis in this ledger; on the
   * total basis it is the shots whose rollout the monitor never modelled.
   */
  unusable: number;
  sessions: number;
  /** True when `active` is under the display threshold. */
  suppressed: boolean;

  medianDistanceYd: number | null;
  distanceP25Yd: number | null;
  distanceP75Yd: number | null;
  distanceMinYd: number | null;
  distanceMaxYd: number | null;

  /** 80th-percentile lateral band: p10 and p90 of offline, in yards. */
  offlineP10Yd: number | null;
  offlineP90Yd: number | null;
  medianOfflineYd: number | null;

  /* The same band in the units the miss is actually made in.
   *
   * Offline yards are a consequence of two things, and only one of them is the
   * club: the export derives `deviation distance = carry × sin(deviation
   * angle)`, so the same face-to-path error puts a 6 iron further offline than
   * a wedge purely because the ball went further. Quantiles of the angle
   * separate the aim error from the distance, which is what makes two clubs
   * comparable and what lets the chart draw a cone rather than a box. */
  deviationP10Deg: number | null;
  deviationP90Deg: number | null;
  medianDeviationDeg: number | null;

  medianBallSpeedMph: number | null;
  medianClubSpeedMph: number | null;
  medianSmashFactor: number | null;
  medianLaunchAngleDeg: number | null;
  medianBackspinRpm: number | null;

  /** Largest gap between per-session medians. Flags a pooled, bimodal club. */
  sessionSpreadYd: number | null;
}

/**
 * Median rollout per club: how much further the ball ran after it landed.
 *
 * Measured shot by shot and then taken as a median, NOT as the difference of
 * the two published medians. The two bases are computed over different shot
 * sets — total drops every carry copy — so subtracting one median from the
 * other would difference two populations and call the result roll. Here both
 * numbers always come off the same swing.
 */
export function medianRolloutYd(shots: LedgerShot[]): Map<string, number> {
  const byClub = new Map<string, number[]>();
  for (const s of shots) {
    if (s.isExcluded || s.totalIsCarryCopy) continue;
    if (s.carryYd === null || s.totalYd === null) continue;
    const a = byClub.get(s.club) ?? [];
    a.push(s.totalYd - s.carryYd);
    byClub.set(s.club, a);
  }
  return new Map([...byClub].map(([club, rolls]) => [club, median(rolls)]));
}

export const MIN_SHOTS_TO_DISPLAY = 15;

const medOrNull = (v: number[]): number | null => (v.length === 0 ? null : median(v));

export function clubProfile(
  allShots: LedgerShot[],
  club: string,
  minShots = MIN_SHOTS_TO_DISPLAY,
  basis: DistanceBasis = "carry",
): ClubProfile {
  const read = BASIS[basis];
  const mine = allShots.filter((s) => s.club === club);
  const trusted = mine.filter((s) => !s.isExcluded);

  /* A trusted shot the basis cannot read a distance from is not an active shot,
   * however trusted it is. Counting it would let a club whose rollout was never
   * modelled sail past the display threshold on the strength of shots that
   * contribute nothing to the median underneath. */
  const active = trusted.filter((s) => read.distance(s) !== null);
  const pick = (f: (s: LedgerShot) => number | null): number[] =>
    active.map(f).filter((v): v is number => v !== null);

  const distances = pick(read.distance);
  const offline = pick(read.offline);
  const deviation = pick(read.deviation);

  // Per-session medians, to expose the pooling problem rather than hide it.
  const bySession = new Map<string, number[]>();
  for (const s of active) {
    const d = read.distance(s);
    if (d === null) continue;
    const a = bySession.get(s.sessionId) ?? [];
    a.push(d);
    bySession.set(s.sessionId, a);
  }
  const sessionMedians = [...bySession.values()]
    .filter((a) => a.length >= 5)
    .map((a) => median(a));

  return {
    club,
    basis,
    n: mine.length,
    active: active.length,
    unusable: trusted.length - active.length,
    sessions: new Set(mine.map((s) => s.sessionId)).size,
    suppressed: active.length < minShots,

    medianDistanceYd: medOrNull(distances),
    distanceP25Yd: distances.length ? quantile(distances, 0.25) : null,
    distanceP75Yd: distances.length ? quantile(distances, 0.75) : null,
    distanceMinYd: distances.length ? Math.min(...distances) : null,
    distanceMaxYd: distances.length ? Math.max(...distances) : null,

    // The 80th-percentile band: 10th to 90th percentile of lateral miss. Eight
    // shots in ten land inside it, which is the region worth planning against.
    offlineP10Yd: offline.length ? quantile(offline, 0.1) : null,
    offlineP90Yd: offline.length ? quantile(offline, 0.9) : null,
    medianOfflineYd: medOrNull(offline),

    deviationP10Deg: deviation.length ? quantile(deviation, 0.1) : null,
    deviationP90Deg: deviation.length ? quantile(deviation, 0.9) : null,
    medianDeviationDeg: medOrNull(deviation),

    medianBallSpeedMph: medOrNull(pick((s) => s.ballSpeedMph)),
    medianClubSpeedMph: medOrNull(pick((s) => s.clubSpeedMph)),
    medianSmashFactor: medOrNull(pick((s) => s.smashFactor)),
    medianLaunchAngleDeg: medOrNull(pick((s) => s.launchAngleDeg)),
    medianBackspinRpm: medOrNull(pick((s) => s.backspinRpm)),

    sessionSpreadYd:
      sessionMedians.length >= 2
        ? Math.max(...sessionMedians) - Math.min(...sessionMedians)
        : null,
  };
}

export function buildBag(
  shots: LedgerShot[],
  minShots = MIN_SHOTS_TO_DISPLAY,
  basis: DistanceBasis = "carry",
): ClubProfile[] {
  const clubs = [...new Set(shots.map((s) => s.club))];
  return sortByBag(clubs.map((c) => clubProfile(shots, c, minShots, basis)));
}

// ── coverage ────────────────────────────────────────────────────────────────

export interface CoverageGap {
  field: string;
  label: string;
  missing: number;
  total: number;
  sessions: string[];
}

/**
 * Where a metric the heuristics depend on is simply absent.
 *
 * Not hypothetical: one observed export has 41 columns instead of 42, with no
 * `Smash Factor` at all and every club-delivery metric empty — the monitor
 * tracked the ball but not the club. Those shots pass through the smash-based
 * mishit test untouched, so a third of the ledger is filtered more loosely
 * than the rest. That is worth saying out loud rather than discovering later.
 */
export function coverageGaps(shots: LedgerShot[]): CoverageGap[] {
  const FIELDS: { field: keyof LedgerShot; label: string }[] = [
    { field: "smashFactor", label: "smash factor" },
    { field: "clubSpeedMph", label: "club speed" },
    { field: "carryYd", label: "carry" },
  ];

  const out: CoverageGap[] = [];
  for (const { field, label } of FIELDS) {
    const missingShots = shots.filter((s) => s[field] === null);
    if (missingShots.length === 0) continue;
    out.push({
      field: field as string,
      label,
      missing: missingShots.length,
      total: shots.length,
      sessions: [...new Set(missingShots.map((s) => s.sessionId))].sort(),
    });
  }
  return out;
}

// ── gaps ────────────────────────────────────────────────────────────────────

export type GapVerdict = "ok" | "overlap" | "hole" | "inverted" | "unknown";

export interface Gap {
  longer: string;
  shorter: string;
  /** Which distance the two medians were measured to. */
  basis: DistanceBasis;
  /** Median distance of the longer-lofted club minus the shorter. */
  gapYd: number | null;
  verdict: GapVerdict;
  /** True when either club is suppressed, so the gap is not shown. */
  suppressed: boolean;
}

export interface GapOptions {
  /** Below this, the two clubs do the same job. */
  overlapUnderYd: number;
  /** Above this, there is a distance you cannot hit. */
  holeOverYd: number;
}

export const DEFAULT_GAPS: GapOptions = { overlapUnderYd: 8, holeOverYd: 15 };

/**
 * Gaps between clubs adjacent *in the bag*, not adjacent by measured distance.
 * Sorting by distance first would silently repair an inversion — the case where
 * a lower-lofted club goes shorter — by reordering it out of existence, and
 * that is the single most actionable thing this chart can tell you.
 *
 * Whichever basis the profiles were built on is the basis these gaps are in;
 * they are carried on the Gap so a table cannot label them wrong. A bag can gap
 * cleanly on carry and badly on total, which is a real finding about rollout
 * and not an inconsistency between two views.
 */
export function detectGaps(
  profiles: ClubProfile[],
  opts: GapOptions = DEFAULT_GAPS,
): Gap[] {
  const ordered = sortByBag(profiles);
  const gaps: Gap[] = [];

  for (let i = 0; i < ordered.length - 1; i += 1) {
    const a = ordered[i];
    const b = ordered[i + 1];
    const suppressed = a.suppressed || b.suppressed;
    const gapYd =
      a.medianDistanceYd !== null && b.medianDistanceYd !== null
        ? a.medianDistanceYd - b.medianDistanceYd
        : null;

    let verdict: GapVerdict = "unknown";
    if (gapYd !== null) {
      if (gapYd < 0) verdict = "inverted";
      else if (gapYd < opts.overlapUnderYd) verdict = "overlap";
      else if (gapYd > opts.holeOverYd) verdict = "hole";
      else verdict = "ok";
    }

    gaps.push({
      longer: a.club,
      shorter: b.club,
      basis: a.basis,
      gapYd,
      verdict,
      suppressed,
    });
  }

  return gaps;
}
