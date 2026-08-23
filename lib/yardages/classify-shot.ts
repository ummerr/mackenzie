/* Shot review classification. Pure — no I/O, no React, no ledger mutation.
 *
 * ── The discriminator this file exists for ──────────────────────────────────
 *
 * Low carry alone does not mean a bad shot. The signal is the relationship
 * between club speed and smash factor:
 *
 *   partial   low carry, LOW club speed, smash normal for the club.
 *             Less energy went in, so less came out. The player meant this.
 *   mishit    low carry, NORMAL club speed, smash low.
 *             The energy went in and the ball did not go. The player did not.
 *
 * Carry ratio alone cannot tell those apart, and a rule built on it excludes
 * every deliberate three-quarter wedge as a miss. Wedges get a more permissive
 * carry threshold because partials are ordinary there, but the test they enter
 * is the same one — the physics does not change for a knocked-down 8 iron.
 *
 * Where club speed is missing the classification falls back to smash alone and
 * is marked lower certainty. Where both are missing it says so. No shot is ever
 * excluded for a metric the monitor failed to record.
 *
 * Nothing is deleted. Flagged shots stay in the ledger and explain themselves.
 */

import type { LedgerShot } from "../ledger";
import { blockOf, type WedgeBlock } from "../wedge-matrix";
import { madsBelow, mad, median } from "./robust-stats";
import { isWedge, REVIEW_THRESHOLDS, type ReviewThresholds } from "./thresholds";

export type ShotReviewStatus =
  | "included"
  | "auto-flagged"
  | "manually-excluded"
  | "warmup"
  | "phantom"
  | "possible-partial"
  /* A shot inside a hand-asserted block in data/wedge-blocks.json. Not
   * "possible" — the label confirms it. Set aside before the warmup counter
   * and the club pools, and reviewed in lib/wedge-matrix.ts against its own
   * cell instead of the club's full-swing median. */
  | "labeled-partial";

export type ShotFlagReason =
  | "warmup"
  | "phantom"
  | "low-smash"
  | "low-carry"
  | "distance-outlier"
  | "offline-outlier"
  | "possible-partial"
  | "labeled-partial"
  | "missing-data";

/** "low" means the verdict rests on fewer metrics than it wanted, not that it is a guess. */
export type ClassificationCertainty = "high" | "low";

export interface ClassifiedShot extends LedgerShot {
  reviewStatus: ShotReviewStatus;
  /** Machine-readable. May be non-empty on an `included` shot (`missing-data`). */
  flagReasons: ShotFlagReason[];
  /** One concise sentence. Null only when there is nothing to say. */
  explanation: string | null;
  classificationCertainty: ClassificationCertainty;
}

/** What the club-relative rules were computed from. Surfaced for the review UI. */
export interface ClubReviewStats {
  club: string;
  /** Shots eligible for club-relative rules — post-warmup, post-phantom, post-manual. */
  sampleSize: number;
  /** True when the sample was too small, so only deterministic rules ran. */
  gated: boolean;
  medianCarry: number | null;
  madCarry: number | null;
  medianClubSpeed: number | null;
  medianSmash: number | null;
  madSmash: number | null;
  medianAbsOffline: number | null;
  madAbsOffline: number | null;
}

/** Statuses whose shots do not count toward a full-swing stock yardage. */
const NOT_TRUSTED: ReadonlySet<ShotReviewStatus> = new Set<ShotReviewStatus>([
  "auto-flagged",
  "manually-excluded",
  "warmup",
  "phantom",
  "possible-partial",
  "labeled-partial",
]);

export const isTrusted = (s: { reviewStatus: ShotReviewStatus }): boolean =>
  !NOT_TRUSTED.has(s.reviewStatus);

// ── reading the ledger's older, coarser status ──────────────────────────────

const isPhantomReason = (reason: string | null): boolean =>
  reason !== null && reason.startsWith("phantom");

/* Reasons written by this module's own compatibility shim in lib/stats.ts.
 * Guarding against them means classifying an already-classified list is
 * idempotent rather than reading its output back as a set of hand edits. */
const DERIVED_REASONS = new Set(["warmup", "mishit:smash", "mishit:carry"]);

/**
 * Manual state, tolerating a ledger written before `manualOverride` existed.
 * In those, a non-phantom exclusion could only have come from exclusions.json.
 */
