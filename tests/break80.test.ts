import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBenchmarks, type BenchmarkFile } from "../lib/benchmarks";
import {
  approachMisses,
  BREAK80,
  buildBreak80,
  chips,
  doublesPerRound,
  holeViews,
  pinSnapped,
  troublesomeTees,
  upAndDowns,
} from "../lib/break80";
import {
  buildGarminShots,
  type GarminHole,
  type GarminRound,
  type GarminShot,
  type GarminShots,
  type SourceGarminRounds,
} from "../lib/garmin-shots";
import { buildRoundHistory, type PlayedRound, type RoundHistory, type SourceRounds } from "../lib/round-history";

/* The plan prices the record against sourced benchmarks. Each personal
 * number carries its definition; each price prints its arithmetic; a
 * missing benchmark makes a price null, never a guess. The pin-snap rule:
 * a shot whose end is the hole's pin is excluded from any leave or
 * short/long call, but still counts as a chance to get up and down. */

// One degree of latitude ≈ 121,000 yd; 0.0001° ≈ 12 yd north.
const PIN = { lat: 37.78, lon: -122.49 };
const north = (yd: number) => ({ lat: PIN.lat - yd / 121_700, lon: PIN.lon });

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
    startMap: null,
    endMap: null,
    startGeo: north(150),
    endGeo: north(5),
    ...over,
  };
}

function hole(over: Partial<GarminHole> = {}, shots: GarminShot[] = []): GarminHole {
  return { number: 1, strokes: 4, putts: null, par: 4, fairwayShotOutcome: null, pin: PIN, shots, ...over };
}

function round(holes: GarminHole[], over: Partial<GarminRound> = {}): GarminRound {
  return {
    scorecardId: "s1",
    date: "2026-09-26",
    roundType: "ALL",
    courseName: "Test Park",
    teeBox: "Blue",
    teeBoxRating: 70,
    teeBoxSlope: 120,
    holesRecorded: holes.length,
    strokes: 80,
    // A round the watch heard at all — `shotRounds` gates on this, and a
    // scored card with no traced shots is still a heard round in the test.
    shotCount: Math.max(1, holes.reduce((n, h) => n + h.shots.length, 0)),
    holes: holes.map((h, i) => ({ ...h, number: i + 1 })),
    flags: [],
    ...over,
  };
}

const record = (rounds: GarminRound[]): GarminShots => ({ capturedAt: "x", source: "test", stats: null, rounds });

function card(holeStrokes: (number | null)[], holePutts: (number | null)[], over: Partial<PlayedRound> = {}): PlayedRound {
  return {
    roundId: "r1",
    date: "2026-09-26",
    courseName: "Test Park",
    teeName: "Blue",
    entry: "full",
    holes: 18,
    strokes: 80,
    putts: 30,
    holeStrokes,
    holePutts,
    fairwayCodes: null,
    penaltyCodes: null,
    ...over,
  };
}

const linkedTo = (r: GarminRound, c: PlayedRound) => new Map([[r.scorecardId, c]]);

describe("doublesPerRound", () => {
  it("counts two-or-more over par from the card's strokes against the watch's par", () => {
    const r = round([hole({ par: 4 }), hole({ par: 3 }), hole({ par: 5 }), hole({ par: 4 })]);
    const c = card([6, 4, 8, 5], [2, 2, 2, 2]);
    const d = doublesPerRound(holeViews(record([r]), linkedTo(r, c)));
    expect(d.doubles).toBe(2);
    expect(d.holes).toBe(4);
    expect(d.overFromDoubles).toBe(5);
    expect(d.over).toBe(7);
  });
});

describe("upAndDowns", () => {
  it("counts a chip on then one putt, and a holed chip, by the last heard shot", () => {
    const chipOn = shot({ shotType: "CHIP", club: "Lob Wedge", yards: 24, startGeo: north(25), endGeo: north(3), startLie: "Rough" });
    const r = round([
      hole({ par: 4 }, [shot({ shotType: "TEE" }), chipOn]),             // chip on, one putt — bogey save counts
      hole({ par: 4 }, [shot({ shotType: "TEE" }), chipOn]),             // chip on, two putts
      hole({ par: 4 }, [shot({ shotType: "TEE" }), chipOn]),             // holed (0 putts) — for par
      hole({ par: 3 }, [shot({ shotType: "TEE", startGeo: north(150) })]), // GIR hole — not a chance
      hole({ par: 4 }, [shot({ shotType: "TEE" }), shot({ shotType: "CHIP", startGeo: north(25), endLie: "Rough", endGeo: north(8) })]), // chip that missed the green — not a chance
    ]);
    const c = card([5, 5, 4, 3, 6], [1, 2, 0, 2, 2]);
    const ud = upAndDowns(holeViews(record([r]), linkedTo(r, c)));
    expect(ud.chances).toBe(3);
    expect(ud.made).toBe(2);
    expect(ud.madeForPar).toBe(1);
  });

  it("needs the card — an unlinked round has no chances", () => {
    const r = round([hole({}, [shot({ shotType: "CHIP", startGeo: north(20) })])]);
    expect(upAndDowns(holeViews(record([r]), new Map())).chances).toBe(0);
  });
});

