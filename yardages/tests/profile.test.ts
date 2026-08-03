import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CourseHistory, PlayedLayout } from "../lib/course-history";
import { meanScore, scorable, totalRounds } from "../lib/course-history";
import type { LedgerSession, LedgerShot } from "../lib/ledger";
import { buildProfile, coneWidthAt, type GolferProfile } from "../lib/profile";
import { applyHeuristics, buildBag, detectGaps, type ClubProfile } from "../lib/stats";
import { buildTasks } from "../lib/tasks";

const DATA = join(__dirname, "..", "data");
const load = <T,>(f: string): T => JSON.parse(readFileSync(join(DATA, f), "utf8")) as T;

function realProfile(history: CourseHistory | null | undefined = undefined): GolferProfile {
  const shots = applyHeuristics(load<LedgerShot[]>("shots.json"));
  const sessions = load<LedgerSession[]>("sessions.json");
  const profiles = buildBag(shots);
  const gaps = detectGaps(profiles);
  return buildProfile({
    shots,
    sessions,
    profiles,
    gaps,
    tasks: buildTasks({ profiles, gaps, shots, sessions }),
    history: history === undefined ? load<CourseHistory>("course-history.json") : history,
  });
}

function layout(over: Partial<PlayedLayout> = {}): PlayedLayout {
  return {
    facility: "Somewhere Municipal",
    facilitySlug: "somewhere-municipal",
    layout: null,
    region: "CA",
    country: "US",
    timesPlayed: 1,
    avgScore: 90,
    shortRounds: false,
    personalRank: 1,
    ratingOverall: 80,
    ratingFun: 80,
    ratingCondition: 80,
    architect: null,
    access: null,
    ...over,
  };
}

function history(played: PlayedLayout[]): CourseHistory {
  return {
    capturedAt: "2026-08-01",
    source: "test",
    facilities: played.length,
    layouts: played.length,
    countries: ["US"],
    usStates: ["CA"],
    played,
  };
}

describe("course history arithmetic", () => {
  it("weights the mean by rounds, not by layouts", () => {
    // A course played nine times is nine times the evidence. Averaging the
    // averages would let one visit to a hard course move the number as much as
    // a season at the home track.
    const h = history([
      layout({ avgScore: 100, timesPlayed: 1 }),
      layout({ avgScore: 80, timesPlayed: 9, facilitySlug: "home" }),
    ]);
    expect(totalRounds(h)).toBe(10);
    expect(meanScore(scorable(h))).toBeCloseTo(82, 5);
  });

  it("holds out the rounds the map flagged as short", () => {
    // The Grint averages 9- and 18-hole rounds into one figure per layout. A 43
    // and a 90 in the same column would make the short courses look easy.
    const h = history([
      layout({ avgScore: 43, shortRounds: true }),
      layout({ avgScore: 90, facilitySlug: "full" }),
    ]);
    expect(scorable(h)).toHaveLength(1);
    expect(meanScore(scorable(h))).toBe(90);
  });

  it("is null rather than zero when nothing is scorable", () => {
    expect(meanScore([])).toBeNull();
  });
});

describe("coneWidthAt", () => {
  it("measures the aim band in yards at the club's own carry", () => {
    // ±5.74° at 100 yd is ±10 yd, so the band is 20 yd wide. The point of the
    // conversion: the same angles are twice the corridor at twice the distance.
    const p = {
      deviationP10Deg: -5.739,
      deviationP90Deg: 5.739,
      medianCarryYd: 100,
    } as ClubProfile;
    expect(coneWidthAt(p)).toBeCloseTo(20, 1);
    expect(coneWidthAt({ ...p, medianCarryYd: 200 } as ClubProfile)).toBeCloseTo(40, 1);
  });

  it("is null when the club has no measured aim", () => {
    expect(
      coneWidthAt({ deviationP10Deg: null, deviationP90Deg: 3, medianCarryYd: 100 } as ClubProfile),
    ).toBeNull();
  });
});

