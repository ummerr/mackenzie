import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AMAR_COMPONENTS,
  amarScore,
  feeLine,
  joinCalifornia100,
  parseCalifornia100,
  teeLine,
  valueOrdinal,
  type California100File,
  type CaliforniaEntry,
} from "../lib/california100";
import type { SourceFacility } from "../lib/course-history";

/* The to-play list's contract: a compiled row is a claim until its checks
 * say otherwise, the join to the spine is explicit, the index's arithmetic
 * must re-do, and the reader never invents a played state the artifact did
 * not record. */

const rawFile = () => JSON.parse(readFileSync("data/california-100.json", "utf8"));
const real = (): California100File => parseCalifornia100(rawFile());
const spine = () => JSON.parse(readFileSync("data/facilities.json", "utf8")).facilities as { slug: string; layoutSlugs: string[] }[];
const built = () => {
  const src = JSON.parse(readFileSync("public/data/courses.json", "utf8"));
  return { capturedAt: src.capturedAt as string, bySlug: new Map<string, SourceFacility>(src.facilities.map((f: SourceFacility) => [f.slug, f])) };
};

describe("data/california-100.json", () => {
  it("parses every one of the hundred with zero drops", () => {
    const raw = rawFile();
    const file = parseCalifornia100(raw);
    expect(raw.entries.length).toBe(100);
    expect(file.entries.length).toBe(raw.entries.length);
    expect(file.amar).not.toBeNull();
  });

  it("ranks run 1..100 once each and slugs are unique", () => {
    const f = real();
    expect([...f.entries].sort((a, b) => a.rank - b.rank).map((e) => e.rank)).toEqual(
      Array.from({ length: 100 }, (_, i) => i + 1),
    );
    expect(new Set(f.entries.map((e) => e.slug)).size).toBe(100);
  });

  it("every facility it names is in the spine, and a multi-layout facility is named to the layout", () => {
    const bySlug = new Map(spine().map((s) => [s.slug, s]));
    for (const e of real().entries) {
      if (e.facilitySlug === null) continue;
      const f = bySlug.get(e.facilitySlug);
      expect(f, e.slug).toBeDefined();
      if (e.layoutSlug !== null) expect(e.layoutSlug.startsWith(`${e.facilitySlug}--`), e.slug).toBe(true);
      else expect(f!.layoutSlugs.length, e.slug).toBe(1);
    }
  });

  it("a verified check names a source the file knows", () => {
    const f = real();
    for (const e of f.entries) {
      for (const c of Object.values(e.provenance.checks)) {
        if (!c.verified) continue;
        expect(c.source && (/^https?:\/\//.test(c.source) || c.source in f.sources), e.slug).toBeTruthy();
      }
      expect(e.provenance.verified).toBe(Object.values(e.provenance.checks).every((c) => c.verified));
    }
  });

  it("the index's score is its components weighted, and its rank is the one the scores imply", () => {
    const f = real();
    const w = f.amar!.weights;
    expect(AMAR_COMPONENTS.reduce((a, k) => a + w[k], 0)).toBeCloseTo(1, 3);
    const scores = f.entries.map((e) => e.amar.score);
    for (const e of f.entries) {
      expect(Math.abs(amarScore(e.amar.components, w) - e.amar.score), e.slug).toBeLessThan(0.35);
      expect(e.amar.rank, e.slug).toBe(1 + scores.filter((s) => s > e.amar.score).length);
    }
  });

  it("joins Rustic Canyon as played six times, Brookside to its Koiner course, and Pelican Hill's Ocean South as facility-played", () => {
    const b = built();
    const list = joinCalifornia100(real(), b.bySlug, b.capturedAt);
    const rustic = list.rows.find((r) => r.entry.slug === "rustic-canyon")!;
    expect(rustic.state).toBe("played");
    expect(rustic.timesPlayed).toBe(6);
    expect(rustic.facilityName).toBe("Rustic Canyon Golf Course");
    const koiner = list.rows.find((r) => r.entry.slug === "brookside-koiner")!;
    expect(koiner.state).toBe("played");
    expect(koiner.timesPlayed).toBe(5);
    const south = list.rows.find((r) => r.entry.slug === "pelican-hill-ocean-south")!;
    expect(south.state).toBe("facility-played");
    expect(south.layoutName).toBe("Ocean North");
    const pebble = list.rows.find((r) => r.entry.slug === "pebble-beach")!;
    expect(pebble.state).toBe("unplayed");
    expect(list.linked).toBe(22);
    expect(list.played).toBeGreaterThanOrEqual(19);
    expect(list.rows.length).toBe(100);
    expect(list.order.rank).toEqual(Array.from({ length: 100 }, (_, i) => i));
    expect(list.rows[list.order.amar[0]].entry.slug).toBe("pebble-beach");
    expect(list.rows[list.order.drive[0]].entry.drive.minutes).toBe(15);
  });
});

/* ── synthetic ────────────────────────────────────────────────────────────── */

const check = (verified = false, source: string | null = null) => ({ verified, source, note: null });
const comps = (v = 8) => Object.fromEntries(AMAR_COMPONENTS.map((k) => [k, v])) as CaliforniaEntry["amar"]["components"];
const entry = (over: Partial<CaliforniaEntry> & { rank: number; slug: string }): CaliforniaEntry => ({
  name: over.slug,
  locality: "Somewhere",
  region: "Somewhere",
  area: "bay-area",
  architect: null,
  tee: { yards: 7000, slope: 130, rating: null, name: null },
  fee: { low: 100, high: null, note: null },
  access: ["DF"],
  status: "open",
  rankings: { golfweekCA: null, golfweekUS: null, golfDigestScore: null, golfDigestCA: null, golfDigestPublic: null, golfYCP: null },
  value: "B",
  valueNote: null,
  tags: [],
  housing: "none",
  drive: { label: "1h", minutes: 60 },
  amar: { rank: 1, tier: "A", score: 80, components: comps() },
  facilitySlug: null,
  layoutSlug: null,
  joinNote: null,
  provenance: {
    confidence: "low",
    checked: "2026-10-06",
    verified: false,
    checks: { rankings: check(), tee: check(), fee: check(), architect: check() },
  },
  ...over,
});
const file = (entries: CaliforniaEntry[]): California100File => ({
  list: { title: "t", compiledAt: "2026-10-06", compiledBy: "x", from: "SF" },
  sources: {},
  access: { DF: "daily fee" },
  areas: { "bay-area": "Bay Area" },
  tags: { "sf-shortlist": "x" },
  housing: { none: "none" },
  amar: null,
  entries,
});
const layout = (slug: string, over: Partial<SourceFacility["layouts"][number]> = {}): SourceFacility["layouts"][number] => ({
  slug,
  grintLayoutName: null,
  timesPlayed: 1,
  avgScore: 90,
  personalRank: 10,
  played: true,
  flags: [],
  ratings: { overall: 80, fun: 85, condition: 70 },
  ...over,
});
const facility = (slug: string, layouts: SourceFacility["layouts"]): SourceFacility => ({
  name: slug.toUpperCase(),
  slug,
  region: "CA",
  country: "US",
  played: layouts.some((l) => l.played),
  layouts,
});

describe("joinCalifornia100", () => {
  const facilities = new Map<string, SourceFacility>([
    ["one", facility("one", [layout("one")])],
    ["two", facility("two", [layout("two--a", { grintLayoutName: "A", timesPlayed: 3, flags: ["nine_hole_suspected"] }), layout("two--b", { grintLayoutName: "B", played: false, timesPlayed: 0, avgScore: null, personalRank: null })])],
    ["never", facility("never", [layout("never", { played: false, timesPlayed: 0, avgScore: null, personalRank: null })])],
  ]);
  const join = (...es: CaliforniaEntry[]) => joinCalifornia100(file(es), facilities, "2026-10-06");

  it("a single-layout facility is that layout's record", () => {
    const r = join(entry({ rank: 1, slug: "x", facilitySlug: "one" })).rows[0];
    expect(r.state).toBe("played");
    expect(r.timesPlayed).toBe(1);
    expect(r.personalRank).toBe(10);
    expect(r.ratings?.fun).toBe(85);
  });

  it("a named layout is that layout, short-round flags carried across", () => {
    const r = join(entry({ rank: 1, slug: "x", facilitySlug: "two", layoutSlug: "two--a" })).rows[0];
    expect(r.state).toBe("played");
    expect(r.timesPlayed).toBe(3);
    expect(r.shortRounds).toBe(true);
    expect(r.layoutName).toBe("A");
  });

  it("a layout the spine lacks at a played facility is facility-played, naming what was played", () => {
    const r = join(entry({ rank: 1, slug: "x", facilitySlug: "two", layoutSlug: "two--c" })).rows[0];
    expect(r.state).toBe("facility-played");
    expect(r.layoutName).toBe("A");
    expect(r.timesPlayed).toBe(0);
  });

  it("an unplayed spine layout and an unknown facility are both unplayed, never a throw", () => {
    const list = join(
      entry({ rank: 1, slug: "a", facilitySlug: "never" }),
      entry({ rank: 2, slug: "b", facilitySlug: "ghost" }),
      entry({ rank: 3, slug: "c" }),
    );
    expect(list.rows.map((r) => r.state)).toEqual(["unplayed", "unplayed", "unplayed"]);
    expect(list.rows[0].facilityName).toBe("NEVER");
    expect(list.played).toBe(0);
  });

  it("orders by value, difficulty, price, amar and drive with nulls last and rank as the tiebreak", () => {
    const list = join(
      entry({ rank: 1, slug: "a", value: "B", tee: { yards: 7000, slope: null, rating: null, name: null }, fee: { low: null, high: null, note: null }, amar: { rank: 3, tier: "A", score: 70, components: comps(7) }, drive: { label: "3h", minutes: 180 } }),
      entry({ rank: 2, slug: "b", value: "A+", tee: { yards: 6500, slope: 140, rating: null, name: null }, fee: { low: 50, high: 80, note: null }, amar: { rank: 1, tier: "S", score: 95, components: comps(9.5) }, drive: { label: "20m", minutes: 20 } }),
      entry({ rank: 3, slug: "c", value: "A+", tee: { yards: 7200, slope: 140, rating: null, name: null }, fee: { low: 50, high: null, note: null }, amar: { rank: 2, tier: "A", score: 80, components: comps(8) }, drive: { label: "20m", minutes: 20 } }),
      entry({ rank: 4, slug: "d", value: null, status: "closed", tee: { yards: 7400, slope: 120, rating: null, name: null }, fee: { low: 200, high: null, note: null }, amar: { rank: 4, tier: "B", score: 60, components: comps(6) }, drive: { label: "1h", minutes: 60 } }),
    );
    expect(list.order.value).toEqual([1, 2, 0, 3]);
    expect(list.order.difficulty).toEqual([2, 1, 3, 0]);
    expect(list.order.price).toEqual([1, 2, 3, 0]);
    expect(list.order.amar).toEqual([1, 2, 0, 3]);
    expect(list.order.drive).toEqual([1, 2, 3, 0]);
    expect(list.hardest.map((r) => r.entry.slug)).toEqual(["c", "b", "d"]);
  });

  it("next up is the best-value unplayed open course on the SF shortlist; cheapest skips the played", () => {
    const list = join(
      entry({ rank: 1, slug: "played", facilitySlug: "one", tags: ["sf-shortlist"], value: "A++", fee: { low: 10, high: null, note: null }, amar: { rank: 1, tier: "S", score: 90, components: comps(9) } }),
      entry({ rank: 2, slug: "untagged", value: "A++", fee: { low: 20, high: null, note: null } }),
      entry({ rank: 3, slug: "closed", status: "closed", value: null, tags: ["sf-shortlist"], fee: { low: 1, high: null, note: null } }),
      entry({ rank: 4, slug: "pick", tags: ["sf-shortlist"], value: "A", fee: { low: 90, high: null, note: null } }),
      entry({ rank: 5, slug: "also", tags: ["sf-shortlist"], value: "A", fee: { low: 30, high: null, note: null } }),
    );
    expect(list.nextUp?.entry.slug).toBe("pick");
    expect(list.cheapestUnplayed?.entry.slug).toBe("untagged");
    expect(list.top25Played).toBe(1);
    expect(list.amarTenPlayed).toBe(1);
    expect(list.roundsOnList).toBe(1);
    expect(list.byArea).toEqual([{ area: "bay-area", total: 5, played: 1 }]);
  });
});

describe("parseCalifornia100 / formatting", () => {
  it("drops an entry with a bad grade, confidence or component and throws only when the file is not an object", () => {
    const good = entry({ rank: 1, slug: "ok" });
    const badGrade = { ...entry({ rank: 2, slug: "bad" }), value: "Z" };
    const badConf = entry({ rank: 3, slug: "conf" });
    (badConf.provenance as { confidence: string }).confidence = "sure";
    const badComp = entry({ rank: 4, slug: "comp", amar: { rank: 4, tier: "B", score: 50, components: { ...comps(), scenery: 11 } } });
    const f = parseCalifornia100({ list: {}, entries: [good, badGrade, badConf, badComp] });
    expect(f.entries.map((e) => e.slug)).toEqual(["ok"]);
    expect(f.amar).toBeNull();
    expect(() => parseCalifornia100(null)).toThrow();
    expect(parseCalifornia100({}).entries).toEqual([]);
  });

  it("re-does the index's arithmetic", () => {
    const w = Object.fromEntries(AMAR_COMPONENTS.map((k) => [k, 1 / 9])) as Record<(typeof AMAR_COMPONENTS)[number], number>;
    expect(amarScore(comps(8), w)).toBeCloseTo(80, 6);
  });

  it("grades order A++ over A+ over A over A-, unknown last", () => {
    expect(valueOrdinal("A++")).toBeGreaterThan(valueOrdinal("A+"));
    expect(valueOrdinal("A+")).toBeGreaterThan(valueOrdinal("A"));
    expect(valueOrdinal("A")).toBeGreaterThan(valueOrdinal("A-"));
    expect(valueOrdinal("A-")).toBeGreaterThan(valueOrdinal("B+"));
    expect(valueOrdinal("D-")).toBe(0);
    expect(valueOrdinal(null)).toBe(-1);
  });

  it("prints a tee and a fee with dashes where nothing was said", () => {
    expect(teeLine({ yards: 6802, slope: 144, rating: null, name: null })).toBe("6,802 / 144");
    expect(teeLine({ yards: null, slope: 142, rating: null, name: null })).toBe("— / 142");
    expect(feeLine({ low: 65, high: 90, note: null })).toBe("$65–90");
    expect(feeLine({ low: 695, high: null, note: null })).toBe("$695");
    expect(feeLine({ low: null, high: null, note: "resort" })).toBe("—");
  });
});
