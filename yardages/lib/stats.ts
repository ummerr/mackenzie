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
  /** Every shot with this club, including excluded ones. */
  n: number;
  /** Shots actually behind the numbers below. */
  active: number;
  sessions: number;
  /** True when `active` is under the display threshold. */
  suppressed: boolean;

  medianCarryYd: number | null;
  carryP25Yd: number | null;
  carryP75Yd: number | null;
  carryMinYd: number | null;
  carryMaxYd: number | null;

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

export const MIN_SHOTS_TO_DISPLAY = 15;

const medOrNull = (v: number[]): number | null => (v.length === 0 ? null : median(v));

export function clubProfile(
  allShots: LedgerShot[],
  club: string,
  minShots = MIN_SHOTS_TO_DISPLAY,
): ClubProfile {
  const mine = allShots.filter((s) => s.club === club);
  const active = mine.filter((s) => !s.isExcluded);
  const pick = (f: (s: LedgerShot) => number | null): number[] =>
    active.map(f).filter((v): v is number => v !== null);

  const carries = pick((s) => s.carryYd);
  const offline = pick((s) => s.offlineYd);
  const deviation = pick((s) => s.carryDeviationAngleDeg);

  // Per-session medians, to expose the pooling problem rather than hide it.
  const bySession = new Map<string, number[]>();
  for (const s of active) {
    if (s.carryYd === null) continue;
    const a = bySession.get(s.sessionId) ?? [];
    a.push(s.carryYd);
    bySession.set(s.sessionId, a);
  }
  const sessionMedians = [...bySession.values()]
    .filter((a) => a.length >= 5)
    .map((a) => median(a));

  return {
    club,
    n: mine.length,
    active: active.length,
    sessions: new Set(mine.map((s) => s.sessionId)).size,
    suppressed: active.length < minShots,

    medianCarryYd: medOrNull(carries),
    carryP25Yd: carries.length ? quantile(carries, 0.25) : null,
    carryP75Yd: carries.length ? quantile(carries, 0.75) : null,
    carryMinYd: carries.length ? Math.min(...carries) : null,
    carryMaxYd: carries.length ? Math.max(...carries) : null,

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
): ClubProfile[] {
  const clubs = [...new Set(shots.map((s) => s.club))];
  return sortByBag(clubs.map((c) => clubProfile(shots, c, minShots)));
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
  /** Median carry of the longer-lofted club minus the shorter. */
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
 * Gaps between clubs adjacent *in the bag*, not adjacent by measured carry.
 * Sorting by carry first would silently repair an inversion — the case where a
 * lower-lofted club goes shorter — by reordering it out of existence, and that
 * is the single most actionable thing this chart can tell you.
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
      a.medianCarryYd !== null && b.medianCarryYd !== null
        ? a.medianCarryYd - b.medianCarryYd
        : null;

    let verdict: GapVerdict = "unknown";
    if (gapYd !== null) {
      if (gapYd < 0) verdict = "inverted";
      else if (gapYd < opts.overlapUnderYd) verdict = "overlap";
      else if (gapYd > opts.holeOverYd) verdict = "hole";
      else verdict = "ok";
    }

    gaps.push({ longer: a.club, shorter: b.club, gapYd, verdict, suppressed });
  }

  return gaps;
}
