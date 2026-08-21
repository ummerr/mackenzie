import { describe, expect, it } from "vitest";
import { buildCourseHistory, type SourceCourses } from "../lib/course-history";
import {
  asOf,
  buildRoundHistory,
  differentialTail,
  distinctRounds,
  lastNDistinct,
  monthsBefore,
  recentVsCareer,
  since,
  type DifferentialPoint,
  type SourceRound,
  type SourceRounds,
} from "../lib/round-history";

/* The reshape rules used to live in the ingest scripts and were only exercised
 * by running them; now they are lib functions, they get the same treatment as
 * every other pure module. */

function sourceRound(over: Partial<SourceRound> = {}): SourceRound {
  return {
    roundId: "r1",
    entry: "full",
    date: "2024-05-01",
    courseName: "Somewhere Municipal",
    teeName: "White",
    holesRecorded: 18,
    totals: { strokes: 88, putts: 34 },
    perHole: {
      strokes: ["4", "5", "3"],
      putts: ["2", "1", "2"],
      fairways: ["3", "1", ""],
    },
    flags: [],
    ...over,
  };
}

function sourceRounds(rounds: SourceRound[]): SourceRounds {
  return {
    capturedAt: "2026-08-15T00:00:00Z",
    rawFile: "grint-export-2026-08-15.json",
    handicapIndex: 12.9,
    rounds,
    differentials: [],
  };
}

describe("buildRoundHistory", () => {
  it("drops undated rounds", () => {
    const h = buildRoundHistory(sourceRounds([sourceRound(), sourceRound({ date: null })]));
    expect(h.rounds).toHaveLength(1);
    expect(h.rounds[0].date).toBe("2024-05-01");
  });

  it("turns per-hole strings into numbers", () => {
    const h = buildRoundHistory(sourceRounds([sourceRound()]));
    expect(h.rounds[0].holeStrokes).toEqual([4, 5, 3]);
    expect(h.rounds[0].holePutts).toEqual([2, 1, 2]);
  });

  it('coerces "", "0" and null per-hole values to null — an unplayed nine must not count as zero-putt holes', () => {
    const h = buildRoundHistory(
      sourceRounds([
        sourceRound({
          perHole: { strokes: ["4", "0", ""], putts: ["2", "0", null], fairways: ["0", null, "4"] },
        }),
      ]),
    );
    expect(h.rounds[0].holeStrokes).toEqual([4, null, null]);
    expect(h.rounds[0].holePutts).toEqual([2, null, null]);
    expect(h.rounds[0].fairwayCodes).toEqual([null, null, 4]);
  });

  it("carries a missing perHole block through as nulls", () => {
    const h = buildRoundHistory(sourceRounds([sourceRound({ perHole: null })]));
    expect(h.rounds[0].holeStrokes).toBeNull();
    expect(h.rounds[0].holePutts).toBeNull();
    expect(h.rounds[0].fairwayCodes).toBeNull();
  });

  it("names its source after the artifact and the raw file", () => {
    const h = buildRoundHistory(sourceRounds([]));
    expect(h.source).toBe("data/rounds.json (grint-export-2026-08-15.json)");
  });
});

/* The recency helpers window the record; they never correct it. Every test
 * here guards a way a window can quietly lie — counting an echo, trusting
 * file order, or drifting with the wall clock. */

let nextRoundId = 0;
const round = (over: Partial<SourceRound> = {}) =>
  sourceRound({ roundId: `r-${++nextRoundId}`, ...over });

function historyOf(rounds: SourceRound[], differentials: DifferentialPoint[] = []) {
  return buildRoundHistory({ ...sourceRounds(rounds), differentials });
}

describe("asOf", () => {
  it("returns the max date even from an unsorted array — trusting file order is how a stale anchor happens", () => {
    const h = historyOf([
      round({ date: "2024-06-01" }),
      round({ date: "2024-01-01" }),
      round({ date: "2024-03-01" }),
    ]);
    expect(asOf([h.rounds[1], h.rounds[0], h.rounds[2]])).toBe("2024-06-01");
  });

  it("returns null for an empty record", () => {
    expect(asOf([])).toBeNull();
  });
});

