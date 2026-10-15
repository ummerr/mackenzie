import { describe, expect, it } from "vitest";
import type { GarminHole, GarminRound, GarminShots } from "../lib/garmin-shots";
import { buildRecentRounds, RECENT_ROUNDS } from "../lib/recent-rounds";
import type { PlayedRound, RoundHistory } from "../lib/round-history";

/* The last ten cards across every ledger. The rules under test are the
 * inherited ones: the window is the last `count` distinct 18-hole cards
 * anchored to the newest card; the watch speaks only through a confirmed
 * link; the chart is positional and is never joined; every row carries both
 * numbers. */

const eighteen = <T,>(v: T): T[] => Array(18).fill(v);

function card(over: Partial<PlayedRound> = {}): PlayedRound {
  return {
    roundId: "r1",
    date: "2026-01-01",
    courseName: "Somewhere Municipal",
    teeName: "White",
    entry: "full",
    holes: 18,
    strokes: 90,
    putts: 36,
    holeStrokes: eighteen(5),
    holePutts: eighteen(2),
    fairwayCodes: eighteen(3),
    penaltyCodes: eighteen(null),
    ...over,
  };
}

/** `n` cards a month apart, newest last, each tagged with its index. */
function cards(n: number, over: (i: number) => Partial<PlayedRound> = () => ({})): PlayedRound[] {
  return Array.from({ length: n }, (_, i) =>
    card({
      roundId: `r${i}`,
      date: `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-15`,
      courseName: `Course ${i}`,
      ...over(i),
    }),
  );
}

function history(rounds: PlayedRound[], over: Partial<RoundHistory> = {}): RoundHistory {
  return {
    capturedAt: "x",
    source: "test",
    handicapIndex: 13,
    rounds: [...rounds].sort((a, b) => a.date.localeCompare(b.date)),
    differentials: [],
    ...over,
  };
}

function watchRound(scorecardId: string, pars: number[], over: Partial<GarminRound> = {}): GarminRound {
  const holes: GarminHole[] = pars.map((par, i) => ({
    number: i + 1,
    strokes: null,
    putts: null,
    par,
    fairwayShotOutcome: null,
    pin: null,
    shots: [],
  }));
  return {
    scorecardId,
    date: "2026-01-01",
    roundType: "ALL",
    courseName: "Somewhere Municipal",
    teeBox: "White",
    teeBoxRating: 70,
    teeBoxSlope: 120,
    holesRecorded: holes.length,
    strokes: null,
    shotCount: 40,
    holes,
    flags: [],
    ...over,
  };
}

const watch = (rounds: GarminRound[]): GarminShots => ({ capturedAt: "x", source: "test", stats: null, rounds });
const noLinks = new Map<string, PlayedRound>();

describe("buildRecentRounds — the window", () => {
  it("is null without a record, and under the minimum — a three-card 'last ten' is an anecdote", () => {
    expect(buildRecentRounds({ roundHistory: null, garminShots: null, linked: noLinks })).toBeNull();
    const thin = history(cards(RECENT_ROUNDS.min - 1));
    expect(buildRecentRounds({ roundHistory: thin, garminShots: null, linked: noLinks })).toBeNull();
  });

  it("takes the last `count` distinct 18-hole cards, anchored to the newest card and never today", () => {
    const rr = buildRecentRounds({ roundHistory: history(cards(14)), garminShots: null, linked: noLinks })!;
    expect(rr.count).toBe(10);
    expect(rr.rounds.map((l) => l.round.roundId)).toEqual(["r4", "r5", "r6", "r7", "r8", "r9", "r10", "r11", "r12", "r13"]);
    expect(rr.asOf).toBe("2025-02-15");
    expect(rr.from).toBe("2024-05-15");
  });

  it("drops nine-hole cards and quick-entry echoes before counting — an echo is a last 9 wearing a costume", () => {
    const rs = cards(12);
    const nine = card({ roundId: "nine", date: "2025-03-01", holes: 9, strokes: 44 });
    const echo = card({
      roundId: "echo",
      date: rs[11].date,
      courseName: rs[11].courseName,
      strokes: rs[11].strokes,
      entry: "total-only",
      holes: 0,
      putts: null,
      holeStrokes: null,
      holePutts: null,
      fairwayCodes: null,
      penaltyCodes: null,
    });
    const rr = buildRecentRounds({ roundHistory: history([...rs, nine, echo]), garminShots: null, linked: noLinks })!;
    expect(rr.rounds.map((l) => l.round.roundId)).not.toContain("nine");
    expect(rr.rounds.map((l) => l.round.roundId)).not.toContain("echo");
    expect(rr.count).toBe(10);
  });
});

