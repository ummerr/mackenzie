/* Scout — how to play each hole of a course, from three records joined on
 * one drawing.
 *
 *   the course    OSM hole geometry (public/data/holes/<slug>.geojson): the
 *                 centreline, the bunkers, the green. Distances are COMPUTED
 *                 from it — a bunker's carry, a green's depth, where a tee
 *                 set stands — never typed, so the card cannot disagree with
 *                 the map it is drawn on.
 *   the notes     data/scout/<slug>.json: the scorecard and one sourced
 *                 paragraph of strategy per hole — which side, which miss is
 *                 dead, which pins are sucker pins. Every claim names its
 *                 source; nothing numeric lives there except the card.
 *   the golfer    the on-course tee-club bands (where the driver and the
 *                 hybrid actually finish, p25–p75, and how wide), the range
 *                 carries for the irons, and the standing rules /plan already
 *                 states: driver only where there is width, middle of the
 *                 green beyond 140, one more club.
 *
 * Everything here is pure. The page composes the inputs; the client only
 * indexes into what was computed here, so every number on the card is
 * testable without a browser. Local geometry is in metres (the frame the
 * imagery is laid in); every number a golfer reads is in yards.
 */

import { short } from "./clubs";
import type { GarminHole, GarminRound, GarminShots } from "./garmin-shots";
import {
  fitFrame,
  localProjector,
  rotatorToSvg,
  tilesFor,
  type LatLon,
  type XY,
} from "./hole-geometry";
import type { ClubProfile } from "./stats";

export const YD_PER_M = 1.0936133;
export const M_PER_YD = 0.9144;
const yd = (m: number) => Math.round(m * YD_PER_M);
const r1 = (v: number) => Math.round(v * 10) / 10;

/* ── the strategy file ─────────────────────────────────────────────────── */

export const PIN_POSITIONS = [
  "front-left", "front-centre", "front-right",
  "middle-left", "middle-centre", "middle-right",
  "back-left", "back-centre", "back-right",
] as const;
export type PinPos = (typeof PIN_POSITIONS)[number];
export type Side = "left" | "centre" | "right";
export type Shape = "straight" | "dogleg-left" | "dogleg-right" | "double-dogleg";
export type TeeClubHint = "driver" | "hybrid" | "iron";

export interface ScoutSource {
  title: string;
  url: string | null;
  /** When the page is not the plain truth — e.g. a rerouted tournament order. */
  note: string | null;
}

export interface ScoutTee {
  name: string;
  rating: number;
  slope: number;
  /** 18 yardages, hole 1 first. */
  yards: number[];
}

export interface ScoutHoleSpec {
  number: number;
  par: number;
  /** Men's stroke index, 1–18. */
  hcp: number;
  shape: Shape;
  tee: { favour: Side; club: TeeClubHint | null; why: string; source: string };
  hazards: { what: string; side: Side; source: string }[];
  green: { missSafe: string; missDead: string; note: string; source: string };
  suckerPins: PinPos[];
  target: { text: string; source: string };
}

