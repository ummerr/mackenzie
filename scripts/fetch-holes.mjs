#!/usr/bin/env node
/**
 * Fetch the INSIDE of each course: greens, fairways, bunkers, tees, water, cart
 * paths, and the hole centrelines that make a routing plan a routing plan.
 *
 * Run: npm run holes
 *
 * `fetch-osm.mjs` gets the property boundary — enough to say "a golf course is
 * here". This gets the course itself, which is the difference between a dot on
 * a photo and a map you can read a round off. OSM's `golf=*` scheme is well
 * populated in the US: the 2026-08-02 probe found 139 bunkers, 65 greens and 56
 * numbered hole centrelines across two LA municipals alone.
 *
 * Output is one file per facility — `data/holes/<slug>.geojson` — plus an
 * `index.json` manifest. Per-file because the map loads these lazily when you
 * zoom into a course; a single bundle would be ~6 MB of geometry that 99% of
 * sessions never look at.
 *
 * The Overpass client is the one from fetch-osm.mjs, staleness guard included.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "../data");
const OUT = resolve(DATA, "holes");

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const SWEEPS = 4;
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_MIRROR_LAG_MS = 2 * 86_400_000;
const UA = "mackenzie/0.1 (https://github.com/ummerr; personal golf course map; ummerr@gmail.com)";

/** Courses per Overpass query. Six keeps a response near 1.5 MB. */
const CHUNK = 6;

/** Metres of slop around the property bbox, so a green on the boundary is in
 *  the query even though its centroid decides whether it's kept. */
const BBOX_PAD_M = 150;

/** Coordinate precision. 6dp is ~11cm — past the point where a bunker edge
 *  changes shape, and it shortens the files by about a tenth. */
const DP = 6;

/**
 * Douglas–Peucker tolerance, in metres.
 *
 * Half a metre is below the accuracy of the tracing it is thinning: these ways
 * were drawn by hand against aerial imagery whose own georeferencing is off by
 * more than that. It is also a third of a pixel at z18, this map's deepest
 * zoom, so nothing it removes was ever going to be drawn.
 *
 * It is worth doing because the raw fetch is 11 MB. Cart paths and woodland
 * arrive at roughly 1 m vertex spacing — far finer than a bunker lip, and the
 * bulk of the bytes.
 */
const SIMPLIFY_M = 0.5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (p, fb) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fb);

/**
 * OSM tags -> the handful of classes the map actually paints. Everything that
 * doesn't land in here is dropped: an unclassified polygon has no style, so
 * carrying it is pure bytes.
 */
function classify(tags = {}) {
  const g = tags.golf;
  if (g) {
    if (g === "green") return "green";
    if (g === "fairway") return "fairway";
    if (g === "tee") return "tee";
    if (g === "bunker") return "bunker";
    if (g === "rough") return "rough";
    if (g === "water_hazard" || g === "lateral_water_hazard") return "water";
    if (g === "penalty_area") return tags.natural === "water" ? "water" : "penalty";
    if (g === "cartpath" || g === "path") return "path";
    if (g === "hole") return "hole";
    if (g === "driving_range" || g === "practice") return "range";
    if (g === "clubhouse") return "clubhouse";
    return null;
  }
  // Untagged-for-golf features that still shape the picture. Ponds are very
  // often plain natural=water with no golf tag at all.
  if (tags.natural === "water" || tags.landuse === "reservoir" || tags.landuse === "basin") return "water";
  if (tags.natural === "sand" || tags.natural === "beach") return "sand";
  if (tags.natural === "wood" || tags.landuse === "forest" || tags.natural === "scrub") return "wood";
  if (tags.natural === "tree_row") return "treeline";
  if (tags.waterway === "stream" || tags.waterway === "river" || tags.waterway === "ditch") return "stream";
  return null;
}

/** Classes drawn as lines rather than filled areas. */
const LINEAR = new Set(["hole", "path", "stream", "treeline"]);

