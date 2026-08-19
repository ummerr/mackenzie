#!/usr/bin/env node
/**
 * Join the spine + geo + facts into the single payload the browser loads,
 * and compute the ranking vectors.
 *
 * Run: npm run build   →   data/courses.json
 *
 * Inputs, in order of trust:
 *   layouts.json / facilities.json   verbatim from Grint  (adapter output)
 *   geocache.json                    machine-derived, carries a `precision`
 *   course-polygons.geojson          OSM, carries a match score
 *   facts.json                       external claims, each carries a source
 *   weights.json                     the lenses
 *
 * The output is deliberately denormalized — one array of facilities, each with
 * its layouts and facts inlined — because the map is a static page with no
 * query layer and joining in the browser buys nothing.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "../data");
/* Published artifacts live under public/ so the site serves them; everything
   else in data/ (raw exports, caches) stays private. */
const PUB = resolve(__dirname, "../public/data");
const readJson = (n, fb) => {
  const p = resolve(DATA, n);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fb;
};

const { layouts } = readJson("layouts.json", null) ?? {};
const { facilities } = readJson("facilities.json", null) ?? {};
if (!layouts || !facilities) throw new Error("run `npm run parse` first");

const geocache = readJson("geocache.json", {});
const polygonsPath = resolve(PUB, "course-polygons.geojson");
const polygons = existsSync(polygonsPath)
  ? JSON.parse(readFileSync(polygonsPath, "utf8"))
  : { features: [] };
const facts = readJson("facts.json", {});
const { lenses } = readJson("weights.json", { lenses: {} });

const polygonBySlug = new Map(polygons.features.map((f) => [f.properties.facilitySlug, f]));
const layoutsBySlug = new Map();
for (const l of layouts) {
  if (!layoutsBySlug.has(l.facilitySlug)) layoutsBySlug.set(l.facilitySlug, []);
  layoutsBySlug.get(l.facilitySlug).push(l);
}

// --- reference values the vectors are computed against -----------------------

const playedLayouts = layouts.filter((l) => l.played && l.avgScore);
/** Only 18-hole-looking rounds. Averaging a 9-hole 40 into this would drag the
 *  baseline down by ~8 strokes and make every real course look hard. */
const cleanScores = playedLayouts.filter((l) => !l.flags.includes("nine_hole_suspected"));
const meanScore = cleanScores.reduce((s, l) => s + l.avgScore, 0) / cleanScores.length;
const maxPlays = Math.max(...layouts.map((l) => l.timesPlayed));
/** The rank scale runs over RANKED layouts only — a rounds_only course has no
 *  rank at all (null vector, not last place) and must not stretch the scale. */
const ranked = layouts.filter((l) => l.personalRank != null);
const N = ranked.length;

const clamp01 = (x) => Math.max(0, Math.min(1, x));

/**
 * Vectors, all normalized to 0..1 where 1 is "more of the thing".
 * `null` means genuinely unknown and is excluded from any lens that uses it,
 * rather than being treated as zero.
 */
function vectorsFor(layout, fact) {
  const r = layout.ratings;
  const nineHole = layout.flags.includes("nine_hole_suspected");

  // External ranking: best (lowest) position across every published list.
  const ranks = (fact?.rankings ?? []).map((x) => x.rank).filter((x) => Number.isFinite(x));
  const bestExternal = ranks.length ? Math.min(...ranks) : null;

  return {
    // Inverted so 1st becomes 1.0 and last becomes ~0. Null when the paste
    // never ranked this course (rounds_only) — unknown, not last.
    personalRank:
      layout.personalRank == null ? null : clamp01((N - layout.personalRank) / (N - 1)),
    rating: r.overall == null ? null : clamp01(r.overall / 100),
    fun: r.fun == null ? null : clamp01(r.fun / 100),
    condition: r.condition == null ? null : clamp01(r.condition / 100),

    // Revealed preference. sqrt so the 10-play home course doesn't flatten
    // everything else to zero.
    replayRate: clamp01(Math.sqrt(layout.timesPlayed / maxPlays)),

    // Fun earned in spite of conditioning. Centred at 0.5, ±20 points of gap
    // spans the full range.
    funMinusCondition:
      r.fun == null || r.condition == null ? null : clamp01((r.fun - r.condition) / 40 + 0.5),

    // Positive = you score better here than your average. Suppressed for
    // 9-hole rounds, where the number is not comparable.
    scoringDelta: nineHole || !layout.avgScore ? null : clamp01((meanScore - layout.avgScore) / 30 + 0.5),

    // Top-1 of any list = 1.0, 100th = 0.
    externalRanking: bestExternal == null ? null : clamp01((101 - bestExternal) / 100),
    hasArchitect: fact?.architect?.value ? 1 : null,
  };
}

