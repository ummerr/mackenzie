/* The wedge matrix: labeled blocks, their classification, and the cell stats.
 *
 * The load-bearing assertions are the isolation ones: a labeled block must
 * change NOTHING about the full-swing pipeline except its own absence from it.
 * The real-ledger tests are written so adding a session cannot break them —
 * everything is recomputed from the file, never pinned.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LedgerSession, LedgerShot } from "../lib/ledger";
import { applyHeuristics, buildBag, detectGaps, type ClubProfile } from "../lib/stats";
import { buildTasks } from "../lib/tasks";
import {
  buildWedgeMatrix,
  cellOf,
  matchBlocks,
  parseWedgeBlocks,
  WEDGE_MATRIX_THRESHOLDS,
  type WedgeBlock,
  type WedgeCell,
  type WedgeMatrix,
} from "../lib/wedge-matrix";
import { classifyShots } from "../lib/yardages/classify-shot";
import { block, shot, statusOf } from "./yardages/factory";

const DATA = join(__dirname, "..", "data");
const load = <T,>(f: string): T => JSON.parse(readFileSync(join(DATA, f), "utf8")) as T;

/* A deliberate ¾ Gap Wedge block: one shared timestamp so a from = to range
 * claims exactly these shots and nothing the factory numbered elsewhere. */
const BLOCK_TS = "2026-07-01T11:00:00";
const gwBlock = (): WedgeBlock => ({
  sessionId: "2026-07-01T10:00:00",
  club: "Gap Wedge",
  swing: "three-quarter",
  from: BLOCK_TS,
  to: BLOCK_TS,
});
const labeledShots = (over = {}) =>
  block(
    13,
    { club: "Gap Wedge", shotTimestamp: BLOCK_TS, ...over },
    { carry: 75, clubSpeed: 60, smash: 1.09, startIndex: 100 },
  );
const fullShots = () =>
  block(13, { club: "Gap Wedge" }, { carry: 98, clubSpeed: 75, smash: 1.09, startIndex: 0 });

describe("parseWedgeBlocks", () => {
  it("keeps a well-formed entry and drops nothing silently", () => {
    const f = parseWedgeBlocks({ blocks: [gwBlock()] });
    expect(f.blocks).toHaveLength(1);
    expect(f.warnings).toHaveLength(0);
  });

  it("refuses a 'full' label — the stock yardage is the only source for that number", () => {
    const f = parseWedgeBlocks({ blocks: [{ ...gwBlock(), swing: "full" }] });
    expect(f.blocks).toHaveLength(0);
    expect(f.warnings[0]).toMatch(/full swing/);
  });

  it("refuses a non-wedge club and an inverted range, each with its reason", () => {
    const f = parseWedgeBlocks({
      blocks: [
        { ...gwBlock(), club: "7 Iron" },
        { ...gwBlock(), from: "2026-07-01T12:00:00" },
      ],
    });
    expect(f.blocks).toHaveLength(0);
    expect(f.warnings).toHaveLength(2);
    expect(f.warnings[0]).toMatch(/not a wedge/);
    expect(f.warnings[1]).toMatch(/after/);
  });

  it("treats a missing or malformed file shape as empty, not a crash", () => {
    expect(parseWedgeBlocks(null).blocks).toHaveLength(0);
    expect(parseWedgeBlocks({}).blocks).toHaveLength(0);
    expect(parseWedgeBlocks({ blocks: "nope" }).blocks).toHaveLength(0);
  });
});

describe("matchBlocks", () => {
  it("matches on session, club and inclusive timestamp range", () => {
    const shots = [...fullShots(), ...labeledShots()];
    const { byShot, warnings } = matchBlocks(shots, [gwBlock()]);
    expect(byShot.size).toBe(13);
    expect(warnings).toHaveLength(0);
    for (const i of byShot.keys()) expect(shots[i].shotTimestamp).toBe(BLOCK_TS);
  });

  it("reports a block that matches no shot — the orphaned-override treatment", () => {
    const { byShot, warnings } = matchBlocks(fullShots(), [gwBlock()]);
    expect(byShot.size).toBe(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/matches no shot/);
  });

  it("gives an overlapping shot to the first block and says so", () => {
    const twice = [gwBlock(), { ...gwBlock(), swing: "half" as const }];
    const { byShot, warnings } = matchBlocks(labeledShots(), twice);
    expect(byShot.size).toBe(13);
    for (const b of byShot.values()) expect(b.swing).toBe("three-quarter");
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/more than one block/);
  });
});