async function queryOverpass(query) {
  let lastErr;
  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    if (sweep) {
      const wait = 20_000 * sweep;
      console.log(`    … all endpoints failed, retrying in ${wait / 1000}s`);
      await sleep(wait);
    }
    for (const url of ENDPOINTS) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
            "User-Agent": UA,
          },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const base = json.osm3s?.timestamp_osm_base;
        if (!base) throw new Error("no osm3s.timestamp_osm_base to date the data");
        const lagMs = Date.now() - Date.parse(base);
        if (lagMs > MAX_MIRROR_LAG_MS) {
          throw new Error(`mirror is ${(lagMs / 86_400_000).toFixed(1)} days behind (osm_base ${base})`);
        }
        return { json, osmBase: base };
      } catch (err) {
        lastErr = err;
        console.warn(`    ✗ ${url.replace("https://", "").split("/")[0]}: ${err.message}`);
      }
    }
  }
  throw lastErr ?? new Error("all Overpass endpoints failed");
}

function bboxOf(rings) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minx) minx = x;
      if (x > maxx) maxx = x;
      if (y < miny) miny = y;
      if (y > maxy) maxy = y;
    }
  }
  return [minx, miny, maxx, maxy];
}

function padBbox([minx, miny, maxx, maxy], metres) {
  const dLat = metres / 110_540;
  const dLon = metres / (111_320 * Math.cos(((miny + maxy) / 2) * (Math.PI / 180)) || 1);
  return [minx - dLon, miny - dLat, maxx + dLon, maxy + dLat];
}

/** Ray casting against the outer ring. Rings from fetch-osm are already closed. */
function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const pointInRings = (x, y, rings) => rings.some((r) => pointInRing(x, y, r));

/** Mean vertex. Good enough to ask "is this feature this course's". */
function meanPoint(pts) {
  let sx = 0, sy = 0;
  for (const [x, y] of pts) {
    sx += x;
    sy += y;
  }
  return [sx / pts.length, sy / pts.length];
}

/**
 * Douglas–Peucker, iterative so a 4,000-vertex woodland ring can't blow the
 * stack. Distances are computed in a local metre frame — longitude scaled by
 * cos(lat) — because a degree of longitude in Toronto is two thirds of one in
 * Barbados, and a tolerance that ignores that thins the northern courses
 * roughly half as hard as the southern ones.
 */
function simplify(pts, tolM) {
  if (pts.length < 3) return pts;

  const latRad = (pts[0][1] * Math.PI) / 180;
  const kx = 111_320 * Math.cos(latRad);
  const ky = 110_540;
  const tol2 = tolM * tolM;

  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;

  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    if (hi - lo < 2) continue;

    const ax = pts[lo][0] * kx, ay = pts[lo][1] * ky;
    const bx = pts[hi][0] * kx, by = pts[hi][1] * ky;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;

    let worst = 0, at = -1;
    for (let i = lo + 1; i < hi; i++) {
      const px = pts[i][0] * kx, py = pts[i][1] * ky;
      let d2;
      if (len2 === 0) {
        // A closed ring hands us a zero-length chord; fall back to point
        // distance or the whole ring collapses to its endpoints.
        d2 = (px - ax) ** 2 + (py - ay) ** 2;
      } else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d2 = (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2;
      }
      if (d2 > worst) {
        worst = d2;
        at = i;
      }
    }

    if (worst > tol2 && at > 0) {
      keep[at] = 1;
      stack.push([lo, at], [at, hi]);
    }
  }

  return pts.filter((_, i) => keep[i]);
}

/** Round, then drop the points that rounding made duplicates of their
 *  neighbour. On a cart path traced at 1m spacing this removes real vertices. */
