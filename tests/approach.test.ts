import { describe, expect, it } from "vitest";
import { approachBands } from "../lib/approach";
import type { ApproachDetail, GarminRound, GarminShots } from "../lib/garmin-shots";

/* The <150 bands: every number derivable from measurements, course and sim
 * never pooled, the record published at any n with `gated` saying whether
 * claims may fire (DECISIONS.md 2026-08-24). */

function round(scorecardId: string, flags: string[] = []): GarminRound {
  return {
    scorecardId,
    date: "2026-08-20",
    roundType: flags.includes("simulation") ? "SIMULATION" : "ALL",
    courseName: null,
    teeBox: null,
    teeBoxRating: null,
    teeBoxSlope: null,
    holesRecorded: 18,
    strokes: null,
    shotCount: flags.includes("simulation") ? 0 : 1,
    holes: [],
    flags,
  };
}

function row(over: Partial<ApproachDetail>): ApproachDetail {
  return {
    shotId: null,
    scorecardId: "1",
    holeNumber: null,
    clubId: null,
    startingDistanceToHoleM: null,
    startingDistanceToHoleYd: null,
    remainingDistanceM: null,
    remainingDistanceYd: null,
    offsetAngleDeg: null,
    startingLie: null,
    endingLie: null,
    ...over,
  };
}

function shots(rounds: GarminRound[], approach: ApproachDetail[]): GarminShots {
  return {
    capturedAt: "2026-08-23",
    source: "test",
    rounds,
    stats: { approach, chip: [], drive: [] },
  };
}

describe("approachBands", () => {
  it("is null without a stats block or without approach rows", () => {
    expect(approachBands(null)).toBeNull();
    expect(
      approachBands({ capturedAt: "", source: "", rounds: [], stats: null }),
    ).toBeNull();
    expect(approachBands(shots([round("1")], []))).toBeNull();
  });

  it("buckets by starting distance with [min, max) edges", () => {
    const g = shots(
      [round("1")],
      [
        row({ startingDistanceToHoleYd: 99.9 }),
        row({ startingDistanceToHoleYd: 100 }),
        row({ startingDistanceToHoleYd: 149.9 }),
        row({ startingDistanceToHoleYd: 150 }),
      ],
    );
    const bands = approachBands(g)!.course.bands;
    expect(bands.map((b) => b.attempts)).toEqual([1, 2, 1]);
  });

  it("counts a green hit only when Garmin's ending lie says Green", () => {
    const g = shots(
      [round("1")],
      [
        row({ startingDistanceToHoleYd: 120, endingLie: "Green", remainingDistanceYd: 10 }),
        row({ startingDistanceToHoleYd: 130, endingLie: "Rough", remainingDistanceYd: 30 }),
        row({ startingDistanceToHoleYd: 140, endingLie: "Unknown", remainingDistanceYd: 20 }),
      ],
    );
    const mid = approachBands(g)!.course.bands[1];
    expect(mid.greensHit).toBe(1);
    expect(mid.greenHitPct).toBeCloseTo(33.3, 1);
    expect(mid.medianProximityYd).toBe(20);
  });

  it("aggregates inside-150 across its two bands", () => {
    const g = shots(
      [round("1")],
      [
        row({ startingDistanceToHoleYd: 80, endingLie: "Green" }),
        row({ startingDistanceToHoleYd: 120, endingLie: "Green" }),
        row({ startingDistanceToHoleYd: 120, endingLie: "Rough" }),
        row({ startingDistanceToHoleYd: 170, endingLie: "Green" }),
      ],
    );
    const { inside150 } = approachBands(g)!.course;
    expect(inside150.attempts).toBe(3);
    expect(inside150.greensHit).toBe(2);
    expect(inside150.greenHitPct).toBeCloseTo(66.7, 1);
  });

  it("never pools course and sim rows", () => {
    const g = shots(
      [round("1"), round("2", ["simulation"])],
      [
        row({ scorecardId: "1", startingDistanceToHoleYd: 120 }),
        row({ scorecardId: "2", startingDistanceToHoleYd: 120 }),
      ],
    );
    const r = approachBands(g)!;
    expect(r.course.attempts).toBe(1);
    expect(r.sim.attempts).toBe(1);
  });

  it("publishes the record below the gate, gated", () => {
    const g = shots([round("1")], [row({ startingDistanceToHoleYd: 120 })]);
    const r = approachBands(g)!;
    expect(r.course.attempts).toBe(1);
    expect(r.gated).toBe(true);
  });

  it("ungates at minShotRounds distinct course rounds", () => {
    const ids = ["1", "2", "3", "4", "5"];
    const g = shots(
      ids.map((id) => round(id)),
      ids.map((id) => row({ scorecardId: id, startingDistanceToHoleYd: 120 })),
    );
    expect(approachBands(g)!.gated).toBe(false);
  });
});
