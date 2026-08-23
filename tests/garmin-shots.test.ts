import { describe, expect, it } from "vitest";
import {
  asOfGarmin,
  buildGarminShots,
  courseClubDistances,
  fairwayOutcomes,
  GARMIN_THRESHOLDS,
  lieSplit,
  onCourseRecord,
  parTypeScoring,
  puttingRecord,
  shotRounds,
  simRounds,
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
    startMap: { x: 300, y: 500 },
    endMap: { x: 320, y: 220 },
    startGeo: { lat: 37.789174, lon: -122.462697 },
    endGeo: { lat: 37.790293, lon: -122.462828 },
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
    holes: [
      { number: 1, strokes: 5, putts: null, par: 4, fairwayShotOutcome: null, pin: null, shots },
    ],
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
            fairwayShotOutcome: null,
            pin: { lat: 37.789583, lon: -122.463012 },
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

  it("surfaces the map-frame coordinates the diary traces are drawn from", () => {
    // The coordinates ride the surfaced fields, not raw — losing them here
    // would silently blank every trace on the diary page.
    const s = buildGarminShots(src).rounds[0].holes[0].shots[0];
    expect(s.startMap).toEqual({ x: 300, y: 500 });
    expect(s.endMap).toEqual({ x: 320, y: 220 });
  });

  it("surfaces the geographic frame — shot degrees and the hole's pin", () => {
    // The hole drawings project from these; losing them here would silently
    // drop every course drawing back to the bare-trace fallback.
    const h = buildGarminShots(src).rounds[0].holes[0];
    expect(h.pin).toEqual({ lat: 37.789583, lon: -122.463012 });
    expect(h.shots[0].startGeo).toEqual({ lat: 37.789174, lon: -122.462697 });
    expect(h.shots[0].endGeo).toEqual({ lat: 37.790293, lon: -122.462828 });
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

  it("excludes recoveries — a punch-out is deliberately not the club's distance", () => {
    // Ten clean swings around 135 and one 60-yard punch-out from the trees:
    // counting the recovery would print a ten-shot median dragged by a shot
    // that was never trying to go the club's distance.
    const seven = Array.from({ length: 10 }, (_, i) =>
      shot({ club: "7 Iron", yards: 130 + i }),
    );
    const rounds = [
      round({}, [...seven, shot({ club: "7 Iron", shotType: "RECOVERY", yards: 60 })]),
    ];
    expect(courseClubDistances(rounds)).toEqual([
      { club: "7 Iron", shots: 10, medianYd: 134.5 },
    ]);
  });
});

describe("onCourseRecord", () => {
  it("is null with no shot-bearing rounds — a record of nothing is not a record", () => {
    expect(onCourseRecord(record([round({ roundType: "SIMULATION" }, [])]))).toBeNull();
  });

  it("assembles the whole record with its anchors and sample sizes", () => {
    const g = record([
      round({ scorecardId: "1", date: "2026-08-20", strokes: 91 }, [
        shot({ shotType: "TEE", yards: 260 }),
        shot({ startLie: "Rough" }),
      ]),
      round({ scorecardId: "2", date: "2026-08-22", strokes: 98 }, [shot()]),
      round(
        { scorecardId: "3", date: "2026-08-25", roundType: "SIMULATION", flags: ["simulation"] },
        [],
      ),
    ]);
    const oc = onCourseRecord(g);
    expect(oc).not.toBeNull();
    // Anchored to the newest SHOT-BEARING round; the newer sim must not move it.
    expect(oc!.asOf).toBe("2026-08-22");
    expect(oc!.rounds).toBe(2);
    expect(oc!.simRounds).toBe(1);
    expect(oc!.split.shots).toBe(3);
    expect(oc!.split.strokes).toBe(189);
    // Two non-tee shots, verbatim lies.
    expect(oc!.lies).toEqual([
      { lie: "Fairway", shots: 1 },
      { lie: "Rough", shots: 1 },
    ]);
    // No club reaches minShotsPerClub here — held back, not padded.
    expect(oc!.clubs).toEqual([]);
  });
});

describe("screen scorecard readers", () => {
  const holeOf = (par: number, strokes: number, over: object = {}) => ({
    number: 1, strokes, putts: 2, par, fairwayShotOutcome: null, pin: null, shots: [], ...over,
  });

  it("parTypeScoring groups strokes-over-par by par, skipping holes missing either", () => {
    const r = round({
      holes: [
        holeOf(3, 4), holeOf(3, 5), holeOf(5, 5),
        holeOf(4, 5, { strokes: null }), // no strokes — not a scored hole
        holeOf(4, 5, { par: null }),     // no par — nothing to score against
      ] as never,
    });
    expect(parTypeScoring([r])).toEqual([
      { par: 3, holes: 2, meanOverPar: 1.5 },
      { par: 5, holes: 1, meanOverPar: 0 },
    ]);
  });

  it("fairwayOutcomes counts verbatim verdicts and carries the unexpected in `other`", () => {
    const r = round({
      holes: [
        holeOf(4, 5, { fairwayShotOutcome: "HIT" }),
        holeOf(4, 5, { fairwayShotOutcome: "LEFT" }),
        holeOf(4, 5, { fairwayShotOutcome: "RIGHT" }),
        holeOf(4, 5, { fairwayShotOutcome: "RIGHT" }),
        holeOf(4, 5, { fairwayShotOutcome: "LONG" }), //unknown verdict — counted, not redistributed
        holeOf(3, 3), // par 3, no tee-ball verdict
      ] as never,
    });
    expect(fairwayOutcomes([r])).toEqual({ driven: 5, hit: 1, left: 1, right: 2, other: 1 });
  });

  it("puttingRecord counts three-putts over holes that recorded putts", () => {
    const r = round({
      holes: [
        holeOf(4, 5, { putts: 2 }),
        holeOf(4, 6, { putts: 3 }),
        holeOf(4, 7, { putts: 4 }),
        holeOf(4, 5, { putts: null }),
      ] as never,
    });
    expect(puttingRecord([r])).toEqual({ holes: 3, threePutts: 2 });
  });

  it("simRounds selects by the simulation flag, not the roundType string", () => {
    const g = record([
      round({ scorecardId: "1", flags: ["simulation"] }),
      round({ scorecardId: "2" }),
    ]);
    expect(simRounds(g).map((r) => r.scorecardId)).toEqual(["1"]);
  });
});
