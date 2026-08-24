import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildClubIndex,
  parseGarminRound,
  parseHolePars,
  parseShotStats,
  // @ts-expect-error — plain .mjs script module, no type declarations
} from "../scripts/parse-garmin-export.mjs";

/* Fixture-driven, per the house rule: the parser is written against a real
 * captured bundle (fixtures/garmin-export-fixture.json — summary, one
 * 18-hole on-course detail, one 9-hole simulator detail, their holeShots,
 * clubs, clubTypes), never guessed field names. The two cards cover the two
 * capture modes: on-course AutoShot (shots, no per-hole putts, local-offset
 * start time) and R50 simulation (no shots, per-hole putts, UTC start time). */

const fixture = JSON.parse(
  readFileSync(resolve(__dirname, "../fixtures/garmin-export-fixture.json"), "utf8"),
);

const payload = (pred: (r: any) => boolean) => {
  const r = fixture.resources.find(pred);
  return r ? JSON.parse(r.payload.json) : null;
};
const detailOf = (id: string) =>
  payload((r) => r.kind === "scorecardDetail" && String(r.meta.scorecardId) === id);
const holeEntriesOf = (id: string) =>
  payload((r) => r.kind === "holeShots" && String(r.meta.scorecardId) === id)?.holeShots ?? [];
const shotsOf = (id: string) => holeEntriesOf(id).flatMap((h: any) => h.shots ?? []);

/** Garmin semicircles → degrees at the adapter's 1e-6° rounding. */
const deg = (v: number) => Math.round(((v * 180) / 2 ** 31) * 1e6) / 1e6;
const pinsOf = (id: string) =>
  new Map(
    holeEntriesOf(id)
      .filter((h: any) => h.pinPosition)
      .map((h: any) => [
        h.holeNumber,
        { lat: deg(h.pinPosition.lat), lon: deg(h.pinPosition.lon) },
      ]),
  );

const clubIndex = buildClubIndex(
  payload((r) => r.kind === "clubs"),
  payload((r) => r.kind === "clubTypes"),
);

const ON_COURSE = "379752055"; // Presidio, 18 holes, AutoShot
const SIMULATOR = "375908980"; // Pinehurst Cradle, 9 holes, R50 sim

describe("buildClubIndex", () => {
  it("resolves every attested Garmin type to its BAG_ORDER name", () => {
    const unresolved = [...clubIndex.values()].filter(
      (c: any) => c.garminType !== null && c.club === null,
    );
    expect(unresolved).toEqual([]);
  });

  it("carries type name, model, and retirement verbatim", () => {
    const driver = [...clubIndex.values()].find((c: any) => c.garminType === "Driver") as any;
    expect(driver.club).toBe("Driver");
    expect(driver.model).toBe("Taylor Made Stealth 2");
    const threeWood = [...clubIndex.values()].find((c: any) => c.garminType === "3 Wood") as any;
    expect(threeWood.retired).toBe(true);
  });
});

describe("parseGarminRound — on-course AutoShot card", () => {
  const round = parseGarminRound(
    detailOf(ON_COURSE),
    shotsOf(ON_COURSE),
    clubIndex,
    pinsOf(ON_COURSE),
  );

  it("takes the date from the local-offset formattedStartTime, unflagged", () => {
    expect(round.date).toBe("2026-08-22");
    expect(round.startTimeRaw).toBe("2026-08-22T13:11:01-07:00");
    expect(round.flags).not.toContain("date_from_utc");
    expect(round.flags).not.toContain("simulation");
  });

  it("carries course, tee, rating, slope, and par verbatim", () => {
    expect(round.courseName).toBe("Presidio Golf Course");
    expect(round.teeBox).toBe("Black");
    expect(round.teeBoxRating).toBe(72.5);
    expect(round.teeBoxSlope).toBe(136);
    expect(round.holePars).toBe("454344345544343445");
    expect(round.holes[0].par).toBe(4);
    expect(round.holes[2].par).toBe(4);
  });

  it("joins shots to holes and converts meters to yards", () => {
    expect(round.totals.strokes).toBe(98);
    expect(round.totals.shots).toBeGreaterThan(0);
    const first = round.holes[0].shots[0];
    expect(first.meters).toBe(201.426);
    expect(first.yards).toBe(220.3); // 201.426 × 1.0936… rounded to 0.1
    expect(first.club).toBe("3 Hybrid"); // clubId 955153681 per the clubs payload
    expect(first.startLie).toBe("TeeBox");
    expect(first.endLie).toBe("Fairway");
    expect(first.raw.startLoc.lat).toBe(450842403); // verbatim survives
    // The map-frame pixel coordinates are surfaced fields now — the diary's
    // hole traces read them, so a shot whose raw carries x/y must expose them.
    expect(first.startMap).toEqual({ x: first.raw.startLoc.x, y: first.raw.startLoc.y });
    expect(first.endMap).toEqual({ x: first.raw.endLoc.x, y: first.raw.endLoc.y });
  });

  it("surfaces the geographic frame — shot degrees and the day's pins", () => {
    const first = round.holes[0].shots[0];
    // Semicircles → degrees at 1e-6° — the hole drawings project from these.
    expect(first.startGeo).toEqual({
      lat: deg(first.raw.startLoc.lat),
      lon: deg(first.raw.startLoc.lon),
    });
    expect(first.endGeo).toEqual({
      lat: deg(first.raw.endLoc.lat),
      lon: deg(first.raw.endLoc.lon),
    });
    // Every fixture hole carries a pinPosition; each surfaces as the hole's pin.
    const pins = pinsOf(ON_COURSE);
    expect(pins.size).toBeGreaterThan(0);
    for (const h of round.holes) {
      expect(h.pin).toEqual(pins.get(h.number) ?? null);
    }
  });

  it("has no per-hole putts — AutoShot cards do not carry them", () => {
    expect(round.totals.putts).toBeNull();
    expect(round.holes.every((h: any) => h.putts === null)).toBe(true);
  });

  it("orders shots by shotOrder within a hole", () => {
    for (const h of round.holes) {
      const orders = h.shots.map((s: any) => s.order);
      expect(orders).toEqual([...orders].sort((a: number, b: number) => a - b));
    }
  });
});