export interface ScoutCourse {
  facilitySlug: string;
  layoutSlug: string;
  /** The Grint display string, verbatim — the join to the scorecards. */
  grintName: string;
  name: string;
  sources: Record<string, ScoutSource>;
  tees: ScoutTee[];
  osm: { centrelineBy: string; missingCentreline: number[]; missingGreen: number[] };
  holes: ScoutHoleSpec[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const fail = (path: string, what: string): never => {
  throw new Error(`scout ${path}: ${what}`);
};
const str = (o: Record<string, unknown>, k: string, path: string): string => {
  const v = o[k];
  return typeof v === "string" && v.length > 0 ? v : fail(`${path}.${k}`, "is not a non-empty string");
};
const num = (o: Record<string, unknown>, k: string, path: string): number => {
  const v = o[k];
  return typeof v === "number" && Number.isFinite(v) ? v : fail(`${path}.${k}`, "is not a number");
};
const oneOf = <T extends string>(v: unknown, set: readonly T[], path: string): T =>
  (set as readonly string[]).includes(v as string) ? (v as T) : fail(path, `"${String(v)}" is not one of ${set.join("|")}`);

/** The contract, enforced. Throws naming the path; the validator reports
 *  the same message without the stack. */
export function parseScoutCourse(raw: unknown): ScoutCourse {
  if (!isObj(raw)) return fail("", "is not an object");
  const sources: Record<string, ScoutSource> = {};
  if (!isObj(raw.sources)) return fail("sources", "is not an object");
  for (const [k, v] of Object.entries(raw.sources)) {
    if (!isObj(v)) return fail(`sources.${k}`, "is not an object");
    const url = v.url ?? null;
    if (url !== null && (typeof url !== "string" || !/^https?:\/\//.test(url))) fail(`sources.${k}.url`, "is not a URL or null");
    sources[k] = { title: str(v, "title", `sources.${k}`), url: url as string | null, note: typeof v.note === "string" ? v.note : null };
  }
  const src = (o: Record<string, unknown>, path: string): string => {
    const s = str(o, "source", path);
    return s in sources ? s : fail(`${path}.source`, `"${s}" is not in sources`);
  };
  if (!Array.isArray(raw.tees) || raw.tees.length === 0) return fail("tees", "is not a non-empty list");
  const tees: ScoutTee[] = raw.tees.map((t, i) => {
    const p = `tees[${i}]`;
    if (!isObj(t)) return fail(p, "is not an object");
    const yards = t.yards;
    if (!Array.isArray(yards) || yards.length !== 18 || !yards.every((y) => Number.isInteger(y) && y > 50 && y < 800))
      fail(`${p}.yards`, "is not 18 hole yardages");
    return { name: str(t, "name", p), rating: num(t, "rating", p), slope: num(t, "slope", p), yards: yards as number[] };
  });
  if (!Array.isArray(raw.holes) || raw.holes.length !== 18) return fail("holes", "is not a list of 18");
  const holes: ScoutHoleSpec[] = raw.holes.map((h, i) => {
    const p = `holes[${i}]`;
    if (!isObj(h)) return fail(p, "is not an object");
    const number = num(h, "number", p);
    if (number !== i + 1) fail(`${p}.number`, `is ${number}, expected ${i + 1}`);
    const par = num(h, "par", p);
    if (![3, 4, 5].includes(par)) fail(`${p}.par`, "is not 3, 4 or 5");
    const hcp = num(h, "hcp", p);
    if (!Number.isInteger(hcp) || hcp < 1 || hcp > 18) fail(`${p}.hcp`, "is not 1..18");
    if (!isObj(h.tee)) return fail(`${p}.tee`, "is not an object");
    if (!isObj(h.green)) return fail(`${p}.green`, "is not an object");
    if (!isObj(h.target)) return fail(`${p}.target`, "is not an object");
    const club = h.tee.club ?? null;
    return {
      number,
      par,
      hcp,
      shape: oneOf(h.shape, ["straight", "dogleg-left", "dogleg-right", "double-dogleg"] as const, `${p}.shape`),
      tee: {
        favour: oneOf(h.tee.favour, ["left", "centre", "right"] as const, `${p}.tee.favour`),
        club: club === null ? null : oneOf(club, ["driver", "hybrid", "iron"] as const, `${p}.tee.club`),
        why: str(h.tee, "why", `${p}.tee`),
        source: src(h.tee, `${p}.tee`),
      },
      hazards: (Array.isArray(h.hazards) ? h.hazards : fail(`${p}.hazards`, "is not a list")).map((z, j) => {
        const q = `${p}.hazards[${j}]`;
        if (!isObj(z)) return fail(q, "is not an object");
        return { what: str(z, "what", q), side: oneOf(z.side, ["left", "centre", "right"] as const, `${q}.side`), source: src(z, q) };
      }),
      green: {
        missSafe: str(h.green, "missSafe", `${p}.green`),
        missDead: str(h.green, "missDead", `${p}.green`),
        note: str(h.green, "note", `${p}.green`),
        source: src(h.green, `${p}.green`),
      },
      suckerPins: (Array.isArray(h.suckerPins) ? h.suckerPins : fail(`${p}.suckerPins`, "is not a list")).map((s, j) =>
        oneOf(s, PIN_POSITIONS, `${p}.suckerPins[${j}]`),
      ),
      target: { text: str(h.target, "text", `${p}.target`), source: src(h.target, `${p}.target`) },
    };
  });
  for (const t of tees) {
    // The card's own arithmetic: a tee set's yardages are per hole, so a
    // mistyped hole shows up as a total nobody prints.
    const total = t.yards.reduce((a, b) => a + b, 0);
    if (total < 4000 || total > 8000) fail(`tees[${t.name}]`, `totals ${total} yards`);
  }
  if (!isObj(raw.osm)) return fail("osm", "is not an object");
  const ints = (k: string): number[] => {
    const v = raw.osm as Record<string, unknown>;
    const a = v[k];
    return Array.isArray(a) && a.every((n) => Number.isInteger(n)) ? (a as number[]) : fail(`osm.${k}`, "is not a list of hole numbers");
  };
  return {
    facilitySlug: str(raw, "facilitySlug", ""),
    layoutSlug: str(raw, "layoutSlug", ""),
    grintName: str(raw, "grintName", ""),
    name: str(raw, "name", ""),
    sources,
    tees,
    osm: { centrelineBy: str(raw.osm, "centrelineBy", "osm"), missingCentreline: ints("missingCentreline"), missingGreen: ints("missingGreen") },
    holes,
  };
}

/* ── the course geometry ───────────────────────────────────────────────── */

export interface HoleGeoJSON {
  features: {
    properties: Record<string, unknown>;
    geometry: { type: string; coordinates: unknown };
  }[];
}

const toLatLon = (c: unknown): LatLon => {
  const [lon, lat] = c as [number, number];
  return { lat, lon };
};

/** The centreline OSM drew for this hole, back tee → green, or null. Matched
 *  on `ref` AND the men's stroke index, because a facility with a second
 *  course (Harding's Fleming nine) reuses refs 1–9. */
export function centreline(geo: HoleGeoJSON, number: number, hcp: number): LatLon[] | null {
  const f = geo.features.find(
    (x) =>
      x.properties.k === "hole" &&
      x.geometry.type === "LineString" &&
      String(x.properties.ref) === String(number) &&
      x.properties.hcp === hcp,
  );
  return f ? (f.geometry.coordinates as unknown[]).map(toLatLon) : null;
}

const polygons = (geo: HoleGeoJSON, kind: string): LatLon[][] =>
  geo.features
    .filter((f) => f.properties.k === kind && f.geometry.type === "Polygon")
    .map((f) => ((f.geometry.coordinates as unknown[][])[0] ?? []).map(toLatLon));

const centroid = (pts: XY[]): XY => ({
  x: pts.reduce((a, p) => a + p.x, 0) / pts.length,
  y: pts.reduce((a, p) => a + p.y, 0) / pts.length,
});

export function polylineLength(line: XY[]): number {
  let l = 0;
  for (let i = 1; i < line.length; i++) l += Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y);
  return l;
}

/** The point `d` metres along the polyline from its start — clamped to the
 *  ends. */
export function pointAlong(line: XY[], d: number): XY {
  if (d <= 0) return line[0];
  let left = d;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= seg) {
      const t = seg === 0 ? 0 : left / seg;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= seg;
  }
  return line[line.length - 1];
}

/** The unit direction of the polyline at `d` metres along it. */
export function directionAt(line: XY[], d: number): XY {
  let left = d;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= seg || i === line.length - 1) return seg === 0 ? { x: 0, y: 1 } : { x: (b.x - a.x) / seg, y: (b.y - a.y) / seg };
    left -= seg;
  }
  return { x: 0, y: 1 };
}

/** Where a point stands relative to the hole: metres along the centreline
 *  from its start (nearest segment, clamped) and metres to the side —
 *  positive RIGHT of the line as the hole is played, negative left. */
export function alongAndSide(line: XY[], p: XY): { along: number; side: number } {
  let best = { along: 0, side: 0, dist: Infinity };
  let cum = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const seg = Math.hypot(dx, dy);
    if (seg === 0) continue;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (seg * seg)));
    const q = { x: a.x + dx * t, y: a.y + dy * t };
    const dist = Math.hypot(p.x - q.x, p.y - q.y);
    if (dist < best.dist) {
      // cross > 0 → p is left of the direction of play (x east, y north).
      const cross = dx * (p.y - a.y) - dy * (p.x - a.x);
      best = { along: cum + seg * t, side: cross > 0 ? -dist : dist, dist };
    }
    cum += seg;
  }
  return { along: best.along, side: best.side };
}

