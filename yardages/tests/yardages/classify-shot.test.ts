import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LedgerShot } from "../../lib/ledger";
import { classifyShots, isTrusted } from "../../lib/yardages/classify-shot";
import { REVIEW_THRESHOLDS } from "../../lib/yardages/thresholds";
import { block, shot, statusOf } from "./factory";

const classify = (shots: LedgerShot[]) => classifyShots(shots).shots;

// A wedge block: shorter carry, slower club, smash near 1.0 as a wedge is.
const WEDGE = { carry: 100, clubSpeed: 80, smash: 1.0 };

// ── deterministic rules ─────────────────────────────────────────────────────

describe("warmup classification", () => {
  it("marks the first shots of each club block in each session", () => {
    const out = classify([
      ...block(10, { club: "7 Iron" }),
      ...block(10, { club: "8 Iron" }, { startIndex: 10 }),
    ]);
    const warm = out.filter((s) => s.reviewStatus === "warmup");
    expect(warm).toHaveLength(2 * REVIEW_THRESHOLDS.warmupShotsPerClub);
    expect(warm.filter((s) => s.club === "7 Iron")).toHaveLength(3);
    expect(warm.filter((s) => s.club === "8 Iron")).toHaveLength(3);
    expect(warm[0].flagReasons).toEqual(["warmup"]);
    expect(warm[0].explanation).toMatch(/First 3 shots with this club this session/);
  });

  it("restarts the count in a new session", () => {
    const out = classify([
      ...block(6, { sessionId: "2026-07-01T10:00:00" }),
      ...block(6, { sessionId: "2026-07-08T10:00:00" }),
    ]);
    expect(out.filter((s) => s.reviewStatus === "warmup")).toHaveLength(6);
  });

  it("counts by shot order, not array order", () => {
    const out = classify([
      shot({ shotIndex: 9, carryYd: 150 }),
      shot({ shotIndex: 0, carryYd: 100 }),
      shot({ shotIndex: 1, carryYd: 101 }),
      shot({ shotIndex: 2, carryYd: 102 }),
    ]);
    expect(
      out.filter((s) => s.reviewStatus === "warmup").map((s) => s.shotIndex).sort(),
    ).toEqual([0, 1, 2]);
  });

  it("does not let warmup shots into the medians that judge the rest", () => {
    // Three dreadful warmup shots then a good block. If warmup counted toward
    // the median the carry floor would drop far enough to admit the chunk.
    const out = classify([
      ...block(3, { carryYd: 60 }),
      ...block(13, {}, { startIndex: 3 }),
      shot({ shotIndex: 99, carryYd: 88 }), // 59% of 150, but 98% of a pooled median
    ]);
    expect(statusOf(out, 99).reviewStatus).toBe("auto-flagged");
  });
});

describe("phantom classification", () => {
  const phantom = () =>
    shot({
      shotIndex: 99,
      carryYd: null,
      ballSpeedMph: null,
      clubSpeedMph: null,
      smashFactor: null,
      isExcluded: true,
      exclusionReason: "phantom:ball_speed,carry_distance",
    });

  it("keeps the parser's phantom flag and explains it", () => {
    const out = classify([...block(13), phantom()]);
    const p = statusOf(out, 99);
    expect(p.reviewStatus).toBe("phantom");
    expect(p.flagReasons).toEqual(["phantom"]);
    expect(p.explanation).toMatch(/never tracked a ball/);
  });

  it("keeps a phantom out of the medians and out of the warmup count", () => {
    const withPhantom = classify([phantom(), ...block(13, {}, { startIndex: 0 })]);
    const without = classify(block(13));
    // The phantom did not consume one of the three warmup slots.
    expect(withPhantom.filter((s) => s.reviewStatus === "warmup")).toHaveLength(3);
    expect(without.filter((s) => s.reviewStatus === "warmup")).toHaveLength(3);
  });

  it("is never deleted — it stays in the output", () => {
    const out = classify([...block(13), phantom()]);
    expect(out).toHaveLength(14);
  });
});

