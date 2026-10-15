import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildGarminShots, type GarminRound, type SourceGarminRounds } from "../lib/garmin-shots";
import { localProjector } from "../lib/hole-geometry";
import {
  alongAndSide,
  buildHoleGeometry,
  buildScoutCourse,
  buildScoutHole,
  centreline,
  courseHandicap,
  parseScoutCourse,
  pickApproach,
  pickLayup,
  pointAlong,
  polylineLength,
  recommend,
  roundsHere,
  scoutPlayer,
  strokesOn,
  teePointFor,
  M_PER_YD,
  type ApproachClubModel,
  type HoleGeoJSON,
  type ScoutPlayer,
  type TeePlay,
} from "../lib/scout";
import { buildBag } from "../lib/stats";
import type { LedgerShot } from "../lib/ledger";

/* Scout is tested against the real Harding Park files: the OSM plan, the
 * sourced notes, and the watch's 2026-08-20 round. The geometry claims
 * below were measured by hand on 2026-10-13 (centreline ends 2–8 m from the
 * watch's pins; tee polygons 1–8 m from the watch's tee positions). */

const read = (p: string) => JSON.parse(readFileSync(join(process.cwd(), p), "utf8"));
const course = parseScoutCourse(read("data/scout/tpc-harding-park-golf-course.json"));
const geo = read("public/data/holes/tpc-harding-park-golf-course.geojson") as HoleGeoJSON;
const garmin = buildGarminShots(read("data/garmin-rounds.json") as SourceGarminRounds);
const harding = garmin.rounds.find((r) => r.scorecardId === "379296644") as GarminRound;
const shots = read("data/shots.json") as LedgerShot[];
const profiles = buildBag(shots);
const player = scoutPlayer(garmin, profiles, 12.7, 0.45);

describe("every scout file on disk", () => {
  const dir = join(process.cwd(), "data", "scout");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    it(`${file} parses and draws all 18 holes on its own plan`, () => {
      const c = parseScoutCourse(read(`data/scout/${file}`));
      expect(file).toBe(`${c.facilitySlug}.json`);
      const plan = read(`public/data/holes/${c.facilitySlug}.geojson`) as HoleGeoJSON;
      const v = buildScoutCourse(c, plan, player, []);
      // Without a watch round only an OSM-less hole goes undrawn.
      expect(v.undrawn).toEqual(c.osm.missingCentreline);
      for (const h of v.holes) {
        expect(h.green.approximate).toBe(c.osm.missingGreen.includes(h.number));
        expect(h.tiles.length).toBeGreaterThan(0);
        for (const t of h.byTee) expect(t.teePoint.y).toBeGreaterThan(h.green.centre.y);
      }
    });
  }
});

describe("the strategy file", () => {
  it("parses, with 18 holes, four tee sets and a source on every claim", () => {
    expect(course.holes).toHaveLength(18);
    expect(course.tees.map((t) => t.name)).toContain("White");
    for (const h of course.holes) {
      expect(course.sources[h.tee.source]).toBeDefined();
      expect(course.sources[h.green.source]).toBeDefined();
      expect(course.sources[h.target.source]).toBeDefined();
      for (const z of h.hazards) expect(course.sources[z.source]).toBeDefined();
    }
    expect(course.holes.reduce((a, h) => a + h.par, 0)).toBe(72);
    expect(course.tees.find((t) => t.name === "White")?.yards.reduce((a, b) => a + b, 0)).toBe(6405);
  });

  it("refuses a hole whose source is not declared", () => {
    const raw = read("data/scout/tpc-harding-park-golf-course.json");
    raw.holes[0].tee.source = "golfdigest";
    expect(() => parseScoutCourse(raw)).toThrow(/holes\[0\]\.tee\.source/);
  });

  it("refuses a tee set without 18 yardages", () => {
    const raw = read("data/scout/tpc-harding-park-golf-course.json");
    raw.tees[0].yards.pop();
    expect(() => parseScoutCourse(raw)).toThrow(/tees\[0\]\.yards/);
  });
});

