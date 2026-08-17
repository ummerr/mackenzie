#!/usr/bin/env node
/**
 * Fetch the OSM course polygon for each facility, and use it to REPAIR the
 * geocode where Nominatim only managed a city centroid.
 *
 * Run: npm run osm
 *
 * Two jobs, one pass:
 *   1. Polygons for the map — a course drawn in outline reads as a golf course;
 *      a dot reads as a pin.
 *   2. Coordinate repair — 20 of 84 facilities geocoded only to their town.
 *      A named leisure=golf_course polygon near that town is a far better
 *      answer than the town hall, and its centroid replaces the point.
 *
 * The Overpass client below is ported from ~/CodeProj/golf/muni/scripts/
 * fetch-golf-holes.mjs, including its mirror-staleness guard. DECISIONS.md:437
 * in that repo records mirrors silently serving 2-month-old data and 3 of 18
 * courses baking wrong as a result. Do not simplify this away.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "../data");
/* course-polygons.geojson is a published artifact — the map fetches it. */
const PUB = resolve(__dirname, "../public/data");

/**
 * Mirror list, probed 2026-08-01. Two notes worth keeping:
 *  - overpass.private.coffee hangs indefinitely rather than erroring, which is
 *    why every request below carries its own AbortSignal. Removed.
 *  - overpass.kumi.systems answered 200 with data 50 DAYS stale on that probe.
 *    Left in as a last resort precisely because the staleness guard catches it;
 *    if the other two are down, failing loudly beats baking June's data.
 */
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const SWEEPS = 4;
const REQUEST_TIMEOUT_MS = 75_000; // a mirror that hangs is worse than one that 500s
const MAX_MIRROR_LAG_MS = 2 * 86_400_000; // refuse anything >2 days behind
const UA = "mackenzie/0.1 (https://github.com/ummerr; personal golf course map; ummerr@gmail.com)";

/** Search radius by how much we trust the starting point. */
const RADIUS_M = {
  seed: 2_000,
  manual: 2_000,
  course_feature: 2_000,
  osm_polygon: 2_000,
  osm_bounds: 2_000,
  named_place: 5_000,
  city_centroid: 15_000, // the course can be well outside the town centre
};

/** Words that carry no identifying signal when matching a course name. */
const STOPWORDS = new Set([
  "golf", "course", "courses", "club", "country", "the", "at", "of", "and",
  "resort", "links", "cc", "gc", "g", "c", "park", "national", "international",
  "tennis", "center", "centre", "inn", "spa", "clubhouse", "complex",
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (p, fb) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fb);

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

        // Staleness guard. A mirror that answers 200 with month-old data is
        // worse than one that errors, because the output looks fine.
        const base = json.osm3s?.timestamp_osm_base;
        if (!base) throw new Error("no osm3s.timestamp_osm_base to date the data");
        const lagMs = Date.now() - Date.parse(base);
        if (lagMs > MAX_MIRROR_LAG_MS) {
          throw new Error(`mirror is ${(lagMs / 86_400_000).toFixed(1)} days behind (osm_base ${base})`);
        }
        return { json, endpoint: url, osmBase: base };
      } catch (err) {
        lastErr = err;
        console.warn(`    ✗ ${url.replace("https://", "").split("/")[0]}: ${err.message}`);
      }
    }
  }
  throw lastErr ?? new Error("all Overpass endpoints failed");
}