describe("buildProfile — the contract every finding keeps", () => {
  const profile = realProfile();

  it("never ships a claim without evidence or a way to retire it", () => {
    // This is the whole design. A finding with no falsifier is a horoscope.
    expect(profile.findings.length).toBeGreaterThan(0);
    for (const f of profile.findings) {
      expect(f.claim.length).toBeGreaterThan(10);
      expect(f.evidence.length).toBeGreaterThan(10);
      expect(f.falsifiedBy.length).toBeGreaterThan(10);
    }
  });

  it("ranks by how much of the record is behind a finding, not by how bad it sounds", () => {
    const weights = profile.findings.map((f) => f.weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
  });

  it("gives every finding a unique id, so the markdown and the page agree", () => {
    const ids = profile.findings.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("says what it cannot say", () => {
    expect(profile.unknowns.length).toBeGreaterThan(0);
    for (const u of profile.unknowns) expect(u.needs.length).toBeGreaterThan(10);
  });
});

describe("buildProfile — the range half stands alone", () => {
  const rangeOnly = realProfile(null);

  it("drops every course finding rather than guessing at one", () => {
    expect(rangeOnly.rangeOnly).toBe(true);
    expect(rangeOnly.findings.some((f) => f.lens === "course")).toBe(false);
    expect(rangeOnly.findings.some((f) => f.lens === "both")).toBe(false);
  });

  it("names the missing half as a missing half", () => {
    expect(rangeOnly.unknowns.map((u) => u.id)).toContain("no-course-half");
  });
});

describe("buildProfile — findings that must not fire on clean data", () => {
  const shots = applyHeuristics(load<LedgerShot[]>("shots.json"));
  const sessions = load<LedgerSession[]>("sessions.json");

  function findingsFor(h: CourseHistory | null) {
    const profiles = buildBag(shots);
    const gaps = detectGaps(profiles);
    return buildProfile({
      shots,
      sessions,
      profiles,
      gaps,
      tasks: buildTasks({ profiles, gaps, shots, sessions }),
      history: h,
    }).findings;
  }

  it("does not call a one-stroke difference a taste for hard courses", () => {
    // An average of averages moves by a stroke on nothing. Two is a pattern.
    const played = Array.from({ length: 30 }, (_, i) =>
      layout({
        facilitySlug: `c${i}`,
        personalRank: i + 1,
        avgScore: i < 10 ? 89 : 88.5,
      }),
    );
    const ids = findingsFor(history(played)).map((f) => f.id);
    expect(ids).not.toContain("favourites-punish");
  });

  it("does fire when the favourites cost real strokes", () => {
    const played = Array.from({ length: 30 }, (_, i) =>
      layout({
        facilitySlug: `c${i}`,
        personalRank: i + 1,
        avgScore: i < 10 ? 95 : 85,
      }),
    );
    const found = findingsFor(history(played)).find((f) => f.id === "favourites-punish");
    expect(found).toBeDefined();
    expect(found?.claim).toContain("beat you");
  });
});

describe("buildProfile — against the real ledger", () => {
  const profile = realProfile();
  const byId = new Map(profile.findings.map((f) => [f.id, f]));

  it("counts the driver honestly instead of rounding it to none", () => {
    // There is exactly one driver shot on file. "No tee shots at all" would be
    // a rounder sentence and a false one.
    const tee = byId.get("no-tee-game");
    expect(tee).toBeDefined();
    expect(tee?.evidence).toContain("only 1 with a driver");
  });

  it("does not compare a wedge's smash to a long iron's", () => {
    // Smash falls with loft for everyone, so the spread across a bag measures
    // physics. Only an inversion against the neighbouring club is a finding.
    expect(byId.has("strike-spread")).toBe(false);
  });

  it("puts the joined finding at the top, because both halves back it", () => {
    expect(profile.findings[0].lens).toBe("both");
  });
});