/** The tee set's position: walk back from the green end by its yardage.
 *  OSM draws the line from the back tee, so every shorter set lies on it;
 *  a set longer than the line (the watch's two-point fallback) extends the
 *  first segment backwards and says so. */
export function teePointFor(line: XY[], yards: number): { p: XY; along: number; extended: boolean } {
  const L = polylineLength(line);
  const along = L - yards * M_PER_YD;
  if (along >= 0) return { p: pointAlong(line, along), along, extended: false };
  const d = directionAt(line, 0);
  return { p: { x: line[0].x + d.x * along, y: line[0].y + d.y * along }, along, extended: true };
}

export interface Bunker {
  /** Outline in the SVG frame. */
  pts: XY[];
  /** Metres along the centreline from its start, and to the side (+ right). */
  alongM: number;
  sideM: number;
  /** Nearest and farthest vertex along the line — reach and carry. */
  nearM: number;
  farM: number;
  /** The widest the bunker reaches sideways, in metres from its centre. */
  radiusM: number;
}

export interface Green {
  pts: XY[] | null;
  centre: XY;
  centreM: XY;
  depthM: number;
  widthM: number;
  /** True when OSM had no green and a disc stands in for it. */
  approximate: boolean;
  /** The approach direction into the green, unit vector in metres. */
  axis: XY;
}

export interface HoleGeometry {
  /** The centreline in local metres (unrotated) and in the SVG frame. */
  lineM: XY[];
  line: XY[];
  lengthM: number;
  approximateLine: boolean;
  toSvg: (p: XY) => XY;
  project: (p: LatLon) => XY;
  unproject: (p: XY) => LatLon;
  bunkers: Bunker[];
  green: Green;
  fairways: XY[][];
  water: XY[][];
}

export const GEOMETRY = {
  /** A bunker farther than this from the centreline belongs to another hole. */
  bunkerCorridorM: 50,
  /** How far past the green end a bunker can sit and still be this hole's. */
  beyondGreenM: 30,
  /** The green polygon must end this near the centreline's end. */
  greenMatchM: 40,
  /** Hole 9's stand-in: a disc this wide at the line's end. */
  fallbackGreenDiameterM: 26,
  fairwayCorridorM: 60,
} as const;

/** Lay the hole's own features into one frame: the centreline, this hole's
 *  bunkers and green, the fairway outlines that run beside it. */
export function buildHoleGeometry(
  geo: HoleGeoJSON,
  lineGeo: LatLon[],
  approximateLine = false,
): HoleGeometry {
  const { project, unproject } = localProjector(lineGeo[0]);
  const lineM = lineGeo.map(project);
  const lengthM = polylineLength(lineM);
  const end = lineM[lineM.length - 1];
  const toSvg = rotatorToSvg(lineM[0], end);

  const bunkers: Bunker[] = [];
  for (const poly of polygons(geo, "bunker")) {
    const pts = poly.map(project);
    const c = centroid(pts);
    const { along, side } = alongAndSide(lineM, c);
    if (Math.abs(side) > GEOMETRY.bunkerCorridorM) continue;
    if (along < 0 || along > lengthM + GEOMETRY.beyondGreenM) continue;
    const alongs = pts.map((p) => alongAndSide(lineM, p).along);
    const radius = Math.max(...pts.map((p) => Math.hypot(p.x - c.x, p.y - c.y)));
    bunkers.push({
      pts: pts.map(toSvg),
      alongM: along,
      sideM: side,
      nearM: Math.min(...alongs),
      farM: Math.max(...alongs),
      radiusM: radius,
    });
  }
  bunkers.sort((a, b) => a.alongM - b.alongM);

  // The green: the polygon whose centroid sits nearest the line's end.
  let green: Green | null = null;
  let bestD = Infinity;
  for (const poly of polygons(geo, "green")) {
    const pts = poly.map(project);
    const c = centroid(pts);
    const d = Math.hypot(c.x - end.x, c.y - end.y);
    if (d < bestD && d <= GEOMETRY.greenMatchM) {
      bestD = d;
      const axis = directionAt(lineM, lengthM - 1);
      const perp = { x: -axis.y, y: axis.x };
      const al = pts.map((p) => (p.x - c.x) * axis.x + (p.y - c.y) * axis.y);
      const ac = pts.map((p) => (p.x - c.x) * perp.x + (p.y - c.y) * perp.y);
      green = {
        pts: pts.map(toSvg),
        centre: toSvg(c),
        centreM: c,
        depthM: Math.max(...al) - Math.min(...al),
        widthM: Math.max(...ac) - Math.min(...ac),
        approximate: false,
        axis,
      };
    }
  }
  if (green === null) {
    const axis = directionAt(lineM, lengthM - 1);
    green = {
      pts: null,
      centre: toSvg(end),
      centreM: end,
      depthM: GEOMETRY.fallbackGreenDiameterM,
      widthM: GEOMETRY.fallbackGreenDiameterM,
      approximate: true,
      axis,
    };
  }

  const near = (kind: string, corridor: number): XY[][] =>
    polygons(geo, kind)
      .map((poly) => poly.map(project))
      .filter((pts) => {
        const { along, side } = alongAndSide(lineM, centroid(pts));
        return Math.abs(side) <= corridor && along >= -20 && along <= lengthM + GEOMETRY.beyondGreenM;
      })
      .map((pts) => pts.map(toSvg));

  return {
    lineM,
    line: lineM.map(toSvg),
    lengthM,
    approximateLine,
    toSvg,
    project,
    unproject,
    bunkers,
    green,
    fairways: near("fairway", GEOMETRY.fairwayCorridorM),
    water: near("water", GEOMETRY.fairwayCorridorM * 2),
  };
}

/** The nine pin positions on the green, in the SVG frame, each with its
 *  offset along the approach axis in yards (+ is deeper). Front/back at
 *  ±35% of depth, left/right at ±35% of width — a flag is never on the
 *  collar. */