describe("troublesomeTees", () => {
  it("is a short wood, a bunker, or a forced recovery — never an iron lay-up", () => {
    const r = round([
      hole({ par: 4, strokes: 6 }, [shot({ shotType: "TEE", club: "Driver", yards: 140, endLie: "Rough" })]),
      hole({ par: 4, strokes: 4 }, [shot({ shotType: "TEE", club: "8 Iron", yards: 159, endLie: "Fairway" })]),
      hole({ par: 4, strokes: 6 }, [shot({ shotType: "TEE", club: "Driver", yards: 250, endLie: "Bunker" })]),
      hole({ par: 5, strokes: 7 }, [shot({ shotType: "TEE", club: "Driver", yards: 240, endLie: "Rough" }), shot({ shotType: "RECOVERY" })]),
      hole({ par: 4, strokes: 4 }, [shot({ shotType: "TEE", club: "Driver", yards: 250, endLie: "Unknown" })]),
      hole({ par: 3, strokes: 3 }, [shot({ shotType: "TEE", club: "7 Iron", yards: 150 })]),
    ]);
    const t = troublesomeTees(holeViews(record([r]), new Map()));
    expect(t.teeShots).toBe(5);
    expect(t.troublesome).toBe(3);
    expect(t.unknownEnd).toBe(1);
    expect(t.overOnTrouble).toBe(2);
    expect(t.overOnRest).toBe(0);
  });
});

describe("approachMisses and chips — the pin-snap rule", () => {
  it("classifies short, long and lateral misses and sets a pin-snapped end aside", () => {
    const snapped = shot({ yards: 130, endLie: "Rough", endGeo: PIN });
    const r = round([
      hole({}, [shot({ yards: 120, endLie: "Rough", endGeo: north(30) })]), // short: 120 of 150, 30 yd away
      hole({}, [shot({ yards: 170, endLie: "Rough", endGeo: north(-20) })]), // long
      hole({}, [shot({ yards: 148, endLie: "Rough", endGeo: north(12) })]), // lateral
      hole({}, [shot({ yards: 150, endLie: "Green" })]),                     // on
      hole({}, [snapped]),
      hole({ par: 3 }, [shot({ shotType: "TEE", yards: 155, endLie: "Bunker", endGeo: north(15) })]), // par-3 tee shot counts
    ]);
    const a = approachMisses(holeViews(record([r]), new Map()));
    expect(pinSnapped(snapped, hole())).toBe(true);
    expect(a.attempts).toBe(6);
    expect(a.onGreen).toBe(1);
    expect(a.short).toBe(1);
    expect(a.long).toBe(1);
    expect(a.lateral).toBe(2);
    expect(a.snapped).toBe(1);
    expect(a.intoBunker).toBe(1);
    expect(a.shortShareOfMisses).toBe(25);
    expect(a.from125to200).toEqual({ attempts: 6, onGreen: 1 });
  });

  it("measures the chip leave only against a pin the watch placed", () => {
    const r = round([
      hole({}, [shot({ shotType: "CHIP", startGeo: north(30), endGeo: north(1) })]),   // inside 6 ft
      hole({}, [shot({ shotType: "CHIP", startGeo: north(30), endGeo: north(8) })]),
      hole({}, [shot({ shotType: "CHIP", startGeo: north(30), endGeo: PIN })]),        // snapped
      hole({}, [shot({ shotType: "CHIP", startGeo: north(30), endLie: "Rough", endGeo: north(3) })]),
    ]);
    const c = chips(holeViews(record([r]), new Map()));
    expect(c.chips).toBe(4);
    expect(c.reachedGreen).toBe(3);
    expect(c.measured).toBe(2);
    expect(c.pinSnapped).toBe(1);
    expect(c.insideSixFt).toBe(1);
  });
});

const B: BenchmarkFile = parseBenchmarks(JSON.parse(readFileSync("data/benchmarks.json", "utf8")));