export function manualState(s: LedgerShot): "include" | "exclude" | null {
  if (s.manualOverride === "include" || s.manualOverride === "exclude") return s.manualOverride;
  // Already classified once: its isExcluded and exclusionReason are derived, so
  // only manualOverride speaks for the hand edits. Makes reclassification a
  // fixed point instead of laundering yesterday's verdicts into hand edits.
  if ("reviewStatus" in s) return null;
  if (s.isExcluded && !isPhantomReason(s.exclusionReason)) {
    if (s.exclusionReason !== null && DERIVED_REASONS.has(s.exclusionReason)) return null;
    return "exclude";
  }
  return null;
}

// ── formatting ──────────────────────────────────────────────────────────────

const pct = (ratio: number): string => `${Math.round(ratio * 100)}%`;
const mads = (n: number): string => n.toFixed(1);

// ── the verdict for one shot ────────────────────────────────────────────────

interface Verdict {
  status: ShotReviewStatus;
  reasons: ShotFlagReason[];
  explanation: string | null;
  certainty: ClassificationCertainty;
}

type SpeedState = "reduced" | "normal" | "unknown";
type SmashState = "low" | "normal" | "unknown";

/**
 * The partial-versus-mishit decision, once carry is known to be short.
 *
 * Every branch is enumerated rather than collapsed into nested conditionals,
 * because the two "unknown" columns are the ones that matter most on real data
 * — a quarter of this ledger has no club data at all — and they are exactly the
 * branches that a clever short-circuit would get wrong without anyone noticing.
 */
function discriminate(
  speed: SpeedState,
  smash: SmashState,
  carryRatio: number,
  speedRatio: number | null,
  smashMadsBelow: number | null,
  wedge: boolean,
  t: ReviewThresholds,
): Verdict {
  const carryText = `Carry ${pct(carryRatio)} of median`;
  const speedText = speedRatio === null ? "" : ` with club speed ${pct(speedRatio)} of median`;
  const smashText = smashMadsBelow === null ? "" : ` and smash ${mads(smashMadsBelow)} MAD below`;

  if (speed === "reduced" && smash === "normal") {
    return {
      status: "possible-partial",
      reasons: ["possible-partial"],
      explanation: `${carryText}${speedText} and normal smash, likely a partial`,
      certainty: "high",
    };
  }

  if (speed === "reduced" && smash === "unknown") {
    return {
      status: "possible-partial",
      reasons: ["possible-partial", "missing-data"],
      explanation: `${carryText}${speedText}, likely a partial — no smash factor recorded`,
      certainty: "low",
    };
  }

  if (speed === "reduced" && smash === "low") {
    return {
      status: "auto-flagged",
      reasons: ["low-carry", "low-smash"],
      explanation: `${carryText}${speedText}${smashText} — a mishit, not just a shorter swing`,
      certainty: "high",
    };
  }

  if (speed === "normal" && smash === "low") {
    return {
      status: "auto-flagged",
      reasons: ["low-carry", "low-smash"],
      explanation: `${carryText}${smashText} club median at normal club speed`,
      certainty: "high",
    };
  }

  if (speed === "normal" && smash === "normal") {
    /* Full speed in, ball speed normal for that speed, short anyway. Real and
     * visible in this ledger: a 53 yd gap wedge at 95% club speed, smash 0.99,
     * launching 9.3° instead of 30° — a thin. Smash cannot see it, because a
     * bladed wedge transfers energy perfectly well and simply sends it flat.
     *
     * Deliberately not phrased as "the energy never went in": on those shots
     * ball speed was ABOVE the club's median. The failure is in launch and
     * spin, which this classifier does not test, so it is named rather than
     * diagnosed. */
    return {
      status: "auto-flagged",
      reasons: ["low-carry"],
      explanation: `${carryText} at normal club speed and normal smash — a strike or launch problem, not a shorter swing`,
      certainty: "high",
    };
  }

  if (speed === "normal" && smash === "unknown") {
    return {
      status: "auto-flagged",
      reasons: ["low-carry", "missing-data"],
      explanation: `${carryText} at normal club speed — no smash factor to confirm the strike`,
      certainty: "low",
    };
  }

  if (speed === "unknown" && smash === "low") {
    return {
      status: "auto-flagged",
      reasons: ["low-carry", "low-smash", "missing-data"],
      explanation: `${carryText}${smashText} club median — no club speed, so judged on smash alone`,
      certainty: "low",
    };
  }

  if (speed === "unknown" && smash === "normal") {
    return {
      status: "possible-partial",
      reasons: ["possible-partial", "missing-data"],
      explanation: `${carryText} with normal smash — no club speed, so likely a partial on smash alone`,
      certainty: "low",
    };
  }

  // Neither metric recorded. For a wedge inside the permissive band a partial
  // is the strong prior — that band exists because partial wedges are ordinary.
  // Anywhere else, say plainly that the two cannot be told apart here.
  if (wedge && carryRatio >= t.reviewCarryRatio) {
    return {
      status: "possible-partial",
      reasons: ["possible-partial", "missing-data"],
      explanation: `${carryText}, inside the range a partial wedge lives in — no club speed or smash to confirm`,
      certainty: "low",
    };
  }

  return {
    status: "auto-flagged",
    reasons: ["low-carry", "missing-data"],
    explanation: `${carryText} — no club speed or smash factor to tell a partial from a mishit`,
    certainty: "low",
  };
}