export function pinPoints(g: Green, toSvg: (p: XY) => XY): Record<PinPos, { p: XY; alongYd: number; sideYd: number }> {
  const perp = { x: -g.axis.y, y: g.axis.x }; // left of the approach
  const out = {} as Record<PinPos, { p: XY; alongYd: number; sideYd: number }>;
  for (const pos of PIN_POSITIONS) {
    const [depth, lateral] = pos.split("-");
    const fa = depth === "front" ? -0.35 : depth === "back" ? 0.35 : 0;
    const fs = lateral === "left" ? 0.35 : lateral === "right" ? -0.35 : 0;
    const dm = fa * g.depthM;
    const sm = fs * g.widthM;
    const pm = { x: g.centreM.x + g.axis.x * dm + perp.x * sm, y: g.centreM.y + g.axis.y * dm + perp.y * sm };
    out[pos] = { p: toSvg(pm), alongYd: r1(dm * YD_PER_M), sideYd: r1(-sm * YD_PER_M) };
  }
  return out;
}

/* ── the golfer ────────────────────────────────────────────────────────── */

export interface TeeClubModel {
  club: string;
  n: number;
  p25Yd: number;
  medYd: number;
  p75Yd: number;
  /** Half the p10–p90 band of the drive's signed dispersion, yards. */
  lateralHalfYd: number;
  lateralMeasured: boolean;
}

export interface ApproachClubModel {
  club: string;
  n: number;
  medYd: number;
  p25Yd: number;
  p75Yd: number;
  /** Where the measurement comes from — the range's carry, or where the
   *  ball came to rest on course. */
  basis: "range carry" | "course rest";
}

export interface ScoutPlayer {
  index: number | null;
  teeClubs: TeeClubModel[];
  approachClubs: ApproachClubModel[];
  /** Share of classified approach misses that stopped short — the reason
   *  for "one more club". */
  shortMissShare: number | null;
  fairway: { driven: number; hit: number; left: number; right: number } | null;
  asOf: string | null;
}

export const PLAYER_THRESHOLDS = {
  minTeeShots: 10,
  minDispersionShots: 8,
  /** The band when dispersion is unmeasured — two fairway widths. */
  fallbackLateralHalfYd: 25,
} as const;

const quantile = (sorted: number[], q: number): number => {
  if (sorted.length === 0) return NaN;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};

const TEE_FAMILY = (club: string) => club === "Driver" || club.endsWith(" Wood") || club.endsWith(" Hybrid");

/** The golfer's numbers, from the records the site already keeps. */
export function scoutPlayer(
  g: GarminShots | null,
  profiles: ClubProfile[],
  index: number | null,
  shortMissShare: number | null,
): ScoutPlayer {
  const rounds: GarminRound[] = g ? g.rounds.filter((r) => r.shotCount > 0) : [];
  // Tee clubs: where the ball finished off the tee on par 4s and 5s.
  const teeYards = new Map<string, number[]>();
  const clubIds = new Map<number, string>();
  const restYards = new Map<string, number[]>();
  let asOf: string | null = null;
  for (const r of rounds) {
    if (asOf === null || r.date > asOf) asOf = r.date;
    for (const h of r.holes) {
      for (const s of h.shots) {
        if (s.club === null || s.yards === null) continue;
        if (s.clubId !== null) clubIds.set(s.clubId, s.club);
        if (s.shotType === "TEE" && (h.par ?? 4) >= 4 && TEE_FAMILY(s.club)) {
          teeYards.set(s.club, [...(teeYards.get(s.club) ?? []), s.yards]);
        }
        if (s.shotType !== "PUTT" && s.shotType !== "CHIP" && s.shotType !== "RECOVERY" && s.yards > 50) {
          restYards.set(s.club, [...(restYards.get(s.club) ?? []), s.yards]);
        }
      }
    }
  }
  const dispersion = new Map<string, number[]>();
  for (const d of g?.stats?.drive ?? []) {
    if (d.clubId === null || d.dispersionDistanceYd === null) continue;
    const club = clubIds.get(d.clubId);
    if (!club) continue;
    dispersion.set(club, [...(dispersion.get(club) ?? []), d.dispersionDistanceYd]);
  }
  const teeClubs: TeeClubModel[] = [...teeYards.entries()]
    .filter(([, ys]) => ys.length >= PLAYER_THRESHOLDS.minTeeShots)
    .map(([club, ys]) => {
      const s = [...ys].sort((a, b) => a - b);
      const disp = [...(dispersion.get(club) ?? [])].sort((a, b) => a - b);
      const measured = disp.length >= PLAYER_THRESHOLDS.minDispersionShots;
      return {
        club,
        n: s.length,
        p25Yd: Math.round(quantile(s, 0.25)),
        medYd: Math.round(quantile(s, 0.5)),
        p75Yd: Math.round(quantile(s, 0.75)),
        lateralHalfYd: measured
          ? Math.round((quantile(disp, 0.9) - quantile(disp, 0.1)) / 2)
          : PLAYER_THRESHOLDS.fallbackLateralHalfYd,
        lateralMeasured: measured,
      };
    })
    .sort((a, b) => b.medYd - a.medYd);

  // Approach clubs: the range's carries first; a club the range never
  // measured (the hybrid) borrows its on-course resting distance and says so.
  const approachClubs: ApproachClubModel[] = profiles
    .filter((p) => !p.suppressed && p.medianDistanceYd !== null && p.club !== "Driver")
    .map((p) => ({
      club: p.club,
      n: p.active,
      medYd: Math.round(p.medianDistanceYd as number),
      p25Yd: Math.round(p.distanceP25Yd ?? (p.medianDistanceYd as number)),
      p75Yd: Math.round(p.distanceP75Yd ?? (p.medianDistanceYd as number)),
      basis: "range carry" as const,
    }));
  const have = new Set(approachClubs.map((c) => c.club));
  for (const [club, ys] of restYards) {
    if (have.has(club) || club === "Driver" || club === "Putter") continue;
    if (ys.length < PLAYER_THRESHOLDS.minTeeShots) continue;
    const s = [...ys].sort((a, b) => a - b);
    approachClubs.push({
      club,
      n: s.length,
      medYd: Math.round(quantile(s, 0.5)),
      p25Yd: Math.round(quantile(s, 0.25)),
      p75Yd: Math.round(quantile(s, 0.75)),
      basis: "course rest",
    });
  }
  approachClubs.sort((a, b) => a.medYd - b.medYd);

  let fairway: ScoutPlayer["fairway"] = null;
  if (rounds.length) {
    fairway = { driven: 0, hit: 0, left: 0, right: 0 };
    for (const r of rounds)
      for (const h of r.holes) {
        if (h.fairwayShotOutcome === "HIT") { fairway.driven++; fairway.hit++; }
        else if (h.fairwayShotOutcome === "LEFT") { fairway.driven++; fairway.left++; }
        else if (h.fairwayShotOutcome === "RIGHT") { fairway.driven++; fairway.right++; }
      }
  }
  return { index, teeClubs, approachClubs, shortMissShare, fairway, asOf };
}

