import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LedgerSession, LedgerShot } from "../lib/ledger";
import { buildRoundHistory, type SourceRound } from "../lib/round-history";
import { applyHeuristics, buildBag, detectGaps } from "../lib/stats";
import { buildTasks, rawShotsNeeded, type Task } from "../lib/tasks";

const DATA = join(__dirname, "..", "data");
const load = <T,>(f: string): T => JSON.parse(readFileSync(join(DATA, f), "utf8")) as T;

/* The real ledger, optionally at a threshold other than the default. minShots
 * goes to buildBag and buildTasks together — split them and the shortfall is
 * measured against a line the bag was not drawn at. */
function realTasks(minShots?: number): Task[] {
  const shots = applyHeuristics(load<LedgerShot[]>("shots.json"));
  const sessions = load<LedgerSession[]>("sessions.json");
  const profiles = minShots === undefined ? buildBag(shots) : buildBag(shots, minShots);
  return buildTasks({ profiles, gaps: detectGaps(profiles), shots, sessions, minShots });
}

describe("rawShotsNeeded", () => {
  it("adds warmup and a mishit allowance, rounding up", () => {
    // Coming back one shot short means another whole session suppressed.
    expect(rawShotsNeeded(7)).toBe(12);
    expect(rawShotsNeeded(3)).toBe(7);
  });

  it("asks for nothing when the club already qualifies", () => {
    expect(rawShotsNeeded(0)).toBe(0);
    expect(rawShotsNeeded(-4)).toBe(0);
  });
});

describe("buildTasks — priority is information gain", () => {
  const tasks = realTasks();

  it("puts the unmeasured top of the bag first", () => {
    // The lesson this encodes: an unmeasured club hides a gap entirely, while
    // an under-measured one merely makes it noisy.
    expect(tasks[0].category).toBe("blind spot");
  });

  it("ranks a blind spot above a confirmed gapping problem", () => {
    const blind = tasks.findIndex((t) => t.category === "blind spot");
    const gapping = tasks.findIndex((t) => t.category === "gapping");
    expect(blind).toBeLessThan(gapping);
  });

  it("ranks a cheap coverage win above an expensive one", () => {
    // At the real threshold only the driver is short, so the comparison needs
    // a second short club: at 22 the sand wedge is 3 shots away and the driver
    // is 22. The same bucket of balls unlocks more of the bag via the wedge.
    const raised = realTasks(22);
    const cheap = raised.findIndex((t) => t.id === "coverage-Sand Wedge");
    const dear = raised.findIndex((t) => t.id === "coverage-Driver");
    expect(cheap).toBeGreaterThanOrEqual(0);
    expect(cheap).toBeLessThan(dear);
  });
});

describe("buildTasks — against the real ledger", () => {
  const tasks = realTasks();
  const byId = (id: string) => tasks.find((t) => t.id === id);

  it("asks for the suppressed clubs and nothing else", () => {
    const coverage = tasks.filter((t) => t.category === "coverage").map((t) => t.id);
    // The 6 iron used to be here. The 2026-08-02 evening session took it from
    // 19 shots to 41, so the task retired itself — which is the whole design.
    // The sand wedge went the same way on 2026-08-03: 12 shots to 28.
    expect(coverage.sort()).toEqual(["coverage-Driver"]);
  });

  it("quantifies the shortfall in raw shots, not usable ones", () => {
    // 0 usable of 1 hit; 15 short, so ~21 raw swings once warmup and a mishit
    // or two are paid for. Asking for 15 would come back suppressed again.
    expect(byId("coverage-Driver")!.action).toContain("21");
    expect(byId("coverage-Driver")!.action).toContain("15 more usable");
  });

  it("flags both confirmed holes", () => {
    expect(byId("hole-8 Iron-9 Iron")).toBeDefined();
    expect(byId("hole-Pitching Wedge-Gap Wedge")).toBeDefined();
  });

  it("flags the 7 iron / 8 iron overlap", () => {
    expect(byId("overlap-7 Iron-8 Iron")).toBeDefined();
  });

  it("treats the 7 iron's right bias as unconfirmed, because it is one session", () => {
    const t = byId("bias-7 Iron")!;
    expect(t.evidence).toContain("single session");
    expect(t.action).toContain("different day");
    expect(t.doneWhen).toContain("second session");
  });

  it("raises missing club data once, not once per affected metric", () => {
    // Club speed and smash fail together from one cause; four rows saying the
    // same thing with different nouns is noise, not thoroughness.
    const delivery = tasks.filter((t) => t.category === "data");
    expect(delivery).toHaveLength(1);
    // Counted from the ledger rather than pinned: adding a session must not
    // fail this test, only a second data task would.
    const missing = load<LedgerShot[]>("shots.json").filter((s) => s.smashFactor === null).length;
    expect(delivery[0].title).toContain(String(missing));
    expect(delivery[0].evidence).toContain("2026-07-02");
    expect(delivery[0].evidence).toContain("club speed");
    expect(delivery[0].evidence).toContain("smash factor");
  });

  it("retires a bias once a second real session clears it", () => {
    // Gap Wedge carried an unconfirmed right bias while its only full session
    // was 2026-08-02 — the 4-shot July block was never counted as
    // corroboration. The 2026-08-14 session was the "different day" the task
    // asked for, and it cleared the bias instead of confirming it: the pooled
    // median miss is now inside the 8 yd line, so the task is gone, not
    // reworded — which is the whole design.
    expect(byId("bias-Gap Wedge")).toBeUndefined();
  });

  it("does not invent a task for a metric that is fully populated", () => {
    // Every shot has carry, and spin rate type is Measured throughout.
    expect(tasks.some((t) => t.title.includes("carry"))).toBe(false);
  });

  it("gives every task evidence, an action and a retirement condition", () => {
    for (const t of tasks) {
      expect(t.evidence.length).toBeGreaterThan(20);
      expect(t.action.length).toBeGreaterThan(20);
      expect(t.doneWhen.length).toBeGreaterThan(5);
    }
  });
});