function history(over: Partial<RoundHistory> = {}): RoundHistory {
  const cards = Array.from({ length: 20 }, (_, i) =>
    card(Array(18).fill(5), Array(18).fill(i % 2 === 0 ? 2 : 3).map((p, h) => (h === 0 ? 3 : p === 3 ? 2 : p)), {
      roundId: `r${i}`,
      date: `2026-08-${String(i + 1).padStart(2, "0")}`,
    }),
  );
  return {
    capturedAt: "2026-09-29",
    source: "test",
    handicapIndex: 13.1,
    rounds: cards,
    differentials: [],
    series: {
      girPerRound: Array.from({ length: 20 }, () => ({ courseName: "x", value: 5 })),
      parSavesPct: Array.from({ length: 20 }, () => ({ courseName: "x", value: 14 })),
    },
    ...over,
  };
}

describe("buildBreak80 — pricing", () => {
  it("prints the arithmetic and prices against the 5 band", () => {
    const chipOn = shot({ shotType: "CHIP", yards: 24, startGeo: north(25), endGeo: north(3), startLie: "Rough" });
    const holes = Array.from({ length: 18 }, () => hole({ par: 4 }, [shot({ shotType: "TEE", club: "Driver", yards: 240, endLie: "Rough" }), chipOn]));
    const r = round(holes);
    // 18 chances, 3 made → 16.7%; every hole a 5 → no doubles; 2 putts except three one-putts.
    const putts = Array(18).fill(2).map((p, i) => (i < 3 ? 1 : p));
    const strokes = Array(18).fill(5).map((s, i) => (i < 3 ? 4 : s));
    const plan = buildBreak80({ roundHistory: history(), garminShots: record([r]), linked: linkedTo(r, card(strokes, putts)), benchmarks: B });
    const short = plan.ledger.find((o) => o.id === "short-game")!;
    expect(short.yours.value).toBe(16.7);
    // 13 missed greens × (47% − 16.7%) = 3.9
    expect(short.strokes).toBe(3.9);
    expect(short.formula).toContain("13 missed greens");
    const app = plan.ledger.find((o) => o.id === "approach")!;
    // (7.6 − 5) × (1 − 0.167) = 2.2
    expect(app.strokes).toBe(2.2);
    expect(plan.ledger[plan.ledger.length - 1].id).toBe("doubles");
    expect(plan.ledger[0].id).toBe("short-game");
    expect(plan.indexGap).toBe(6.6);
    expect(plan.ledgerTotal).not.toBeNull();
  });

  it("prices nothing without benchmarks, and still prints the definitions", () => {
    const plan = buildBreak80({ roundHistory: history(), garminShots: null, linked: new Map(), benchmarks: null });
    for (const o of plan.ledger) {
      expect(o.strokes).toBeNull();
      expect(o.yours.definition.length).toBeGreaterThan(0);
      expect(o.bench5).toBeNull();
    }
    expect(plan.ledgerTotal).toBeNull();
    expect(plan.target.breakShare).toBeNull();
  });

  it("states what a 79 is worth at each course the watch heard", () => {
    const r = round([hole()], { teeBoxRating: 65.5, teeBoxSlope: 107 });
    const plan = buildBreak80({ roundHistory: null, garminShots: record([r]), linked: new Map(), benchmarks: B });
    expect(plan.target.differentialAt[0].differential).toBe(14.3);
    expect(plan.target.score).toBe(BREAK80.targetScore);
  });
});

describe("buildBreak80 — the real record", () => {
  it("reproduces the hand analysis of the five watch rounds (DECISIONS.md 2026-09-29)", () => {
    const g = buildGarminShots(JSON.parse(readFileSync("data/garmin-rounds.json", "utf8")) as SourceGarminRounds);
    const h = buildRoundHistory(JSON.parse(readFileSync("data/rounds.json", "utf8")) as SourceRounds);
    const links = (JSON.parse(readFileSync("data/round-links.json", "utf8")) as { links: { scorecardId: string; roundId: string | null; status: string }[] }).links
      .filter((l) => l.status === "confirmed" && l.roundId !== null);
    const byId = new Map(h.rounds.map((r) => [r.roundId, r]));
    const linked = new Map(links.map((l) => [l.scorecardId, byId.get(l.roundId as string)!]));
    const views = holeViews(g, linked);
    const d = doublesPerRound(views);
    const ud = upAndDowns(views);
    expect(d.holes).toBeGreaterThanOrEqual(90);
    expect(d.doubles).toBeGreaterThanOrEqual(31);
    expect(ud.chances).toBeGreaterThanOrEqual(33);
    expect(ud.made).toBeGreaterThanOrEqual(5);
    const plan = buildBreak80({ roundHistory: h, garminShots: g, linked, benchmarks: B });
    expect(plan.ledgerTotal).not.toBeNull();
    expect(plan.indexGap).not.toBeNull();
    const ratio = (plan.ledgerTotal as number) / (plan.indexGap as number);
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(1.6);
    expect(plan.coverage.pinSnapped).toBeGreaterThan(0);
  });
});
