import { describe, expect, it } from "vitest";
import { GARMIN_THRESHOLDS, type GarminRound, type GarminShots } from "../lib/garmin-shots";
import { buildLeaks, type LeakInputs } from "../lib/leaks";
import type { PlayedRound, RoundHistory } from "../lib/round-history";
import type { ClubProfile } from "../lib/stats";
import type { Task } from "../lib/tasks";

/* ── fixtures ─────────────────────────────────────────────────────────────── */

function playedRound(over: Partial<PlayedRound> = {}): PlayedRound {
  return {
    roundId: "r1",
    date: "2026-08-01",
    courseName: "Somewhere Municipal",
    teeName: "White",
    entry: "full",
    holes: 18,
    strokes: 90,
    putts: 36,
    holeStrokes: Array(18).fill(5),
    holePutts: Array(18).fill(2),
    fairwayCodes: Array(18).fill(3),
    ...over,
  };
}

function history(over: Partial<RoundHistory> = {}): RoundHistory {
  /* 30 rounds across two seasons: a 2022 peak year and a thin recent tail —
   * the shape the sample-size leak exists to describe. */
  const rounds: PlayedRound[] = [];
  for (let i = 0; i < 24; i++) {
    rounds.push(
      playedRound({
        roundId: `r22-${i}`,
        date: `2022-${String((i % 12) + 1).padStart(2, "0")}-10`,
        putts: 36,
        // A three-putt on two holes a round, hit half the fairways, miss both ways.
        holePutts: Array(18).fill(2).map((v, h) => (h < 2 ? 3 : v)),
        fairwayCodes: Array(18)
          .fill(0)
          .map((_, h) => (h % 4 === 0 ? 1 : h % 4 === 1 ? 2 : h % 4 === 2 ? 3 : 4)),
      }),
    );
  }
  for (let i = 0; i < 6; i++) {
    rounds.push(
      playedRound({
        roundId: `r26-${i}`,
        date: `2026-0${(i % 6) + 1}-15`,
        putts: 34,
        holePutts: Array(18).fill(2).map((v, h) => (h < 1 ? 3 : v)),
      }),
    );
  }
  return {
    capturedAt: "2026-08-23T00:00:00Z",
    source: "test",
    handicapIndex: 13.5,
    rounds,
    differentials: [],
    series: {
      girPerRound: rounds.map((r) => ({ courseName: r.courseName, value: 5 })),
      parSavesPct: rounds.map((r) => ({ courseName: r.courseName, value: 15 })),
    },
    ...over,
  };
}

function task(over: Partial<Task> = {}): Task {
  return {
    id: "hole-5 Iron-6 Iron",
    category: "gapping",
    title: "Close the 31 yd hole between 5i and 6i",
    evidence: "…",
    action: "…",
    doneWhen: "…",
    priority: 65,
    done: false,
    ...over,
  };
}

function driverProfile(n: number): ClubProfile {
  return {
    club: "Driver",
    basis: "carry",
    n,
    active: n,
    unusable: 0,
    sessions: 1,
    suppressed: true,
    medianDistanceYd: null,
    distanceP25Yd: null,
    distanceP75Yd: null,
    distanceMinYd: null,
    distanceMaxYd: null,
    offlineP10Yd: null,
    offlineP90Yd: null,
    medianOfflineYd: null,
    deviationP10Deg: null,
    deviationP90Deg: null,
    medianDeviationDeg: null,
    medianBallSpeedMph: null,
    medianClubSpeedMph: null,
    medianSmashFactor: null,
    medianLaunchAngleDeg: null,
    medianBackspinRpm: null,
    sessionSpreadYd: null,
  };
}

function shotBearingRound(id: string, shots: number): GarminRound {
  return {
    scorecardId: id,
    date: "2026-08-20",
    roundType: "ALL",
    courseName: "Somewhere Municipal",
    teeBox: "White",
    teeBoxRating: 70,
    teeBoxSlope: 120,
    holesRecorded: 18,
    strokes: 90,
    shotCount: shots,
    holes: [
      {
        number: 1,
        strokes: 5,
        putts: 2,
        par: 4,
        fairwayShotOutcome: null,
        pin: null,
        shots: Array.from({ length: shots }, (_, i) => ({
          order: i + 1,
          club: "7 Iron",
          clubId: 1,
          shotType: i % 3 === 0 ? ("CHIP" as const) : ("APPROACH" as const),
          meters: 90,
          yards: 100,
          startLie: "Fairway",
          endLie: "Green",
          startMap: null,
          startGeo: null,
          endMap: null,
          endGeo: null,
        })),
      },
    ],
    flags: [],
  };
}

const garmin = (rounds: GarminRound[]): GarminShots => ({
  capturedAt: "2026-08-23T00:00:00Z",
  source: "test",
  rounds,
  stats: null,
});

function inputs(over: Partial<LeakInputs> = {}): LeakInputs {
  return {
    roundHistory: history(),
    garminShots: null,
    profiles: [driverProfile(1)],
    tasks: [task()],
    recentMonths: 18,
    ...over,
  };
}

