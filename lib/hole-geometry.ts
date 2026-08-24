/* The hole under the trace — Esri World Imagery, the same tiles the /courses
 * map stands on.
 *
 * `paintHole` projects a hole's shots (WGS84 degrees, surfaced by the Garmin
 * adapter) into one local-metre frame, rotated so the day's pin sits due
 * north of the tee — tee at the bottom of the card, green at the top — and
 * lays the photograph under it: for every Web Mercator tile touching the
 * frame, an affine transform that carries the 256-px tile image into the
 * rotated frame. The tile URLs are deterministic; the rasters are loaded by
 * the reader's browser straight from Esri's public service (attributed on
 * the page), never fetched or stored at build. The trace and marks remain
 * our own drawing of the record's own numbers, and Garmin's raster imagery
 * stays never-fetched (DECISIONS.md).
 *
 * The OSM course polygons that used to be painted here were wrong in both
 * directions — fairways OSM never mapped rendered as rough, and a green
 * matched by proximity could rotate the whole card toward a neighbouring
 * hole — so the drawing now depends on nothing but the capture itself:
 * the shots and the pin. */

import type { GarminShot } from "./garmin-shots";

export interface LatLon {
  lat: number;
  lon: number;
}

export interface XY {
  x: number;
  y: number;
}

export interface HolePaint {
  /** Local metres, y down, pin-side up. Aspect fixed to the card's. */
  viewBox: { x: number; y: number; w: number; h: number };
  /** The imagery under the trace — each tile's 256-px image carried into the
   *  frame by its own matrix (the rotation lives inside it). */
  tiles: { href: string; transform: string }[];
  pin: XY | null;
  /** The shot segments in the same frame. */
  segs: { a: XY; b: XY }[];
}

/* ── the frame ────────────────────────────────────────────────────────── */

/** Equirectangular local-metre scale about a latitude — the attested
 *  constants from scripts/fetch-holes.mjs. */
const M_PER_DEG_LAT = 110_540;
const mPerDegLon = (latRad: number) => 111_320 * Math.cos(latRad);

/** A hole whose frame spans more than this is a mis-assigned shot, not a
 *  hole — fall back to the bare trace rather than print a wild drawing. */
const MAX_FRAME_M = 700;
/** Below this tee→target distance the bearing is noise — skip rotation. */
const MIN_BEARING_M = 10;
/** Width over height of the card the frame fills (aspect-[3/4] on the
 *  page) — the frame is widened or lengthened to it so the photograph
 *  reaches every edge instead of letterboxing. */
const FRAME_ASPECT = 3 / 4;
/** Frame padding around the marks, as a share of the larger span. */
const PAD_SHARE = 0.12;
/** The padding floor in metres, so a one-chip hole still gets air. */
const MIN_PAD_SPAN_M = 60;

const round1 = (v: number) => Math.round(v * 10) / 10;

/* ── the imagery ──────────────────────────────────────────────────────── */

