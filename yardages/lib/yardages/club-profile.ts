/* Stock yardages per club, from classified shots.
 *
 * Two medians, always both. The weighted one answers "what does this club do
 * now"; the unweighted one answers "what has this club ever done". Publishing
 * only the weighted number hides the fact that recency moved it, and a stock
 * yardage that quietly drifts is worse than one that is merely old.
 *
 * Possible-partial shots are counted separately and kept out of the full-swing
 * numbers entirely. A deliberate three-quarter wedge is a real shot and belongs
 * in the ledger; it is not evidence about what a full wedge carries.
 *
 * Carry and offline round to whole yards. The monitor reports carry to seven
 * decimal places and none of them survive the wind.
 */

import type { LedgerShot } from "../ledger";
/* Bag order stays in lib/stats.ts — one array, one place to add a club. There
 * is no cycle: stats.ts reaches classify-shot.ts, never this file. */
import { bagRank } from "../stats";
import { isTrusted, type ClassifiedShot } from "./classify-shot";
import { latestSessionId, shotWeights, type NaiveTimestamp } from "./recency-weighting";
import {
  medianOrNull,
  percentileInterval,
  weightedMedian,
} from "./robust-stats";
import { REVIEW_THRESHOLDS, type ReviewThresholds } from "./thresholds";

export interface ClubYardageProfile {
  club: string;
  weightedMedianCarry: number | null;
  unweightedMedianCarry: number | null;
  carryP25toP75: [number, number] | null;
  carryP10toP90: [number, number] | null;
  medianOffline: number | null;
  offlineP10toP90: [number, number] | null;
  medianBallSpeed: number | null;
  medianSmash: number | null;
  trustedShotCount: number;
  sessionCount: number;
  lastPracticedAt: string | null;
  flaggedShotCount: number;
  partialShotCount: number;
}

const round = (v: number | null): number | null => (v === null ? null : Math.round(v));

const roundPair = (p: [number, number] | null): [number, number] | null =>
  p === null ? null : [Math.round(p[0]), Math.round(p[1])];

/** Ball speed keeps a decimal and smash keeps three; whole-number smash is meaningless. */
const roundTo = (v: number | null, dp: number): number | null =>
  v === null ? null : Number(v.toFixed(dp));

export function clubYardageProfile(
  classified: ClassifiedShot[],
  club: string,
  asOf: NaiveTimestamp | null = null,
  t: ReviewThresholds = REVIEW_THRESHOLDS,
): ClubYardageProfile {
  const mine = classified.filter((s) => s.club === club);
  const trusted = mine.filter(isTrusted);
  const partials = mine.filter((s) => s.reviewStatus === "possible-partial");
  const flagged = mine.filter((s) => !isTrusted(s) && s.reviewStatus !== "possible-partial");

  const pick = (from: ClassifiedShot[], f: (s: LedgerShot) => number | null): number[] =>
    from.map(f).filter((v): v is number => v !== null);

  const carries = pick(trusted, (s) => s.carryYd);
  const offlines = pick(trusted, (s) => s.offlineYd);

  // Weighted over only the shots that have a carry, so weights and values stay
  // aligned — a trusted shot with no carry must not consume weight it cannot use.
  const withCarry = trusted.filter((s) => s.carryYd !== null);
  const reference = asOf ?? latestSessionId(mine);
  const weighted =
    withCarry.length > 0 && reference !== null
      ? weightedMedian(
          withCarry.map((s) => s.carryYd as number),
          shotWeights(withCarry, reference, t).weights,
        )
      : null;

  // Last practised counts any shot with the club, flagged or not. A session of
  // nothing but mishits is still a session in which you hit the club.
  const lastPracticedAt = mine.reduce<string | null>(
    (latest, s) => (latest === null || s.sessionId > latest ? s.sessionId : latest),
    null,
  );

  return {
    club,
    weightedMedianCarry: round(weighted),
    unweightedMedianCarry: round(medianOrNull(carries)),
    carryP25toP75: roundPair(percentileInterval(carries, 0.25, 0.75)),
    carryP10toP90: roundPair(percentileInterval(carries, 0.1, 0.9)),
    medianOffline: round(medianOrNull(offlines)),
    offlineP10toP90: roundPair(percentileInterval(offlines, 0.1, 0.9)),
    medianBallSpeed: roundTo(medianOrNull(pick(trusted, (s) => s.ballSpeedMph)), 1),
    medianSmash: roundTo(medianOrNull(pick(trusted, (s) => s.smashFactor)), 3),
    trustedShotCount: trusted.length,
    sessionCount: new Set(trusted.map((s) => s.sessionId)).size,
    lastPracticedAt,
    flaggedShotCount: flagged.length,
    partialShotCount: partials.length,
  };
}

/**
 * Every club present, in bag order.
 *
 * `asOf` defaults to the newest session in the whole ledger rather than the
 * newest session per club, so a club you have not hit since June is measured
 * against today and decays, instead of silently resetting its own clock and
 * reporting stale numbers as if they were current.
 */
export function buildClubProfiles(
  classified: ClassifiedShot[],
  asOf: NaiveTimestamp | null = null,
  t: ReviewThresholds = REVIEW_THRESHOLDS,
): ClubYardageProfile[] {
  const reference = asOf ?? latestSessionId(classified);
  const clubs = [...new Set(classified.map((s) => s.club))];
  const profiles = clubs.map((c) => clubYardageProfile(classified, c, reference, t));
  return [...profiles].sort(
    (a, b) => bagRank(a.club) - bagRank(b.club) || a.club.localeCompare(b.club),
  );
}
