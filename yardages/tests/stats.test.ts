import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LedgerShot } from "../lib/ledger";
import {
  applyHeuristics,
  bagRank,
  buildBag,
  clubProfile,
  coverageGaps,
  detectGaps,
  mad,
  median,
  quantile,
  sortByBag,
} from "../lib/stats";

// ── primitives, against distributions with known answers ────────────────────

describe("quantile", () => {
  it("interpolates between neighbours", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([0, 10], 0.25)).toBe(2.5);
  });

  it("returns the ends at p=0 and p=1", () => {
    expect(quantile([5, 1, 9], 0)).toBe(1);
    expect(quantile([5, 1, 9], 1)).toBe(9);
  });

  it("does not require sorted input or mutate it", () => {
    const input = [9, 1, 5];
    expect(quantile(input, 0.5)).toBe(5);
    expect(input).toEqual([9, 1, 5]);
  });

  it("throws on an empty set or an out-of-range p", () => {
    expect(() => quantile([], 0.5)).toThrow();
    expect(() => quantile([1], 1.5)).toThrow();
  });
});

describe("mad", () => {
  it("is the scaled median absolute deviation", () => {
    // deviations from median 3 are [2,1,0,1,2]; their median is 1.
    expect(mad([1, 2, 3, 4, 5])).toBeCloseTo(1.4826, 4);
  });

  it("ignores an outlier that would blow up a standard deviation", () => {
    const clean = [10, 10, 10, 10, 10, 11, 9, 10, 10, 10];
    const withOutlier = [...clean, 500];
    // MAD barely moves; SD would roughly quintuple.
    expect(mad(withOutlier)).toBeCloseTo(mad(clean), 6);
  });

  it("is zero for a constant series", () => {
    expect(mad([7, 7, 7])).toBe(0);
  });
});

// ── bag order ───────────────────────────────────────────────────────────────

describe("bag order", () => {
  it("runs longest to shortest by loft, not by name", () => {
    const sorted = sortByBag(
      ["Pitching Wedge", "Driver", "9 Iron", "6 Iron"].map((club) => ({ club })),
    );
    expect(sorted.map((s) => s.club)).toEqual([
      "Driver",
      "6 Iron",
      "9 Iron",
      "Pitching Wedge",
    ]);
  });

  it("sorts an unrecognised club to the end instead of throwing", () => {
    expect(bagRank("Chipper")).toBeGreaterThan(bagRank("Lob Wedge"));
    const sorted = sortByBag([{ club: "Chipper" }, { club: "Driver" }]);
    expect(sorted[0].club).toBe("Driver");
  });
});

// ── synthetic shots ─────────────────────────────────────────────────────────

let uid = 0;
function shot(over: Partial<LedgerShot> = {}): LedgerShot {
  uid += 1;
  return {
    id: `s${uid}`,
    sessionId: "2026-07-01T10:00:00",
    shotIndex: uid,
    shotTimestamp: `2026-07-01T10:00:${String(uid % 60).padStart(2, "0")}`,
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
    raw: {},
    ...over,
  } as LedgerShot;
}

const many = (n: number, over: (i: number) => Partial<LedgerShot>) =>
  Array.from({ length: n }, (_, i) => shot({ shotIndex: i, ...over(i) }));

// ── heuristics ──────────────────────────────────────────────────────────────

/* Classification itself is tested exhaustively in tests/yardages/. What is
 * tested here is the SHIM: lib/stats.ts narrows the classifier's six statuses
 * back down to the boolean that the bag chart, the practice list and the
 * session table were written against. If this mapping drifts, three pages
 * quietly start counting different shots. */