describe("classifyShots with labeled blocks", () => {
  it("labels every block shot and leaves the club's full-swing median alone", () => {
    const shots = [...fullShots(), ...labeledShots()];
    const withBlocks = classifyShots(shots, undefined, [gwBlock()]);
    for (let i = 100; i < 113; i += 1) {
      expect(statusOf(withBlocks.shots, i).reviewStatus).toBe("labeled-partial");
    }
    // The full-swing pool never saw the 75 yd block: median is the full block's centre.
    expect(withBlocks.clubStats.get("Gap Wedge")!.medianCarry).toBe(98);
    // Without the label the same shots pollute the pool and the median moves.
    const without = classifyShots(shots);
    expect(without.clubStats.get("Gap Wedge")!.medianCarry).not.toBe(98);
  });

  it("does not let a labeled block consume the full-swing warmup slots", () => {
    /* The labeled block sits FIRST in shot order (indexes 100+ vs 0+ would put
     * it last, so flip: label the low indexes). The first three full swings
     * after it must still be warmup — a half swing warms nothing up for the
     * full-swing record. */
    const labeledFirst = block(
      13,
      { club: "Gap Wedge", shotTimestamp: BLOCK_TS },
      { carry: 75, clubSpeed: 60, smash: 1.09, startIndex: 0 },
    );
    const fullAfter = block(
      13,
      { club: "Gap Wedge" },
      { carry: 98, clubSpeed: 75, smash: 1.09, startIndex: 100 },
    );
    const r = classifyShots([...labeledFirst, ...fullAfter], undefined, [gwBlock()]);
    expect(statusOf(r.shots, 100).reviewStatus).toBe("warmup");
    expect(statusOf(r.shots, 101).reviewStatus).toBe("warmup");
    expect(statusOf(r.shots, 102).reviewStatus).toBe("warmup");
    expect(statusOf(r.shots, 103).reviewStatus).toBe("included");
  });

  it("lets phantom and manual exclusion win over the label, and the label win over manual include", () => {
    const shots = [...fullShots(), ...labeledShots()];
    const at = (shotIndex: number) => shots.findIndex((s) => s.shotIndex === shotIndex);
    shots[at(100)] = shot({
      ...shots[at(100)],
      isExcluded: true,
      exclusionReason: "phantom:ball_speed",
    });
    shots[at(101)] = shot({ ...shots[at(101)], manualOverride: "exclude" });
    shots[at(102)] = shot({ ...shots[at(102)], manualOverride: "include" });
    const r = classifyShots(shots, undefined, [gwBlock()]);
    expect(statusOf(r.shots, 100).reviewStatus).toBe("phantom");
    expect(statusOf(r.shots, 101).reviewStatus).toBe("manually-excluded");
    expect(statusOf(r.shots, 102).reviewStatus).toBe("labeled-partial");
  });

  it("reproduces pre-matrix behavior exactly when blocks are null or empty", () => {
    const shots = [...fullShots(), ...labeledShots()];
    const bare = classifyShots(shots).shots.map((s) => s.reviewStatus);
    expect(classifyShots(shots, undefined, null).shots.map((s) => s.reviewStatus)).toEqual(bare);
    expect(classifyShots(shots, undefined, []).shots.map((s) => s.reviewStatus)).toEqual(bare);
  });

  it("classifies twice the same as once — the idempotence contract", () => {
    const shots = [...fullShots(), ...labeledShots()];
    const once = classifyShots(shots, undefined, [gwBlock()]);
    const twice = classifyShots(once.shots, undefined, [gwBlock()]);
    expect(twice.shots.map((s) => s.reviewStatus)).toEqual(
      once.shots.map((s) => s.reviewStatus),
    );
  });
});

