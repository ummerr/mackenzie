import { describe, expect, it } from "vitest";
import { buildCourseHistory, type SourceCourses } from "../lib/course-history";
import { buildRoundHistory, type SourceRound, type SourceRounds } from "../lib/round-history";

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