/* ── the decisions ─────────────────────────────────────────────────────── */

export const SCOUT_RULES = {
  /** /plan: driver only where there is 60 yd of playable width. */
  driverMinWidthYd: 60,
  /** /plan: outside 140 the target is the middle of the green. */
  middleOfGreenBeyondYd: 140,
  /** A flag this close to sand on its own side is a sucker pin — six
   *  yards is two paces off the collar. */
  suckerBunkerYd: 6,
  /** The leave a lay-up aims for — the wedges the range has measured. */
  layupLeaveYd: 100,
  /** How far toward the favoured side the aim point sits. */
  favourOffsetYd: 8,
  /** Air around a bunker when asking whether a landing band touches it. */
  bandPadM: 4,
} as const;

export interface ApproachPick {
  club: string | null;
  /** The club after it — "one more club", the plan's standing rule. */
  oneMore: string | null;
  /** False when no measured club reaches: lay up. */
  reaches: boolean;
  basis: string | null;
}

/** The shortest measured club whose median covers the distance — the
 *  middle of the green, so a median miss is still on the putting surface. */
export function pickApproach(clubs: ApproachClubModel[], distanceYd: number): ApproachPick {
  const asc = [...clubs].sort((a, b) => a.medYd - b.medYd);
  const i = asc.findIndex((c) => c.medYd >= distanceYd);
  if (i === -1) {
    const last = asc[asc.length - 1];
    return { club: last?.club ?? null, oneMore: null, reaches: false, basis: last?.basis ?? null };
  }
  return { club: asc[i].club, oneMore: asc[i + 1]?.club ?? null, reaches: true, basis: asc[i].basis };
}

/** The club whose median lands nearest a distance — for a lay-up, where
 *  short of the number is fine and long is not. */
export function pickLayup(clubs: ApproachClubModel[], distanceYd: number): ApproachClubModel | null {
  const under = clubs.filter((c) => c.medYd <= distanceYd + 5);
  if (under.length === 0) return clubs[0] ?? null;
  return under.reduce((a, b) => (b.medYd > a.medYd ? b : a));
}

export interface Landing {
  /** Ellipse in the SVG frame: centre, half-axes (metres), rotation (deg,
   *  SVG sense) so the long axis runs along the line of play. */
  centre: XY;
  rx: number;
  ry: number;
  angle: number;
  /** Yards from the tee to the band's near, middle and far edge. */
  nearYd: number;
  medYd: number;
  farYd: number;
}

export interface TeePlay {
  club: string;
  recommended: boolean;
  landing: Landing;
  /** Bunkers the band can reach — described in yards from this tee. */
  reaches: { side: Side; carryYd: number; reachYd: number }[];
  /** Yards from the band's middle to the green's centre. */
  remainingYd: number;
  approach: ApproachPick;
  /** Par 5s: the second shot that leaves a wedge, and the wedge. */
  second: { club: string; leaveYd: number; third: ApproachPick } | null;
  /** The one line that says it. */
  line: string;
  /** Why this is not the recommendation — null on the recommended play. */
  cost: string | null;
}

export interface PinRead {
  pos: PinPos;
  p: XY;
  /** Yards the flag adds to (or takes off) the number to the centre. */
  alongYd: number;
  sucker: boolean;
  /** Why it is a sucker pin, or what to do with it. */
  why: string;
  /** Where to aim: the flag, or the centre / the fat side. */
  aim: string;
}

export interface TeeView {
  tee: string;
  yards: number;
  teePoint: XY;
  teeAlongM: number;
  extended: boolean;
  /** Net par at this course handicap, and the number to refuse. */
  target: number;
  refuse: number;
  plays: TeePlay[];
  /** Par 3s: the shot from the tee. */
  teeApproach: ApproachPick | null;
  toCentreYd: number;
}

export interface LastTime {
  date: string;
  strokes: number | null;
  par: number | null;
  fairway: string | null;
  segs: { a: XY; b: XY; club: string | null; yards: number | null }[];
  pin: XY | null;
  line: string;
}

export interface ScoutHoleView {
  number: number;
  par: number;
  hcp: number;
  shape: Shape;
  spec: ScoutHoleSpec;
  viewBox: { x: number; y: number; w: number; h: number };
  tiles: { href: string; transform: string }[];
  line: XY[];
  approximateLine: boolean;
  bunkers: { pts: XY[]; side: Side }[];
  fairways: XY[][];
  water: XY[][];
  green: { pts: XY[] | null; centre: XY; depthYd: number; widthYd: number; approximate: boolean };
  pins: PinRead[];
  byTee: TeeView[];
  lastTime: LastTime | null;
  /** The headline — the recommended play on the first tee set, said bluntly. */
  verdict: string;
}

/** WHS course handicap, rounded: index × slope / 113 + (rating − par). */
export function courseHandicap(index: number, slope: number, rating: number, par: number): number {
  return Math.round((index * slope) / 113 + (rating - par));
}

/** Strokes received on a hole of this stroke index. */
export function strokesOn(hcp: number, ch: number): number {
  if (ch <= 0) return 0;
  return Math.floor(ch / 18) + (hcp <= ch % 18 ? 1 : 0);
}

const sideWord = (sideM: number): Side => (Math.abs(sideM) < 6 ? "centre" : sideM < 0 ? "left" : "right");
const over = (n: number) => (n === 0 ? "par" : n === 1 ? "bogey" : n === 2 ? "double" : n === -1 ? "birdie" : `+${n}`);
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

function describeReaches(reaches: TeePlay["reaches"]): string {
  if (reaches.length === 0) return "";
  const by = new Map<Side, number[]>();
  for (const r of reaches) by.set(r.side, [...(by.get(r.side) ?? []), r.reachYd, r.carryYd]);
  return list(
    [...by.entries()].map(([side, ys]) => `the ${side === "centre" ? "" : side + " "}bunker${ys.length > 2 ? "s" : ""} at ${Math.min(...ys)}–${Math.max(...ys)}`),
  );
}