describe("buildWedgeMatrix", () => {
  const classified = (shots: LedgerShot[], blocks: WedgeBlock[]) =>
    applyHeuristics(shots, undefined, blocks);

  it("builds the labeled cell: warmup stripped, gate cleared, median on the block", () => {
    const blocks = [gwBlock()];
    const shots = classified([...fullShots(), ...labeledShots()], blocks);
    const m = buildWedgeMatrix(shots, blocks, buildBag(shots));
    expect(m.cells).toHaveLength(12); // 4 wedges × 3 swings, always
    const cell = cellOf(m, "Gap Wedge", "three-quarter")!;
    expect(cell.n).toBe(13);
    expect(cell.active).toBe(10); // 3 block warmup swings stripped
    expect(cell.suppressed).toBe(false); // 10 ≥ the 8-shot gate
    expect(cell.medianCarryYd).toBe(75);
    expect(cell.sessions).toBe(1);
  });

  it("flags a mishit inside a block against the CELL pool, not the club pool", () => {
    const blocks = [gwBlock()];
    const fat = shot({
      club: "Gap Wedge",
      shotTimestamp: BLOCK_TS,
      shotIndex: 120,
      carryYd: 45,
      clubSpeedMph: 60,
      smashFactor: 0.75,
    });
    const shots = classified([...fullShots(), ...labeledShots(), fat], blocks);
    const m = buildWedgeMatrix(shots, blocks, buildBag(shots));
    const cell = cellOf(m, "Gap Wedge", "three-quarter")!;
    expect(cell.n).toBe(14);
    expect(cell.active).toBe(10); // the fat one is out, the ten good ones stay
    expect(cell.medianCarryYd).toBe(75); // and the median never saw it
  });

  it("reads the full row verbatim from the stock yardage — one source, never two", () => {
    const blocks = [gwBlock()];
    const shots = classified([...fullShots(), ...labeledShots()], blocks);
    const profiles = buildBag(shots);
    const m = buildWedgeMatrix(shots, blocks, profiles);
    const full = cellOf(m, "Gap Wedge", "full")!;
    const p = profiles.find((x) => x.club === "Gap Wedge")!;
    expect(full.source).toBe("stock");
    expect(full.medianCarryYd).toBe(p.medianDistanceYd);
    expect(full.active).toBe(p.active);
    expect(full.suppressed).toBe(p.suppressed);
  });

  it("holds below the gate: a 7-shot block shows its count and no number", () => {
    /* 10 raw − 3 warmup = 7 usable, one under minShotsPerCell. */
    const short = block(
      10,
      { club: "Gap Wedge", shotTimestamp: BLOCK_TS },
      { carry: 75, clubSpeed: 60, smash: 1.09, startIndex: 100 },
    );
    const blocks = [gwBlock()];
    const shots = classified([...fullShots(), ...short], blocks);
    const m = buildWedgeMatrix(shots, blocks, buildBag(shots));
    const cell = cellOf(m, "Gap Wedge", "three-quarter")!;
    expect(cell.active).toBe(7);
    expect(cell.active).toBeLessThan(WEDGE_MATRIX_THRESHOLDS.minShotsPerCell);
    expect(cell.suppressed).toBe(true);
    // The number exists for the coverage line but the cell is marked unshowable.
    expect(cell.n).toBe(10);
  });
});

/* ── the tasks the matrix generates ─────────────────────────────────────── */

const prof = (club: string, medianYd: number, over: Partial<ClubProfile> = {}): ClubProfile => ({
  club,
  basis: "carry",
  n: 20,
  active: 20,
  unusable: 0,
  sessions: 2,
  suppressed: false,
  medianDistanceYd: medianYd,
  distanceP25Yd: medianYd - 2,
  distanceP75Yd: medianYd + 2,
  distanceMinYd: medianYd - 5,
  distanceMaxYd: medianYd + 5,
  offlineP10Yd: -5,
  offlineP90Yd: 5,
  medianOfflineYd: 0,
  deviationP10Deg: -2,
  deviationP90Deg: 2,
  medianDeviationDeg: 0,
  medianBallSpeedMph: 80,
  medianClubSpeedMph: 70,
  medianSmashFactor: 1.1,
  medianLaunchAngleDeg: 25,
  medianBackspinRpm: 8000,
  sessionSpreadYd: 2,
  ...over,
});

const cell = (
  club: string,
  swing: WedgeCell["swing"],
  medianCarryYd: number | null,
  over: Partial<WedgeCell> = {},
): WedgeCell => ({
  club,
  swing,
  source: swing === "full" ? "stock" : "blocks",
  n: 13,
  active: 10,
  sessions: 1,
  suppressed: false,
  medianCarryYd,
  carryP25Yd: medianCarryYd === null ? null : medianCarryYd - 2,
  carryP75Yd: medianCarryYd === null ? null : medianCarryYd + 2,
  medianOfflineYd: 0,
  ...over,
});