describe("the centreline", () => {
  it("picks Harding's line by ref AND stroke index, not Fleming's", () => {
    // Fleming's 2nd is a par 3 with ref "2"; Harding's 2nd is hcp 3, par 4.
    const line = centreline(geo, 2, 3);
    expect(line).not.toBeNull();
    expect(centreline(geo, 2, 11)).not.toBeNull(); // Fleming's, if asked for
    expect(centreline(geo, 18, 2)).toBeNull(); // OSM has no 18th
  });

  it("walks a tee set back from the green by its yardage", () => {
    const line = [{ x: 0, y: 0 }, { x: 0, y: 400 }];
    expect(polylineLength(line)).toBe(400);
    const t = teePointFor(line, 300);
    expect(t.p.y).toBeCloseTo(400 - 300 * M_PER_YD, 5);
    expect(t.extended).toBe(false);
    const far = teePointFor(line, 500);
    expect(far.extended).toBe(true);
    expect(far.p.y).toBeLessThan(0);
    expect(pointAlong(line, 100)).toEqual({ x: 0, y: 100 });
  });

  it("reads along and side with right positive", () => {
    const line = [{ x: 0, y: 0 }, { x: 0, y: 100 }]; // played due north
    expect(alongAndSide(line, { x: 10, y: 50 })).toEqual({ along: 50, side: 10 });
    expect(alongAndSide(line, { x: -10, y: 50 }).side).toBe(-10);
  });
});

describe("the hole geometry, on the real plan", () => {
  it("puts the White tee on hole 1 within 15 m of where the watch stood", () => {
    const line = centreline(geo, 1, 13)!;
    const g = buildHoleGeometry(geo, line);
    const tee = teePointFor(g.lineM, 375);
    const watchTee = g.project(harding.holes[0].shots[0].startGeo!);
    expect(Math.hypot(tee.p.x - watchTee.x, tee.p.y - watchTee.y)).toBeLessThan(15);
  });

  it("finds hole 2's fairway bunkers on the LEFT at a driver's carry", () => {
    const g = buildHoleGeometry(geo, centreline(geo, 2, 3)!);
    const tee = teePointFor(g.lineM, 400);
    const left = g.bunkers.filter((b) => b.sideM < 0 && b.alongM - tee.along > 150 * M_PER_YD && b.alongM - tee.along < 300 * M_PER_YD);
    expect(left.length).toBeGreaterThanOrEqual(2);
    for (const b of left) {
      const carry = (b.farM - tee.along) / M_PER_YD;
      expect(carry).toBeGreaterThan(200);
      expect(carry).toBeLessThan(280);
    }
  });

  it("matches every green to its centreline end except the 9th, which is approximate", () => {
    for (const h of course.holes.filter((h) => h.number !== 18)) {
      const g = buildHoleGeometry(geo, centreline(geo, h.number, h.hcp)!);
      expect(g.green.approximate).toBe(h.number === 9);
      if (!g.green.approximate) {
        expect(g.green.depthM).toBeGreaterThan(15);
        expect(g.green.depthM).toBeLessThan(60);
      }
    }
  });

  it("keeps the frame rigid — SVG distances are metres", () => {
    const g = buildHoleGeometry(geo, centreline(geo, 3, 9)!);
    const a = g.lineM[0];
    const b = g.lineM[g.lineM.length - 1];
    const sa = g.toSvg(a);
    const sb = g.toSvg(b);
    expect(Math.hypot(sb.x - sa.x, sb.y - sa.y)).toBeCloseTo(Math.hypot(b.x - a.x, b.y - a.y), 6);
    // Tee at the bottom, green at the top.
    expect(sb.y).toBeLessThan(sa.y);
  });
});

