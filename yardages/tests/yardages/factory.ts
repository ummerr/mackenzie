/* Synthetic shots for the classification tests. Not a test file itself —
 * vitest only collects tests/ ** /*.test.ts. */

import type { LedgerShot } from "../../lib/ledger";

let uid = 0;

export function shot(over: Partial<LedgerShot> = {}): LedgerShot {
  uid += 1;
  return {
    sessionId: "2026-07-01T10:00:00",
    shotIndex: uid,
    shotTimestamp: `2026-07-01T10:${String(Math.floor(uid / 60) % 60).padStart(2, "0")}:${String(
      uid % 60,
    ).padStart(2, "0")}`,
    club: "7 Iron",
    carryYd: 150,
    totalYd: 160,
    totalIsCarryCopy: false,
    ballSpeedMph: 110,
    clubSpeedMph: 85,
    smashFactor: 1.3,
    launchAngleDeg: 19,
    launchDirectionDeg: 0,
    attackAngleDeg: -3,
    backspinRpm: 5500,
    sidespinRpm: -200,
    spinRateRpm: 5504,
    spinRateType: "Measured",
    spinAxisDeg: 2,
    faceAngleDeg: 1,
    clubPathDeg: 0,
    faceToPathDeg: 1,
    apexFt: 90,
    descentAngleDeg: null,
    offlineYd: 0,
    carryDeviationAngleDeg: 0,
    totalDeviationYd: 0,
    totalDeviationAngleDeg: 0,
    isExcluded: false,
    exclusionReason: null,
    manualOverride: null,
    raw: {},
    ...over,
  };
}

export interface BlockShape {
  carry: number;
  clubSpeed: number;
  smash: number;
  startIndex: number;
}

/**
 * An ordinary block of shots for one club: enough to clear both the warmup
 * rule and the sample gate, with a spread wide enough that MAD is a usable
 * scale rather than a rounding error.
 *
 * The spreads are deliberately generous. A tight synthetic distribution makes
 * the window between `reviewSmashMad` and `extremeSmashMad` a few thousandths
 * wide, and a test aimed at it would be measuring floating point rather than
 * the rule.
 *
 * Values cycle over five offsets so the median lands exactly on the centre and
 * the MAD is exactly one step — both easy to reason about from a test.
 *
 * The first three shots sit ON the centre rather than in the cycle, because the
 * warmup rule is going to remove them and a cycle that starts at -2 leaves a
 * lopsided pool behind. Use a size where `n - 3` is a multiple of five —
 * `block(13)` is the workhorse — and the surviving pool is exactly symmetric
 * whether or not those three were stripped.
 */
export function block(
  n: number,
  over: Partial<LedgerShot> = {},
  shape: Partial<BlockShape> = {},
): LedgerShot[] {
  const { carry = 150, clubSpeed = 85, smash = 1.3, startIndex = 0 } = shape;
  return Array.from({ length: n }, (_, i) => {
    const k = i < 3 ? 0 : ((i - 3) % 5) - 2; // 0 0 0 then -2 -1 0 1 2 repeating
    return shot({
      shotIndex: startIndex + i,
      carryYd: carry + k * (carry * 0.027), // ±5.3% of the club's carry
      clubSpeedMph: clubSpeed + k,
      smashFactor: smash + k * 0.04,
      offlineYd: k * 2,
      ...over,
    });
  });
}

/** Every status in the result, keyed by shot index, for compact assertions. */
export function statusOf<T extends { shotIndex: number; reviewStatus: string }>(
  shots: T[],
  shotIndex: number,
): T {
  const found = shots.find((s) => s.shotIndex === shotIndex);
  if (!found) throw new Error(`no shot with shotIndex ${shotIndex}`);
  return found;
}