describe("buildRecentRounds — each card", () => {
  it("reads putts, fairways and the penalty row off the card itself", () => {
    const rs = cards(10, (i) =>
      i === 9
        ? {
            holePutts: [1, 1, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 2],
            fairwayCodes: [3, 3, 1, 2, 4, 7, 8, null, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
            penaltyCodes: ["D", "SS", null, "W", "F", null, null, null, null, null, null, null, null, null, null, null, null, "O"],
          }
        : {},
    );
    const rr = buildRecentRounds({ roundHistory: history(rs), garminShots: null, linked: noLinks })!;
    const last = rr.rounds[9];
    expect(last.onePutts).toBe(2);
    expect(last.threePutts).toBe(2);
    // 7 and 8 are outside Grint's legend: carried, never read as a miss.
    expect(last.fairways).toEqual({ hit: 12, left: 1, right: 1, missed: 1, classified: 15 });
    expect(last.penaltyStrokes).toBe(3); // D, W, O
    expect(last.bunkerShots).toBe(3); // S, S, F
  });

  it("prints a dash, not a guess, where the watch has no confirmed link", () => {
    const rr = buildRecentRounds({ roundHistory: history(cards(10)), garminShots: null, linked: noLinks })!;
    for (const l of rr.rounds) {
      expect(l.scorecardId).toBeNull();
      expect(l.shotsHeard).toBeNull();
      expect(l.overPar).toBeNull();
      expect(l.doublesOrWorse).toBeNull();
      expect(l.worstHole).toBeNull();
    }
    expect(rr.heard).toBe(0);
    expect(rr.rows.some((r) => r.label === "Over par")).toBe(false);
  });

  it("joins the watch's pars to the card's strokes on a confirmed link: over par, doubles, worst hole", () => {
    const rs = cards(10, (i) =>
      i === 9 ? { holeStrokes: [6, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 8] } : {},
    );
    const pars = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5];
    const g = watch([watchRound("s9", pars)]);
    const linked = new Map([["s9", rs[9]]]);
    const rr = buildRecentRounds({ roundHistory: history(rs), garminShots: g, linked })!;
    const last = rr.rounds[9];
    expect(last.scorecardId).toBe("s9");
    expect(last.shotsHeard).toBe(40);
    expect(last.overPar).toBe(2 + 3); // 6 on a par 4, 8 on a par 5
    expect(last.doublesOrWorse).toBe(2);
    expect(last.worstHole).toEqual({ hole: 18, strokes: 8, par: 5 });
    expect(rr.heard).toBe(1);
    expect(rr.rounds[8].overPar).toBeNull();
  });

  it("leaves over par null when a played hole has no par — a partial sum is invented data", () => {
    const rs = cards(10);
    const pars = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
    const g = watch([watchRound("s9", pars, { holes: watchRound("s9", pars).holes.map((h, i) => (i === 0 ? { ...h, par: null } : h)) })]);
    const rr = buildRecentRounds({ roundHistory: history(rs), garminShots: g, linked: new Map([["s9", rs[9]]]) })!;
    expect(rr.rounds[9].overPar).toBeNull();
    // the holes that do have a par still count toward doubles and the worst hole
    expect(rr.rounds[9].doublesOrWorse).toBe(0);
  });
});

describe("buildRecentRounds — the rows", () => {
  it("carries both numbers on every row — the window beside the career, each with its n", () => {
    const rs = cards(14, (i) => ({ strokes: i < 4 ? 100 : 90 }));
    const rr = buildRecentRounds({ roundHistory: history(rs), garminShots: null, linked: noLinks })!;
    const strokes = rr.rows.find((r) => r.label === "Strokes")!;
    expect(strokes.recent).toBe("90.0 (10 rounds)");
    expect(strokes.career).toContain("14 rounds");
    expect(rr.scoring.mean).toBe(90);
    expect(rr.scoring.careerN).toBe(14);
    for (const r of rr.rows) {
      expect(r.recent).not.toBe("");
      expect(r.career).not.toBe("");
    }
  });

  it("slices the chart by position and says whether its names line up, instead of joining it", () => {
    const rs = cards(12);
    const gir = rs.map((r) => ({ courseName: r.courseName, value: 5 }));
    const aligned = buildRecentRounds({
      roundHistory: history(rs, { series: { girPerRound: gir, parSavesPct: [] } }),
      garminShots: null,
      linked: noLinks,
    })!;
    expect(aligned.chartNamesMatch).toBe(true);
    expect(aligned.rows.find((r) => r.label === "Greens in regulation")?.recent).toBe("5.0 a round (last 10 charted)");

    // The chart carries a point the cards do not (a combined score, say):
    // the slice still renders, and the mismatch is stated, never repaired.
    const skewed = buildRecentRounds({
      roundHistory: history(rs, {
        series: { girPerRound: [...gir, { courseName: "Combined", value: 9 }], parSavesPct: [] },
      }),
      garminShots: null,
      linked: noLinks,
    })!;
    expect(skewed.chartNamesMatch).toBe(false);
    expect(skewed.rows.find((r) => r.label === "Greens in regulation")?.recent).toBe("5.4 a round (last 10 charted)");

    const none = buildRecentRounds({ roundHistory: history(rs), garminShots: null, linked: noLinks })!;
    expect(none.chartNamesMatch).toBeNull();
    expect(none.rows.some((r) => r.label === "Greens in regulation")).toBe(false);
  });

  it("calls the tee miss two-way unless one side owns the lean share", () => {
    const twoWay = buildRecentRounds({
      roundHistory: history(cards(10, () => ({ fairwayCodes: [1, 2, 3, ...eighteen(3).slice(3)] }))),
      garminShots: null,
      linked: noLinks,
    })!;
    expect(twoWay.rows.find((r) => r.label.startsWith("Misses left"))?.note).toBe("two-way");
    const left = buildRecentRounds({
      roundHistory: history(cards(10, () => ({ fairwayCodes: [1, 1, 1, 2, ...eighteen(3).slice(4)] }))),
      garminShots: null,
      linked: noLinks,
    })!;
    expect(left.rows.find((r) => r.label.startsWith("Misses left"))?.note).toBe("leans left");
    expect(left.reads.some((r) => r.includes("leans left"))).toBe(true);
  });

  it("emits a read only where the record has the number for it", () => {
    const rr = buildRecentRounds({
      roundHistory: history(cards(10, () => ({ penaltyCodes: null, fairwayCodes: null }))),
      garminShots: null,
      linked: noLinks,
    })!;
    expect(rr.reads.some((r) => r.startsWith("10 cards from"))).toBe(true);
    expect(rr.reads.some((r) => r.includes("penalty strokes a card"))).toBe(false);
    expect(rr.reads.some((r) => r.startsWith("Fairways"))).toBe(false);
    expect(rr.reads.some((r) => r.includes("Double bogey"))).toBe(false);
  });
});