describe("the golfer", () => {
  it("has a driver and a hybrid band from the course, irons from the range", () => {
    const d = player.teeClubs.find((c) => c.club === "Driver")!;
    expect(d.n).toBeGreaterThanOrEqual(10);
    expect(d.p25Yd).toBeLessThan(d.medYd);
    expect(d.medYd).toBeLessThan(d.p75Yd);
    expect(d.lateralMeasured).toBe(true);
    expect(player.teeClubs.some((c) => c.club === "3 Hybrid")).toBe(true);
    const irons = player.approachClubs.filter((c) => c.basis === "range carry");
    expect(irons.length).toBeGreaterThanOrEqual(6);
    expect(player.approachClubs.find((c) => c.club === "3 Hybrid")?.basis).toBe("course rest");
    expect(player.approachClubs.find((c) => c.club === "Driver")).toBeUndefined();
  });

  it("picks the shortest club whose median covers the number, and names one more", () => {
    const clubs: ApproachClubModel[] = [
      { club: "Pitching Wedge", n: 20, medYd: 120, p25Yd: 115, p75Yd: 125, basis: "range carry" },
      { club: "9 Iron", n: 20, medYd: 138, p25Yd: 130, p75Yd: 145, basis: "range carry" },
      { club: "7 Iron", n: 20, medYd: 160, p25Yd: 150, p75Yd: 170, basis: "range carry" },
    ];
    expect(pickApproach(clubs, 130)).toMatchObject({ club: "9 Iron", oneMore: "7 Iron", reaches: true });
    expect(pickApproach(clubs, 100)).toMatchObject({ club: "Pitching Wedge", oneMore: "9 Iron" });
    expect(pickApproach(clubs, 200)).toMatchObject({ club: "7 Iron", oneMore: null, reaches: false });
    expect(pickLayup(clubs, 150)?.club).toBe("9 Iron");
  });

  it("prices the course handicap and the strokes received the WHS way", () => {
    expect(courseHandicap(12.7, 122, 70.4, 72)).toBe(12);
    expect(courseHandicap(12.7, 125, 72.7, 72)).toBe(15);
    expect(strokesOn(12, 12)).toBe(1);
    expect(strokesOn(13, 12)).toBe(0);
    expect(strokesOn(1, 20)).toBe(2);
    expect(strokesOn(5, 0)).toBe(0);
  });
});

const play = (club: string, medYd: number, reaches: number, remainingYd: number): Omit<TeePlay, "recommended" | "cost" | "line"> => ({
  club,
  landing: { centre: { x: 0, y: 0 }, rx: 1, ry: 1, angle: 0, nearYd: medYd - 20, medYd, farYd: medYd + 20 },
  reaches: Array.from({ length: reaches }, () => ({ side: "left" as const, carryYd: 250, reachYd: 230 })),
  remainingYd,
  approach: { club: null, oneMore: null, reaches: true, basis: null },
  second: null,
});

describe("the recommendation", () => {
  it("takes the longest clean club that still leaves a full measured swing", () => {
    expect(recommend([play("Driver", 252, 0, 125), play("3 Hybrid", 223, 0, 154)], null, 92)).toBe(0);
    // A 60-yard leave is a partial wedge: the hybrid's 90 is the full swing.
    expect(recommend([play("Driver", 252, 0, 60), play("3 Hybrid", 223, 0, 90)], null, 92)).toBe(1);
  });
  it("steps down when the driver's band reaches sand and the hybrid's does not", () => {
    expect(recommend([play("Driver", 252, 2, 150), play("3 Hybrid", 223, 0, 180)], null, 92)).toBe(1);
  });
  it("takes the fewer bunkers, the shorter club on a tie", () => {
    expect(recommend([play("Driver", 252, 2, 150), play("3 Hybrid", 223, 2, 180)], null, 92)).toBe(1);
    expect(recommend([play("Driver", 252, 1, 150), play("3 Hybrid", 223, 2, 180)], null, 92)).toBe(0);
  });
  it("obeys a sourced hint over the geometry", () => {
    expect(recommend([play("Driver", 252, 0, 150), play("3 Hybrid", 223, 0, 180)], "3 Hybrid", 92)).toBe(1);
  });
});

