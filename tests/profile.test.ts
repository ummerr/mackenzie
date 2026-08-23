import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CourseHistory, PlayedLayout, SourceCourses } from "../lib/course-history";
import { buildCourseHistory, meanScore, scorable, totalRounds } from "../lib/course-history";
import type { LedgerSession, LedgerShot } from "../lib/ledger";
import { buildProfile, coneWidthAt, PROFILE_THRESHOLDS, type GolferProfile } from "../lib/profile";
import {
  buildRoundHistory,
  type DifferentialPoint,
  type RoundHistory,
  type SourceRound,
} from "../lib/round-history";
import { applyHeuristics, buildBag, detectGaps, type ClubProfile } from "../lib/stats";
import { buildTasks } from "../lib/tasks";

const DATA = join(__dirname, "..", "data");
const PUB = join(__dirname, "..", "public", "data");
const load = <T,>(f: string): T => JSON.parse(readFileSync(join(DATA, f), "utf8")) as T;
const realHistory = (): CourseHistory =>
  buildCourseHistory(JSON.parse(readFileSync(join(PUB, "courses.json"), "utf8")) as SourceCourses);

function realProfile(
  history: CourseHistory | null | undefined = undefined,
  roundHistory: RoundHistory | null = null,
): GolferProfile {
  const shots = applyHeuristics(load<LedgerShot[]>("shots.json"));
  const sessions = load<LedgerSession[]>("sessions.json");
  const profiles = buildBag(shots);
  const gaps = detectGaps(profiles);
  return buildProfile({
    shots,
    sessions,
    profiles,
    gaps,
    tasks: buildTasks({ profiles, gaps, shots, sessions, roundHistory }),
    history: history === undefined ? realHistory() : history,
    roundHistory,
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
      medianDistanceYd: 100,
    } as ClubProfile;
    expect(coneWidthAt(p)).toBeCloseTo(20, 1);
    expect(coneWidthAt({ ...p, medianDistanceYd: 200 } as ClubProfile)).toBeCloseTo(40, 1);
  });

  it("is null when the club has no measured aim", () => {
    expect(
      coneWidthAt({ deviationP10Deg: null, deviationP90Deg: 3, medianDistanceYd: 100 } as ClubProfile),
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

/* The round half, previously untested here: the trajectory finding, the
 * recent-form finding, and the recency spec line. Synthetic histories only —
 * these are behavioural guards, and the failure each one names is the reason
 * it exists. */

let nextRoundId = 0;
function srcRound(date: string, strokes: number, over: Partial<SourceRound> = {}): SourceRound {
  return {
    roundId: `pr-${++nextRoundId}`,
    entry: "full",
    date,
    courseName: "Test Course",
    teeName: "White",
    holesRecorded: 18,
    totals: { strokes, putts: 34 },
    perHole: { strokes: [], putts: [], fairways: [] },
    flags: [],
    ...over,
  };
}

function roundHistoryOf(
  rounds: SourceRound[],
  differentials: DifferentialPoint[] = [],
): RoundHistory {
  return buildRoundHistory({
    capturedAt: "2026-08-19T00:00:00Z",
    rawFile: "test.json",
    handicapIndex: 13.3,
    rounds,
    differentials,
  });
}

const diffPt = (seq: number, differential: number, trendingHdcp: number): DifferentialPoint => ({
  seq,
  courseName: null,
  differential,
  countsTowardHdcp: true,
  trendingHdcp,
});

/* 26 rounds ending 2024-06-01: 20 in 2021, six inside 18 months of the newest
 * card. Enough for the round block's minRounds gate and the recent gate both. */
function baseRounds(): SourceRound[] {
  const old = Array.from({ length: 20 }, (_, i) =>
    srcRound(`2021-${String((i % 12) + 1).padStart(2, "0")}-15`, 92),
  );
  const recent = [84, 86, 88, 90, 92, 94].map((s, i) =>
    srcRound(`2024-0${i + 1}-01`, s),
  );
  return [...old, ...recent];
}

/* 40 chart points whose whole arc improves (trending 24 → 13) while the last
 * 12 give strokes back (9.5 → 13) — the shape the real record has today. */
function divergingDiffs(): DifferentialPoint[] {
  const falling = Array.from({ length: 28 }, (_, i) => diffPt(i + 1, 20, 24 - i * 0.5));
  const rising = Array.from({ length: 12 }, (_, i) => diffPt(29 + i, 17, 9.5 + i * 0.32));
  rising[11] = diffPt(40, 17, 13);
  return [...falling, ...rising];
}

/* The same arc with the tail still falling — career and recent form agree. */
function agreeingDiffs(): DifferentialPoint[] {
  return Array.from({ length: 40 }, (_, i) => diffPt(i + 1, 20, 24 - i * 0.28));
}

describe("buildProfile — the round half", () => {
  it("says the career arc and the recent tail point opposite ways when they do — claiming improvement the recent record contradicts is the failure this exists for", () => {
    const p = realProfile(null, roundHistoryOf(baseRounds(), divergingDiffs()));
    const t = p.findings.find((f) => f.id === "trajectory");
    expect(t).toBeDefined();
    expect(t?.claim).toContain("opposite ways");
    // The tail's numbers ride in the evidence, so the reconciliation is checkable.
    expect(t?.evidence).toContain("Over the last 12 chart points");
    expect(t?.evidence).toContain("9.5 to 13.0");
    expect(t?.falsifiedBy).toContain("last 12 differentials");
  });

  it("keeps the single-direction claim when the tail agrees with the arc", () => {
    const p = realProfile(null, roundHistoryOf(baseRounds(), agreeingDiffs()));
    const t = p.findings.find((f) => f.id === "trajectory");
    expect(t).toBeDefined();
    expect(t?.claim).not.toContain("opposite ways");
    expect(t?.claim).toContain("getting better");
  });

  it("emits recent-form with both n's printed and low confidence under ten recent rounds", () => {
    const p = realProfile(null, roundHistoryOf(baseRounds(), divergingDiffs()));
    const f = p.findings.find((x) => x.id === "recent-form");
    expect(f).toBeDefined();
    expect(f?.confidence).toBe("low");
    expect(f?.evidence).toContain("6 distinct 18-hole rounds");
    expect(f?.evidence).toContain("over the career's 26");
  });

  it("stays silent under minRecentRounds — two rounds passing as form is the failure", () => {
    const thin = [
      ...Array.from({ length: 20 }, (_, i) =>
        srcRound(`2021-${String((i % 12) + 1).padStart(2, "0")}-15`, 92),
      ),
      srcRound("2024-04-01", 88),
      srcRound("2024-05-01", 90),
      srcRound("2024-06-01", 92),
    ];
    const p = realProfile(null, roundHistoryOf(thin, divergingDiffs()));
    expect(p.findings.some((f) => f.id === "recent-form")).toBe(false);
    expect(p.recentForm).toBeNull();
  });

  it("anchors the window to the newest round, never today — Date.now creep would break `pnpm profile --check`", () => {
    // The record ends in 2024. On any wall-clock date, the window must still be
    // measured from 2024-06-01 and produce the same object.
    const p = realProfile(null, roundHistoryOf(baseRounds(), divergingDiffs()));
    expect(p.recentForm).not.toBeNull();
    expect(p.recentForm?.asOf).toBe("2024-06-01");
    expect(p.recentForm?.cutoff).toBe("2022-12-01");
  });

  it("computes the Recent scoring spec line over deduped rounds — an echo would move the mean", () => {
    const echo = srcRound("2024-06-01", 94, {
      entry: "total-only",
      holesRecorded: 18,
      perHole: null,
      totals: { strokes: 94, putts: null },
    });
    const p = realProfile(null, roundHistoryOf([...baseRounds(), echo], divergingDiffs()));
    const line = p.spec.find((s) => s.label === "Recent scoring");
    expect(line).toBeDefined();
    // Last 5 distinct: 86, 88, 90, 92, 94. Counting the echo would say 91.6.
    expect(line?.value).toBe("90.0");
    expect(line?.note).toContain("last 5 rounds");
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

describe("buildProfile — the on-course shot half", () => {
  const garminRound = (id: string, date: string, shots: object[]): object => ({
    scorecardId: id,
    date,
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
  });
  const shot = (over: object = {}): object => ({
    order: 1,
    club: "7 Iron",
    clubId: 1,
    shotType: "APPROACH",
    meters: 128,
    yards: 140,
    startLie: "Fairway",
    endLie: "Green",
    ...over,
  });
  const shotsFor = () => [
    shot({ shotType: "TEE", club: "Driver", yards: 220, startLie: "TeeBox" }),
    shot(), shot(), shot({ startLie: "Rough" }),
    shot({ shotType: "CHIP", yards: 15, startLie: "Rough" }),
  ];
  const garminShotsOf = (rounds: object[]): object => ({
    capturedAt: "2026-08-23T00:00:00Z",
    source: "test",
    rounds,
  });
  const withGarmin = (garminShots: object | null): GolferProfile => {
    const shots = applyHeuristics(load<LedgerShot[]>("shots.json"));
    const sessions = load<LedgerSession[]>("sessions.json");
    const profiles = buildBag(shots);
    const gaps = detectGaps(profiles);
    return buildProfile({
      shots,
      sessions,
      profiles,
      gaps,
      tasks: [],
      history: realHistory(),
      roundHistory: null,
      garminShots: garminShots as never,
    });
  };

  it("changes nothing when the shot record is absent — the unknowns stand", () => {
    const p = withGarmin(null);
    expect(p.unknowns.map((u) => u.id)).toContain("short-game");
    expect(p.unknowns.map((u) => u.id)).toContain("lies");
    expect(p.findings.map((f) => f.id)).not.toContain("short-game-share");
    expect(p.sources.find((s) => s.label === "Shots on course")?.detail).toContain(
      "pnpm data:garmin",
    );
  });

  it("keeps the unknowns below minShotRounds, but says what exists", () => {
    const p = withGarmin(
      garminShotsOf([garminRound("1", "2026-08-20", shotsFor()), garminRound("2", "2026-08-22", shotsFor())]),
    );
    const shortGame = p.unknowns.find((u) => u.id === "short-game");
    expect(shortGame).toBeDefined();
    expect(shortGame?.why).toContain("2 round(s) of AutoShot shot data exist");
    expect(p.findings.map((f) => f.id)).not.toContain("short-game-share");
  });

  it("retires short-game and lies above the threshold, and the findings appear", () => {
    const rounds = Array.from({ length: 5 }, (_, i) =>
      garminRound(String(i + 1), `2026-08-1${i}`, shotsFor()),
    );
    const p = withGarmin(garminShotsOf(rounds));
    expect(p.unknowns.map((u) => u.id)).not.toContain("short-game");
    expect(p.unknowns.map((u) => u.id)).not.toContain("lies");
    const ids = p.findings.map((f) => f.id);
    expect(ids).toContain("short-game-share");
    expect(ids).toContain("lie-mix");
    const lieMix = p.findings.find((f) => f.id === "lie-mix");
    // 4 non-tee shots a round: Fairway 2, Rough 2 — the leading named lie.
    expect(lieMix?.evidence).toContain("Fairway 10");
    expect(lieMix?.evidence).toContain("Rough 10");
    const sg = p.findings.find((f) => f.id === "short-game-share");
    // Every share prints its coverage caveat beside it.
    expect(sg?.evidence).toContain("the watch heard");
  });

  it("publishes the on-course record below the gate — the record is not a claim", () => {
    // Two rounds: well under minShotRounds, so no findings — but the record
    // itself must still be on the profile with its sample sizes. Hiding it
    // until the gate would make the gate look like an absence of data.
    const p = withGarmin(
      garminShotsOf([
        garminRound("1", "2026-08-20", shotsFor()),
        garminRound("2", "2026-08-22", shotsFor()),
      ]),
    );
    expect(p.findings.map((f) => f.id)).not.toContain("short-game-share");
    expect(p.onCourse).not.toBeNull();
    expect(p.onCourse?.rounds).toBe(2);
    expect(p.onCourse?.asOf).toBe("2026-08-22");
    expect(p.onCourse?.split.shots).toBe(10);
    expect(p.onCourse?.split.strokes).toBe(180);
  });

  it("has no on-course record without the shot half", () => {
    expect(withGarmin(null).onCourse).toBeNull();
  });

  it("decorates each measured club with its range median, null when the range never measured it", () => {
    // Ten 7 Iron swings (the range has drawn it) and ten 2 Iron swings (no
    // range data exists for it): both clear minShotsPerClub, and the range
    // column must say "number" for one and "null" for the other — a null
    // rangeYd is the course giving a club its first number, not a bug.
    const seven = Array.from({ length: 10 }, () => shot({ yards: 130 }));
    const twoIron = Array.from({ length: 10 }, () => shot({ club: "2 Iron", yards: 200 }));
    const p = withGarmin(
      garminShotsOf([
        garminRound("1", "2026-08-20", seven),
        garminRound("2", "2026-08-22", twoIron),
      ]),
    );
    const clubs = p.onCourse?.clubs ?? [];
    expect(clubs.find((c) => c.club === "7 Iron")?.rangeYd).not.toBeNull();
    expect(clubs.find((c) => c.club === "2 Iron")?.rangeYd).toBeNull();
  });

  it("compares a club to the range only at minShotsPerClub, with the gap in the claim", () => {
    // 10 full-swing 7 Iron shots per the threshold, medians deliberately short
    // of the range number so the direction is fixed.
    const seven = Array.from({ length: 10 }, (_, i) => shot({ yards: 120 + (i % 3) }));
    const rounds = Array.from({ length: 5 }, (_, i) =>
      garminRound(String(i + 1), `2026-08-1${i}`, i === 0 ? seven : shotsFor()),
    );
    const p = withGarmin(garminShotsOf(rounds));
    const f = p.findings.find((x) => x.id === "course-vs-range");
    expect(f).toBeDefined();
    expect(f?.lens).toBe("both");
    expect(f?.evidence).toContain("7 Iron");
    expect(f?.evidence).toContain("on course");
  });
});
