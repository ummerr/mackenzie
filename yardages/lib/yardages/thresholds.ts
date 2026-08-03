/* Every tunable number in shot review and stock-yardage statistics.
 *
 * One object, exported once, documented in place. Nothing downstream may
 * hard-code a threshold — if a rule needs a number, it belongs here with the
 * reasoning beside it, because a heuristic whose constants are scattered
 * across five files cannot be re-tuned without re-reading all five.
 *
 * Values were checked against the real ledger (191 shots, 5 sessions, 8 clubs)
 * and the effect of each is visible in `pnpm compare`.
 */

export interface ReviewThresholds {
  /** Shots at the start of each club's block in a session, treated as warmup. */
  warmupShotsPerClub: number;
  /**
   * A club needs this many valid shots before any club-relative rule runs.
   * Below it, only deterministic rules apply — computing a median off five
   * shots and then excluding shots against that median is circular, and it
   * silently distorts exactly the small samples least able to survive it.
   */
  minSampleForClubRelativeRules: number;
  /** Smash this many MADs below the club median is a mishit, no other evidence needed. */
  extremeSmashMad: number;
  /** Smash this many MADs below the club median is worth flagging for review. */
  reviewSmashMad: number;
  /** Carry below this fraction of the club median is extreme. */
  extremeCarryRatio: number;
  /** Carry below this fraction of the club median enters the partial/mishit test. */
  reviewCarryRatio: number;
  /**
   * Wedges enter the partial/mishit test earlier, because a deliberate partial
   * wedge is ordinary practice rather than a miss. The physics of the test that
   * follows is identical — this only widens the door into it.
   */
  wedgePartialCarryRatio: number;
  /**
   * How far below the club's median club speed counts as "deliberately
   * reduced". Within this band of the median is a normal-speed swing.
   *
   * Read as a band around median club speed, NOT as |carryRatio − speedRatio|.
   * Carry is super-linear in ball speed, so an honest 85%-speed partial lands
   * near 75% carry; a literal proportionality test would call it a mishit.
   */
  clubSpeedProportionalityTolerance: number;
  /**
   * Recency decay constant, in days: `weight = exp(-ageInDays / this)`.
   *
   * NOT a half-life despite the name — `exp(-45/45)` is 1/e ≈ 0.37, not 0.5.
   * A true half-life would need `exp(-ln2 × age / 45)`. The name and the
   * formula both came from the brief and are kept verbatim rather than
   * silently corrected; a session 45 days old carries 37% of today's weight.
   */
  recencyHalfLifeDays: number;

  // ── additions beyond the brief, all four required by rules it does specify ──

  /**
   * No single session may contribute more than this share of a club's total
   * weight — capped at `max(this, that session's share of the club's shots)`.
   *
   * The asymmetry is the point. A flat share cap is perverse: with two
   * sessions it drags every split to 50/50, which *amplifies* a small recent
   * session against a large old one — the exact failure it was meant to
   * prevent. Allowing a session up to its raw sample share means recency can
   * only ever reduce a session's influence relative to sample size, never
   * inflate it past what the sample alone would justify.
   *
   * 0.6 rather than 0.5. At 0.5 the cap swallows the feature: most clubs here
   * have two sessions, and two sessions a month apart land near a 66/34 split,
   * so a 0.5 cap pins them to 50/50 and recency weighting does nothing at all.
   * At 0.6 the newest session shifts the number without dictating it, and a
   * four-shot session against a decayed history still tops out at 60%.
   */
  maxSessionWeightShare: number;
  /** Carry this many MADs ABOVE the club median is a distance outlier. */
  carryOutlierMad: number;
  /**
   * Absolute offline this many MADs above the club median is a lateral outlier.
   * Annotates the shot; never excludes it. See the rule in classify-shot.ts.
   */
  offlineOutlierMad: number;
  /** Clubs that get `wedgePartialCarryRatio` instead of `reviewCarryRatio`. */
  wedgeClubs: readonly string[];
}

export const REVIEW_THRESHOLDS: ReviewThresholds = {
  warmupShotsPerClub: 3,
  minSampleForClubRelativeRules: 8,
  extremeSmashMad: 3,
  reviewSmashMad: 2,
  extremeCarryRatio: 0.5,
  reviewCarryRatio: 0.65,
  wedgePartialCarryRatio: 0.8,
  clubSpeedProportionalityTolerance: 0.15,
  recencyHalfLifeDays: 45,

  maxSessionWeightShare: 0.6,
  carryOutlierMad: 3,
  offlineOutlierMad: 3,
  wedgeClubs: ["Pitching Wedge", "Gap Wedge", "Sand Wedge", "Lob Wedge"],
};

export function isWedge(club: string, t: ReviewThresholds = REVIEW_THRESHOLDS): boolean {
  return t.wedgeClubs.includes(club);
}
