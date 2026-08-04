import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BAG_ORDER,
  bagRank,
  clubSpec,
  family,
  loftComparable,
  loftOf,
  ownedClubs,
  parseBag,
  short,
  sortByBag,
  startsAHole,
  WEDGE_CLUBS,
  type BagSpec,
} from "../lib/clubs";
import type { LedgerShot } from "../lib/ledger";
import { bagCoverage, buildBag, detectGaps } from "../lib/stats";

// ── the vocabulary ──────────────────────────────────────────────────────────

describe("family", () => {
  it("reads the role off the name", () => {
    expect(family("Driver")).toBe("tee");
    expect(family("3 Wood")).toBe("tee");
    expect(family("3 Hybrid")).toBe("rescue");
    expect(family("3 Iron")).toBe("long-iron");
    expect(family("4 Iron")).toBe("long-iron");
    expect(family("5 Iron")).toBe("iron");
    expect(family("9 Iron")).toBe("iron");
    expect(family("Pitching Wedge")).toBe("wedge");
    expect(family("Putter")).toBe("putter");
  });

  it("classifies a club nobody owns, rather than throwing", () => {
    expect(family("2 Wood")).toBe("tee");
    expect(family("Chipper")).toBe("unknown");
  });

  it("covers every name in BAG_ORDER", () => {
    expect(BAG_ORDER.filter((c) => family(c) === "unknown")).toEqual([]);
  });
});

describe("startsAHole", () => {
  it("is the clubs that decide where the next shot is played from", () => {
    expect(startsAHole("Driver")).toBe(true);
    expect(startsAHole("3 Hybrid")).toBe(true);
    expect(startsAHole("4 Iron")).toBe(true);
    expect(startsAHole("5 Iron")).toBe(false);
    expect(startsAHole("Sand Wedge")).toBe(false);
  });
});

describe("WEDGE_CLUBS", () => {
  it("is derived from the order, not a fifth copy of the same four names", () => {
    expect([...WEDGE_CLUBS]).toEqual([
      "Pitching Wedge",
      "Gap Wedge",
      "Sand Wedge",
      "Lob Wedge",
    ]);
  });
});

describe("bagRank and sortByBag", () => {
  /* The contract stats.ts re-exports and every caller depends on. Moving the
   * order into this module must not have changed it. */
  it("sorts an unknown club last, by name", () => {
    const sorted = sortByBag([
      { club: "Chipper" },
      { club: "7 Iron" },
      { club: "Driver" },
    ]);
    expect(sorted.map((s) => s.club)).toEqual(["Driver", "7 Iron", "Chipper"]);
    expect(bagRank("Chipper")).toBe(BAG_ORDER.length);
  });
});

describe("short", () => {
  it("abbreviates without colliding", () => {
    expect(short("Pitching Wedge")).toBe("PW");
    expect(short("Gap Wedge")).toBe("GW");
    expect(short("7 Iron")).toBe("7i");
    expect(short("3 Hybrid")).toBe("3H");
    expect(short("Driver")).toBe("Driver");
    const all = BAG_ORDER.map(short);
    expect(new Set(all).size).toBe(all.length);
  });
});

// ── parsing ─────────────────────────────────────────────────────────────────

describe("parseBag", () => {
  it("reports a key that matches no club instead of dropping it silently", () => {
    const bag = parseBag({
      clubs: { "7 Iron": { headType: "iron" }, "7 Irno": { headType: "iron" } },
    });
    expect(bag.clubs.map((c) => c.club)).toEqual(["7 Iron"]);
    expect(bag.orphans).toEqual(["7 Irno"]);
  });

  it("returns clubs in bag order whatever order the file is in", () => {
    const bag = parseBag({
      clubs: {
        "Sand Wedge": { headType: "wedge" },
        Driver: { headType: "wood" },
        "7 Iron": { headType: "iron" },
      },
    });
    expect(bag.clubs.map((c) => c.club)).toEqual(["Driver", "7 Iron", "Sand Wedge"]);
  });

  it("leaves an absent field absent rather than filling it with a blank", () => {
    const bag = parseBag({ clubs: { Driver: { headType: "wood", shaft: "" } } });
    expect(bag.clubs[0].shaft).toBeUndefined();
    expect(bag.clubs[0].grip).toBeUndefined();
    expect(bag.clubs[0].loftDeg).toBeUndefined();
  });

  it("drops a loft with no number, rather than defaulting it to zero", () => {
    const bag = parseBag({
      clubs: { Driver: { headType: "wood", loftDeg: { source: "x", verified: true } } },
    });
    expect(bag.clubs[0].loftDeg).toBeUndefined();
  });

  it("treats a missing verified flag as unverified", () => {
    const bag = parseBag({
      clubs: { Driver: { headType: "wood", loftDeg: { value: 10.5 } } },
    });
    expect(bag.clubs[0].loftDeg?.verified).toBe(false);
  });

  it("survives a file that is missing, empty or the wrong shape", () => {
    expect(parseBag(null).clubs).toEqual([]);
    expect(parseBag({}).clubs).toEqual([]);
    expect(parseBag({ clubs: {} }).clubs).toEqual([]);
  });

  it("falls back to the name when headType is absent or nonsense", () => {
    const bag = parseBag({
      clubs: { "7 Iron": {}, "Sand Wedge": { headType: "banana" }, Driver: {} },
    });
    expect(clubSpec(bag, "7 Iron")?.headType).toBe("iron");
    expect(clubSpec(bag, "Sand Wedge")?.headType).toBe("wedge");
    expect(clubSpec(bag, "Driver")?.headType).toBe("wood");
  });
});

