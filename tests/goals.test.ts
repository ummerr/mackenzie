import { describe, expect, it } from "vitest";
import type { GarminRound, GarminShots } from "../lib/garmin-shots";
import {
  buildGoalProgress,
  daysAfter,
  METRICS,
  parseGoalsFile,
  proposalForLeak,
  type GoalEntry,
  type GoalInputs,
} from "../lib/goals";
import { LEAK_TARGETS, type Leak } from "../lib/leaks";
import type { PlayedRound, RoundHistory } from "../lib/round-history";

/* Goals run on record time: statuses derive from the newest capture, never
 * the wall clock, so a test (and `pnpm profile --check`) reads the same on
 * any machine on any day. Malformed entries are a rendered state. */

function played(over: Partial<PlayedRound>): PlayedRound {
  return {
    roundId: "r1",
    date: "2026-08-20",
    courseName: null,
    teeName: null,
    entry: "full",
    holes: 18,
    strokes: 90,
    putts: 34,
    holeStrokes: null,
    holePutts: null,
    fairwayCodes: null,
    ...over,
  };
}

function history(over: Partial<RoundHistory> = {}): RoundHistory {
  return {
    capturedAt: "2026-08-23",
    source: "test",
    handicapIndex: null,
    rounds: [played({})],
    differentials: [],
    ...over,
  };
}

function inputs(over: Partial<GoalInputs> = {}): GoalInputs {
  return {
    roundHistory: history(),
    garminShots: null,
    profiles: [],
    wedgeMatrix: null,
    leaks: [],
    tasks: [],
    recentMonths: 18,
    ...over,
  };
}

const goal = (over: Partial<GoalEntry> = {}): GoalEntry => ({
  id: "g1",
  metricId: "gir-last-20",
  target: 9,
  ...over,
});

const file = (weekOf: string, goals: GoalEntry[]) => ({ weeks: [{ weekOf, goals }] });

describe("daysAfter", () => {
  it("does pure UTC calendar arithmetic", () => {
    expect(daysAfter("2026-08-24", 7)).toBe("2026-08-31");
    expect(daysAfter("2026-08-28", 7)).toBe("2026-09-04");
    expect(daysAfter("2026-12-29", 7)).toBe("2027-01-05");
    expect(daysAfter("2024-02-26", 7)).toBe("2024-03-04");
  });
});

describe("parseGoalsFile", () => {
  it("throws only on a shape that cannot be read at all", () => {
    expect(() => parseGoalsFile(null)).toThrow();
    expect(() => parseGoalsFile({ weeks: "no" })).toThrow();
  });

  it("drops malformed weeks and sorts by weekOf", () => {
    const parsed = parseGoalsFile({
      weeks: [
        { weekOf: "2026-09-01", goals: [] },
        { weekOf: "not a date", goals: [] },
        { weekOf: "2026-08-24", goals: [] },
        { badWeek: true },
      ],
    });
    expect(parsed.weeks.map((w) => w.weekOf)).toEqual(["2026-08-24", "2026-09-01"]);
  });
});