describe("applyHeuristics — the boolean the pages still read", () => {
  it("excludes warmup and says why in the reason", () => {
    const shots = [
      ...many(10, (i) => ({ club: "7 Iron", shotIndex: i })),
      ...many(10, (i) => ({ club: "8 Iron", shotIndex: 10 + i })),
    ];
    const out = applyHeuristics(shots).filter((s) => s.isExcluded);
    expect(out).toHaveLength(6);
    expect(out.filter((s) => s.club === "7 Iron")).toHaveLength(3);
    expect(out.every((s) => /First 3 shots/.test(s.exclusionReason ?? ""))).toBe(true);
  });

  it("restarts the warmup count in a new session", () => {
    const shots = [
      ...many(6, (i) => ({ sessionId: "A", shotIndex: i })),
      ...many(6, (i) => ({ sessionId: "B", shotIndex: i })),
    ];
    expect(applyHeuristics(shots).filter((s) => s.isExcluded)).toHaveLength(6);
  });

  it("counts by shot order, not array order", () => {
    const shots = [
      shot({ shotIndex: 9, carryYd: 150 }),
      shot({ shotIndex: 0, carryYd: 100 }),
      shot({ shotIndex: 1, carryYd: 101 }),
      shot({ shotIndex: 2, carryYd: 102 }),
    ];
    const out = applyHeuristics(shots).filter((s) => s.isExcluded);
    expect(out.map((s) => s.shotIndex).sort()).toEqual([0, 1, 2]);
  });

  it("excludes a mishit and carries its explanation through", () => {
    const shots = [
      ...many(20, (i) => ({ shotIndex: i, carryYd: 150 })),
      shot({ shotIndex: 99, carryYd: 80 }), // 53% of median
    ];
    const chunk = applyHeuristics(shots).find((s) => s.shotIndex === 99)!;
    expect(chunk.isExcluded).toBe(true);
    expect(chunk.exclusionReason).toMatch(/Carry 53% of median/);
  });

  it("excludes a possible partial from the stock number, deliberately", () => {
    // A partial is a real shot and stays in the ledger, but it is not evidence
    // about what a full swing carries, so the bag chart must not average it in.
    const shots = [
      ...many(20, (i) => ({ club: "Gap Wedge", shotIndex: i, carryYd: 100, clubSpeedMph: 80 })),
      shot({ shotIndex: 99, club: "Gap Wedge", carryYd: 70, clubSpeedMph: 64 }),
    ];
    const partial = applyHeuristics(shots).find((s) => s.shotIndex === 99)!;
    expect(partial.isExcluded).toBe(true);
    expect(partial.exclusionReason).toMatch(/partial/);
  });

  it("keeps a lateral outlier IN, because a crooked shot is not a short one", () => {
    const shots = [
      ...many(20, (i) => ({ shotIndex: i, carryYd: 150, offlineYd: (i % 5) - 2 })),
      shot({ shotIndex: 99, carryYd: 150, offlineYd: 40 }),
    ];
    const wild = applyHeuristics(shots).find((s) => s.shotIndex === 99)!;
    expect(wild.isExcluded).toBe(false);
    expect(wild.exclusionReason).toBeNull();
  });

  it("leaves an already-excluded phantom excluded", () => {
    const shots = [
      ...many(20, (i) => ({ shotIndex: i, carryYd: 150 })),
      shot({ shotIndex: 99, carryYd: null, isExcluded: true, exclusionReason: "phantom:ball_speed" }),
    ];
    const p = applyHeuristics(shots).find((s) => s.shotIndex === 99)!;
    expect(p.isExcluded).toBe(true);
    expect(p.exclusionReason).toMatch(/never tracked a ball/);
  });

  it("clears the reason on a shot it keeps", () => {
    const kept = applyHeuristics(many(20, (i) => ({ shotIndex: i })));
    for (const s of kept.filter((x) => !x.isExcluded)) {
      expect(s.exclusionReason).toBeNull();
    }
  });

  it("carries the richer classification along for the review UI to come", () => {
    const out = applyHeuristics(many(20, (i) => ({ shotIndex: i })));
    const enriched = out[0] as typeof out[0] & { reviewStatus: string; flagReasons: string[] };
    expect(enriched.reviewStatus).toBeTruthy();
    expect(Array.isArray(enriched.flagReasons)).toBe(true);
  });

  it("never mutates its input", () => {
    const shots = many(10, () => ({}));
    applyHeuristics(shots);
    expect(shots.every((s) => !s.isExcluded)).toBe(true);
  });
});

// ── profiles ────────────────────────────────────────────────────────────────

describe("clubProfile", () => {
  const shots = many(25, (i) => ({ shotIndex: i, carryYd: 140 + i, offlineYd: i - 12 }));

  it("reports n and active separately", () => {
    const p = clubProfile(applyHeuristics(shots), "7 Iron");
    expect(p.n).toBe(25);
    expect(p.active).toBe(22); // 25 less 3 warmup
  });

  it("suppresses a club under the display threshold", () => {
    const few = many(10, (i) => ({ shotIndex: i, carryYd: 150 }));
    expect(clubProfile(applyHeuristics(few), "7 Iron").suppressed).toBe(true);
    expect(clubProfile(applyHeuristics(shots), "7 Iron").suppressed).toBe(false);
  });

  it("gives an 80th-percentile lateral band, not the full range", () => {
    const p = clubProfile(applyHeuristics(shots), "7 Iron");
    expect(p.offlineP10Yd).toBeGreaterThan(Math.min(...shots.map((s) => s.offlineYd!)));
    expect(p.offlineP90Yd).toBeLessThan(Math.max(...shots.map((s) => s.offlineYd!)));
  });

  it("exposes the between-session spread that pooling would hide", () => {
    const bimodal = [
      ...many(10, (i) => ({ sessionId: "A", shotIndex: i, carryYd: 150 })),
      ...many(10, (i) => ({ sessionId: "B", shotIndex: i, carryYd: 170 })),
    ];
    const p = clubProfile(applyHeuristics(bimodal), "7 Iron");
    expect(p.sessionSpreadYd).toBeCloseTo(20, 6);
    expect(p.sessions).toBe(2);
  });

  it("returns nulls rather than NaN when every metric is missing", () => {
    const blank = many(20, (i) => ({ shotIndex: i, carryYd: null, offlineYd: null }));
    const p = clubProfile(applyHeuristics(blank), "7 Iron");
    expect(p.medianCarryYd).toBeNull();
    expect(p.offlineP90Yd).toBeNull();
    expect(p.sessionSpreadYd).toBeNull();
  });
});