/** Weighted mean over the vectors a lens names, skipping nulls and
 *  renormalizing — so a sparse fact layer degrades gracefully instead of
 *  silently ranking every uncurated course last. */
function scoreLens(vectors, weights) {
  let sum = 0, total = 0, used = 0, asked = 0;
  for (const [key, w] of Object.entries(weights)) {
    asked++;
    const v = vectors[key];
    if (v == null) continue;
    sum += v * w;
    total += w;
    used++;
  }
  if (!total) return { score: null, coverage: 0 };
  return { score: Number((sum / total).toFixed(4)), coverage: Number((used / asked).toFixed(2)) };
}

// --- build -------------------------------------------------------------------

const out = [];
let withCoords = 0, withPolygon = 0, withFacts = 0;

for (const f of facilities) {
  const geo = geocache[f.slug];
  const poly = polygonBySlug.get(f.slug);
  const fact = facts[f.slug] ?? null;
  const own = (layoutsBySlug.get(f.slug) ?? []).sort(
    (a, b) => (a.personalRank ?? Infinity) - (b.personalRank ?? Infinity),
  );

  if (geo?.lat != null) withCoords++;
  if (poly) withPolygon++;
  if (fact) withFacts++;

  const enriched = own.map((l) => {
    const vectors = vectorsFor(l, fact);
    const scores = {};
    for (const [id, lens] of Object.entries(lenses)) scores[id] = scoreLens(vectors, lens.weights);
    return { ...l, vectors, scores };
  });

  /* Where the paste is silent (rounds_only facilities), the geocoder's
     addressdetails fill in — machine-derived like the coordinate itself, and
     placeFrom says which source is speaking. */
  const rankVals = own.map((l) => l.personalRank).filter((r) => r != null);

  out.push({
    slug: f.slug,
    name: fact?.displayName?.value ?? f.grintName,
    grintName: f.grintName,
    locality: f.locality ?? geo?.address?.locality ?? null,
    region: f.region ?? geo?.address?.region ?? null,
    country: f.country ?? geo?.address?.country ?? null,
    placeFrom: f.locality != null || f.region != null ? "grint" : geo?.address ? "nominatim" : null,
    origin: f.origin ?? "paste",
    aliases: f.aliases,

    lat: geo?.lat ?? null,
    lon: geo?.lon ?? null,
    precision: geo?.precision ?? null,

    osmId: poly?.properties?.osmId ?? null,
    areaAcres: poly?.properties?.areaAcres ?? null,
    hasPolygon: Boolean(poly),

    // Facility rollups, so the map can size and sort pins without walking layouts.
    bestRank: rankVals.length ? Math.min(...rankVals) : null,
    totalPlays: own.reduce((s, l) => s + l.timesPlayed, 0),
    layoutCount: own.length,
    played: own.some((l) => l.played),

    // OSM tags are free, already-sourced facts. Kept separate from facts.json
    // so their provenance stays legible as "OSM" rather than "curated".
    osmTags: poly
      ? {
          holes: poly.properties.holes ?? null,
          par: poly.properties.par ?? null,
          access: poly.properties.access ?? null,
          website: poly.properties.website ?? null,
          operator: poly.properties.operator ?? null,
          architect: poly.properties.architect ?? null,
        }
      : null,

    facts: fact,
    layouts: enriched,
  });
}

// Facility-level lens scores = the best layout at that facility.
for (const fac of out) {
  fac.scores = {};
  for (const id of Object.keys(lenses)) {
    const vals = fac.layouts.map((l) => l.scores[id]?.score).filter((v) => v != null);
    fac.scores[id] = vals.length ? Math.max(...vals) : null;
  }
}

writeFileSync(
  resolve(PUB, "courses.json"),
  JSON.stringify(
    {
      generatedFrom: "layouts.json + geocache.json + course-polygons.geojson + facts.json",
      capturedAt: readJson("layouts.json", {}).capturedAt ?? null,
      stats: {
        facilities: out.length,
        layouts: layouts.length,
        ranked: N,
        played: layouts.filter((l) => l.played).length,
        meanScore: Number(meanScore.toFixed(1)),
        countries: [...new Set(out.map((f) => f.country))].filter(Boolean),
        usStates: [...new Set(out.filter((f) => f.country === "US").map((f) => f.region))]
          .filter(Boolean)
          .sort(),
      },
      lenses,
      facilities: out,
    },
    null,
    2,
  ) + "\n",
);

console.log(`\n  facilities   ${out.length}`);
console.log(`  layouts      ${layouts.length}`);
console.log(`  coords       ${withCoords}/${out.length}`);
console.log(`  polygons     ${withPolygon}/${out.length}`);
console.log(`  facts        ${withFacts}/${out.length}`);
console.log(`  mean score   ${meanScore.toFixed(1)} (over ${cleanScores.length} non-9-hole layouts)`);
console.log(`  lenses       ${Object.keys(lenses).join(", ")}\n`);