// ── sample-size gating ──────────────────────────────────────────────────────

describe("sample-size gating", () => {
  const dreadful = shot({ shotIndex: 99, carryYd: 40, smashFactor: 0.6, clubSpeedMph: 85 });

  it("applies no club-relative rule below the minimum sample", () => {
    // 9 shots plus the bad one, less 3 warmup, is a pool of 7 — below the gate
    // of 8. Judging a shot against a median built from seven shots, one of
    // which is the shot itself, is circular.
    const out = classify([...block(9), dreadful]);
    expect(statusOf(out, 99).reviewStatus).toBe("included");
    expect(classifyShots([...block(9), dreadful]).clubStats.get("7 Iron")!.gated).toBe(true);
  });

  it("applies them once the sample is large enough", () => {
    // 12 shots less 3 warmup is 9 survivors, over the gate.
    const out = classify([...block(12), dreadful]);
    expect(statusOf(out, 99).reviewStatus).toBe("auto-flagged");
    expect(classifyShots([...block(12), dreadful]).clubStats.get("7 Iron")!.gated).toBe(false);
  });

  it("gates each metric on its own count, not on one global one", () => {
    // Plenty of carries, only three smash readings. A MAD off three readings is
    // not a threshold, so no smash rule may fire against it.
    const out = classify([
      ...block(13, { smashFactor: null }),
      ...block(3, { smashFactor: 1.3 }, { startIndex: 13 }),
      shot({ shotIndex: 99, smashFactor: 0.8, carryYd: 150 }),
    ]);
    expect(statusOf(out, 99).reviewStatus).toBe("included");
  });

  it("declines to judge a club whose metric never varies", () => {
    // MAD of zero would make every value that is not the median infinitely
    // deviant, and every shot would be flagged.
    const out = classify([
      ...block(13, { smashFactor: 1.3 }),
      shot({ shotIndex: 99, smashFactor: 1.29, carryYd: 150 }),
    ]);
    expect(statusOf(out, 99).reviewStatus).toBe("included");
  });
});

// ── the partial versus mishit discriminator ─────────────────────────────────

describe("mishit: low carry at normal club speed", () => {
  it("classifies a low-smash iron at normal club speed as a mishit", () => {
    const out = classify([
      ...block(13),
      // 60% of median carry, full club speed, smash 2.5 MAD below.
      shot({ shotIndex: 99, carryYd: 90, clubSpeedMph: 85, smashFactor: 1.15 }),
    ]);
    const s = statusOf(out, 99);
    expect(s.reviewStatus).toBe("auto-flagged");
    expect(s.flagReasons).toContain("low-carry");
    expect(s.flagReasons).toContain("low-smash");
    expect(s.reviewStatus).not.toBe("possible-partial");
    expect(s.classificationCertainty).toBe("high");
  });

  it("flags an extreme smash on its own evidence, whatever carry did", () => {
    const out = classify([
      ...block(13),
      shot({ shotIndex: 99, carryYd: 150, clubSpeedMph: 85, smashFactor: 0.9 }),
    ]);
    const s = statusOf(out, 99);
    expect(s.reviewStatus).toBe("auto-flagged");
    expect(s.flagReasons).toEqual(["low-smash"]);
    expect(s.explanation).toMatch(/MAD below club median at \d+% of median club speed/);
  });

  it("calls a short shot at full speed and normal smash a strike problem, not a partial", () => {
    // Real and in the ledger: a 95 yd six iron at 100% club speed with smash
    // 1.279 — a thin. Ball speed was fine; the launch angle was 4.3°.
    const out = classify([
      ...block(13),
      shot({ shotIndex: 99, carryYd: 90, clubSpeedMph: 85, smashFactor: 1.3 }),
    ]);
    const s = statusOf(out, 99);
    expect(s.reviewStatus).toBe("auto-flagged");
    expect(s.flagReasons).toEqual(["low-carry"]);
    expect(s.explanation).toMatch(/strike or launch problem/);
  });
});