// ── gaps ────────────────────────────────────────────────────────────────────

describe("detectGaps", () => {
  const bag = (spec: [string, number, number][]) =>
    buildBag(
      spec.flatMap(([club, carry, n]) =>
        many(n, (i) => ({ club, shotIndex: i, carryYd: carry })),
      ).map((s) => ({ ...s, isExcluded: false })),
    );

  it("flags a hole over 15 yards", () => {
    const g = detectGaps(bag([["8 Iron", 155, 20], ["9 Iron", 130, 20]]));
    expect(g[0]).toMatchObject({ longer: "8 Iron", shorter: "9 Iron", verdict: "hole" });
    expect(g[0].gapYd).toBeCloseTo(25, 6);
  });

  it("flags an overlap under 8 yards", () => {
    const g = detectGaps(bag([["7 Iron", 158, 20], ["8 Iron", 153, 20]]));
    expect(g[0].verdict).toBe("overlap");
  });

  it("flags an inversion rather than reordering it away", () => {
    // The 6 iron going shorter than the 7 is the finding. Sorting by measured
    // carry would silently repair it.
    const g = detectGaps(bag([["6 Iron", 153, 20], ["7 Iron", 158, 20]]));
    expect(g[0]).toMatchObject({ longer: "6 Iron", shorter: "7 Iron", verdict: "inverted" });
    expect(g[0].gapYd).toBeLessThan(0);
  });

  it("calls a 12-yard gap fine", () => {
    const g = detectGaps(bag([["9 Iron", 132, 20], ["Pitching Wedge", 120, 20]]));
    expect(g[0].verdict).toBe("ok");
  });

  it("marks a gap suppressed when either club is under the threshold", () => {
    const g = detectGaps(bag([["8 Iron", 155, 20], ["9 Iron", 130, 6]]));
    expect(g[0].suppressed).toBe(true);
  });

  it("compares bag neighbours, skipping clubs that are absent", () => {
    const g = detectGaps(bag([["Driver", 240, 20], ["Pitching Wedge", 120, 20]]));
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ longer: "Driver", shorter: "Pitching Wedge" });
  });
});

// ── against the real ledger ─────────────────────────────────────────────────

describe("the real bag", () => {
  const shots: LedgerShot[] = JSON.parse(
    readFileSync(join(__dirname, "..", "data", "shots.json"), "utf8"),
  );

  it("keeps every club's active count at or below its total", () => {
    for (const p of buildBag(applyHeuristics(shots))) {
      expect(p.active).toBeLessThanOrEqual(p.n);
    }
  });

  it("still finds the 8 iron to 9 iron hole after exclusions", () => {
    const gaps = detectGaps(buildBag(applyHeuristics(shots)));
    const g = gaps.find((x) => x.longer === "8 Iron" && x.shorter === "9 Iron")!;
    expect(g.verdict).toBe("hole");
  });

  it("reports the pitching wedge as pooled across divergent sessions", () => {
    const p = clubProfile(applyHeuristics(shots), "Pitching Wedge");
    expect(p.sessions).toBeGreaterThan(1);
    expect(p.sessionSpreadYd).toBeGreaterThan(15);
  });
});

describe("coverageGaps", () => {
  it("reports a metric that is absent from a whole session", () => {
    const shots = [
      ...many(10, (i) => ({ sessionId: "A", shotIndex: i, smashFactor: null, clubSpeedMph: null })),
      ...many(10, (i) => ({ sessionId: "B", shotIndex: i })),
    ];
    const c = coverageGaps(shots);
    const smash = c.find((x) => x.field === "smashFactor")!;
    expect(smash).toMatchObject({ missing: 10, total: 20, sessions: ["A"] });
  });

  it("says nothing when every metric is present", () => {
    expect(coverageGaps(many(10, (i) => ({ shotIndex: i })))).toEqual([]);
  });

  it("finds the real export that tracked the ball but not the club", () => {
    const real: LedgerShot[] = JSON.parse(
      readFileSync(join(__dirname, "..", "data", "shots.json"), "utf8"),
    );
    const smash = coverageGaps(real).find((c) => c.field === "smashFactor");
    expect(smash).toBeDefined();
    // 2026-07-02 lost club tracking for the whole session. 2026-08-02 evening
    // lost it for a single shot — the one that also reported 706 rpm of
    // backspin on a six iron. Both are the same failure at different scales.
    expect(smash!.sessions).toEqual(["2026-07-02T08:42:41", "2026-08-02T20:40:21"]);
  });
});