function quantize(pts) {
  const out = [];
  for (const [x, y] of pts) {
    const p = [Number(x.toFixed(DP)), Number(y.toFixed(DP))];
    const last = out[out.length - 1];
    if (last && last[0] === p[0] && last[1] === p[1]) continue;
    out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------

const { facilities } = readJson(resolve(DATA, "facilities.json"), {}) ?? {};
if (!facilities) throw new Error("data/facilities.json missing — run `npm run parse` first");
const osm = readJson(resolve(DATA, "osm-cache.json"), {});

mkdirSync(OUT, { recursive: true });

const force = process.argv.includes("--force");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);

/** Every facility we have a boundary for. Without one there is no way to say
 *  which of the neighbourhood's polygons belong to the course, so those stay
 *  pins — a wrong course drawing is worse than none. */
const targets = facilities.filter((f) => {
  if (only && f.slug !== only) return false;
  const hit = osm[f.slug];
  return hit?.rings?.length;
});

const pending = targets.filter((f) => force || !existsSync(resolve(OUT, `${f.slug}.geojson`)));

console.log(`\n  ${targets.length} facilities with a boundary · ${targets.length - pending.length} already on disk · ${pending.length} to fetch`);
if (pending.length) console.log(`  batching into ${Math.ceil(pending.length / CHUNK)} Overpass queries\n`);

let osmBaseSeen = null;

for (let i = 0; i < pending.length; i += CHUNK) {
  const chunk = pending.slice(i, i + CHUNK);
  const boxes = chunk.map((f) => padBbox(bboxOf(osm[f.slug].rings), BBOX_PAD_M));

  /* One union per course. `golf` catches the designed features; the natural /
   * landuse / waterway clauses catch the ponds, sand and treelines that shape a
   * course but that no one bothered to tag `golf=`.
   *
   * Ways only. `out geom` does not carry relation member geometry on either
   * working mirror (see fetch-osm.mjs), and golf features modelled as
   * multipolygon relations are rare enough not to be worth a second pass. */
  const clauses = boxes
    .map(([w, s, e, n]) => {
      const bb = `${s.toFixed(6)},${w.toFixed(6)},${n.toFixed(6)},${e.toFixed(6)}`;
      return [
        `  way["golf"](${bb});`,
        `  way["natural"~"^(water|sand|beach|wood|scrub|tree_row)$"](${bb});`,
        `  way["landuse"~"^(reservoir|basin|forest)$"](${bb});`,
        `  way["waterway"~"^(stream|river|ditch)$"](${bb});`,
      ].join("\n");
    })
    .join("\n");

  const query = `[out:json][timeout:180];\n(\n${clauses}\n);\nout geom tags;`;

  let json, osmBase;
  try {
    console.log(`  ▸ batch ${i / CHUNK + 1}/${Math.ceil(pending.length / CHUNK)} (${chunk.length} courses)`);
    ({ json, osmBase } = await queryOverpass(query));
  } catch (err) {
    // Uncached on purpose: a failed request is not evidence a course is empty.
    console.log(`    ✗ batch failed: ${err.message} — these will retry on the next run`);
    continue;
  }
  osmBaseSeen = osmBase;

  const elements = (json.elements ?? []).filter((el) => el.geometry?.length >= 2);

  for (const f of chunk) {
    const rings = osm[f.slug].rings;
    const features = [];

    for (const el of elements) {
      const k = classify(el.tags);
      if (!k) continue;
      const pts = el.geometry.map((p) => [p.lon, p.lat]);
      const [cx, cy] = meanPoint(pts);
      if (!pointInRings(cx, cy, rings)) continue;

      const linear = LINEAR.has(k);
      // Simplify before rounding: thinning first means the survivors are the
      // vertices that carry the shape, and quantizing them afterwards can only
      // move a point it already decided to keep.
      const coords = quantize(simplify(pts, SIMPLIFY_M));
      if (coords.length < (linear ? 2 : 4)) continue;

      const props = { k };
      // Hole centrelines carry the routing: number, par, stroke index.
      if (k === "hole") {
        if (el.tags.ref) props.ref = String(el.tags.ref);
        if (el.tags.par) props.par = Number(el.tags.par) || undefined;
        if (el.tags.handicap) props.hcp = Number(el.tags.handicap) || undefined;
        if (el.tags.name && !el.tags.ref) props.ref = String(el.tags.name);
      }
      if (el.tags.name && k === "clubhouse") props.name = el.tags.name;

      features.push({
        type: "Feature",
        properties: props,
        geometry: linear
          ? { type: "LineString", coordinates: coords }
          : { type: "Polygon", coordinates: [coords[0].join() === coords[coords.length - 1].join() ? coords : [...coords, coords[0]]] },
      });
    }

    // Holes first in the file so the routing is easy to eyeball in a diff.
    features.sort((a, b) => {
      if (a.properties.k === "hole" && b.properties.k === "hole") {
        return (Number(a.properties.ref) || 99) - (Number(b.properties.ref) || 99);
      }
      return a.properties.k === "hole" ? -1 : b.properties.k === "hole" ? 1 : 0;
    });

    const counts = {};
    for (const ft of features) counts[ft.properties.k] = (counts[ft.properties.k] ?? 0) + 1;

    writeFileSync(
      resolve(OUT, `${f.slug}.geojson`),
      JSON.stringify({ type: "FeatureCollection", features }),
    );

    const mark = counts.green >= 9 ? "●" : features.length ? "◐" : "○";
    console.log(
      `  ${mark} ${f.grintName.padEnd(44).slice(0, 44)} ${String(features.length).padStart(4)} features  ` +
        Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([k, v]) => `${k}:${v}`)
          .join(" "),
    );
  }

  await sleep(2_000);
}