describe("partial: low carry with proportionally reduced club speed", () => {
  it("classifies a low-carry wedge at reduced club speed as a partial", () => {
    const out = classify([
      ...block(13, { club: "Gap Wedge" }, WEDGE),
      // 70% of median carry, club speed 80% of median, smash normal.
      shot({ shotIndex: 99, club: "Gap Wedge", carryYd: 70, clubSpeedMph: 64, smashFactor: 1.0 }),
    ]);
    const s = statusOf(out, 99);
    expect(s.reviewStatus).toBe("possible-partial");
    expect(s.flagReasons).toEqual(["possible-partial"]);
    expect(s.classificationCertainty).toBe("high");
    expect(s.explanation).toMatch(/likely a partial/);
  });

  it("applies the same physics to an iron — a knocked-down 8 iron is a partial too", () => {
    const out = classify([
      ...block(13, { club: "8 Iron" }),
      shot({ shotIndex: 99, club: "8 Iron", carryYd: 90, clubSpeedMph: 68, smashFactor: 1.3 }),
    ]);
    expect(statusOf(out, 99).reviewStatus).toBe("possible-partial");
  });

  it("gives wedges a more permissive door into the test, not a different test", () => {
    // 75% of median carry. A wedge enters the discriminator at 0.80 and an iron
    // only at 0.65, so the identical shot is judged for one club and not the other.
    const wedge = classify([
      ...block(13, { club: "Gap Wedge" }, WEDGE),
      shot({ shotIndex: 99, club: "Gap Wedge", carryYd: 75, clubSpeedMph: 64, smashFactor: 1.0 }),
    ]);
    const iron = classify([
      ...block(13, { club: "8 Iron" }),
      shot({ shotIndex: 99, club: "8 Iron", carryYd: 112.5, clubSpeedMph: 68, smashFactor: 1.3 }),
    ]);
    expect(statusOf(wedge, 99).reviewStatus).toBe("possible-partial");
    expect(statusOf(iron, 99).reviewStatus).toBe("included");
  });

  it("classifies an extremely short wedge with poor smash as a mishit, not a partial", () => {
    const out = classify([
      ...block(13, { club: "Gap Wedge" }, WEDGE),
      // 45% of median carry, and the strike was bad enough to say why.
      shot({ shotIndex: 99, club: "Gap Wedge", carryYd: 45, clubSpeedMph: 80, smashFactor: 0.7 }),
    ]);
    const s = statusOf(out, 99);
    expect(s.reviewStatus).toBe("auto-flagged");
    expect(s.flagReasons).toContain("low-smash");
  });

  it("calls a reduced-speed swing that was also badly struck a mishit", () => {
    // The player swung shorter AND caught it thin. Reduced speed alone does not
    // buy a pass; the smash still has to be normal for that club.
    const out = classify([
      ...block(13, { club: "Gap Wedge" }, WEDGE),
      shot({ shotIndex: 99, club: "Gap Wedge", carryYd: 60, clubSpeedMph: 64, smashFactor: 0.88 }),
    ]);
    const s = statusOf(out, 99);
    expect(s.reviewStatus).toBe("auto-flagged");
    expect(s.flagReasons).toContain("low-carry");
    expect(s.flagReasons).toContain("low-smash");
    expect(s.explanation).toMatch(/not just a shorter swing/);
  });
});

// ── missing data ────────────────────────────────────────────────────────────

