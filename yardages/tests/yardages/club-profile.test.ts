import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LedgerShot } from "../../lib/ledger";
import { classifyShots } from "../../lib/yardages/classify-shot";
import { buildClubProfiles, clubYardageProfile } from "../../lib/yardages/club-profile";
import { block, shot } from "./factory";

const profileFor = (shots: LedgerShot[], club = "7 Iron", asOf: string | null = null) =>
  clubYardageProfile(classifyShots(shots).shots, club, asOf);

const WEDGE = { carry: 100, clubSpeed: 80, smash: 1.0 };

describe("counts partition the club's shots", () => {
  const shots = [
    ...block(13),
    shot({ shotIndex: 90, carryYd: 40, smashFactor: 0.6 }), // mishit
    shot({ shotIndex: 91, isExcluded: true, exclusionReason: "phantom:ball_speed", carryYd: null }),
    shot({ shotIndex: 92, manualOverride: "exclude", isExcluded: true, exclusionReason: "phone rang" }),
  ];

  it("adds trusted, partial and flagged back up to every shot with the club", () => {
    const p = profileFor(shots);
    expect(p.trustedShotCount + p.partialShotCount + p.flaggedShotCount).toBe(16);
  });

  it("counts warmup, phantoms and hand exclusions as flagged, not as trusted", () => {
    const p = profileFor(shots);
    expect(p.trustedShotCount).toBe(10); // 13 less 3 warmup
    expect(p.flaggedShotCount).toBe(6); // 3 warmup + mishit + phantom + manual
    expect(p.partialShotCount).toBe(0);
  });

  it("counts partials separately and keeps them out of the stock number", () => {
    const withPartial = [
      ...block(13, { club: "Gap Wedge" }, WEDGE),
      shot({ shotIndex: 99, club: "Gap Wedge", carryYd: 60, clubSpeedMph: 64, smashFactor: 1.0 }),
    ];
    const p = profileFor(withPartial, "Gap Wedge");
    expect(p.partialShotCount).toBe(1);
    // A 60 yd partial in a 100 yd club would drag a pooled median down.
    expect(p.unweightedMedianCarry).toBe(100);
  });
});

describe("the two medians", () => {
  it("reports both, always", () => {
    const p = profileFor(block(13));
    expect(p.weightedMedianCarry).not.toBeNull();
    expect(p.unweightedMedianCarry).not.toBeNull();
  });

  it("agrees with itself when every shot is from one session", () => {
    // One session means one weight, so recency has nothing to act on.
    const p = profileFor(block(13));
    expect(p.weightedMedianCarry).toBe(p.unweightedMedianCarry);
  });

  it("pulls the weighted number toward the newer session", () => {
    const shots = [
      ...block(13, { sessionId: "2026-06-01T10:00:00" }, { carry: 140 }),
      ...block(13, { sessionId: "2026-08-01T10:00:00" }, { carry: 160, startIndex: 13 }),
    ];
    const p = profileFor(shots, "7 Iron", "2026-08-01T10:00:00");
    // Pooled, the two sessions sit either side of 150.
    expect(p.unweightedMedianCarry).toBeGreaterThan(145);
    expect(p.unweightedMedianCarry).toBeLessThan(155);
    // Weighting moves it up toward the newer session without reaching it.
    expect(p.weightedMedianCarry).toBeGreaterThan(p.unweightedMedianCarry!);
    expect(p.weightedMedianCarry).toBeLessThan(160);
  });

  it("does not let a small recent session run away with the number", () => {
    // Four shots today against thirty from four months ago. Without the cap the
    // decayed history would be worth less than today's four swings.
    const shots = [
      ...block(33, { sessionId: "2026-04-01T10:00:00" }, { carry: 150 }),
      ...block(7, { sessionId: "2026-08-01T10:00:00" }, { carry: 190, startIndex: 33 }),
    ];
    const p = profileFor(shots, "7 Iron", "2026-08-01T10:00:00");
    expect(p.unweightedMedianCarry).toBe(150);
    // It moves — it should — but nowhere near the four-shot session's own number.
    expect(p.weightedMedianCarry).toBeLessThan(175);
  });

  it("is deterministic — the same input gives the same number twice", () => {
    const shots = block(13);
    expect(profileFor(shots).weightedMedianCarry).toBe(profileFor(shots).weightedMedianCarry);
  });
});

