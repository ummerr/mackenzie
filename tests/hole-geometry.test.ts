import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs script module, no type declarations
import { garminFacilitySlug } from "../scripts/link-rounds.mjs";
import {
  garminCourseSlug,
  paintHole,
  type CourseGeo,
  type LatLon,
} from "../lib/hole-geometry";
import type { GarminShot } from "../lib/garmin-shots";

/* A synthetic course near Presidio's latitude — real-world scale, invented
 * shapes. The projection constants under test are the attested pair from
 * scripts/fetch-holes.mjs (111320·cos(lat) m/°lon, 110540 m/°lat). */

const LAT = 37.789;
const LON = -122.463;

const at = (dLat: number, dLon: number): LatLon => ({
  lat: LAT + dLat,
  lon: LON + dLon,
});

function shot(startGeo: LatLon | null, endGeo: LatLon | null): GarminShot {
  return {
    order: 1,
    club: null,
    clubId: null,
    shotType: null,
    meters: null,
    yards: null,
    startLie: null,
    endLie: null,
    startMap: null,
    endMap: null,
    startGeo,
    endGeo,
  };
}

/** A small square polygon centred on a point, ~18 m across. */
function square(k: string, center: LatLon, half = 0.0001) {
  const ring: [number, number][] = [
    [center.lon - half, center.lat - half],
    [center.lon + half, center.lat - half],
    [center.lon + half, center.lat + half],
    [center.lon - half, center.lat + half],
    [center.lon - half, center.lat - half],
  ];
  return { properties: { k }, geometry: { type: "Polygon", coordinates: [ring] } };
}

const emptyCourse: CourseGeo = { features: [] };

describe("garminCourseSlug", () => {
  it("agrees with the pipeline's garminFacilitySlug for every attested name", () => {
    // The app-side slug is a mirror of scripts/link-rounds.mjs, which it
    // cannot import — this parity holds the two together.
    for (const name of [
      "Harding Park Golf Course ~ Harding",
      "Presidio Golf Course",
      "TPC Toronto at Osprey Valley ~ North",
    ]) {
      expect(garminCourseSlug(name)).toBe(garminFacilitySlug(name));
    }
  });
});

describe("paintHole — the frame", () => {
  it("is null without a course, without shots, or without degrees", () => {
    const geoShot = shot(at(0, 0), at(0.001, 0));
    expect(paintHole(null, [geoShot], null)).toBeNull();
    expect(paintHole(emptyCourse, [], null)).toBeNull();
    expect(paintHole(emptyCourse, [shot(null, null)], null)).toBeNull();
  });

  it("projects at the attested metre scale — 0.001° lat ≈ 110.5 m, lon shrunk by cos(lat)", () => {
    const north = paintHole(emptyCourse, [shot(at(0, 0), at(0.001, 0))], null)!;
    const n = north.segs[0];
    expect(Math.hypot(n.b.x - n.a.x, n.b.y - n.a.y)).toBeCloseTo(110.54, 0);

    const east = paintHole(emptyCourse, [shot(at(0, 0), at(0, 0.001))], null)!;
    const e = east.segs[0];
    const len = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y);
    expect(len).toBeGreaterThan(87);
    expect(len).toBeLessThan(89);
  });

  it("rotates the frame so the pin sits directly above the tee", () => {
    // A hole running northeast; the rotation must bring its target north.
    const pin = at(0.0025, 0.00125);
    const paint = paintHole(emptyCourse, [shot(at(0, 0), at(0.002, 0.001))], pin)!;
    const tee = paint.segs[0].a;
    expect(paint.pin).not.toBeNull();
    expect(Math.abs(paint.pin!.x - tee.x)).toBeLessThan(0.5);
    expect(paint.pin!.y).toBeLessThan(tee.y);
  });

  it("keeps a degenerate bearing finite instead of spinning on noise", () => {
    // Tee and target 5 m apart — under the 10 m floor, rotation is skipped.
    const paint = paintHole(emptyCourse, [shot(at(0, 0), at(0.00005, 0))], null)!;
    for (const s of paint.segs) {
      expect(Number.isFinite(s.a.x + s.a.y + s.b.x + s.b.y)).toBe(true);
    }
  });

  it("falls back to null when the frame spans like a mis-assigned shot", () => {
    // 0.01° lat ≈ 1.1 km — no golf hole, so no drawing.
    expect(paintHole(emptyCourse, [shot(at(0, 0), at(0.01, 0))], null)).toBeNull();
  });
});

describe("paintHole — the scenery", () => {
  // A straight par-3-ish hole running 220 m north, with its green at the
  // end, a bunker beside the green, a tee box at the start, and a second
  // green two fairways over that belongs to another hole.
  const course: CourseGeo = {
    features: [
      square("tee", at(0.00002, 0)),
      square("green", at(0.002, 0)),
      square("bunker", at(0.002, 0.0003)),
      square("green", at(0.002, 0.004)), // ~350 m east — another hole's
      // A driving range beside the hole, with a target green inside it —
      // the range's furniture, not a hole's, so it must not paint.
      square("range", at(0.001, 0.0006), 0.0005),
      square("green", at(0.001, 0.0006)),
      { properties: { k: "hole" }, geometry: { type: "LineString", coordinates: [] } },
    ],
  };
  const shots = [shot(at(0, 0), at(0.0019, 0))];

  it("paints the hole's own green, tee, and bunker — not the neighbour's green", () => {
    const paint = paintHole(course, shots, null)!;
    const kinds = paint.polys.map((p) => p.kind);
    expect(kinds.filter((k) => k === "green")).toHaveLength(1);
    expect(kinds).toContain("tee");
    expect(kinds).toContain("bunker");
  });

  it("paints bottom-to-top — the green over everything else", () => {
    const paint = paintHole(course, shots, null)!;
    const kinds = paint.polys.map((p) => p.kind);
    expect(kinds.indexOf("green")).toBe(kinds.length - 1);
    expect(kinds.indexOf("tee")).toBeLessThan(kinds.indexOf("bunker"));
  });

  it("orients on the matched green when the capture carries no pin", () => {
    const paint = paintHole(course, shots, null)!;
    // The green sits due north of the tee already, so the frame must keep
    // the last shot's end above its start.
    const s = paint.segs[0];
    expect(s.b.y).toBeLessThan(s.a.y);
    expect(paint.pin).toBeNull();
  });
});