// ── the pass over the whole ledger ──────────────────────────────────────────

export interface ClassificationResult {
  shots: ClassifiedShot[];
  clubStats: Map<string, ClubReviewStats>;
}

/**
 * Classify every shot. Input is never mutated; output preserves input order.
 *
 * Order of operations is deliberate and load-bearing:
 *
 *   1. manual overrides, which win in both directions and are never revisited
 *   2. phantoms, from the parser
 *   3. labeled partial blocks, set aside like phantoms — they neither occupy
 *      warmup positions (the full-swing warmup count counts full swings only)
 *      nor enter the club pools (twenty half swings would drag the carry
 *      floor down and let genuine mishits through the filter)
 *   4. warmup, per (session, club) block
 *   5. club medians, computed from ONLY what survived 1-4
 *   6. club-relative rules, gated on sample size
 *
 * Step 5 after step 4 is the important one. Warmup shots are systematically
 * worse, so leaving them in the median drags the carry floor down with it,
 * which lets genuinely bad shots through the very filter meant to catch them.
 *
 * `blocks = null` (the default) reproduces the pre-matrix behavior exactly.
 */
export function classifyShots(
  shots: LedgerShot[],
  t: ReviewThresholds = REVIEW_THRESHOLDS,
  blocks: readonly WedgeBlock[] | null = null,
): ClassificationResult {
  const verdicts = new Map<number, Verdict>();
  const manual = shots.map(manualState);
  const labeled = new Set<number>();

  // ── 1-2: deterministic, per shot ──────────────────────────────────────────
  shots.forEach((s, i) => {
    if (manual[i] === "exclude") {
      verdicts.set(i, {
        status: "manually-excluded",
        reasons: [],
        explanation: s.exclusionReason ?? "Excluded by hand in data/exclusions.json",
        certainty: "high",
      });
      return;
    }
    if (manual[i] === "include") return; // decided at the end, after the auto rules run
    if (s.isExcluded && isPhantomReason(s.exclusionReason)) {
      verdicts.set(i, {
        status: "phantom",
        reasons: ["phantom"],
        explanation: "Monitor recorded a swing but never tracked a ball",
        certainty: "high",
      });
    }
  });

  // ── 3: labeled partial blocks, set aside like phantoms ────────────────────
  //
  // A label wins over a manual INCLUDE, deliberately: pulling a half swing
  // into the full-swing pool is exactly the poisoning the label exists to
  // prevent, and a hand that wrote both entries almost certainly meant the
  // more specific one. Manual exclusion and phantom (above) still win — a
  // block can contain a swing the monitor missed or a shot excluded by hand.
  if (blocks && blocks.length > 0) {
    shots.forEach((s, i) => {
      if (verdicts.has(i)) return;
      const b = blockOf(s, blocks);
      if (!b) return;
      labeled.add(i);
      verdicts.set(i, {
        status: "labeled-partial",
        reasons: ["labeled-partial"],
        explanation:
          `Labeled ${b.swing} block in data/wedge-blocks.json — ` +
          "reviewed in the wedge matrix, not against the full swing",
        certainty: "high",
      });
    });
  }

  // ── 4: warmup, per (session, club) block, in shot order ───────────────────
  const order = shots
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.sessionId.localeCompare(b.s.sessionId) || a.s.shotIndex - b.s.shotIndex);

  const blockCount = new Map<string, number>();
  for (const { s, i } of order) {
    const decided = verdicts.get(i);
    if (
      decided &&
      (decided.status === "phantom" ||
        decided.status === "manually-excluded" ||
        decided.status === "labeled-partial")
    ) {
      continue;
    }
    const key = `${s.sessionId}#${s.club}`;
    const n = (blockCount.get(key) ?? 0) + 1;
    blockCount.set(key, n);
    // A manually included shot still occupies its position in the block — the
    // fourth swing is the fourth swing — but is never marked warmup itself.
    if (n <= t.warmupShotsPerClub && manual[i] !== "include") {
      verdicts.set(i, {
        status: "warmup",
        reasons: ["warmup"],
        explanation: `First ${t.warmupShotsPerClub} shots with this club this session`,
        certainty: "high",
      });
    }
  }

  // ── 5: club pools, from what survived ─────────────────────────────────────
  const pool = new Map<string, number[]>();
  shots.forEach((s, i) => {
    if (verdicts.has(i)) return; // phantom, manual exclusion, labeled block or warmup
    const list = pool.get(s.club) ?? [];
    list.push(i);
    pool.set(s.club, list);
  });

  const clubStats = new Map<string, ClubReviewStats>();
  for (const club of new Set(shots.map((s) => s.club))) {
    const idx = pool.get(club) ?? [];
    const values = (f: (s: LedgerShot) => number | null): number[] =>
      idx.map((i) => f(shots[i])).filter((v): v is number => v !== null);

    const carries = values((s) => s.carryYd);
    const speeds = values((s) => s.clubSpeedMph);
    const smashes = values((s) => s.smashFactor);
    const offlines = values((s) => s.offlineYd).map(Math.abs);

    // Gate on the metric each rule actually uses, not on a single global count.
    // A club can have twenty carries and three smash readings; a MAD off three
    // readings is not a threshold, it is a coin flip with a decimal point.
    const enough = (v: number[]): boolean => v.length >= t.minSampleForClubRelativeRules;

    clubStats.set(club, {
      club,
      sampleSize: carries.length,
      gated: !enough(carries),
      medianCarry: enough(carries) ? median(carries) : null,
      madCarry: enough(carries) ? mad(carries) : null,
      medianClubSpeed: enough(speeds) ? median(speeds) : null,
      medianSmash: enough(smashes) ? median(smashes) : null,
      madSmash: enough(smashes) ? mad(smashes) : null,
      medianAbsOffline: enough(offlines) ? median(offlines) : null,
      madAbsOffline: enough(offlines) ? mad(offlines) : null,
    });
  }

  // ── 6: club-relative rules ────────────────────────────────────────────────
  for (const [club, idx] of pool) {
    const stats = clubStats.get(club)!;
    const smashPool = idx
      .map((i) => shots[i].smashFactor)
      .filter((v): v is number => v !== null);

    for (const i of idx) {
      const s = shots[i];

      if (s.carryYd === null) {
        verdicts.set(i, {
          status: "included",
          reasons: ["missing-data"],
          explanation: "No carry recorded — not judged against the club",
          certainty: "low",
        });
        continue;
      }

      // Sample gating: below the threshold only the deterministic rules above
      // have run, and this shot is included without a club-relative opinion.
      if (stats.medianCarry === null) {
        verdicts.set(i, {
          status: "included",
          reasons: [],
          explanation: null,
          certainty: "high",
        });
        continue;
      }

      const carryRatio = s.carryYd / stats.medianCarry;
      const smashDev =
        s.smashFactor !== null && stats.madSmash !== null
          ? madsBelow(s.smashFactor, smashPool)
          : null;
      const speedRatio =
        s.clubSpeedMph !== null && stats.medianClubSpeed !== null
          ? s.clubSpeedMph / stats.medianClubSpeed
          : null;

      // ── extreme smash: a mishit on its own evidence, whatever carry did ────
      if (smashDev !== null && smashDev >= t.extremeSmashMad) {
        verdicts.set(i, {
          status: "auto-flagged",
          reasons: ["low-smash"],
          explanation:
            `Smash ${mads(smashDev)} MAD below club median` +
            (speedRatio === null
              ? " — no club speed recorded"
              : ` at ${pct(speedRatio)} of median club speed`),
          certainty: speedRatio === null ? "low" : "high",
        });
        continue;
      }

      // ── low carry: the partial/mishit discriminator ────────────────────────
      const wedge = isWedge(club, t);
      const floor = wedge ? t.wedgePartialCarryRatio : t.reviewCarryRatio;
      if (carryRatio < floor) {
        const speed: SpeedState =
          speedRatio === null
            ? "unknown"
            : speedRatio <= 1 - t.clubSpeedProportionalityTolerance
              ? "reduced"
              : "normal";
        const smash: SmashState =
          s.smashFactor === null || smashDev === null
            ? "unknown"
            : smashDev >= t.reviewSmashMad
              ? "low"
              : "normal";
        verdicts.set(i, discriminate(speed, smash, carryRatio, speedRatio, smashDev, wedge, t));
        continue;
      }

      // ── carry is fine: the remaining club-relative checks ──────────────────
      if (smashDev !== null && smashDev >= t.reviewSmashMad) {
        verdicts.set(i, {
          status: "auto-flagged",
          reasons: ["low-smash"],
          explanation: `Smash ${mads(smashDev)} MAD below club median on a normal-length carry`,
          certainty: "high",
        });
        continue;
      }

      if (stats.madCarry !== null && stats.madCarry > 0) {
        const above = (s.carryYd - stats.medianCarry) / stats.madCarry;
        if (above >= t.carryOutlierMad) {
          verdicts.set(i, {
            status: "auto-flagged",
            reasons: ["distance-outlier"],
            explanation: `Carry ${mads(above)} MAD above club median — check the club is tagged right`,
            certainty: "high",
          });
          continue;
        }
      }

      /* An offline outlier ANNOTATES an included shot. It never excludes one.
       *
       * A lateral miss says nothing about carry, and the real ledger settles
       * it: the pitching wedge shots 19-30 yd left carried 127-141 yd against
       * a club median of 121 — above it. Dropping them would bias the carry
       * median downward on the assumption that a crooked shot is a short one,
       * which this data directly contradicts. It would also delete the very
       * signal lib/tasks.ts reads to tell a systematic pull from a bad day:
       * four consecutive pulls are a tendency, and an outlier rule that eats
       * all four reports a straight club.
       *
       * So the reason is recorded and the shot stays trusted. `included` with
       * a reason is an annotation; `auto-flagged` is an exclusion. */
      if (
        s.offlineYd !== null &&
        stats.medianAbsOffline !== null &&
        stats.madAbsOffline !== null &&
        stats.madAbsOffline > 0
      ) {
        const dev = (Math.abs(s.offlineYd) - stats.medianAbsOffline) / stats.madAbsOffline;
        if (dev >= t.offlineOutlierMad) {
          verdicts.set(i, {
            status: "included",
            reasons: ["offline-outlier"],
            explanation:
              `${Math.round(Math.abs(s.offlineYd))} yd ${s.offlineYd > 0 ? "right" : "left"}, ` +
              `${mads(dev)} MAD outside this club's usual miss — carry still counts`,
            certainty: "high",
          });
          continue;
        }
      }

      verdicts.set(i, { status: "included", reasons: [], explanation: null, certainty: "high" });
    }
  }

  // ── manual inclusion wins last, over anything the rules decided ────────────
  const out: ClassifiedShot[] = shots.map((s, i) => {
    const v = verdicts.get(i) ?? {
      status: "included" as ShotReviewStatus,
      reasons: [] as ShotFlagReason[],
      explanation: null,
      certainty: "high" as ClassificationCertainty,
    };

    if (manual[i] === "include" && !labeled.has(i)) {
      return {
        ...s,
        reviewStatus: "included",
        // The automatic reasons are kept rather than erased: a hand-included
        // shot that the heuristics dislike is worth being able to see.
        flagReasons: v.reasons,
        explanation:
          v.reasons.length > 0
            ? `Included by hand — heuristics would have flagged it: ${v.explanation ?? v.reasons.join(", ")}`
            : "Included by hand in data/exclusions.json",
        classificationCertainty: v.certainty,
      };
    }

    return {
      ...s,
      reviewStatus: v.status,
      flagReasons: v.reasons,
      explanation: v.explanation,
      classificationCertainty: v.certainty,
    };
  });

  return { shots: out, clubStats };
}