/** The /courses map's tile service, verbatim (public/courses/src/map.js). */
const TILE_URL = (z: number, y: number, x: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
const TILE_PX = 256;
/** Each tile is scaled up by one source pixel about its NW corner, so
 *  neighbours overlap instead of showing an antialiased hairline seam when
 *  the frame is rotated. Costs at most one ground-pixel of drift at a
 *  tile's far edge — invisible at these zooms. */
const TILE_OVERSCAN = (TILE_PX + 1) / TILE_PX;
/** Zoom is the deepest level that covers the frame within the budget —
 *  a hole card is ~300 CSS px, so ~0.5–1 m/px is already past the screen. */
const MAX_TILE_ZOOM = 19;
const MIN_TILE_ZOOM = 13;
const MAX_TILES = 16;

/** Web Mercator, normalized to [0,1) — ×2^z gives the tile grid. */
const mercX = (lon: number) => (lon + 180) / 360;
const mercY = (lat: number) => {
  const r = (lat * Math.PI) / 180;
  return (1 - Math.asinh(Math.tan(r)) / Math.PI) / 2;
};
const tileLon = (x: number, n: number) => (x / n) * 360 - 180;
const tileLat = (y: number, n: number) =>
  (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;

/**
 * Project this hole's shots into one SVG-ready frame over the imagery, or
 * null when there is nothing to draw it from — no shot carrying degrees, or
 * a frame so wide it must be a mis-assigned shot. The caller falls back to
 * the bare trace.
 */
export function paintHole(shots: GarminShot[], pin: LatLon | null): HolePaint | null {
  const geoShots = shots.filter((s) => s.startGeo !== null && s.endGeo !== null);
  if (geoShots.length === 0) return null;

  // Local metres about the first shot's start — east right, north up for now.
  const anchor = geoShots[0].startGeo as LatLon;
  const kx = mPerDegLon((anchor.lat * Math.PI) / 180);
  const project = (p: LatLon): XY => ({
    x: (p.lon - anchor.lon) * kx,
    y: (p.lat - anchor.lat) * M_PER_DEG_LAT,
  });
  const unproject = (p: XY): LatLon => ({
    lat: anchor.lat + p.y / M_PER_DEG_LAT,
    lon: anchor.lon + p.x / kx,
  });

  const rawSegs = geoShots.map((s) => ({
    a: project(s.startGeo as LatLon),
    b: project(s.endGeo as LatLon),
  }));
  const tee = rawSegs[0].a;
  const lastEnd = rawSegs[rawSegs.length - 1].b;
  const pinPt = pin ? project(pin) : null;

  // Orientation target: the day's pin, else where the last heard shot
  // finished. Rotate about the anchor so it sits due north of the tee, then
  // flip north into SVG's y-down. The map is a reflection (det −1), so it
  // is its own inverse — `toSvg` runs both ways.
  const target = pinPt ?? lastEnd;
  const dTee = Math.hypot(target.x - tee.x, target.y - tee.y);
  const bearing = dTee < MIN_BEARING_M ? 0 : Math.atan2(target.x - tee.x, target.y - tee.y);
  const cos = Math.cos(bearing);
  const sin = Math.sin(bearing);
  const toSvg = (p: XY): XY => ({
    x: p.x * cos - p.y * sin,
    y: -(p.x * sin + p.y * cos),
  });

  const segs = rawSegs.map((s) => ({ a: toSvg(s.a), b: toSvg(s.b) }));
  const svgPin = pinPt ? toSvg(pinPt) : null;

  // The frame: shots ∪ pin, padded, then stretched to the card's aspect so
  // the imagery reaches every edge.
  const framePts: XY[] = segs.flatMap((s) => [s.a, s.b]);
  if (svgPin) framePts.push(svgPin);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of framePts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const span = Math.max(maxX - minX, maxY - minY);
  if (span > MAX_FRAME_M) return null; // a mis-assigned shot, not a hole
  const pad = Math.max(span, MIN_PAD_SPAN_M) * PAD_SHARE;
  let w = maxX - minX + pad * 2;
  let h = maxY - minY + pad * 2;
  let x0 = minX - pad;
  let y0 = minY - pad;
  if (w < h * FRAME_ASPECT) {
    const grow = h * FRAME_ASPECT - w;
    x0 -= grow / 2;
    w += grow;
  } else if (h < w / FRAME_ASPECT) {
    const grow = w / FRAME_ASPECT - h;
    y0 -= grow / 2;
    h += grow;
  }

  return {
    viewBox: { x: round1(x0), y: round1(y0), w: round1(w), h: round1(h) },
    tiles: tilesFor({ x0, y0, w, h }, toSvg, project, unproject),
    pin: svgPin ? { x: round1(svgPin.x), y: round1(svgPin.y) } : null,
    segs: segs.map((s) => ({
      a: { x: round1(s.a.x), y: round1(s.a.y) },
      b: { x: round1(s.b.x), y: round1(s.b.y) },
    })),
  };
}

/** The tiles covering the frame, each with the affine that lays its 256-px
 *  image into the rotated local-metre frame. Over a hole-sized extent the
 *  Mercator curvature is far below a pixel, so three projected corners per
 *  tile pin the whole matrix. */
function tilesFor(
  frame: { x0: number; y0: number; w: number; h: number },
  toSvg: (p: XY) => XY,
  project: (p: LatLon) => XY,
  unproject: (p: XY) => LatLon,
): { href: string; transform: string }[] {
  // The frame's corners, carried back to degrees (toSvg is self-inverse),
  // bound the tile walk — the rotated quad's bbox in Mercator space.
  const corners = [
    { x: frame.x0, y: frame.y0 },
    { x: frame.x0 + frame.w, y: frame.y0 },
    { x: frame.x0, y: frame.y0 + frame.h },
    { x: frame.x0 + frame.w, y: frame.y0 + frame.h },
  ].map((p) => unproject(toSvg(p)));
  const mxs = corners.map((c) => mercX(c.lon));
  const mys = corners.map((c) => mercY(c.lat));
  const minMx = Math.min(...mxs);
  const maxMx = Math.max(...mxs);
  const minMy = Math.min(...mys);
  const maxMy = Math.max(...mys);

  // The deepest zoom whose cover fits the budget.
  let z = MAX_TILE_ZOOM;
  let n = 2 ** z;
  for (; z > MIN_TILE_ZOOM; z--, n = 2 ** z) {
    const count =
      (Math.floor(maxMx * n) - Math.floor(minMx * n) + 1) *
      (Math.floor(maxMy * n) - Math.floor(minMy * n) + 1);
    if (count <= MAX_TILES) break;
  }

  const r5 = (v: number) => Math.round(v * 1e5) / 1e5;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  // Tile grid → degrees → local metres → the rotated frame.
  const cornerOf = (tx: number, ty: number): XY =>
    toSvg(project({ lat: tileLat(ty, n), lon: tileLon(tx, n) }));

  const tiles: { href: string; transform: string }[] = [];
  for (let ty = Math.floor(minMy * n); ty <= Math.floor(maxMy * n); ty++) {
    for (let tx = Math.floor(minMx * n); tx <= Math.floor(maxMx * n); tx++) {
      const nw = cornerOf(tx, ty);
      const ne = cornerOf(tx + 1, ty);
      const sw = cornerOf(tx, ty + 1);
      const a = ((ne.x - nw.x) / TILE_PX) * TILE_OVERSCAN;
      const b = ((ne.y - nw.y) / TILE_PX) * TILE_OVERSCAN;
      const c = ((sw.x - nw.x) / TILE_PX) * TILE_OVERSCAN;
      const d = ((sw.y - nw.y) / TILE_PX) * TILE_OVERSCAN;
      tiles.push({
        href: TILE_URL(z, ty, tx),
        transform: `matrix(${r5(a)} ${r5(b)} ${r5(c)} ${r5(d)} ${r2(nw.x)} ${r2(nw.y)})`,
      });
    }
  }
  return tiles;
}