function teePlay(
  g: HoleGeometry,
  spec: ScoutHoleSpec,
  tee: { along: number },
  club: TeeClubModel,
  player: ScoutPlayer,
  holeYd: number,
): Omit<TeePlay, "recommended" | "cost" | "line"> {
  const favour = spec.tee.favour === "left" ? -1 : spec.tee.favour === "right" ? 1 : 0;
  const offsetM = favour * SCOUT_RULES.favourOffsetYd * M_PER_YD;
  const medM = club.medYd * M_PER_YD;
  const nearM = club.p25Yd * M_PER_YD;
  const farM = club.p75Yd * M_PER_YD;
  const latM = club.lateralHalfYd * M_PER_YD;
  const mid = pointAlong(g.lineM, tee.along + medM);
  const dir = directionAt(g.lineM, tee.along + medM);
  const perpRight = { x: dir.y, y: -dir.x };
  const centreM = { x: mid.x + perpRight.x * offsetM, y: mid.y + perpRight.y * offsetM };
  const centre = g.toSvg(centreM);
  // The ellipse's long axis follows the line of play; in the SVG frame the
  // direction is the rotated unit vector.
  const dSvg = g.toSvg({ x: dir.x, y: dir.y });
  const oSvg = g.toSvg({ x: 0, y: 0 });
  const angle = (Math.atan2(dSvg.y - oSvg.y, dSvg.x - oSvg.x) * 180) / Math.PI;

  const reaches: TeePlay["reaches"] = [];
  for (const b of g.bunkers) {
    const relNear = b.nearM - tee.along;
    const relFar = b.farM - tee.along;
    if (relFar < nearM - SCOUT_RULES.bandPadM || relNear > farM + SCOUT_RULES.bandPadM) continue;
    if (Math.abs(b.sideM - offsetM) > latM + b.radiusM + SCOUT_RULES.bandPadM) continue;
    reaches.push({ side: sideWord(b.sideM), carryYd: yd(relFar), reachYd: yd(relNear) });
  }
  const remainingM = Math.hypot(g.green.centreM.x - centreM.x, g.green.centreM.y - centreM.y);
  const remainingYd = yd(remainingM);
  const approach = pickApproach(player.approachClubs, remainingYd);
  let second: TeePlay["second"] = null;
  if (spec.par === 5) {
    const longest = player.approachClubs[player.approachClubs.length - 1];
    const reachable = longest && longest.medYd >= remainingYd;
    if (!reachable) {
      const lay = pickLayup(player.approachClubs, remainingYd - SCOUT_RULES.layupLeaveYd);
      if (lay) {
        const leave = remainingYd - lay.medYd;
        second = { club: lay.club, leaveYd: leave, third: pickApproach(player.approachClubs, leave) };
      }
    }
  }
  return {
    club: club.club,
    landing: {
      centre: { x: r1(centre.x), y: r1(centre.y) },
      rx: r1((farM - nearM) / 2),
      ry: r1(latM),
      angle: r1(angle),
      nearYd: club.p25Yd,
      medYd: club.medYd,
      farYd: club.p75Yd,
    },
    reaches,
    remainingYd,
    approach,
    second,
  };
}

const hintClub = (hint: TeeClubHint | null, player: ScoutPlayer): string | null => {
  if (hint === "driver") return "Driver";
  if (hint === "hybrid") return player.teeClubs.find((c) => c.club.endsWith("Hybrid"))?.club ?? null;
  if (hint === "iron") return player.approachClubs.filter((c) => c.club.endsWith(" Iron")).at(-1)?.club ?? null;
  return null;
};

/** Which play the card recommends: the sourced hint when the notes have
 *  one; else, among the clubs whose band touches no bunker, the longest that
 *  still leaves a FULL measured swing (a 60-yard leave is a partial wedge
 *  the range has never measured — /bag's wedge matrix is 0 of 6 cells), or
 *  when none does, the longest leave; else the club that touches the fewest
 *  bunkers, the shorter one on a tie. */
export function recommend(
  plays: Omit<TeePlay, "recommended" | "cost" | "line">[],
  hint: string | null,
  shortestFullSwingYd: number,
): number {
  if (plays.length === 0) return -1;
  if (hint) {
    const i = plays.findIndex((p) => p.club === hint);
    if (i !== -1) return i;
  }
  const indexed = plays.map((p, i) => [p, i] as const);
  const clean = indexed.filter(([p]) => p.reaches.length === 0);
  if (clean.length) {
    const full = clean.filter(([p]) => p.remainingYd >= shortestFullSwingYd);
    if (full.length) return full.reduce((a, b) => (b[0].landing.medYd > a[0].landing.medYd ? b : a))[1];
    // Nothing leaves a full swing: take the longest leave, the one nearest a
    // measured number, rather than the shortest pitch.
    return clean.reduce((a, b) => (b[0].remainingYd > a[0].remainingYd ? b : a))[1];
  }
  return indexed.reduce((a, b) =>
    b[0].reaches.length < a[0].reaches.length ||
    (b[0].reaches.length === a[0].reaches.length && b[0].landing.medYd < a[0].landing.medYd)
      ? b
      : a,
  )[1];
}

function playLine(p: Omit<TeePlay, "recommended" | "cost" | "line">, spec: ScoutHoleSpec): string {
  const side = spec.tee.favour === "centre" ? "down the middle" : `${spec.tee.favour} side`;
  const band = `${p.landing.nearYd}–${p.landing.farYd}`;
  const hazard = p.reaches.length ? ` — the band reaches ${describeReaches(p.reaches)}` : "";
  if (spec.par === 5 && p.second) {
    return `${short(p.club)} ${side} (${band})${hazard}. ${p.remainingYd} left: ${short(p.second.club)} to ${p.second.leaveYd}, then ${p.second.third.club ? short(p.second.third.club) : "a wedge"}.`;
  }
  const app = p.approach.club
    ? p.approach.reaches
      ? `${p.remainingYd} in, ${short(p.approach.club)}${p.approach.oneMore ? ` (${short(p.approach.oneMore)} if the pin is back)` : ""}`
      : `${p.remainingYd} in — no measured club reaches; ${short(p.approach.club)} and a chip`
    : `${p.remainingYd} in`;
  return `${short(p.club)} ${side} (${band})${hazard}. ${app}.`;
}