/* The recency tasks are guards for a future capture: on the real record today
 * neither fires, because the recent raw stats sit slightly ahead of career.
 * These synthetic histories exercise both sides of each guard so the tasks
 * cannot silently fire on noise or sleep through a real decline. */

let nextRoundId = 0;
function taskRound(date: string, strokes: number, putts: number | null): SourceRound {
  return {
    roundId: `tr-${++nextRoundId}`,
    entry: "full",
    date,
    courseName: "Test Course",
    teeName: "White",
    holesRecorded: 18,
    totals: { strokes, putts },
    perHole: { strokes: [], putts: [], fairways: [] },
    flags: [],
  };
}

function tasksWithRounds(rounds: SourceRound[]): Task[] {
  const shots = applyHeuristics(load<LedgerShot[]>("shots.json"));
  const sessions = load<LedgerSession[]>("sessions.json");
  const profiles = buildBag(shots);
  const roundHistory = buildRoundHistory({
    capturedAt: "2026-08-19T00:00:00Z",
    rawFile: "test.json",
    handicapIndex: 13.3,
    rounds,
    differentials: [],
  });
  return buildTasks({ profiles, gaps: detectGaps(profiles), shots, sessions, roundHistory });
}

// 20 rounds in 2021 with steady numbers, six inside 18 months of the newest.
const oldRounds = (strokes: number, putts: number) =>
  Array.from({ length: 20 }, (_, i) =>
    taskRound(`2021-${String((i % 12) + 1).padStart(2, "0")}-15`, strokes, putts),
  );
const recentRounds = (strokes: number, putts: number) =>
  Array.from({ length: 6 }, (_, i) => taskRound(`2024-0${i + 1}-01`, strokes, putts));

describe("buildTasks — recency", () => {
  it("fires recent-putting when the recent window gives back more than the threshold", () => {
    const tasks = tasksWithRounds([...oldRounds(88, 30), ...recentRounds(95, 36)]);
    const t = tasks.find((x) => x.id === "recent-putting");
    expect(t).toBeDefined();
    // A newly worsening pattern outranks the confirmed career-long leak (60)
    // and stays under the inverted-gapping blind spots (65).
    expect(t?.priority).toBe(62);
    expect(t?.evidence).toContain("36.0 putts a round");
    expect(t?.doneWhen).toContain("career figure");
  });

  it("stays quiet when recent putting matches career — a task that fires on noise teaches nothing", () => {
    const tasks = tasksWithRounds([...oldRounds(88, 30), ...recentRounds(88, 30)]);
    expect(tasks.some((x) => x.id === "recent-putting")).toBe(false);
    expect(tasks.some((x) => x.id === "recent-scoring")).toBe(false);
  });

  it("fires recent-scoring and names the stat that moved with it", () => {
    const tasks = tasksWithRounds([...oldRounds(88, 30), ...recentRounds(95, 36)]);
    const t = tasks.find((x) => x.id === "recent-scoring");
    expect(t).toBeDefined();
    expect(t?.priority).toBe(62);
    // Putts worsened past their own threshold alongside the scores, so the
    // action points at the greens rather than hand-waving.
    expect(t?.action).toContain("lag drill");
  });

  it("teaches the career three-putt task what the recent window says", () => {
    // Two 3-putts in 18 holes is a share of 0.111 — over the firing threshold —
    // and 34 such rounds clear the 500-hole gate. The career task then carries
    // the recent share beside the career one, per both-numbers-always.
    const putts = [...Array(16).fill("2"), "3", "3"];
    const card = (date: string): SourceRound => ({
      ...taskRound(date, 90, 38),
      perHole: { strokes: Array(18).fill("5"), putts, fairways: Array(18).fill("") },
    });
    const rounds = [
      ...Array.from({ length: 28 }, (_, i) =>
        card(`2021-${String((i % 12) + 1).padStart(2, "0")}-15`),
      ),
      ...Array.from({ length: 6 }, (_, i) => card(`2024-0${i + 1}-01`)),
    ];
    const t = tasksWithRounds(rounds).find((x) => x.id === "three-putts");
    expect(t).toBeDefined();
    expect(t?.evidence).toContain("The last 18 months say the same thing");
    expect(t?.evidence).toContain("108 recent holes");
  });

  it("keeps recent-scoring honest when nothing measured moved with the scores", () => {
    // Scores up, putting flat, no fairway data: the action must say the card
    // cannot itemise the leak, not invent a culprit.
    const tasks = tasksWithRounds([...oldRounds(88, 33), ...recentRounds(95, 33)]);
    const t = tasks.find((x) => x.id === "recent-scoring");
    expect(t).toBeDefined();
    expect(t?.action).toContain("cannot itemise");
  });
});

describe("buildTasks — retires its own tasks", () => {
  it("drops a coverage task once the club clears the threshold", () => {
    // The sand wedge is the worked example: it was on this list until the
    // 2026-08-03 session, and hitting the shots is the only thing that removed
    // it. Raise the bar past what it now has and the task comes back.
    const short = realTasks(22);
    expect(short.some((t) => t.id === "coverage-Sand Wedge")).toBe(true);

    const real = realTasks();
    expect(real.some((t) => t.id === "coverage-Sand Wedge")).toBe(false);
  });

  it("returns nothing at all when there are no sessions", () => {
    expect(buildTasks({ profiles: [], gaps: [], shots: [], sessions: [] })).toEqual([]);
  });
});