describe("parseGarminRound — simulator card", () => {
  const round = parseGarminRound(detailOf(SIMULATOR), shotsOf(SIMULATOR), clubIndex);

  it("is flagged simulation and date_from_utc, never silently local", () => {
    expect(round.roundType).toBe("SIMULATION");
    expect(round.flags).toContain("simulation");
    expect(round.flags).toContain("date_from_utc");
    expect(round.date).toBe("2026-08-01");
  });

  it("is a nine-hole card with per-hole putts and no shots", () => {
    expect(round.holesRecorded).toBe(9);
    expect(round.flags).toContain("nine_hole_round");
    expect(round.flags).toContain("no_shots");
    expect(round.totals.strokes).toBe(35);
    expect(round.totals.putts).not.toBeNull();
    expect(round.totals.shots).toBe(0);
    expect(round.courseName).toBe("Pinehurst Resort ~ The Cradle");
  });

  it("defaults every pin to null when no pin map is passed", () => {
    expect(round.holes.every((h: any) => h.pin === null)).toBe(true);
  });
});

describe("parseHolePars", () => {
  it("splits the digit string and rejects anything else", () => {
    expect(parseHolePars("333333333")).toEqual([3, 3, 3, 3, 3, 3, 3, 3, 3]);
    expect(parseHolePars(null)).toBeNull();
    expect(parseHolePars("")).toBeNull();
  });
});

/* The shot-stats detail reader: measurements survive, the model does not.
 * Synthetic payloads because the fixture predates the stats capture — field
 * names copied verbatim from the real bundles (DECISIONS.md 2026-08-24). */

describe("parseShotStats", () => {
  const approachJson = {
    numberOfRounds: 2,
    percentGreenInRegulation: 0.0,
    shotOrientationDetail: [
      {
        remainingDistance: 11.34,
        startingDistanceToHole: 155.38,
        offsetAngle: 31,
        shotId: 10612569098,
        clubId: 950232114,
        scorecardId: 379296644,
        holeNumber: 8,
        startingLieType: "TeeBox",
        endingLieType: "Rough",
        strokesGained: -0.32,
      },
    ],
  };

  it("converts meters to yards and stringifies the ids", () => {
    const rows = parseShotStats("approach", approachJson);
    expect(rows).toHaveLength(1);
    expect(rows[0].scorecardId).toBe("379296644");
    expect(rows[0].shotId).toBe("10612569098");
    expect(rows[0].startingDistanceToHoleM).toBe(155.38);
    expect(rows[0].startingDistanceToHoleYd).toBeCloseTo(169.9, 1);
    expect(rows[0].remainingDistanceYd).toBeCloseTo(12.4, 1);
    expect(rows[0].startingLie).toBe("TeeBox");
    expect(rows[0].endingLie).toBe("Rough");
  });

  it("drops Garmin's model outputs — per-shot strokesGained included", () => {
    const rows = parseShotStats("approach", approachJson);
    expect(rows[0]).not.toHaveProperty("strokesGained");
    // And the view-level aggregate is simply never read.
    expect(JSON.stringify(rows)).not.toContain("percentGreenInRegulation");
  });

  it("keeps the chip view's observed onePuttAfter", () => {
    const rows = parseShotStats("chip", {
      shotOrientationDetail: [
        {
          remainingDistance: 2.1,
          startingDistanceToHole: 21.4,
          shotId: 1,
          scorecardId: 2,
          holeNumber: 4,
          clubId: 3,
          startingLieType: "Bunker",
          endingLieType: "Green",
          onePuttAfter: true,
          strokesGained: -1,
        },
      ],
    });
    expect(rows[0].onePuttAfter).toBe(true);
    expect(rows[0]).not.toHaveProperty("strokesGained");
  });

  it("reads the drive view's dispersion rows", () => {
    const rows = parseShotStats("drive", {
      shotDispersionDetails: [
        {
          shotId: 10625067109,
          scorecardId: 379752055,
          holeNumber: 16,
          shotTime: "2026-08-23T00:33:55.000Z",
          clubId: 950232105,
          dispersionDistance: 64.85,
          shotDistance: 245.8,
          fairwayShotOutcome: "RIGHT",
        },
      ],
    });
    expect(rows[0].shotDistanceYd).toBeCloseTo(268.8, 1);
    expect(rows[0].dispersionDistanceYd).toBeCloseTo(70.9, 1);
    expect(rows[0].fairwayShotOutcome).toBe("RIGHT");
    expect(rows[0].shotTime).toBe("2026-08-23T00:33:55.000Z");
  });

  it("returns [] for a missing payload or an unknown view", () => {
    expect(parseShotStats("approach", null)).toEqual([]);
    expect(parseShotStats("putt", { usingClubtrack: false })).toEqual([]);
  });
});
