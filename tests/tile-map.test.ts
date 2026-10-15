import { describe, expect, it } from "vitest";
import { centerMosaic, fitMosaic, haversineMiles, tileXY, TILE } from "../lib/tile-map";

/* The static map's arithmetic. A wrong tile is a map of somewhere else. */

const SF = { lon: -122.4194, lat: 37.7749 };
const LA = { lon: -118.2437, lat: 34.0522 };

describe("tileXY", () => {
  it("puts the origin at the middle tile and Null Island in the right quadrant", () => {
    expect(tileXY({ lon: 0, lat: 0 }, 1)).toEqual({ x: 1, y: 1 });
    const sf = tileXY(SF, 10);
    expect(Math.floor(sf.x)).toBe(163);
    expect(Math.floor(sf.y)).toBe(395);
  });
});

describe("haversineMiles", () => {
  it("SF to LA is about 347 miles", () => {
    expect(haversineMiles(SF, LA)).toBeCloseTo(347.4, 0);
  });
});

describe("centerMosaic", () => {
  it("covers the box with whole tiles and projects the centre to the middle", () => {
    const m = centerMosaic(SF, 12, 640, 400);
    expect(m.tiles.length).toBeGreaterThanOrEqual(6);
    for (const t of m.tiles) {
      expect(t.left).toBeGreaterThan(-TILE);
      expect(t.top).toBeGreaterThan(-TILE);
      expect(t.left).toBeLessThan(640);
      expect(t.top).toBeLessThan(400);
    }
    const c = m.project(SF);
    expect(c.x).toBeCloseTo(320, 6);
    expect(c.y).toBeCloseTo(200, 6);
  });
});

describe("fitMosaic", () => {
  it("picks the deepest zoom that keeps every point inside the padded box", () => {
    const m = fitMosaic([SF, LA], 640, 400, { pad: 0.1 });
    for (const p of [SF, LA]) {
      const { x, y } = m.project(p);
      expect(x).toBeGreaterThanOrEqual(64 - 1);
      expect(x).toBeLessThanOrEqual(576 + 1);
      expect(y).toBeGreaterThanOrEqual(40 - 1);
      expect(y).toBeLessThanOrEqual(360 + 1);
    }
    const deeper = centerMosaic(SF, m.zoom + 1, 640, 400);
    const far = deeper.project(LA);
    expect(far.x < 0 || far.x > 640 || far.y < 0 || far.y > 400 || m.zoom === 13).toBe(true);
  });

  it("one point gets the deepest zoom asked for", () => {
    expect(fitMosaic([SF], 300, 300, { maxZoom: 15 }).zoom).toBe(15);
  });
});

describe("spreadPins", () => {
  it("leaves far pins alone and pushes near ones to the minimum distance", async () => {
    const { spreadPins } = await import("../lib/tile-map");
    const far = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    expect(spreadPins(far, 30)).toEqual(far);
    const near = spreadPins([{ x: 50, y: 50 }, { x: 52, y: 50 }, { x: 50, y: 51 }], 30);
    for (let i = 0; i < near.length; i++)
      for (let j = i + 1; j < near.length; j++) expect(Math.hypot(near[i].x - near[j].x, near[i].y - near[j].y)).toBeGreaterThanOrEqual(29.9);
    const same = spreadPins([{ x: 10, y: 10 }, { x: 10, y: 10 }], 20);
    expect(Math.hypot(same[0].x - same[1].x, same[0].y - same[1].y)).toBeCloseTo(20, 6);
  });
});