function costLine(p: Omit<TeePlay, "recommended" | "cost" | "line">, rec: Omit<TeePlay, "recommended" | "cost" | "line">): string {
  const parts: string[] = [];
  if (p.reaches.length) parts.push(`its band reaches ${describeReaches(p.reaches)}`);
  const gain = rec.remainingYd - p.remainingYd;
  if (gain > 0) parts.push(`it buys ${gain} yd (${p.remainingYd} in vs ${rec.remainingYd})`);
  else if (gain < 0) parts.push(`it leaves ${-gain} yd more (${p.remainingYd} in vs ${rec.remainingYd})`);
  if (p.approach.club && rec.approach.club && p.approach.club !== rec.approach.club)
    parts.push(`${short(p.approach.club)} in instead of ${short(rec.approach.club)}`);
  return parts.length ? `${short(p.club)} instead: ${list(parts)}.` : `${short(p.club)} instead: same leave.`;
}

function lastTimeLine(h: GarminHole, par: number): string {
  const shots = h.shots.filter((s) => s.yards !== null && s.yards > 0);
  const words = shots.map((s) => `${s.club ? short(s.club) : "?"} ${Math.round(s.yards as number)}`);
  const fw = h.fairwayShotOutcome === "LEFT" ? ", tee ball left" : h.fairwayShotOutcome === "RIGHT" ? ", tee ball right" : h.fairwayShotOutcome === "HIT" ? ", fairway" : "";
  const score = h.strokes !== null ? `${h.strokes} (${over(h.strokes - par)})` : "no score";
  return `${words.join(" → ")}${fw}: ${score}.`;
}

const toSvgPt = (g: HoleGeometry, pm: XY): XY => g.toSvg(pm);

function pinReads(g: HoleGeometry, spec: ScoutHoleSpec): PinRead[] {
  const pts = pinPoints(g.green, g.toSvg);
  const perp = { x: -g.green.axis.y, y: g.green.axis.x };
  return PIN_POSITIONS.map((pos) => {
    const { p, alongYd, sideYd } = pts[pos];
    // The flag's own position in metres, for the bunker test.
    const pm = {
      x: g.green.centreM.x + g.green.axis.x * (alongYd * M_PER_YD) + perp.x * (-sideYd * M_PER_YD),
      y: g.green.centreM.y + g.green.axis.y * (alongYd * M_PER_YD) + perp.y * (-sideYd * M_PER_YD),
    };
    // Sand within reach of the flag, on the flag's side: the nearest bunker
    // vertex is inside the sucker distance AND nearer the flag than the
    // green's centre is. The frame is rigid, so SVG distances are metres.
    const ps = toSvgPt(g, pm);
    const nearBunker =
      pos === "middle-centre"
        ? undefined
        : g.bunkers.find((b) => {
            const dPin = Math.min(...b.pts.map((q) => Math.hypot(q.x - ps.x, q.y - ps.y)));
            const dCentre = Math.min(...b.pts.map((q) => Math.hypot(q.x - g.green.centre.x, q.y - g.green.centre.y)));
            return dPin <= SCOUT_RULES.suckerBunkerYd * M_PER_YD && dPin < dCentre;
          });
    const listed = spec.suckerPins.includes(pos);
    const sucker = listed || nearBunker !== undefined;
    const [depth, lateral] = pos.split("-");
    const fat = lateral === "left" ? "right half" : lateral === "right" ? "left half" : depth === "back" ? "front half" : "middle";
    const why = listed
      ? `${spec.green.note}`
      : nearBunker
        ? `Sand within ${SCOUT_RULES.suckerBunkerYd} yd of this flag.`
        : "";
    const aim = sucker
      ? `Aim at the ${fat} of the green. ${spec.green.missSafe} is the miss; ${spec.green.missDead.charAt(0).toLowerCase()}${spec.green.missDead.slice(1)} is dead.`
      : depth === "middle" && lateral === "centre"
        ? "Aim at the flag."
        : `Centre of the green outside ${SCOUT_RULES.middleOfGreenBeyondYd}; the flag inside it.`;
    return { pos, p: { x: r1(p.x), y: r1(p.y) }, alongYd, sucker, why, aim };
  });
}

/**
 * One hole, every option precomputed: each tee set's position, target and
 * plays; nine pins; the last round's trace. The client indexes, it never
 * computes.
 */