describe("the hole view, on the real course", () => {
  const here = roundsHere(
    course,
    garmin,
    [{ roundId: "62185587", courseName: "TPC Harding Park Golf Course" }],
    [{ scorecardId: "379296644", roundId: "62185587" }],
  );
  const view = buildScoutCourse(course, geo, player, here);

  it("draws all 18 — the 18th from the watch's own line, and says so", () => {
    expect(view.undrawn).toEqual([]);
    expect(view.holes).toHaveLength(18);
    const h18 = view.holes[17];
    expect(h18.approximateLine).toBe(true);
    expect(h18.lastTime).not.toBeNull();
    expect(view.holes[8].green.approximate).toBe(true);
    expect(view.holes[0].approximateLine).toBe(false);
  });

  it("joins the last round through the Grint name and the confirmed link", () => {
    expect(here.map((r) => r.scorecardId)).toEqual(["379296644"]);
    expect(view.lastRound).toMatchObject({ date: "2026-08-20", strokes: 91, tee: "White" });
    expect(view.holes[0].lastTime?.line).toMatch(/Driver 298/);
    expect(view.holes[0].lastTime?.segs).toHaveLength(3);
  });

  it("prices the White tees at a plan total of 84 — net par at a 12 course handicap", () => {
    const white = view.tees.find((t) => t.name === "White")!;
    expect(white.courseHandicap).toBe(12);
    expect(white.planTotal).toBe(84);
    const h4 = view.holes[3].byTee.find((t) => t.tee === "White")!;
    expect(h4.target).toBe(6);
    expect(h4.refuse).toBe(7);
  });

  it("recommends the hybrid where the notes say so (4) and where the driver reaches sand (2)", () => {
    const rec = (n: number) => view.holes[n - 1].byTee[0].plays.find((p) => p.recommended)!;
    expect(rec(4).club).toBe("3 Hybrid");
    expect(rec(2).club).toBe("3 Hybrid");
    expect(view.holes[1].byTee[0].plays.find((p) => p.club === "Driver")?.reaches.some((r) => r.side === "left")).toBe(true);
    // Hole 1 is open: the driver, left side, a wedge or short iron in.
    expect(rec(1).club).toBe("Driver");
    expect(rec(1).remainingYd).toBeLessThan(140);
  });

  it("gives a par 3 its club from the tee and no tee plays", () => {
    const h3 = view.holes[2].byTee[0];
    expect(h3.plays).toEqual([]);
    expect(h3.teeApproach?.club).toBeTruthy();
    expect(h3.toCentreYd).toBeGreaterThan(140);
    expect(h3.toCentreYd).toBeLessThan(170);
  });

  it("marks the listed sucker pins and shifts the aim to the fat side", () => {
    const h11 = view.holes[10];
    const backLeft = h11.pins.find((p) => p.pos === "back-left")!;
    expect(backLeft.sucker).toBe(true);
    expect(backLeft.aim).toMatch(/right half/);
    const centre = h11.pins.find((p) => p.pos === "middle-centre")!;
    expect(centre.sucker).toBe(false);
    expect(h11.pins).toHaveLength(9);
  });

  it("states a cost on every play that is not the recommendation", () => {
    for (const h of view.holes) {
      for (const t of h.byTee) {
        for (const p of t.plays) {
          if (p.recommended) expect(p.cost).toBeNull();
          else expect(p.cost).toMatch(/instead/);
        }
        expect(t.plays.filter((p) => p.recommended).length).toBe(h.par === 3 ? 0 : 1);
      }
    }
  });

  it("builds a frame with tiles for every hole, tee at the bottom", () => {
    for (const h of view.holes) {
      expect(h.tiles.length).toBeGreaterThan(0);
      expect(h.tiles.length).toBeLessThanOrEqual(16);
      const white = h.byTee.find((t) => t.tee === "White")!;
      expect(white.teePoint.y).toBeGreaterThan(h.green.centre.y);
      expect(h.viewBox.w).toBeGreaterThan(0);
    }
  });

  it("returns null for a hole with no line and no watch round to stand in", () => {
    const spec = course.holes[17];
    const p: ScoutPlayer = player;
    expect(buildScoutHole(course, spec, geo, p, null)).toBeNull();
  });

  it("projects with the same constants as the diary", () => {
    const g = buildHoleGeometry(geo, centreline(geo, 1, 13)!);
    const ref = localProjector({ lat: g.unproject({ x: 0, y: 0 }).lat, lon: g.unproject({ x: 0, y: 0 }).lon });
    const p = { lat: 37.7235, lon: -122.4905 };
    expect(g.project(p)).toEqual(ref.project(p));
  });
});