describe("loftComparable", () => {
  const bag = parseBag({
    clubs: {
      "Pitching Wedge": { headType: "iron", loftDeg: { value: 45 } },
      "Gap Wedge": { headType: "wedge", loftDeg: { value: 50 } },
      "Sand Wedge": { headType: "wedge", loftDeg: { value: 54 } },
    },
  });

  it("is true within one head type", () => {
    expect(loftComparable(bag, "Gap Wedge", "Sand Wedge")).toBe(true);
  });

  it("is false across head types — a set PW is not a ground wedge", () => {
    expect(loftComparable(bag, "Pitching Wedge", "Gap Wedge")).toBe(false);
  });

  it("is false when the bag has never heard of one of them", () => {
    expect(loftComparable(bag, "Gap Wedge", "Driver")).toBe(false);
    expect(loftComparable(null, "Gap Wedge", "Sand Wedge")).toBe(false);
  });
});

// ── the real file ───────────────────────────────────────────────────────────

describe("data/bag.json", () => {
  const raw = JSON.parse(
    readFileSync(join(__dirname, "..", "data", "bag.json"), "utf8"),
  ) as unknown;
  const bag = parseBag(raw);

  it("has no key that BAG_ORDER does not know", () => {
    expect(bag.orphans).toEqual([]);
  });

  it("is a legal bag — 14 clubs at most, counting the putter", () => {
    expect(bag.clubs.length).toBeLessThanOrEqual(14);
  });

  it("gives every club a head type and every loft a source and a checked date", () => {
    for (const c of bag.clubs) {
      expect(c.headType, c.club).toBeTruthy();
      if (!c.loftDeg) continue;
      expect(c.loftDeg.source, `${c.club} loft source`).not.toBe("");
      expect(c.loftDeg.checked, `${c.club} loft checked`).not.toBe("");
    }
  });

  /* Not "lofts increase down the bag" — they do not, and that is a finding
   * rather than a bug. The utility wood and the 3 iron are both 19°, which is
   * exactly the claim profile.ts is built to surface. What must hold is the
   * weaker statement: loft never runs BACKWARDS. */
  it("never runs backwards in loft, though it may repeat", () => {
    const lofts = bag.clubs
      .filter((c) => c.loftDeg)
      .map((c) => ({ club: c.club, deg: c.loftDeg?.value as number }));
    for (let i = 0; i < lofts.length - 1; i += 1) {
      expect(lofts[i + 1].deg, `${lofts[i].club} → ${lofts[i + 1].club}`)
        .toBeGreaterThanOrEqual(lofts[i].deg);
    }
  });

  it("increases strictly within each head type", () => {
    const heads = new Set(bag.clubs.map((c) => c.headType));
    for (const head of heads) {
      const lofts = bag.clubs
        .filter((c) => c.headType === head && c.loftDeg)
        .map((c) => c.loftDeg?.value as number);
      for (let i = 0; i < lofts.length - 1; i += 1) {
        expect(lofts[i + 1], `${head} loft order`).toBeGreaterThan(lofts[i]);
      }
    }
  });

  it("carries the one thing the ledger cannot: clubs it has never seen", () => {
    expect(loftOf(bag, "Lob Wedge")).toBe(58);
    expect(ownedClubs(bag).has("3 Hybrid")).toBe(true);
  });
});

// ── coverage against the ledger ─────────────────────────────────────────────

