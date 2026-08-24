import { describe, expect, it } from "vitest";
import { paintHole, type LatLon } from "../lib/hole-geometry";
import type { GarminShot } from "../lib/garmin-shots";

/* Synthetic holes near Presidio's latitude — real-world scale, invented
 * shots. The projection constants under test are the attested pair from
 * scripts/fetch-holes.mjs (111320·cos(lat) m/°lon, 110540 m/°lat); the tile
 * grid under test is Web Mercator, the /courses map's. */

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

const TILE_RE =
  /^https:\/\/server\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery\/MapServer\/tile\/(\d+)\/(\d+)\/(\d+)$/;

describe("paintHole — the frame", () => {
  it("is null without shots or without degrees", () => {
    expect(paintHole([], null)).toBeNull();
    expect(paintHole([shot(null, null)], null)).toBeNull();
  });

  it("projects at the attested metre scale — 0.001° lat ≈ 110.5 m, lon shrunk by cos(lat)", () => {
    const north = paintHole([shot(at(0, 0), at(0.001, 0))], null)!;
    const n = north.segs[0];
    expect(Math.hypot(n.b.x - n.a.x, n.b.y - n.a.y)).toBeCloseTo(110.54, 0);

    const east = paintHole([shot(at(0, 0), at(0, 0.001))], null)!;
    const e = east.segs[0];
    const len = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y);
    expect(len).toBeGreaterThan(87);
    expect(len).toBeLessThan(89);
  });

  it("rotates the frame so the pin sits directly above the tee", () => {
    // A hole running northeast; the rotation must bring its target north.
    const pin = at(0.0025, 0.00125);
    const paint = paintHole([shot(at(0, 0), at(0.002, 0.001))], pin)!;
    const tee = paint.segs[0].a;
    expect(paint.pin).not.toBeNull();
    expect(Math.abs(paint.pin!.x - tee.x)).toBeLessThan(0.5);
    expect(paint.pin!.y).toBeLessThan(tee.y);
  });

  it("orients on where the last shot finished when the capture carries no pin", () => {
    const paint = paintHole([shot(at(0, 0), at(0.0019, 0.001))], null)!;
    const s = paint.segs[0];
    expect(Math.abs(s.b.x - s.a.x)).toBeLessThan(0.5);
    expect(s.b.y).toBeLessThan(s.a.y);
    expect(paint.pin).toBeNull();
  });

  it("keeps a degenerate bearing finite instead of spinning on noise", () => {
    // Tee and target 5 m apart — under the 10 m floor, rotation is skipped.
    const paint = paintHole([shot(at(0, 0), at(0.00005, 0))], null)!;
    for (const s of paint.segs) {
      expect(Number.isFinite(s.a.x + s.a.y + s.b.x + s.b.y)).toBe(true);
    }
  });

  it("holds the card's 3:4 aspect whatever the hole's shape", () => {
    for (const end of [at(0.004, 0), at(0.0008, 0.0002), at(0.001, 0.003)]) {
      const vb = paintHole([shot(at(0, 0), end)], null)!.viewBox;
      expect(vb.w / vb.h).toBeCloseTo(3 / 4, 2);
    }
  });

  it("falls back to null when the frame spans like a mis-assigned shot", () => {
    // 0.01° lat ≈ 1.1 km — no golf hole, so no drawing.
    expect(paintHole([shot(at(0, 0), at(0.01, 0))], null)).toBeNull();
  });
});

describe("paintHole — the imagery", () => {
  // A straight par 4 running due north, pin on the line — bearing 0, so the
  // rotation is identity and every tile matrix is checkable by hand.
  const paint = paintHole([shot(at(0, 0), at(0.0025, 0))], at(0.0033, 0))!;

  it("addresses Esri World Imagery within the zoom walk and tile budget", () => {
    expect(paint.tiles.length).toBeGreaterThan(0);
    expect(paint.tiles.length).toBeLessThanOrEqual(16);
    for (const t of paint.tiles) {
      const m = t.href.match(TILE_RE);
      expect(m).not.toBeNull();
      const z = Number(m![1]);
      expect(z).toBeGreaterThanOrEqual(13);
      expect(z).toBeLessThanOrEqual(19);
    }
  });

  it("covers the tee — the anchor's Mercator cell is among the tiles", () => {
    const cells = paint.tiles.map((t) => {
      const [, z, y, x] = t.href.match(TILE_RE)!.map(Number);
      return { z, y, x };
    });
    const z = cells[0].z;
    const n = 2 ** z;
    const tx = Math.floor(((LON + 180) / 360) * n);
    const latRad = (LAT * Math.PI) / 180;
    const ty = Math.floor(((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n);
    expect(cells).toContainEqual({ z, y: ty, x: tx });
  });

  it("lays each unrotated tile axis-aligned at the ground scale of its zoom", () => {
    for (const t of paint.tiles) {
      const z = Number(t.href.match(TILE_RE)![1]);
      const [a, b, c, d] = t.transform
        .match(/^matrix\((.+)\)$/)![1]
        .split(" ")
        .map(Number);
      // Bearing 0: east stays east (b ≈ 0), south stays down (c ≈ 0).
      expect(Math.abs(b)).toBeLessThan(0.001);
      expect(Math.abs(c)).toBeLessThan(0.001);
      // Ground metres per tile pixel, in the frame's own lon scale — plus
      // the one-pixel overscan that hides rotated tile seams.
      const kx = 111_320 * Math.cos((LAT * Math.PI) / 180);
      const expected = (((360 / 2 ** z) * kx) / 256) * (257 / 256);
      expect(a).toBeCloseTo(expected, 3);
      // Mercator is conformal, so the tile is near-square on the ground.
      expect(Math.abs(d - a) / a).toBeLessThan(0.05);
      expect(d).toBeGreaterThan(0);
    }
  });
});