export function buildScoutHole(
  course: ScoutCourse,
  spec: ScoutHoleSpec,
  geo: HoleGeoJSON,
  player: ScoutPlayer,
  last: { round: GarminRound; hole: GarminHole } | null,
  aspect = 3 / 4,
): ScoutHoleView | null {
  let lineGeo = centreline(geo, spec.number, spec.hcp);
  let approximateLine = false;
  if (lineGeo === null) {
    // No line from OSM: the watch's tee and pin stand in, and the card says so.
    const first = last?.hole.shots.find((s) => s.startGeo !== null)?.startGeo ?? null;
    const pin = last?.hole.pin ?? null;
    if (first === null || pin === null) return null;
    lineGeo = [first, pin];
    approximateLine = true;
  }
  const g = buildHoleGeometry(geo, lineGeo, approximateLine);

  const byTee: TeeView[] = course.tees.map((t) => {
    const yards = t.yards[spec.number - 1];
    const tee = teePointFor(g.lineM, yards);
    const ch = player.index === null ? null : courseHandicap(player.index, t.slope, t.rating, course.holes.reduce((a, h) => a + h.par, 0));
    const target = spec.par + (ch === null ? 0 : strokesOn(spec.hcp, ch));
    const toCentreYd = yd(Math.hypot(g.green.centreM.x - tee.p.x, g.green.centreM.y - tee.p.y));
    let plays: TeePlay[] = [];
    let teeApproach: ApproachPick | null = null;
    if (spec.par === 3) {
      teeApproach = pickApproach(player.approachClubs, toCentreYd);
    } else {
      const raw = player.teeClubs.map((c) => teePlay(g, spec, tee, c, player, yards));
      const rec = recommend(raw, hintClub(spec.tee.club, player), player.approachClubs[0]?.medYd ?? 0);
      plays = raw.map((p, i) => ({
        ...p,
        recommended: i === rec,
        line: playLine(p, spec),
        cost: i === rec ? null : costLine(p, raw[rec]),
      }));
    }
    return {
      tee: t.name,
      yards,
      teePoint: { x: r1(g.toSvg(tee.p).x), y: r1(g.toSvg(tee.p).y) },
      teeAlongM: r1(tee.along),
      extended: tee.extended,
      target,
      refuse: spec.par + 2,
      plays,
      teeApproach,
      toCentreYd,
    };
  });

  // The frame holds every tee set, the green, the hole's bunkers and the
  // last round's shots.
  const framePts: XY[] = [...g.line, ...byTee.map((t) => t.teePoint), g.green.centre];
  if (g.green.pts) framePts.push(...g.green.pts);
  for (const b of g.bunkers) framePts.push(...b.pts);
  let lastTime: LastTime | null = null;
  if (last) {
    const segs = last.hole.shots
      .filter((s) => s.startGeo && s.endGeo)
      .map((s) => ({
        a: g.toSvg(g.project(s.startGeo as LatLon)),
        b: g.toSvg(g.project(s.endGeo as LatLon)),
        club: s.club,
        yards: s.yards,
      }))
      .map((s) => ({ ...s, a: { x: r1(s.a.x), y: r1(s.a.y) }, b: { x: r1(s.b.x), y: r1(s.b.y) } }));
    // A shot that flew off this hole's frame is a mis-assigned shot; keep
    // the frame honest and drop it from the picture.
    const span = fitFrame([...framePts, ...segs.flatMap((s) => [s.a, s.b])], aspect).span;
    const kept = span > 700 ? segs.filter((s) => Math.hypot(s.b.x - g.green.centre.x, s.b.y - g.green.centre.y) < 500) : segs;
    framePts.push(...kept.flatMap((s) => [s.a, s.b]));
    const pin = last.hole.pin ? g.toSvg(g.project(last.hole.pin)) : null;
    lastTime = {
      date: last.round.date,
      strokes: last.hole.strokes,
      par: last.hole.par,
      fairway: last.hole.fairwayShotOutcome,
      segs: kept,
      pin: pin ? { x: r1(pin.x), y: r1(pin.y) } : null,
      line: lastTimeLine(last.hole, spec.par),
    };
  }
  const box = fitFrame(framePts, aspect, 0.08);
  const tiles = tilesFor({ x0: box.x, y0: box.y, w: box.w, h: box.h }, g.toSvg, g.project, g.unproject);

  const first = byTee[0];
  const rec = first.plays.find((p) => p.recommended) ?? null;
  const verdict =
    spec.par === 3
      ? `${first.toCentreYd} to the middle: ${first.teeApproach?.club ? short(first.teeApproach.club) : "—"}${first.teeApproach?.oneMore ? `, ${short(first.teeApproach.oneMore)} if the flag is back` : ""}. ${spec.target.text}`
      : rec
        ? `${rec.line} ${spec.target.text}`
        : spec.target.text;

  return {
    number: spec.number,
    par: spec.par,
    hcp: spec.hcp,
    shape: spec.shape,
    spec,
    viewBox: { x: r1(box.x), y: r1(box.y), w: r1(box.w), h: r1(box.h) },
    tiles,
    line: g.line.map((p) => ({ x: r1(p.x), y: r1(p.y) })),
    approximateLine,
    bunkers: g.bunkers.map((b) => ({ pts: b.pts.map((p) => ({ x: r1(p.x), y: r1(p.y) })), side: sideWord(b.sideM) })),
    fairways: g.fairways.map((f) => f.map((p) => ({ x: r1(p.x), y: r1(p.y) }))),
    water: g.water.map((f) => f.map((p) => ({ x: r1(p.x), y: r1(p.y) }))),
    green: {
      pts: g.green.pts ? g.green.pts.map((p) => ({ x: r1(p.x), y: r1(p.y) })) : null,
      centre: { x: r1(g.green.centre.x), y: r1(g.green.centre.y) },
      depthYd: yd(g.green.depthM),
      widthYd: yd(g.green.widthM),
      approximate: g.green.approximate,
    },
    pins: pinReads(g, spec),
    byTee,
    lastTime,
    verdict,
  };
}

/* ── the course ────────────────────────────────────────────────────────── */

export interface ScoutCourseView {
  slug: string;
  name: string;
  tees: { name: string; rating: number; slope: number; yards: number; courseHandicap: number | null; planTotal: number }[];
  holes: ScoutHoleView[];
  /** Holes the geometry could not draw at all. */
  undrawn: number[];
  lastRound: { date: string; strokes: number | null; tee: string | null } | null;
  player: ScoutPlayer;
  sources: Record<string, ScoutSource>;
}

/** The rounds the watch heard at this course, newest first, matched
 *  through the confirmed Grint links (facility name is Grint's; the Garmin
 *  name differs and is never guessed at here). */
export function roundsHere(
  course: ScoutCourse,
  g: GarminShots | null,
  grintRounds: { roundId: string; courseName: string | null }[],
  links: { scorecardId: string; roundId: string }[],
): GarminRound[] {
  if (!g) return [];
  const ids = new Set(grintRounds.filter((r) => r.courseName === course.grintName).map((r) => r.roundId));
  const sc = new Set(links.filter((l) => ids.has(l.roundId)).map((l) => l.scorecardId));
  return g.rounds.filter((r) => sc.has(r.scorecardId) && r.shotCount > 0).sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function buildScoutCourse(
  course: ScoutCourse,
  geo: HoleGeoJSON,
  player: ScoutPlayer,
  here: GarminRound[],
): ScoutCourseView {
  const last = here[0] ?? null;
  const holes: ScoutHoleView[] = [];
  const undrawn: number[] = [];
  for (const spec of course.holes) {
    const lh = last?.holes.find((h) => h.number === spec.number) ?? null;
    const v = buildScoutHole(course, spec, geo, player, last && lh ? { round: last, hole: lh } : null);
    if (v) holes.push(v);
    else undrawn.push(spec.number);
  }
  const par = course.holes.reduce((a, h) => a + h.par, 0);
  return {
    slug: course.layoutSlug,
    name: course.name,
    tees: course.tees.map((t) => {
      const ch = player.index === null ? null : courseHandicap(player.index, t.slope, t.rating, par);
      return {
        name: t.name,
        rating: t.rating,
        slope: t.slope,
        yards: t.yards.reduce((a, b) => a + b, 0),
        courseHandicap: ch,
        planTotal: course.holes.reduce((a, h) => a + h.par + (ch === null ? 0 : strokesOn(h.hcp, ch)), 0),
      };
    }),
    holes,
    undrawn,
    lastRound: last ? { date: last.date, strokes: last.strokes, tee: last.teeBox } : null,
    player,
    sources: course.sources,
  };
}