const tokens = (s) =>
  new Set(
    s
      .toLowerCase()
      .replace(/['‘’]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((t) => t && !STOPWORDS.has(t)),
  );

/** Jaccard-ish overlap, biased toward covering the Grint name's tokens. */
function nameScore(grintName, osmName) {
  if (!osmName) return 0;
  const a = tokens(grintName);
  const b = tokens(osmName);
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const t of a) {
    if (b.has(t)) hit++;
    else if ([...b].some((u) => u.startsWith(t) || t.startsWith(u))) hit += 0.6;
  }
  return hit / a.size;
}

const closeRing = (ring) => {
  const [first] = ring;
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
  return ring;
};

const ptKey = (p) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`;

/**
 * Join open way segments end-to-end into closed rings.
 *
 * A multipolygon relation stores its boundary as member ways that are usually
 * NOT individually closed — you have to walk them. Overpass returns the
 * segments in arbitrary order and arbitrary direction, so each step looks for a
 * segment touching the current ring's tail and reverses it if needed. Segments
 * that never close are dropped rather than guessed at.
 */
function stitchRings(segments) {
  const pool = segments.filter((s) => s.length >= 2).map((s) => s.slice());
  const rings = [];

  while (pool.length) {
    let ring = pool.shift();
    let progress = true;
    while (progress && ptKey(ring[0]) !== ptKey(ring[ring.length - 1])) {
      progress = false;
      const tail = ptKey(ring[ring.length - 1]);
      for (let i = 0; i < pool.length; i++) {
        const seg = pool[i];
        if (ptKey(seg[0]) === tail) {
          ring = ring.concat(seg.slice(1));
          pool.splice(i, 1);
          progress = true;
          break;
        }
        if (ptKey(seg[seg.length - 1]) === tail) {
          ring = ring.concat(seg.slice(0, -1).reverse());
          pool.splice(i, 1);
          progress = true;
          break;
        }
      }
    }
    if (ring.length >= 4 && ptKey(ring[0]) === ptKey(ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}

function ringOf(el) {
  if (el.type === "way" && el.geometry?.length >= 3) {
    return [closeRing(el.geometry.map((p) => [p.lon, p.lat]))];
  }
  if (el.type === "relation" && el.members?.length) {
    // `out geom` on a relation is SUPPOSED to carry member geometry, but as of
    // 2026-08-01 neither overpass-api.de nor maps.mail.ru returns it — both
    // send bounds+tags only. Kept for mirrors that do; resolveRelation()
    // handles the rest with a follow-up query.
    const outers = (el.members ?? [])
      .filter((m) => (m.role === "outer" || m.role === "") && m.geometry?.length >= 2)
      .map((m) => m.geometry.map((p) => [p.lon, p.lat]));
    const rings = stitchRings(outers);
    return rings.length ? rings : null;
  }
  return null;
}

/** Area-weighted-ish centroid: mean of the outer ring vertices. Good enough to
 *  place a pin inside the property; we are not doing spatial joins here. */
function centroidOf(rings) {
  let sx = 0, sy = 0, n = 0;
  for (const ring of rings) {
    for (const [x, y] of ring.slice(0, -1)) {
      sx += x;
      sy += y;
      n++;
    }
  }
  return n ? { lon: sx / n, lat: sy / n } : null;
}

/** Centre of a relation's bounding box. Enough to place a pin and to test
 *  proximity when the outline never arrives. */
function boundsCentre(el) {
  const b = el.bounds;
  if (!b) return null;
  return { lon: (b.minlon + b.maxlon) / 2, lat: (b.minlat + b.maxlat) / 2 };
}

/**
 * Second-pass fetch for a multipolygon relation: pull it plus its member ways
 * (`>` recurses down) and stitch the ways into rings. One small query per
 * relation, run only for relations that actually matched a facility.
 */
async function resolveRelation(osmId) {
  const id = osmId.split("/")[1];
  const { json } = await queryOverpass(`[out:json][timeout:60];relation(${id});(._;>;);out geom;`);
  const segments = (json.elements ?? [])
    .filter((el) => el.type === "way" && el.geometry?.length >= 2)
    .map((el) => el.geometry.map((p) => [p.lon, p.lat]));
  const rings = stitchRings(segments);
  return rings.length ? rings : null;
}

/** Shoelace on lon/lat scaled to metres. Rough, but only used for reporting. */
function areaAcres(rings) {
  const [ring] = rings;
  if (!ring || ring.length < 4) return null;
  const latRad = (ring[0][1] * Math.PI) / 180;
  const mPerLon = 111_320 * Math.cos(latRad);
  const mPerLat = 110_540;
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    a += x1 * mPerLon * (y2 * mPerLat) - x2 * mPerLon * (y1 * mPerLat);
  }
  return Math.abs(a / 2) / 4046.86;
}

/** Metres between two lon/lat points. */
function haversine(aLon, aLat, bLon, bLat) {
  const R = 6_371_000;
  const p = Math.PI / 180;
  const dLat = (bLat - aLat) * p;
  const dLon = (bLon - aLon) * p;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(aLat * p) * Math.cos(bLat * p) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------------------------------------------------------------------------

const { facilities } = readJson(resolve(DATA, "facilities.json"), {}) ?? {};
if (!facilities) throw new Error("data/facilities.json missing — run `npm run parse` first");

const geocache = readJson(resolve(DATA, "geocache.json"), {});
const cache = readJson(resolve(DATA, "osm-cache.json"), {});

const features = [];
const unmatched = [];
const failReason = new Map(); // slug -> why its batch never returned
let matched = 0, repaired = 0, cached = 0, noOutline = 0, osmBaseSeen = null;

/**
 * Batch. One query per CHUNK facilities instead of one per facility: 84
 * separate round-trips against a mirror that intermittently 504s took tens of
 * minutes and hammered a free service for no reason. A union of `around`
 * clauses returns the same polygons in 7 requests. Assignment back to
 * facilities happens locally, by distance + name, which we were doing anyway.
 */
const CHUNK = 12;

const pending = facilities.filter((f) => cache[f.slug] === undefined && geocache[f.slug]?.lat != null);
for (const f of facilities) {
  if (cache[f.slug] !== undefined) cached++;
}

console.log(`\n  ${facilities.length} facilities · ${cached} cached · ${pending.length} to fetch`);
console.log(`  batching into ${Math.ceil(pending.length / CHUNK)} Overpass queries\n`);

for (let i = 0; i < pending.length; i += CHUNK) {
  const chunk = pending.slice(i, i + CHUNK);
  const clauses = chunk
    .map((f) => {
      const geo = geocache[f.slug];
      const r = RADIUS_M[geo.precision] ?? 5_000;
      return `  way["leisure"="golf_course"](around:${r},${geo.lat},${geo.lon});\n` +
             `  relation["leisure"="golf_course"](around:${r},${geo.lat},${geo.lon});`;
    })
    .join("\n");

  const query = `[out:json][timeout:180];\n(\n${clauses}\n);\nout geom tags;`;

  let json, osmBase;
  try {
    console.log(`  ▸ batch ${i / CHUNK + 1}/${Math.ceil(pending.length / CHUNK)} (${chunk.length} facilities)`);
    ({ json, osmBase } = await queryOverpass(query));
  } catch (err) {
    // Deliberately leave these uncached so a re-run retries them; a failed
    // request is not evidence that no polygon exists.
    for (const f of chunk) failReason.set(f.slug, err.message);
    console.log(`    ✗ batch failed: ${err.message}`);
    continue;
  }
  osmBaseSeen = osmBase;

  // Every course this batch returned. Relations usually arrive without member
  // geometry, so `rings` may be null here — they still get a centre from their
  // bounding box and are resolved in the second pass below.
  const pool = (json.elements ?? [])
    .map((el) => {
      const rings = ringOf(el);
      const centre = (rings && centroidOf(rings)) ?? boundsCentre(el);
      if (!centre) return null;
      return {
        osmId: `${el.type}/${el.id}`,
        name: el.tags?.name ?? el.tags?.["name:en"] ?? null,
        rings,
        centre,
        tags: el.tags ?? {},
      };
    })
    .filter(Boolean);

  for (const f of chunk) {
    const geo = geocache[f.slug];
    const radius = RADIUS_M[geo.precision] ?? 5_000;

    const near = pool
      .map((p) => ({ ...p, dist: haversine(geo.lon, geo.lat, p.centre.lon, p.centre.lat) }))
      .filter((p) => p.dist <= radius)
      .map((p) => ({
        ...p,
        // Nominatim frequently resolved the exact OSM feature already. When it
        // did, trust it over the name matcher: Grint calls Sepulveda's course
        // "Sepulveda Golf Club" and OSM calls it "Balboa Municipal Golf
        // Course", which scores 0 on names but is unambiguously the same place.
        score: geo.osmId && geo.osmId === p.osmId ? 1 : nameScore(f.grintName, p.name),
        viaGeocoder: Boolean(geo.osmId && geo.osmId === p.osmId),
      }))
      // Name first, then proximity as the tie-break.
      .sort((a, b) => b.score - a.score || a.dist - b.dist);

    const best = near[0];
    // A weak name match is acceptable only when there is exactly one course
    // near a point we already trust — Grint abbreviates names constantly.
    const trusted = geo.precision === "course_feature" || geo.precision === "seed";
    const accept = best && (best.score >= 0.5 || (trusted && near.length === 1));

    cache[f.slug] = accept
      ? {
          osmId: best.osmId,
          osmName: best.name,
          score: Number(best.score.toFixed(2)),
          distM: Math.round(best.dist),
          viaGeocoder: best.viaGeocoder,
          rings: best.rings,
          centre: best.centre,
          tags: {
            holes: best.tags.holes ?? null,
            par: best.tags.par ?? null,
            access: best.tags.access ?? null,
            website: best.tags.website ?? null,
            operator: best.tags.operator ?? null,
            architect: best.tags.architect ?? null,
          },
          candidatesNearby: near.length,
        }
      : null;
  }

  await sleep(2_000); // be polite between batches
}

// --- second pass: outlines for the matched multipolygon relations -----------

const needRings = facilities.filter(
  (f) => cache[f.slug] && !cache[f.slug].rings && cache[f.slug].osmId.startsWith("relation/"),
);
if (needRings.length) {
  console.log(`\n  resolving ${needRings.length} multipolygon relations\n`);
  for (const f of needRings) {
    const hit = cache[f.slug];
    try {
      const rings = await resolveRelation(hit.osmId);
      if (rings) {
        hit.rings = rings;
        hit.centre = centroidOf(rings) ?? hit.centre;
        console.log(`  ⬡ ${f.grintName.padEnd(46).slice(0, 46)} ${hit.osmId}`);
      } else {
        console.log(`  · ${f.grintName.padEnd(46).slice(0, 46)} no closed ring`);
      }
    } catch (err) {
      console.log(`  ✗ ${f.grintName.padEnd(46).slice(0, 46)} ${err.message.slice(0, 34)}`);
    }
    await sleep(1_200);
  }
}

for (const f of facilities) {
  const geo = geocache[f.slug];
  if (!geo?.lat) {
    unmatched.push({ ...f, reason: "no geocode" });
    continue;
  }
  const hit = cache[f.slug];

  if (!hit) {
    const reason = failReason.get(f.slug) ?? "no name match nearby";
    unmatched.push({ ...f, reason, precision: geo.precision });
    console.log(`  ✗ ${f.grintName.padEnd(46).slice(0, 46)} ${reason.slice(0, 40)}`);
    continue;
  }

  matched++;
  const centre = (hit.rings && centroidOf(hit.rings)) ?? hit.centre ?? null;

  // Coordinate repair: a matched course beats a town centroid, always — even
  // when only its bounding box came back, which still locates it far better
  // than the town hall.
  if (centre && (geo.precision === "city_centroid" || geo.precision === "named_place")) {
    geocache[f.slug] = {
      ...geo,
      lat: centre.lat,
      lon: centre.lon,
      precision: hit.rings ? "osm_polygon" : "osm_bounds",
      repairedFrom: geo.precision,
      source: `overpass ${hit.osmId}`,
    };
    repaired++;
  }

  // A match without an outline still counts as a match — it fixed the pin and
  // it carries the OSM tags. It just has no geometry to draw.
  if (!hit.rings) {
    noOutline++;
    console.log(`  ◍ ${f.grintName.padEnd(46).slice(0, 46)} ${String(hit.osmId).padEnd(16)} pin only`);
    continue;
  }

  features.push({
    type: "Feature",
    id: hit.osmId,
    properties: {
      facilitySlug: f.slug,
      name: hit.osmName,
      grintName: f.grintName,
      osmId: hit.osmId,
      matchScore: hit.score,
      areaAcres: Number((areaAcres(hit.rings) ?? 0).toFixed(1)) || null,
      ...hit.tags,
    },
    geometry: { type: "Polygon", coordinates: hit.rings },
  });

  const mark = hit.score >= 0.8 ? "●" : hit.score >= 0.5 ? "◐" : "○";
  console.log(
    `  ${mark} ${f.grintName.padEnd(46).slice(0, 46)} ${String(hit.osmId).padEnd(16)} ${hit.score.toFixed(2)}`,
  );
}

writeFileSync(resolve(DATA, "osm-cache.json"), JSON.stringify(cache, null, 2) + "\n");
writeFileSync(resolve(DATA, "geocache.json"), JSON.stringify(geocache, null, 2) + "\n");
writeFileSync(
  resolve(PUB, "course-polygons.geojson"),
  JSON.stringify({ type: "FeatureCollection", features }, null, 2) + "\n",
);

if (unmatched.length) {
  writeFileSync(
    resolve(DATA, "osm-unmatched.md"),
    [
      "# Facilities with no OSM polygon",
      "",
      "Generated by `npm run osm`. These still render as pins — they just have no outline.",
      "Fix by adding the OSM id by hand to `data/osm-cache.json`, or leave them.",
      "",
      ...unmatched.map((f) => `- \`${f.slug}\` — ${f.grintName}, ${f.locality} (${f.reason})`),
      "",
    ].join("\n"),
  );
}

const precision = {};
for (const v of Object.values(geocache)) if (v?.precision) precision[v.precision] = (precision[v.precision] ?? 0) + 1;

console.log(`\n  matched      ${matched}/${facilities.length}  (${cached} from cache)`);
console.log(`  repaired     ${repaired} coordinates upgraded from a town centroid to a course polygon`);
console.log(`  unmatched    ${unmatched.length}`);
console.log(`  osm_base     ${osmBaseSeen ?? "(all cached)"}`);
console.log(`  precision    ${Object.entries(precision).map(([k, v]) => `${k}:${v}`).join("  ")}\n`);