describe("missing metrics never cause an exclusion", () => {
  it("does not exclude a shot for a missing smash factor", () => {
    const out = classify([
      ...block(13),
      shot({ shotIndex: 99, carryYd: 150, clubSpeedMph: 85, smashFactor: null }),
    ]);
    expect(statusOf(out, 99).reviewStatus).toBe("included");
    expect(isTrusted(statusOf(out, 99))).toBe(true);
  });

  it("does not exclude a shot missing both club speed and smash", () => {
    const out = classify([
      ...block(13),
      shot({ shotIndex: 99, carryYd: 150, clubSpeedMph: null, smashFactor: null }),
    ]);
    expect(statusOf(out, 99).reviewStatus).toBe("included");
  });

  it("keeps a shot with no carry at all, and says why it was not judged", () => {
    const out = classify([...block(13), shot({ shotIndex: 99, carryYd: null })]);
    const s = statusOf(out, 99);
    expect(s.reviewStatus).toBe("included");
    expect(s.flagReasons).toEqual(["missing-data"]);
    expect(s.explanation).toMatch(/No carry recorded/);
  });

  it("does not exclude a whole session that recorded no club data", () => {
    // The real shape: one export of 45 shots with no club speed and no smash.
    const out = classify([
      ...block(13, { sessionId: "2026-07-01T10:00:00" }),
      ...block(13, { sessionId: "2026-07-08T10:00:00", clubSpeedMph: null, smashFactor: null }),
    ]);
    const noClubData = out.filter((s) => s.sessionId === "2026-07-08T10:00:00");
    expect(noClubData.filter((s) => s.reviewStatus === "included")).toHaveLength(10);
  });
});

describe("missing club speed falls back to smash alone, at lower certainty", () => {
  it("reads a short wedge with normal smash as a partial", () => {
    const out = classify([
      ...block(13, { club: "Gap Wedge" }, WEDGE),
      shot({ shotIndex: 99, club: "Gap Wedge", carryYd: 70, clubSpeedMph: null, smashFactor: 1.0 }),
    ]);
    const s = statusOf(out, 99);
    expect(s.reviewStatus).toBe("possible-partial");
    expect(s.flagReasons).toContain("missing-data");
    expect(s.classificationCertainty).toBe("low");
    expect(s.explanation).toMatch(/no club speed/i);
  });

  it("reads a short shot with low smash as a mishit", () => {
    const out = classify([
      ...block(13),
      shot({ shotIndex: 99, carryYd: 90, clubSpeedMph: null, smashFactor: 1.15 }),
    ]);
    const s = statusOf(out, 99);
    expect(s.reviewStatus).toBe("auto-flagged");
    expect(s.flagReasons).toContain("low-smash");
    expect(s.classificationCertainty).toBe("low");
  });

  it("says plainly when neither metric can tell a partial from a mishit", () => {
    const out = classify([
      ...block(13),
      shot({ shotIndex: 99, carryYd: 90, clubSpeedMph: null, smashFactor: null }),
    ]);
    const s = statusOf(out, 99);
    expect(s.reviewStatus).toBe("auto-flagged");
    expect(s.flagReasons).toEqual(["low-carry", "missing-data"]);
    expect(s.classificationCertainty).toBe("low");
    expect(s.explanation).toMatch(/no club speed or smash factor/i);
  });

  it("defaults a wedge inside the partial band to a partial when nothing is recorded", () => {
    const out = classify([
      ...block(13, { club: "Gap Wedge" }, WEDGE),
      // 72% — below the wedge door at 0.80, above the review floor at 0.65.
      shot({ shotIndex: 99, club: "Gap Wedge", carryYd: 72, clubSpeedMph: null, smashFactor: null }),
    ]);
    const s = statusOf(out, 99);
    expect(s.reviewStatus).toBe("possible-partial");
    expect(s.classificationCertainty).toBe("low");
  });
});

// ── outliers ────────────────────────────────────────────────────────────────