describe("monthsBefore", () => {
  it("clamps to the target month's last day — a Date here would overflow Feb 31 into Mar 3", () => {
    expect(monthsBefore("2026-03-31", 1)).toBe("2026-02-28");
  });

  it("knows a leap February", () => {
    expect(monthsBefore("2024-03-31", 1)).toBe("2024-02-29");
  });

  it("crosses a year boundary", () => {
    expect(monthsBefore("2026-08-16", 18)).toBe("2025-02-16");
  });
});

describe("distinctRounds", () => {
  // The real shape in the record: the 2026-06-30 Eagle Vines card exists as a
  // full entry and a total-only quick-entry echo with the same strokes.
  const full = round({ date: "2026-06-30", courseName: "Eagle Vines", totals: { strokes: 90, putts: 32 } });
  const echo = round({
    date: "2026-06-30",
    courseName: "Eagle Vines",
    entry: "total-only",
    holesRecorded: 0,
    totals: { strokes: 90, putts: null },
    perHole: null,
  });

  it('drops a total-only entry twinned with a full card — otherwise "last 5" is silently 4 rounds and an echo', () => {
    const h = historyOf([full, echo]);
    const out = distinctRounds(h.rounds);
    expect(out).toHaveLength(1);
    expect(out[0].entry).toBe("full");
  });

  it("keeps two full cards on one date at one course — that is a 36-hole day, not a duplicate", () => {
    const h = historyOf([full, round({ date: "2026-06-30", courseName: "Eagle Vines", totals: { strokes: 95, putts: 36 } })]);
    expect(distinctRounds(h.rounds)).toHaveLength(2);
  });

  it("keeps a total-only card with different strokes — a quick-entered second round is a round", () => {
    const h = historyOf([
      full,
      round({
        date: "2026-06-30",
        courseName: "Eagle Vines",
        entry: "total-only",
        holesRecorded: 0,
        totals: { strokes: 84, putts: null },
        perHole: null,
      }),
    ]);
    expect(distinctRounds(h.rounds)).toHaveLength(2);
  });
});

describe("lastNDistinct / since", () => {
  it("returns the last n distinct rounds ascending, not the first", () => {
    const h = historyOf([
      round({ date: "2024-01-01" }),
      round({ date: "2024-02-01" }),
      round({ date: "2024-03-01" }),
    ]);
    expect(lastNDistinct(h.rounds, 2).map((r) => r.date)).toEqual(["2024-02-01", "2024-03-01"]);
  });

  it("includes a round dated exactly on the cutoff — an exclusive boundary silently shrinks the window", () => {
    const h = historyOf([round({ date: "2025-02-16" }), round({ date: "2025-02-15" })]);
    expect(since(h.rounds, 18, "2026-08-16").map((r) => r.date)).toEqual(["2025-02-16"]);
  });
});

describe("recentVsCareer", () => {
  it("returns null on an empty record rather than a window measured from nothing", () => {
    expect(recentVsCareer(historyOf([]), 18)).toBeNull();
  });

  it("carries both numbers with both n's — publishing only the recent one hides that recency moved it", () => {
    const h = historyOf([
      round({ date: "2023-01-01", totals: { strokes: 100, putts: 40 } }),
      round({ date: "2024-05-01", totals: { strokes: 80, putts: 30 } }),
      round({ date: "2024-06-01", totals: { strokes: 90, putts: 34 } }),
    ]);
    const form = recentVsCareer(h, 18);
    expect(form).not.toBeNull();
    // Anchored to the newest ROUND (2024-06-01), not today — the record ends in
    // 2024 and must still produce a 2024 window, or `pnpm profile --check`
    // would fail on any day the wall clock disagrees with the data.
    expect(form!.asOf).toBe("2024-06-01");
    expect(form!.cutoff).toBe("2022-12-01");
    expect(form!.scoring.careerN).toBe(3);
    expect(form!.scoring.career).toBe(90);
    // 2023-01-01 is inside 18 months of 2024-06-01, so recent = all three.
    expect(form!.scoring.recentN).toBe(3);
    const shorter = recentVsCareer(h, 6);
    expect(shorter!.scoring.recentN).toBe(2);
    expect(shorter!.scoring.recent).toBe(85);
    expect(shorter!.scoring.career).toBe(90);
  });

  it("counts deduped rounds only — an echo would double one card's weight in the recent mean", () => {
    const h = historyOf([
      round({ date: "2024-05-01", totals: { strokes: 80, putts: 30 } }),
      round({
        date: "2024-05-01",
        entry: "total-only",
        holesRecorded: 0,
        totals: { strokes: 80, putts: null },
        perHole: null,
      }),
      round({ date: "2024-06-01", totals: { strokes: 90, putts: 34 } }),
    ]);
    expect(recentVsCareer(h, 18)!.scoring.recentN).toBe(2);
  });
});

