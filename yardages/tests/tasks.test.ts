import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LedgerSession, LedgerShot } from "../lib/ledger";
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

  it("will not call a bias confirmed on the back of a 4-shot session", () => {
    // Gap Wedge appears in two sessions, but only one has enough shots to have
    // a median. Counting the other as corroboration overstates the evidence.
    const t = byId("bias-Gap Wedge")!;
    expect(t.evidence).toContain("single session");
    expect(t.action).toContain("different day");
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