describe("outliers", () => {
  it("flags a carry far above the club median as a probable mis-tagged club", () => {
    const out = classify([...block(13), shot({ shotIndex: 99, carryYd: 260 })]);
    const s = statusOf(out, 99);
    expect(s.reviewStatus).toBe("auto-flagged");
    expect(s.flagReasons).toEqual(["distance-outlier"]);
  });

  it("annotates a lateral outlier but keeps it in the stock yardage", () => {
    // A crooked shot is not a short one. In the real ledger the shots 19-30 yd
    // left carried ABOVE the club median; excluding them would bias it down and
    // erase the very signal that tells a systematic pull from one bad day.
    const out = classify([...block(13), shot({ shotIndex: 99, carryYd: 152, offlineYd: -40 })]);
    const s = statusOf(out, 99);
    expect(s.reviewStatus).toBe("included");
    expect(isTrusted(s)).toBe(true);
    expect(s.flagReasons).toEqual(["offline-outlier"]);
    expect(s.explanation).toMatch(/carry still counts/);
  });
});

// ── manual precedence ───────────────────────────────────────────────────────

describe("manual precedence, in both directions", () => {
  it("excludes a shot the heuristics were perfectly happy with", () => {
    const out = classify([
      ...block(13),
      shot({ shotIndex: 99, carryYd: 150, manualOverride: "exclude", exclusionReason: "phone rang", isExcluded: true }),
    ]);
    const s = statusOf(out, 99);
    expect(s.reviewStatus).toBe("manually-excluded");
    expect(s.explanation).toBe("phone rang");
    expect(isTrusted(s)).toBe(false);
  });

  it("includes a shot the heuristics would have flagged", () => {
    const out = classify([
      ...block(13),
      shot({ shotIndex: 99, carryYd: 40, smashFactor: 0.6, manualOverride: "include" }),
    ]);
    const s = statusOf(out, 99);
    expect(s.reviewStatus).toBe("included");
    expect(isTrusted(s)).toBe(true);
  });

  it("keeps the automatic reasons on a hand-included shot rather than erasing them", () => {
    const out = classify([
      ...block(13),
      shot({ shotIndex: 99, carryYd: 40, smashFactor: 0.6, manualOverride: "include" }),
    ]);
    const s = statusOf(out, 99);
    expect(s.flagReasons.length).toBeGreaterThan(0);
    expect(s.explanation).toMatch(/Included by hand — heuristics would have flagged it/);
  });

  it("overrides warmup, and does not shift the block count for the shots after it", () => {
    const shots = [
      shot({ shotIndex: 0, manualOverride: "include" }),
      ...block(14, {}, { startIndex: 1 }),
    ];
    const out = classify(shots);
    expect(statusOf(out, 0).reviewStatus).toBe("included");
    // The manually included shot still occupies position 1 of the block, so
    // only positions 2 and 3 remain warmup.
    expect(out.filter((s) => s.reviewStatus === "warmup").map((s) => s.shotIndex)).toEqual([1, 2]);
  });

  it("brings a phantom back when asked, without inventing the flight it never saw", () => {
    const out = classify([
      ...block(13),
      shot({
        shotIndex: 99,
        carryYd: null,
        ballSpeedMph: null,
        smashFactor: null,
        isExcluded: false,
        exclusionReason: null,
        manualOverride: "include",
      }),
    ]);
    const s = statusOf(out, 99);
    expect(s.reviewStatus).toBe("included");
    expect(s.carryYd).toBeNull();
  });

  it("keeps a manually excluded shot out of the medians it would otherwise distort", () => {
    const withIt = classifyShots([
      ...block(13),
      shot({ shotIndex: 99, carryYd: 400, manualOverride: "exclude", isExcluded: true, exclusionReason: "wrong club" }),
    ]);
    const without = classifyShots(block(13));
    expect(withIt.clubStats.get("7 Iron")!.medianCarry).toBeCloseTo(
      without.clubStats.get("7 Iron")!.medianCarry!,
      9,
    );
  });

  it("reads a legacy ledger's hand exclusion, written before manualOverride existed", () => {
    const legacy = shot({ shotIndex: 99, isExcluded: true, exclusionReason: "phone rang" });
    delete (legacy as { manualOverride?: unknown }).manualOverride;
    expect(statusOf(classify([...block(13), legacy]), 99).reviewStatus).toBe("manually-excluded");
  });
});