/* ── the engine ───────────────────────────────────────────────────────────── */

describe("buildLeaks", () => {
  it("is empty without scorecards — a leak without a record behind it is a worry", () => {
    expect(buildLeaks(inputs({ roundHistory: null }))).toEqual([]);
  });

  it("prices what it can and says so: priced leaks outrank unpriced ones", () => {
    const leaks = buildLeaks(inputs());
    const priced = leaks.filter((l) => l.costStrokes !== null);
    const unpriced = leaks.filter((l) => l.costStrokes === null);
    expect(priced.length).toBeGreaterThan(0);
    expect(unpriced.length).toBeGreaterThan(0);
    // Every priced leak sits above every unpriced one.
    const lastPriced = leaks.findIndex((l) => l.costStrokes === null);
    expect(leaks.slice(0, lastPriced).every((l) => l.costStrokes !== null)).toBe(true);
    // Within the priced tier, order is by cost.
    for (let i = 1; i < priced.length; i++) {
      expect(priced[i - 1].costStrokes as number).toBeGreaterThanOrEqual(
        priced[i].costStrokes as number,
      );
    }
  });

  it("ranks the approach ceiling first: 13 missed greens at a 15% save rate", () => {
    const leaks = buildLeaks(inputs());
    expect(leaks[0].id).toBe("gir-ceiling");
    // 18 - 5 GIR = 13 misses, 85% unsaved ≈ 11 bogey-or-worse holes.
    expect(leaks[0].costStrokes).toBeCloseTo(13 * 0.85, 5);
    expect(leaks[0].fact).toContain("5.0 GIR per round");
  });

  it("joins each leak's move to the top open practice task instead of frozen prose", () => {
    const leaks = buildLeaks(inputs());
    const gir = leaks.find((l) => l.id === "gir-ceiling");
    expect(gir?.move).toContain("Close the 31 yd hole between 5i and 6i");
    // A done task is not a move.
    const done = buildLeaks(inputs({ tasks: [task({ done: true })] }));
    expect(done.find((l) => l.id === "gir-ceiling")?.move).not.toContain("31 yd");
  });

  it("prices the putting give-back from the record's own three-putts", () => {
    const leak = buildLeaks(inputs()).find((l) => l.id === "putting-giveback");
    // 24 rounds × 2 + 6 rounds × 1 = 54 three-putts over 30 putted rounds.
    expect(leak?.costStrokes).toBeCloseTo(54 / 30, 5);
    expect(leak?.fact).toContain("own best round used 34");
  });

  it("counts the driver's swings on file, not a frozen sentence", () => {
    const one = buildLeaks(inputs()).find((l) => l.id === "tee-unmeasured");
    expect(one?.fact).toContain("one launch-monitor swing");
    const twenty = buildLeaks(inputs({ profiles: [driverProfile(20)] })).find(
      (l) => l.id === "tee-unmeasured",
    );
    expect(twenty?.fact).toContain("20 launch-monitor swings");
  });

  it("names the peak year against the recent window", () => {
    const leak = buildLeaks(inputs()).find((l) => l.id === "thin-sample");
    expect(leak?.fact).toContain("24 rounds in 2022");
    expect(leak?.cost).toContain("proof");
  });

  describe("the short-game leak and the findings gate", () => {
    it("below the gate it says what exists, not that nothing does", () => {
      const two = garmin([shotBearingRound("a", 10), shotBearingRound("b", 12)]);
      const leak = buildLeaks(inputs({ garminShots: two })).find((l) => l.id === "short-game");
      expect(leak?.title).toBe("The invisible 60 yards");
      expect(leak?.fact).toContain("2 rounds of AutoShot shot data exist, 3 short of a claim");
      expect(leak?.source).toBe("scorecards + watch");
    });

    it("with no watch data at all, the leak is invisible and says so", () => {
      const leak = buildLeaks(inputs()).find((l) => l.id === "short-game");
      expect(leak?.fact).toContain("no shot between fairway and green is recorded anywhere");
      expect(leak?.source).toBe("scorecards");
    });

    it("at the gate the leak upgrades from invisible to located", () => {
      const five = garmin(
        Array.from({ length: GARMIN_THRESHOLDS.minShotRounds }, (_, i) =>
          shotBearingRound(String(i), 12),
        ),
      );
      const leak = buildLeaks(inputs({ garminShots: five })).find((l) => l.id === "short-game");
      expect(leak?.title).toBe("The short game, located");
      expect(leak?.fact).toContain("the watch heard");
      expect(leak?.source).toBe("scorecards + watch");
    });
  });

  it("every leak carries its receipts: a fact, a cost, a move, and a retire condition", () => {
    for (const l of buildLeaks(inputs())) {
      expect(l.fact.length).toBeGreaterThan(0);
      expect(l.cost.length).toBeGreaterThan(0);
      expect(l.move.length).toBeGreaterThan(0);
      expect(l.retiredWhen.length).toBeGreaterThan(0);
      expect(l.weight).toBe(l.costStrokes ?? l.coverage);
    }
  });
});
