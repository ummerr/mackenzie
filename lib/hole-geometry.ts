/* The hole drawn under the trace — the diary's own yardage-book frame.
 *
 * `paintHole` projects a hole's shots (WGS84 degrees, surfaced by the Garmin
 * adapter) and the course geometry the map already owns
 * (public/data/holes/<slug>.geojson, drawn from OSM by scripts/fetch-holes.mjs)
 * into one local-metre frame, rotated so the target sits due north of the
 * tee — tee at the bottom of the card, green at the top. Everything here is
 * our own drawing of the record's own numbers; Garmin's raster imagery stays
 * never-fetched (DECISIONS.md).
 *
 * Feature selection is by proximity, never by the geojson's hole refs or
 * centerlines: Harding's file shares refs 1–9 with the adjacent Fleming 9 and
 * is missing the hole-18 centerline, so the frame is built from the shots,
 * the pin, and the matched green, and every polygon that touches it is
 * painted — the SVG edge clips the neighbours, which reads as context, like
 * a yardage book.
 */

import type { GarminShot } from "./garmin-shots";

export interface LatLon {
  lat: number;
  lon: number;
}

export interface XY {
  x: number;
  y: number;
}

/** The polygon kinds the card paints, in paint order (first = bottom). */
export type CourseKind =
  | "rough"
  | "fairway"
  | "tee"
  | "water"
  | "penalty"
  | "bunker"
  | "green";

const PAINT_ORDER: CourseKind[] = [
  "rough",
  "fairway",
  "tee",
  "water",
  "penalty",
  "bunker",
  "green",
];
const KIND_SET = new Set<string>(PAINT_ORDER);

/** The geojson narrowed to what is read here — structural, like the seams. */
export interface CourseGeo {
  features: {
    properties: { k: string; ref?: string };
    geometry: { type: string; coordinates: unknown };
  }[];
}

export interface HolePaint {
  /** Local metres, y down, target up. */
  viewBox: { x: number; y: number; w: number; h: number };
  /** Painted bottom-to-top in this order; coords rounded to 0.1 m. */
  polys: { kind: CourseKind; d: string }[];
  pin: XY | null;
  /** The shot segments in the same frame. */
  segs: { a: XY; b: XY }[];
}

/* ── slug ─────────────────────────────────────────────────────────────── */

/* Mirror of scripts/link-rounds.mjs garminFacilitySlug (which the app cannot
 * import — the pipeline's untyped .mjs side of the seam). A parity test in
 * tests/hole-geometry.test.ts holds the two together. */
const GARMIN_FACILITY_ALIASES: Record<string, string> = {
  "harding-park-golf-course": "tpc-harding-park-golf-course",
};

/** "Harding Park Golf Course ~ Harding" → "tpc-harding-park-golf-course" —
 *  Garmin writes "Facility ~ Layout"; the geojson files are named by
 *  facility slug. */
export function garminCourseSlug(courseName: string): string {
  const facility = courseName.split("~")[0].trim();
  const slug = facility
    .toLowerCase()
    .replace(/['‘’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return GARMIN_FACILITY_ALIASES[slug] ?? slug;
}

/* ── the frame ────────────────────────────────────────────────────────── */

/** Equirectangular local-metre scale about a latitude — the attested
 *  constants from scripts/fetch-holes.mjs. */
const M_PER_DEG_LAT = 110_540;
const mPerDegLon = (latRad: number) => 111_320 * Math.cos(latRad);

/** A hole whose frame spans more than this is a mis-assigned shot, not a
 *  hole — fall back to the bare trace rather than print a wild drawing. */
const MAX_FRAME_M = 700;
/** A green farther than this from the hole's last point is another hole's. */
const GREEN_MATCH_M = 120;
/** Tee polygons within this of the first shot's start belong to the frame. */
const TEE_MATCH_M = 40;
/** Below this tee→target distance the bearing is noise — skip rotation. */
const MIN_BEARING_M = 10;

const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);

const centroid = (pts: XY[]): XY => {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
};

const bboxOf = (pts: XY[]) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
};

type Bbox = ReturnType<typeof bboxOf>;
const intersects = (a: Bbox, b: Bbox) =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

/** Ray casting, the scripts/fetch-holes.mjs idiom. */
const pointInRing = (pt: XY, ring: XY[]): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (
      a.y > pt.y !== b.y > pt.y &&
      pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
};

const round1 = (v: number) => Math.round(v * 10) / 10;
const pathOf = (ring: XY[]) =>
  `M${ring.map((p) => `${round1(p.x)} ${round1(p.y)}`).join("L")}Z`;

/**
 * Project this hole's shots and its patch of the course into one SVG-ready
 * frame, or null when there is nothing to draw it from — no course file, or
 * no shot carrying degrees. The caller falls back to the bare trace.
 */