describe("buildGoalProgress — record time", () => {
  const gir = (values: number[]) =>
    history({
      rounds: [played({ date: "2026-08-20" })],
      series: {
        girPerRound: values.map((v) => ({ courseName: null, value: v })),
        parSavesPct: [],
      },
    });

  it("a week the record has not outrun stays open when unmet", () => {
    // newest card 2026-08-20; week of 2026-08-18 ends 2026-08-25 → not over.
    const p = buildGoalProgress(file("2026-08-18", [goal()]), inputs({ roundHistory: gir([5]) }));
    expect(p.latest?.over).toBe(false);
    expect(p.latest?.goals[0].status).toBe("open");
  });

  it("a week the record outran goes missed when unmet, achieved when met", () => {
    // newest card 2026-08-20; week of 2026-08-01 ended 2026-08-08 → over.
    const missed = buildGoalProgress(
      file("2026-08-01", [goal()]),
      inputs({ roundHistory: gir([5]) }),
    );
    expect(missed.latest?.goals[0].status).toBe("missed");
    const achieved = buildGoalProgress(
      file("2026-08-01", [goal()]),
      inputs({ roundHistory: gir([9, 10]) }),
    );
    expect(achieved.latest?.goals[0].status).toBe("achieved");
  });

  it("derives status from the record's asOf, never today", () => {
    // Same file, same records → same statuses, whatever day the test runs.
    const a = buildGoalProgress(file("2026-08-18", [goal()]), inputs({ roundHistory: gir([5]) }));
    const b = buildGoalProgress(file("2026-08-18", [goal()]), inputs({ roundHistory: gir([5]) }));
    expect(a).toEqual(b);
    expect(a.asOf).toBe("2026-08-20");
  });

  it("a down-direction metric achieves at or under its target", () => {
    const h = history({
      rounds: Array.from({ length: 3 }, (_, i) =>
        played({
          roundId: `r${i}`,
          date: `2026-08-1${i}`,
          holePutts: Array.from({ length: 18 }, () => 2),
        }),
      ),
    });
    const p = buildGoalProgress(
      file("2026-08-01", [goal({ metricId: "three-putt-share-last-20", target: 10 })]),
      inputs({ roundHistory: h }),
    );
    expect(p.latest?.goals[0].value).toBe(0);
    expect(p.latest?.goals[0].status).toBe("achieved");
  });

  it("renders nonsense as invalid, never a crash", () => {
    const p = buildGoalProgress(
      file("2026-08-01", [
        goal({ metricId: "no-such-metric" }),
        goal({ id: "g2", target: "nine" as unknown as number }),
        goal({ id: "g3", metricId: "usable-shots" }), // needs a club
      ]),
      inputs(),
    );
    expect(p.latest?.goals.map((g) => g.status)).toEqual(["invalid", "invalid", "invalid"]);
    expect(p.latest?.goals[0].label).toContain("unknown metric");
    expect(p.latest?.goals[2].label).toContain("needs a club");
  });

  it("marks an unresolvable leak join as orphaned but still measures", () => {
    const p = buildGoalProgress(
      file("2026-08-18", [goal({ leakId: "long-retired-leak" })]),
      inputs({ roundHistory: gir([5]) }),
    );
    const g = p.latest!.goals[0];
    expect(g.status).toBe("open");
    expect(g.orphaned).toContain("long-retired-leak");
  });

  it("the newest committed week is latest — position, not the clock", () => {
    const p = buildGoalProgress(
      {
        weeks: [
          { weekOf: "2026-08-10", goals: [goal()] },
          { weekOf: "2026-08-18", goals: [goal({ id: "g2" })] },
        ],
      },
      inputs({ roundHistory: gir([5]) }),
    );
    expect(p.latest?.weekOf).toBe("2026-08-18");
  });

  it("with no goals file there are no weeks and no latest", () => {
    const p = buildGoalProgress(null, inputs());
    expect(p.weeks).toEqual([]);
    expect(p.latest).toBeNull();
  });
});

describe("goal proposals agree with the leak targets", () => {
  const leak = (id: string): Leak => ({
    id,
    title: id,
    fact: "",
    cost: "",
    move: "",
    retiredWhen: "",
    source: "scorecards",
    costStrokes: null,
    coverage: 0,
    weight: 0,
  });

  it("gir-ceiling proposes the leak's own retire target", () => {
    const p = proposalForLeak(leak("gir-ceiling"));
    expect(p).toMatchObject({ metricId: "gir-last-20", target: LEAK_TARGETS.girPerRound });
  });

  it("putting-giveback proposes the three-putt retire line as a share", () => {
    const p = proposalForLeak(leak("putting-giveback"));
    expect(p).toMatchObject({
      metricId: "three-putt-share-last-20",
      target: 100 / LEAK_TARGETS.threePuttHoles,
    });
  });

  it("every proposed metric exists in the registry", () => {
    for (const id of ["gir-ceiling", "putting-giveback", "thin-sample", "short-game", "tee-unmeasured"]) {
      const p = proposalForLeak(leak(id));
      expect(p).not.toBeNull();
      expect(METRICS[p!.metricId]).toBeDefined();
    }
  });
});

describe("METRICS — the watch metrics", () => {
  const round = (id: string, flags: string[] = [], shotCount = 1): GarminRound => ({
    scorecardId: id,
    date: "2026-08-22",
    roundType: flags.includes("simulation") ? "SIMULATION" : "ALL",
    courseName: null,
    teeBox: null,
    teeBoxRating: null,
    teeBoxSlope: null,
    holesRecorded: 18,
    strokes: null,
    shotCount,
    holes: [],
    flags,
  });
  const g: GarminShots = {
    capturedAt: "2026-08-23",
    source: "test",
    rounds: [round("1"), round("2"), round("3", ["simulation"], 0)],
    stats: null,
  };

  it("counts shot-bearing rounds, not sim scorecards", () => {
    expect(METRICS["shot-bearing-rounds"].compute(inputs({ garminShots: g }), null).value).toBe(2);
  });

  it("uses the watch asOf when it is newer than the cards'", () => {
    const p = buildGoalProgress(
      file("2026-08-18", [goal()]),
      inputs({ roundHistory: history(), garminShots: g }),
    );
    expect(p.asOf).toBe("2026-08-22");
  });
});