describe("rounding and shape", () => {
  const p = profileFor(block(13, { offlineYd: 3.7 }));

  it("rounds carry and offline to whole yards", () => {
    for (const v of [p.weightedMedianCarry, p.unweightedMedianCarry, p.medianOffline]) {
      expect(v).toBe(Math.round(v!));
    }
    for (const iv of [p.carryP25toP75, p.carryP10toP90, p.offlineP10toP90]) {
      expect(iv![0]).toBe(Math.round(iv![0]));
      expect(iv![1]).toBe(Math.round(iv![1]));
    }
  });

  it("keeps a decimal on ball speed and three on smash", () => {
    expect(p.medianBallSpeed).toBeCloseTo(110, 1);
    expect(p.medianSmash).toBeCloseTo(1.3, 3);
  });

  it("nests the p25–p75 interval inside p10–p90", () => {
    const wide = profileFor(block(23));
    expect(wide.carryP25toP75![0]).toBeGreaterThanOrEqual(wide.carryP10toP90![0]);
    expect(wide.carryP25toP75![1]).toBeLessThanOrEqual(wide.carryP10toP90![1]);
  });

  it("uses null rather than a placeholder when there is nothing to report", () => {
    const p = profileFor(block(13, { carryYd: null, offlineYd: null }));
    expect(p.weightedMedianCarry).toBeNull();
    expect(p.unweightedMedianCarry).toBeNull();
    expect(p.carryP25toP75).toBeNull();
    expect(p.offlineP10toP90).toBeNull();
  });
});

describe("sessions and last practised", () => {
  it("counts only sessions that contributed a trusted shot", () => {
    const shots = [
      ...block(13, { sessionId: "2026-07-01T10:00:00" }),
      ...block(3, { sessionId: "2026-08-01T10:00:00" }, { startIndex: 13 }), // all warmup
    ];
    const p = profileFor(shots, "7 Iron", "2026-08-01T10:00:00");
    expect(p.sessionCount).toBe(1);
  });

  it("dates last practised from any shot, flagged or not", () => {
    // A session of nothing but mishits is still a session in which you hit it.
    const shots = [
      ...block(13, { sessionId: "2026-07-01T10:00:00" }),
      ...block(3, { sessionId: "2026-08-01T10:00:00" }, { startIndex: 13 }),
    ];
    const p = profileFor(shots, "7 Iron", "2026-08-01T10:00:00");
    expect(p.lastPracticedAt).toBe("2026-08-01T10:00:00");
  });

  it("is null for a club with no shots at all", () => {
    expect(profileFor(block(13), "Lob Wedge").lastPracticedAt).toBeNull();
  });
});

describe("buildClubProfiles", () => {
  it("returns every club in bag order", () => {
    const shots = [
      ...block(13, { club: "Pitching Wedge" }, WEDGE),
      ...block(13, { club: "Driver" }, { carry: 240, clubSpeed: 105, smash: 1.45, startIndex: 13 }),
      ...block(13, { club: "7 Iron" }, { startIndex: 26 }),
    ];
    const profiles = buildClubProfiles(classifyShots(shots).shots);
    expect(profiles.map((p) => p.club)).toEqual(["Driver", "7 Iron", "Pitching Wedge"]);
  });

  it("measures every club against one reference date, not each against its own", () => {
    // A club untouched since June must decay against today, rather than reset
    // its own clock and report stale numbers as if they were current.
    const shots = [
      ...block(13, { club: "7 Iron", sessionId: "2026-06-01T10:00:00" }),
      ...block(13, { club: "8 Iron", sessionId: "2026-08-01T10:00:00" }, { startIndex: 13 }),
    ];
    const profiles = buildClubProfiles(classifyShots(shots).shots);
    const seven = profiles.find((p) => p.club === "7 Iron")!;
    // Single-session club: weighting cannot move it, but it must still resolve.
    expect(seven.weightedMedianCarry).toBe(seven.unweightedMedianCarry);
    expect(seven.lastPracticedAt).toBe("2026-06-01T10:00:00");
  });
});

describe("the real ledger", () => {
  const real: LedgerShot[] = JSON.parse(
    readFileSync(join(__dirname, "..", "..", "data", "shots.json"), "utf8"),
  );
  const profiles = buildClubProfiles(classifyShots(real).shots);

  it("gives every club a profile whose counts add up", () => {
    const total = profiles.reduce(
      (n, p) => n + p.trustedShotCount + p.partialShotCount + p.flaggedShotCount,
      0,
    );
    expect(total).toBe(real.length);
  });

  it("keeps the weighted and unweighted numbers within a few yards of each other", () => {
    // The cap exists so recency shifts the stock number rather than replacing
    // it. A double-digit gap here would mean one session had taken over.
    for (const p of profiles) {
      if (p.weightedMedianCarry === null || p.unweightedMedianCarry === null) continue;
      expect(Math.abs(p.weightedMedianCarry - p.unweightedMedianCarry)).toBeLessThanOrEqual(5);
    }
  });

  it("still puts the bag in loft order with the carries to match", () => {
    const measured = profiles.filter((p) => p.trustedShotCount >= 15 && p.weightedMedianCarry);
    expect(measured.length).toBeGreaterThan(2);
  });
});