// --- manifest ---------------------------------------------------------------

/* The map fetches `<slug>.geojson` on demand, so it needs to know up front
 * which slugs exist and which are worth switching into plan view for. `holes`
 * and `greens` drive that: a course with 18 greens draws as a routing plan, a
 * course with three stray bunkers does not and stays on the aerial. */
const index = {};
for (const f of targets) {
  const p = resolve(OUT, `${f.slug}.geojson`);
  if (!existsSync(p)) continue;
  const fc = JSON.parse(readFileSync(p, "utf8"));
  const counts = {};
  for (const ft of fc.features) counts[ft.properties.k] = (counts[ft.properties.k] ?? 0) + 1;
  if (!fc.features.length) continue;
  index[f.slug] = {
    features: fc.features.length,
    greens: counts.green ?? 0,
    holes: counts.hole ?? 0,
    bunkers: counts.bunker ?? 0,
    water: (counts.water ?? 0) + (counts.stream ?? 0),
    // "Drawable" means there is enough of a course here to be worth hiding the
    // photograph for. Greens are the test: they are the last thing a mapper
    // adds and the first thing you look for reading a routing plan.
    plan: (counts.green ?? 0) >= 9 || (counts.fairway ?? 0) >= 9,
    bytes: readFileSync(p).length,
  };
}

writeFileSync(resolve(DATA, "holes", "index.json"), JSON.stringify(index, null, 2) + "\n");

const drawable = Object.values(index).filter((v) => v.plan).length;
const bytes = Object.values(index).reduce((n, v) => n + v.bytes, 0);
const onDisk = readdirSync(OUT).filter((n) => n.endsWith(".geojson")).length;

console.log(`\n  files        ${onDisk} written`);
console.log(`  with data    ${Object.keys(index).length}`);
console.log(`  plan-ready   ${drawable}  (≥9 greens or ≥9 fairways)`);
console.log(`  total size   ${(bytes / 1e6).toFixed(2)} MB  ·  median ${
  (() => {
    const s = Object.values(index).map((v) => v.bytes).sort((a, b) => a - b);
    return s.length ? Math.round(s[s.length >> 1] / 1024) : 0;
  })()
} KB`);
console.log(`  osm_base     ${osmBaseSeen ?? "(all cached)"}\n`);