export function paintHole(
  course: CourseGeo | null,
  shots: GarminShot[],
  pin: LatLon | null,
): HolePaint | null {
  if (!course?.features) return null;
  const geoShots = shots.filter((s) => s.startGeo !== null && s.endGeo !== null);
  if (geoShots.length === 0) return null;

  // Local metres about the first shot's start — east right, north up for now.
  const anchor = geoShots[0].startGeo as LatLon;
  const kx = mPerDegLon((anchor.lat * Math.PI) / 180);
  const project = (p: LatLon): XY => ({
    x: (p.lon - anchor.lon) * kx,
    y: (p.lat - anchor.lat) * M_PER_DEG_LAT,
  });

  const rawSegs = geoShots.map((s) => ({
    a: project(s.startGeo as LatLon),
    b: project(s.endGeo as LatLon),
  }));
  const tee = rawSegs[0].a;
  const lastEnd = rawSegs[rawSegs.length - 1].b;
  const pinPt = pin ? project(pin) : null;

  // The course's paintable polygons, projected. Outer rings only; anything
  // that is not a Polygon of a known kind is skipped, not guessed at. The
  // driving range's furniture — target greens, mats — is tagged green/tee in
  // OSM too, so anything centred inside a `range` polygon is scenery of the
  // range, not of a hole, and stays out (Harding 1 runs beside the range).
  const outerRingOf = (f: CourseGeo["features"][number]): XY[] | null => {
    if (f.geometry?.type !== "Polygon") return null;
    const outer = (f.geometry.coordinates as [number, number][][])?.[0];
    if (!Array.isArray(outer) || outer.length < 3) return null;
    return outer.map(([lon, lat]) => project({ lat, lon }));
  };
  const rangeRings = course.features
    .filter((f) => f.properties?.k === "range")
    .map(outerRingOf)
    .filter((r): r is XY[] => r !== null);
  const polys: { kind: CourseKind; ring: XY[]; center: XY; bbox: Bbox }[] = [];
  for (const f of course.features) {
    const kind = f.properties?.k;
    if (!KIND_SET.has(kind)) continue;
    const ring = outerRingOf(f);
    if (!ring) continue;
    const center = centroid(ring);
    if (rangeRings.some((rr) => pointInRing(center, rr))) continue;
    polys.push({ kind: kind as CourseKind, ring, center, bbox: bboxOf(ring) });
  }

  // Orientation target: the day's pin, else the green this hole ends on,
  // else where the last heard shot finished.
  const greens = polys.filter((p) => p.kind === "green");
  const near = pinPt ?? lastEnd;
  let matchedGreen: (typeof polys)[number] | null = null;
  for (const g of greens) {
    if (dist(g.center, near) > GREEN_MATCH_M) continue;
    if (!matchedGreen || dist(g.center, near) < dist(matchedGreen.center, near)) {
      matchedGreen = g;
    }
  }
  const target = pinPt ?? matchedGreen?.center ?? lastEnd;

  // Rotate about the anchor so the target sits due north of the tee, then
  // flip north into SVG's y-down.
  const bearing =
    dist(tee, target) < MIN_BEARING_M ? 0 : Math.atan2(target.x - tee.x, target.y - tee.y);
  const cos = Math.cos(bearing);
  const sin = Math.sin(bearing);
  const toSvg = (p: XY): XY => ({
    x: p.x * cos - p.y * sin,
    y: -(p.x * sin + p.y * cos),
  });

  const segs = rawSegs.map((s) => ({ a: toSvg(s.a), b: toSvg(s.b) }));
  const svgPin = pinPt ? toSvg(pinPt) : null;

  // The frame: shots ∪ pin ∪ the matched green ∪ the tee boxes the round
  // left from — padded a tenth of its larger span.
  const framePts: XY[] = segs.flatMap((s) => [s.a, s.b]);
  if (svgPin) framePts.push(svgPin);
  if (matchedGreen) framePts.push(...matchedGreen.ring.map(toSvg));
  const teeStart = segs[0].a;
  for (const p of polys) {
    if (p.kind === "tee" && dist(toSvg(p.center), teeStart) <= TEE_MATCH_M) {
      framePts.push(...p.ring.map(toSvg));
    }
  }
  const box = bboxOf(framePts);
  const span = Math.max(box.maxX - box.minX, box.maxY - box.minY);
  if (span > MAX_FRAME_M) return null; // a mis-assigned shot, not a hole
  const pad = Math.max(span, TEE_MATCH_M) * 0.1;
  const frame: Bbox = {
    minX: box.minX - pad,
    minY: box.minY - pad,
    maxX: box.maxX + pad,
    maxY: box.maxY + pad,
  };

  // Paint everything that touches the frame; the SVG edge clips the rest.
  const painted = polys
    .map((p) => ({ kind: p.kind, ring: p.ring.map(toSvg) }))
    .filter((p) => intersects(bboxOf(p.ring), frame))
    .sort((a, b) => PAINT_ORDER.indexOf(a.kind) - PAINT_ORDER.indexOf(b.kind))
    .map((p) => ({ kind: p.kind, d: pathOf(p.ring) }));

  return {
    viewBox: {
      x: round1(frame.minX),
      y: round1(frame.minY),
      w: round1(frame.maxX - frame.minX),
      h: round1(frame.maxY - frame.minY),
    },
    polys: painted,
    pin: svgPin ? { x: round1(svgPin.x), y: round1(svgPin.y) } : null,
    segs: segs.map((s) => ({
      a: { x: round1(s.a.x), y: round1(s.a.y) },
      b: { x: round1(s.b.x), y: round1(s.b.y) },
    })),
  };
}
