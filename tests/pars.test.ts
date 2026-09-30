import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildGarminShots, type GarminRound, type GarminShots, type SourceGarminRounds } from "../lib/garmin-shots";
import { buildParIndex, parCoverage, parsFor } from "../lib/pars";
import { buildRoundHistory, type PlayedRound, type SourceRounds } from "../lib/round-history";

/* Par for a Grint round exists only through a confirmed link to an
 * on-course Garmin card with all 18 pars. No other Grint round has one —
 * a simulator card never lends, and a short card never lends. */

function garminRound(over: Partial<GarminRound> = {}): GarminRound {
  const pars = "444344534443544344".split("").map(Number);
  return {
    scorecardId: "s1",
    date: "2026-09-26",
    roundType: "ALL",
    courseName: "Lincoln Park Golf Course",
    teeBox: "Blue",
    teeBoxRating: 65.5,
    teeBoxSlope: 107,
    holesRecorded: 18,
    strokes: 77,
    shotCount: 40,
    holes: pars.map((par, i) => ({
      number: i + 1,
      strokes: par,
      putts: null,
      par,
      fairwayShotOutcome: null,
      pin: null,
      shots: [],
    })),
    flags: [],
    ...over,
  };
}

const record = (rounds: GarminRound[]): GarminShots => ({
  capturedAt: "2026-09-29",
  source: "test",
  stats: null,
  rounds,
});

const played = (over: Partial<PlayedRound> = {}): PlayedRound => ({
  roundId: "r1",
  date: "2026-09-26",
  courseName: "Lincoln Park Golf Course",
  teeName: "Blue",
  entry: "full",
  holes: 18,
  strokes: 77,
  putts: 29,
  holeStrokes: null,
  holePutts: null,
  fairwayCodes: null,
  ...over,
});

describe("buildParIndex", () => {
  it("lends pars through a confirmed link", () => {
    const idx = buildParIndex(record([garminRound()]), [{ scorecardId: "s1", roundId: "r1" }]);
    expect(parsFor(idx, played())?.length).toBe(18);
    expect(parsFor(idx, played())?.[2]).toBe(4);
    expect(parsFor(idx, played({ roundId: "r2" }))).toBeNull();
  });

  it("never lends from a simulator card or a card missing a par", () => {
    const sim = garminRound({ scorecardId: "sim", flags: ["simulation"] });
    const short = garminRound({ scorecardId: "short" });
    short.holes[7].par = null;
    const idx = buildParIndex(record([sim, short]), [
      { scorecardId: "sim", roundId: "r1" },
      { scorecardId: "short", roundId: "r2" },
    ]);
    expect(idx.size).toBe(0);
  });

  it("is empty without a watch record", () => {
    expect(buildParIndex(null, [{ scorecardId: "s1", roundId: "r1" }]).size).toBe(0);
  });

  it("covers exactly the linked rounds on the real record", () => {
    const g = buildGarminShots(JSON.parse(readFileSync("data/garmin-rounds.json", "utf8")) as SourceGarminRounds);
    const h = buildRoundHistory(JSON.parse(readFileSync("data/rounds.json", "utf8")) as SourceRounds);
    const links = (JSON.parse(readFileSync("data/round-links.json", "utf8")) as { links: { scorecardId: string; roundId: string | null; status: string }[] }).links
      .filter((l) => l.status === "confirmed" && l.roundId !== null)
      .map((l) => ({ scorecardId: l.scorecardId, roundId: l.roundId as string }));
    const idx = buildParIndex(g, links);
    const cov = parCoverage(idx, h);
    expect(cov.known).toBe(links.length);
    expect(cov.of).toBeGreaterThan(cov.known);
  });
});
