import { describe, expect, it } from "vitest";
import {
  asOfGarmin,
  buildGarminShots,
  courseClubDistances,
  GARMIN_THRESHOLDS,
  lieSplit,
  shotRounds,
  strokeCategorySplit,
  type GarminRound,
  type GarminShot,
  type GarminShots,
  type SourceGarminRounds,
} from "../lib/garmin-shots";

function shot(over: Partial<GarminShot> = {}): GarminShot {
  return {
    order: 1,
    club: "7 Iron",
    clubId: 1,
    shotType: "APPROACH",
    meters: 128,
    yards: 140,
    startLie: "Fairway",
    endLie: "Green",
    ...over,
  };
}

function round(over: Partial<GarminRound> = {}, shots: GarminShot[] = []): GarminRound {
  return {
    scorecardId: "1",
    date: "2026-08-22",
    roundType: "ALL",
    courseName: "Somewhere Municipal",
    teeBox: "White",
    teeBoxRating: 70,
    teeBoxSlope: 120,
    holesRecorded: 18,
    strokes: 90,
    shotCount: shots.length,
    holes: [{ number: 1, strokes: 5, putts: null, par: 4, shots }],
    flags: [],
    ...over,
  };
}

const record = (rounds: GarminRound[]): GarminShots => ({
  capturedAt: "2026-08-23T00:00:00Z",
  source: "test",
  rounds,
});

describe("buildGarminShots", () => {
  const src: SourceGarminRounds = {
    capturedAt: "2026-08-23T00:00:00Z",
    rawFile: "raw/garmin-export-2026-08-23.json",
    rounds: [
      {
        scorecardId: "10",
        date: "2026-08-22",
        roundType: "ALL",
        courseName: "Somewhere Municipal",
        teeBox: "White",
        teeBoxRating: 70,
        teeBoxSlope: 120,
        holesRecorded: 18,
        totals: { strokes: 90, putts: null, shots: 1 },
        holes: [
          {
            number: 1,
            strokes: 5,
            putts: null,
            par: 4,
            shots: [{ ...shot(), raw: { secret: "never surfaces" } } as never],
          },
        ],
        flags: [],
      },
      {
        scorecardId: "11",
        date: null,
        roundType: "ALL",
        courseName: null,
        teeBox: null,
        teeBoxRating: null,
        teeBoxSlope: null,
        holesRecorded: 0,
        totals: { strokes: null, putts: null, shots: 0 },
        holes: [],
        flags: ["no_date_parsed"],
      },
    ],
  };

  it("reshapes without recomputing, and drops undated rounds", () => {
    const g = buildGarminShots(src);
    expect(g.rounds).toHaveLength(1);
    expect(g.rounds[0].strokes).toBe(90);
    expect(g.rounds[0].shotCount).toBe(1);
    expect(g.rounds[0].holes[0].par).toBe(4);
  });

  it("drops the adapter's raw objects at the seam", () => {
    const g = buildGarminShots(src);
    expect("raw" in (g.rounds[0].holes[0].shots[0] as object)).toBe(false);
  });
});

describe("shotRounds / asOfGarmin", () => {
  it("anchors to the newest SHOT-BEARING round, not the newest round", () => {
    const g = record([
      round({ scorecardId: "1", date: "2026-08-20" }, [shot()]),
      // A newer simulator round with no shots must not move the anchor.
      round({ scorecardId: "2", date: "2026-08-25", roundType: "SIMULATION" }, []),
    ]);
    expect(shotRounds(g).map((r) => r.scorecardId)).toEqual(["1"]);
    expect(asOfGarmin(g)).toBe("2026-08-20");
  });

  it("is null when no round carries a shot", () => {
    expect(asOfGarmin(record([round({}, [])]))).toBeNull();
  });
});

describe("strokeCategorySplit", () => {
  it("classifies by Garmin's shotType first, distance second", () => {
    const rounds = [
      round({ strokes: 10 }, [
        shot({ shotType: "TEE", yards: 220 }),
        shot({ shotType: "APPROACH", yards: 150 }),
        shot({ shotType: "LAYUP", yards: 80 }),
        // An APPROACH inside the short-game line is short game — the label
        // says intent, the distance says what it was.
        shot({ shotType: "APPROACH", yards: GARMIN_THRESHOLDS.shortGameYd }),
        shot({ shotType: "CHIP", yards: 12 }),
        shot({ shotType: "PUTT", yards: 2 }),
        shot({ shotType: "UNKNOWN", yards: 90 }),
      ]),
    ];
    const s = strokeCategorySplit(rounds);
    expect(s).toEqual({
      tee: 1,
      approach: 2,
      shortGame: 2,
      putts: 1,
      other: 1,
      shots: 7,
      strokes: 10,
    });
  });
});

describe("lieSplit", () => {
  it("counts start lies verbatim, excludes the tee box, carries Unknown", () => {
    const rounds = [
      round({}, [
        shot({ shotType: "TEE", startLie: "TeeBox" }),
        shot({ startLie: "Fairway" }),
        shot({ startLie: "Fairway" }),
        shot({ startLie: "Rough" }),
        shot({ startLie: null }),
      ]),
    ];
    expect(lieSplit(rounds)).toEqual([
      { lie: "Fairway", shots: 2 },
      { lie: "Rough", shots: 1 },
      { lie: "Unknown", shots: 1 },
    ]);
  });
});

describe("courseClubDistances", () => {
  it("medians full swings only, and holds a club under minShots back", () => {
    const seven = Array.from({ length: 10 }, (_, i) =>
      shot({ club: "7 Iron", yards: 130 + i }), // median 134.5
    );
    const rounds = [
      round({}, [
        ...seven,
        shot({ club: "7 Iron", shotType: "CHIP", yards: 12 }), // not a full swing
        shot({ club: "Sand Wedge", yards: 70 }), // only 1 shot — held back
        shot({ club: null, yards: 200 }), // no club recorded
      ]),
    ];
    expect(courseClubDistances(rounds)).toEqual([
      { club: "7 Iron", shots: 10, medianYd: 134.5 },
    ]);
  });
});