describe("buildTasks — the wedge matrix", () => {
  /* A 22 yd PW→GW hole, the real bag's own shape, built synthetically so the
   * test still means the same thing after the real one retires. */
  const profiles = [prof("Pitching Wedge", 120), prof("Gap Wedge", 98)];
  const holeTasks = (m: WedgeMatrix | null) =>
    buildTasks({
      profiles,
      gaps: detectGaps(profiles),
      shots: [],
      sessions: [{ id: "s" } as LedgerSession],
      wedgeMatrix: m,
    });

  it("retires the hole task when a measured cell splits the window small enough", () => {
    const bare = holeTasks(null);
    expect(bare.some((t) => t.id === "hole-Pitching Wedge-Gap Wedge")).toBe(true);
    // 109 splits 98–120 into 11 + 11, both under the 15 yd hole threshold.
    const covered = holeTasks({
      cells: [cell("Pitching Wedge", "three-quarter", 109)],
      warnings: [],
    });
    expect(covered.some((t) => t.id === "hole-Pitching Wedge-Gap Wedge")).toBe(false);
  });

  it("keeps the hole task, with the cell named, when a stretch stays unmeasured", () => {
    // 117 leaves 98→117: a 19 yd stretch, still a hole.
    const partial = holeTasks({
      cells: [cell("Pitching Wedge", "three-quarter", 117)],
      warnings: [],
    }).find((t) => t.id === "hole-Pitching Wedge-Gap Wedge");
    expect(partial).toBeDefined();
    expect(partial?.evidence).toContain("three-quarter Pitching Wedge at 117 yd");
    expect(partial?.evidence).toContain("19.0 yd of the window is still unmeasured");
  });

  it("ignores a suppressed cell when judging coverage — a held-back median covers nothing", () => {
    const held = holeTasks({
      cells: [cell("Pitching Wedge", "three-quarter", 109, { active: 5, suppressed: true })],
      warnings: [],
    });
    expect(held.some((t) => t.id === "hole-Pitching Wedge-Gap Wedge")).toBe(true);
  });

  it("asks to finish a started cell, cheapest first, with the labeling step in the action", () => {
    const m: WedgeMatrix = {
      cells: [cell("Gap Wedge", "half", null, { n: 9, active: 5, suppressed: true })],
      warnings: [],
    };
    const t = holeTasks(m).find((x) => x.id === "wedge-cell-Gap Wedge-half");
    expect(t).toBeDefined();
    expect(t?.category).toBe("wedge matrix");
    expect(t?.evidence).toContain("5 usable shots of 9 labeled");
    expect(t?.action).toContain("data/wedge-blocks.json");
    expect(t?.doneWhen).toContain(`${WEDGE_MATRIX_THRESHOLDS.minShotsPerCell} usable shots`);
    // 44 + (8 − 3): three short, so five of the gate already banked.
    expect(t?.priority).toBe(49);
  });

  it("aggregates the never-measured cells of measured wedges on the real ledger", () => {
    const shots = applyHeuristics(load<LedgerShot[]>("shots.json"));
    const sessions = load<LedgerSession[]>("sessions.json");
    const realProfiles = buildBag(shots);
    const m = buildWedgeMatrix(shots, [], realProfiles);
    const tasks = buildTasks({
      profiles: realProfiles,
      gaps: detectGaps(realProfiles),
      shots,
      sessions,
      wedgeMatrix: m,
    });
    const agg = tasks.find((t) => t.id === "wedge-matrix-empty");

    /* Recomputed, never pinned: eligible = partial cells of wedges whose full
     * swing clears the bag chart's gate; empty = those with no labeled shot. */
    const fullOk = new Set(
      m.cells.filter((c) => c.swing === "full" && !c.suppressed).map((c) => c.club),
    );
    const eligible = m.cells.filter((c) => c.swing !== "full" && fullOk.has(c.club));
    const empty = eligible.filter((c) => c.n === 0);
    if (empty.length === 0) {
      expect(agg).toBeUndefined();
      return;
    }
    expect(agg).toBeDefined();
    expect(agg?.title).toContain(`${empty.length} of ${eligible.length}`);
    expect(agg?.priority).toBe(56);
    // A wedge with no full swing on file stays out: its coverage task comes first.
    for (const c of m.cells.filter((x) => x.swing === "full" && x.suppressed)) {
      expect(agg?.evidence ?? "").not.toContain(c.club);
    }
  });
});

describe("the real ledger", () => {
  const shots = load<LedgerShot[]>("shots.json");

  it("is untouched by the shipped empty blocks file", () => {
    const file = parseWedgeBlocks(load<unknown>("wedge-blocks.json"));
    expect(file.warnings).toHaveLength(0);
    const bare = applyHeuristics(shots).map((s) => s.exclusionReason);
    const withFile = applyHeuristics(shots, undefined, file.blocks).map(
      (s) => s.exclusionReason,
    );
    expect(withFile).toEqual(bare);
  });

  it("renders every partial cell as honest emptiness until a block is labeled", () => {
    const file = parseWedgeBlocks(load<unknown>("wedge-blocks.json"));
    const classified = applyHeuristics(shots, undefined, file.blocks);
    const m = buildWedgeMatrix(classified, file.blocks, buildBag(classified));
    expect(m.cells).toHaveLength(12);
    const partials = m.cells.filter((c) => c.swing !== "full");
    /* Recomputed, not pinned: if a block is ever labeled, this asserts the
     * cells with no blocks stay empty rather than that all of them do. */
    for (const c of partials.filter((x) => x.n === 0)) {
      expect(c.suppressed).toBe(true);
      expect(c.medianCarryYd).toBeNull();
    }
    // The full rows agree with the bag chart to the digit.
    const profiles = buildBag(classified);
    for (const c of m.cells.filter((x) => x.swing === "full")) {
      const p = profiles.find((x) => x.club === c.club);
      expect(c.medianCarryYd).toBe(p?.medianDistanceYd ?? null);
    }
  });
});