let uid = 0;
function shot(over: Partial<LedgerShot> = {}): LedgerShot {
  uid += 1;
  return {
    id: `s${uid}`,
    sessionId: "2026-07-01T10:00:00",
    shotIndex: uid,
    shotTimestamp: `2026-07-01T10:00:${String(uid % 60).padStart(2, "0")}`,
    club: "7 Iron",
    carryYd: 150,
    totalYd: 160,
    totalIsCarryCopy: false,
    ballSpeedMph: 110,
    clubSpeedMph: 85,
    smashFactor: 1.3,
    launchAngleDeg: 19,
    launchDirectionDeg: 0,
    attackAngleDeg: -3,
    backspinRpm: 5500,
    sidespinRpm: -200,
    spinRateRpm: 5504,
    spinRateType: "Measured",
    spinAxisDeg: 2,
    faceAngleDeg: 1,
    clubPathDeg: 0,
    faceToPathDeg: 1,
    apexFt: 90,
    descentAngleDeg: null,
    offlineYd: 0,
    carryDeviationAngleDeg: 0,
    totalDeviationYd: 0,
    totalDeviationAngleDeg: 0,
    isExcluded: false,
    exclusionReason: null,
    raw: {},
    ...over,
  } as LedgerShot;
}

const FIXTURE: BagSpec = parseBag({
  clubs: {
    Driver: { headType: "wood", loftDeg: { value: 10.5 } },
    "7 Iron": { headType: "iron", loftDeg: { value: 30.5 } },
    "8 Iron": { headType: "iron", loftDeg: { value: 35 } },
    "Lob Wedge": { headType: "wedge", loftDeg: { value: 58 } },
  },
});

describe("bagCoverage", () => {
  const shots = [
    ...Array.from({ length: 20 }, () => shot({ club: "7 Iron" })),
    ...Array.from({ length: 4 }, () => shot({ club: "8 Iron", carryYd: 140 })),
    shot({ club: "5 Iron", carryYd: 175 }),
  ];
  const profiles = buildBag(shots);

  it("counts the clubs owned, not the clubs hit", () => {
    const c = bagCoverage(profiles, FIXTURE);
    expect(c?.owned).toBe(4);
    expect(c?.recorded).toEqual(["7 Iron", "8 Iron"]);
  });

  it("separates never-recorded from under-sampled — they are different absences", () => {
    const c = bagCoverage(profiles, FIXTURE);
    expect(c?.neverRecorded).toEqual(["Driver", "Lob Wedge"]);
    expect(c?.underSampled).toEqual([{ club: "8 Iron", active: 4, n: 4 }]);
  });

  it("runs the check the other way too: a club hit but not in the bag file", () => {
    expect(bagCoverage(profiles, FIXTURE)?.unowned).toEqual(["5 Iron"]);
  });

  it("is null when there is no bag file, so every caller can fall back", () => {
    expect(bagCoverage(profiles, null)).toBeNull();
    expect(bagCoverage(profiles, parseBag({ clubs: {} }))).toBeNull();
  });
});

describe("detectGaps with a bag", () => {
  const shots = [
    ...Array.from({ length: 20 }, () => shot({ club: "7 Iron", carryYd: 150 })),
    ...Array.from({ length: 20 }, () => shot({ club: "8 Iron", carryYd: 138 })),
  ];
  const gaps = detectGaps(buildBag(shots), undefined, FIXTURE);

  it("signs the loft gap the same way round as the carry gap", () => {
    const g = gaps.find((x) => x.longer === "7 Iron");
    expect(g?.gapYd).toBeCloseTo(12);
    expect(g?.loftGapDeg).toBeCloseTo(4.5);
    expect(g?.loftComparable).toBe(true);
  });

  it("leaves the loft null rather than zero when the bag has no number", () => {
    const bare = detectGaps(buildBag(shots), undefined, null);
    expect(bare[0].loftGapDeg).toBeNull();
    expect(bare[0].loftComparable).toBe(false);
  });

  /* The whole point of the null: these two are adjacent in the TABLE and four
   * apart in the BAG, so 20° between them describes no pair of clubs. The carry
   * gap across the same skip is still real and stays. */
  it("withholds the loft when unmeasured clubs sit between the pair", () => {
    const skipping = [
      ...Array.from({ length: 20 }, () => shot({ club: "Driver", carryYd: 230 })),
      ...Array.from({ length: 20 }, () => shot({ club: "Lob Wedge", carryYd: 70 })),
    ];
    const g = detectGaps(buildBag(skipping), undefined, FIXTURE)[0];
    expect(g.longer).toBe("Driver");
    expect(g.shorter).toBe("Lob Wedge");
    expect(g.gapYd).toBeCloseTo(160);
    expect(g.loftGapDeg).toBeNull();
    expect(g.loftComparable).toBe(false);
  });

  it("still computes the carry gap identically without a bag", () => {
    const bare = detectGaps(buildBag(shots), undefined, null);
    expect(bare[0].gapYd).toBeCloseTo(gaps.find((x) => x.longer === "7 Iron")?.gapYd as number);
    expect(bare[0].verdict).toBe(gaps.find((x) => x.longer === "7 Iron")?.verdict);
  });
});