describe("differentialTail", () => {
  const pt = (seq: number, differential: number, trendingHdcp: number): DifferentialPoint => ({
    seq,
    courseName: null,
    differential,
    countsTowardHdcp: true,
    trendingHdcp,
  });

  it("returns null under `window` points — a tail of the whole chart is not a tail", () => {
    expect(differentialTail(historyOf([], [pt(1, 20, 20)]), 12)).toBeNull();
  });

  it("slices the last `window` by position and reads the trending line at the tail's ends", () => {
    const pts = [pt(1, 30, 25), pt(2, 20, 20), pt(3, 10, 15), pt(4, 14, 13)];
    const tail = differentialTail(historyOf([], pts), 2);
    expect(tail).toEqual({ mean: 12, trendingStart: 15, trendingEnd: 13, points: 2 });
  });
});

describe("buildCourseHistory", () => {
  const src: SourceCourses = {
    capturedAt: "2026-08-01T00:00:00Z",
    generatedFrom: "layouts.json + geocache.json + course-polygons.geojson + facts.json",
    stats: { facilities: 2, layouts: 3, countries: ["US"], usStates: ["CA"] },
    facilities: [
      {
        name: "Somewhere Municipal",
        slug: "somewhere-municipal",
        region: "CA",
        country: "US",
        played: true,
        facts: { architect: { value: "A. Person" } },
        layouts: [
          {
            grintLayoutName: null,
            timesPlayed: 3,
            avgScore: 88,
            personalRank: 2,
            played: true,
            flags: [],
            ratings: { overall: 4, fun: 4, condition: 3 },
          },
        ],
      },
      {
        name: "Nine Elsewhere",
        slug: "nine-elsewhere",
        region: "CA",
        country: "US",
        played: true,
        layouts: [
          {
            grintLayoutName: "Front",
            timesPlayed: 1,
            avgScore: 42,
            personalRank: 1,
            played: true,
            flags: ["nine_hole_suspected"],
            ratings: { overall: null, fun: null, condition: null },
          },
          {
            grintLayoutName: "Back",
            timesPlayed: 0,
            avgScore: null,
            personalRank: null,
            played: false,
            flags: [],
            ratings: { overall: null, fun: null, condition: null },
          },
        ],
      },
    ],
  };

  it("keeps only played layouts of played facilities", () => {
    const h = buildCourseHistory(src);
    expect(h.played.map((l) => l.facilitySlug)).toEqual([
      "nine-elsewhere",
      "somewhere-municipal",
    ]);
  });

  it("carries the pipeline's short-round flags as a single boolean", () => {
    const h = buildCourseHistory(src);
    expect(h.played.find((l) => l.facilitySlug === "nine-elsewhere")?.shortRounds).toBe(true);
    expect(h.played.find((l) => l.facilitySlug === "somewhere-municipal")?.shortRounds).toBe(false);
  });

  it("sorts favourite first, never file order", () => {
    const h = buildCourseHistory(src);
    expect(h.played[0].personalRank).toBe(1);
  });

  it("reads facts through to architect and access, absent as null", () => {
    const h = buildCourseHistory(src);
    expect(h.played.find((l) => l.facilitySlug === "somewhere-municipal")?.architect).toBe(
      "A. Person",
    );
    expect(h.played.find((l) => l.facilitySlug === "nine-elsewhere")?.architect).toBeNull();
  });
});