// ── invariants ──────────────────────────────────────────────────────────────

describe("invariants", () => {
  const shots = [
    ...block(13),
    ...block(13, { club: "Gap Wedge" }, { ...WEDGE, startIndex: 15 }),
    shot({ shotIndex: 98, carryYd: 40, smashFactor: 0.6 }),
    shot({ shotIndex: 99, carryYd: null, isExcluded: true, exclusionReason: "phantom:ball_speed" }),
  ];

  it("never mutates its input", () => {
    const snapshot = JSON.stringify(shots);
    classify(shots);
    expect(JSON.stringify(shots)).toBe(snapshot);
  });

  it("deletes nothing and preserves input order", () => {
    const out = classify(shots);
    expect(out).toHaveLength(shots.length);
    expect(out.map((s) => s.shotIndex)).toEqual(shots.map((s) => s.shotIndex));
  });

  it("gives every shot a status and every flagged shot an explanation", () => {
    for (const s of classify(shots)) {
      expect(s.reviewStatus).toBeTruthy();
      if (s.reviewStatus !== "included") {
        expect(s.explanation).toBeTruthy();
        expect(s.flagReasons.length + (s.reviewStatus === "manually-excluded" ? 1 : 0)).toBeGreaterThan(0);
      }
    }
  });

  it("is a fixed point — classifying the output again changes nothing", () => {
    const once = classify(shots);
    const twice = classify(once);
    expect(twice.map((s) => s.reviewStatus)).toEqual(once.map((s) => s.reviewStatus));
    expect(twice.map((s) => s.flagReasons.join())).toEqual(once.map((s) => s.flagReasons.join()));
  });
});

// ── against the real ledger ─────────────────────────────────────────────────

describe("the real ledger", () => {
  const real: LedgerShot[] = JSON.parse(
    readFileSync(join(__dirname, "..", "..", "data", "shots.json"), "utf8"),
  );

  it("classifies every shot exactly once", () => {
    const out = classify(real);
    expect(out).toHaveLength(real.length);
    expect(out.every((s) => s.reviewStatus !== undefined)).toBe(true);
  });

  it("never excludes a shot from the session that recorded no club data for the absence alone", () => {
    // 2026-07-02T08:42:41 has no club speed and no smash on any of its 45 shots.
    // Absence is allowed to lower certainty and to widen a verdict, never to be
    // the whole of one: something the monitor DID record has to be wrong too.
    const substantive = new Set(["low-carry", "low-smash", "distance-outlier", "possible-partial"]);
    const out = classify(real).filter((s) => s.sessionId === "2026-07-02T08:42:41");
    const untrusted = out.filter((s) => !isTrusted(s) && s.reviewStatus !== "warmup");

    expect(untrusted.length).toBeGreaterThan(0);
    for (const s of untrusted) {
      expect(s.flagReasons.some((r) => substantive.has(r))).toBe(true);
      expect(s.flagReasons).not.toEqual(["missing-data"]);
    }
  });

  it("finds the thin six iron and refuses to call it a partial", () => {
    // 95.4 yd at 100% club speed, smash 1.279, launched 4.3 degrees.
    const s = classify(real).find((x) => x.shotTimestamp === "2026-08-02T20:44:53");
    expect(s?.reviewStatus).toBe("auto-flagged");
    expect(s?.flagReasons).toEqual(["low-carry"]);
  });

  it("finds the full-speed six iron that came off the face badly", () => {
    // 116.2 yd at 103% club speed with smash 0.979 — the brief's mishit case.
    const s = classify(real).find((x) => x.shotTimestamp === "2026-08-02T20:42:59");
    expect(s?.reviewStatus).toBe("auto-flagged");
    expect(s?.flagReasons).toContain("low-smash");
  });

  it("keeps the great majority of the ledger", () => {
    const out = classify(real);
    const trusted = out.filter(isTrusted).length;
    expect(trusted / out.length).toBeGreaterThan(0.65);
  });
});
