#!/usr/bin/env node
/**
 * One point per course of the California 100, and one per trip airport, into
 * data/california-100-geo.json. The map on a trip page and the satellite
 * thumbnails read it; validate insists every trip course and airport has one.
 *
 * Run: pnpm data:geocode:ca   (idempotent — a slug with a point is skipped;
 *                              --refresh re-asks for everything)
 *
 * Order of preference, as scripts/geocode.mjs:
 *   1. a `manual` entry already in the file — hand-entered, never overwritten
 *   2. the record's own geocache, when the entry names a spine facility
 *   3. the file itself, from a previous run
 *   4. Nominatim — keyless, 1 req/s, real User-Agent required
 *
 * Every point carries a `precision` (course_feature | named_place |
 * city_centroid | aerodrome | manual) because a town centroid and a located
 * clubhouse are not the same claim, and the page says which it is drawing.
 * Nothing gets a silent 0,0; a miss is written as null with the query kept.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "../data");
const OUT = resolve(DATA, "california-100-geo.json");
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const UA = "mackenzie/0.1 (https://github.com/ummerr; personal golf course map; ummerr@gmail.com)";
const RATE_MS = 1100;
const REFRESH = process.argv.includes("--refresh");
/** --only a,b,c re-asks for just those slugs or codes. */
const ONLY = new Set((process.argv.find((a) => a.startsWith("--only="))?.slice(7) ?? "").split(",").filter(Boolean));

/** Names Nominatim knows a course by when the list's name misses: search
 *  strings only, tried before the list's own name; they change nothing stored
 *  and are not facts. */
const SEARCH_NAME = {
  "spyglass-hill": ["Spyglass Hill Golf Course"],
  "poppy-hills": ["Poppy Hills Golf Course"],
  "dragon-at-nakoma": ["Nakoma Golf Resort"],
  "silverrock": ["SilverRock Resort"],
  "pelican-hill-ocean-south": ["Pelican Hill Golf Club"],
  "pelican-hill-ocean-north": ["Pelican Hill Golf Club"],
  "grizzly-ranch": ["Grizzly Ranch", "Grizzly Ranch Golf Course, Portola"],
  "monarch-dunes-old": ["Monarch Dunes Golf Course", "Monarch Dunes, Nipomo, California"],
  "sea-ranch": ["Sea Ranch Golf Links, Sea Ranch", "Sea Ranch Golf Course"],
  "plumas-pines": ["Plumas Pines Golf Course, Blairsden", "Plumas Pines Golf Resort, Graeagle"],
  "spanish-bay": ["The Links at Spanish Bay"],
  "carmel-valley-ranch": ["Carmel Valley Ranch Golf Course"],
  "san-juan-oaks": ["San Juan Oaks Golf Club, Hollister"],
  "silverado-north": ["Silverado Resort Golf, Napa"],
  "cypress-ridge": ["Cypress Ridge Golf Course, Arroyo Grande"],
  "olivas-links": ["Olivas Links Golf Course, Ventura"],
  "balboa-park": ["Balboa Park Golf Course, San Diego"],
  "barona-creek": ["Barona Creek Golf Club, Lakeside"],
  "la-costa-north": ["Omni La Costa Resort Golf, Carlsbad"],
  "pga-west-greg-norman": ["PGA West Greg Norman Course, La Quinta"],
  "pga-west-mountain": ["PGA West Mountain Course, La Quinta"],
  "pga-west-nicklaus-tournament": ["PGA West Nicklaus Tournament Course, La Quinta"],
};

/** The airports the trips fly into, by IATA code — the query is the airport's
 *  name, which Nominatim knows; the code alone it does not. */
const AIRPORTS = {
  SFO: "San Francisco International Airport",
  SJC: "San Jose International Airport",
  MRY: "Monterey Regional Airport",
  RNO: "Reno-Tahoe International Airport",
  PSP: "Palm Springs International Airport",
  SAN: "San Diego International Airport",
  BUR: "Hollywood Burbank Airport",
  SBA: "Santa Barbara Airport",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback);
const today = new Date().toISOString().slice(0, 10);

async function nominatim(q) {
  const url = new URL(NOMINATIM);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "us");
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from Nominatim`);
  await sleep(RATE_MS);
  return res.json();
}

const cat = (r) => r.category ?? r.class;
const point = (r, precision, query) => ({
  lat: Number(r.lat),
  lon: Number(r.lon),
  precision,
  display: r.display_name,
  osmId: r.osm_type && r.osm_id ? `${r.osm_type}/${r.osm_id}` : null,
  source: "nominatim",
  query,
  checked: today,
});

function golfResult(results, query) {
  const golf =
    results.find((r) => r.type === "golf_course") ??
    results.find((r) => cat(r) === "leisure") ??
    results.find((r) => /golf/i.test(r.display_name));
  if (!golf) return null;
  return point(golf, golf.type === "golf_course" || cat(golf) === "leisure" ? "course_feature" : "named_place", query);
}

/** The course: the name as written, then the name with its layout suffix
 *  dropped ("PGA West — Stadium" → "PGA West"), then the town as a centroid. */
async function geocodeCourse(e) {
  const plain = e.name.replace(/\s+—\s+/g, " ");
  const head = e.name.split(" — ")[0];
  const queries = [...(SEARCH_NAME[e.slug] ?? []), `${plain}, ${e.locality}, California`, `${plain} Golf Course, ${e.locality}, California`];
  if (head !== plain) queries.push(`${head}, ${e.locality}, California`);
  for (const q of queries) {
    const hit = golfResult(await nominatim(q), q);
    if (hit) return hit;
  }
  const q = `${e.locality}, California`;
  const town = (await nominatim(q))[0];
  return town ? point(town, "city_centroid", q) : null;
}

async function geocodeAirport(code, name) {
  const q = name;
  const results = await nominatim(q);
  const aero = results.find((r) => cat(r) === "aeroway" || r.type === "aerodrome") ?? results[0];
  return aero ? point(aero, cat(aero) === "aeroway" || aero.type === "aerodrome" ? "aerodrome" : "named_place", q) : null;
}

// ---------------------------------------------------------------------------

const ca = readJson(resolve(DATA, "california-100.json"), null);
if (!ca) throw new Error("data/california-100.json missing");
const geocache = readJson(resolve(DATA, "geocache.json"), {});
const file = readJson(OUT, { points: {}, airports: {} });
file._README = [
  "One point per course of the California 100 (by entry slug) and per trip airport (by IATA",
  "code), from scripts/geocode-california.mjs. precision says what the point is: course_feature",
  "(an OSM golf course), named_place (a match by name, not as a golf feature), city_centroid",
  "(the town — the course was not found), aerodrome, or manual (hand-entered; never overwritten).",
  "A null is an honest miss with its query kept. The trip map and the satellite thumbnails read",
  "this; validate insists every trip course and airport resolves to a real point.",
];
file.points ??= {};
file.airports ??= {};

let fromCache = 0, fromRecord = 0, fetched = 0, missed = 0;
const codes = new Set(Object.values(ca._trips?.trips ?? []).map((t) => t.airport?.code).filter(Boolean));

for (const e of ca.entries) {
  const have = file.points[e.slug];
  if (have?.precision === "manual") { fromCache++; continue; }
  if (!REFRESH && !ONLY.has(e.slug) && have?.lat != null) { fromCache++; continue; }
  const rec = e.facilitySlug ? geocache[e.facilitySlug] : null;
  if (rec?.lat != null && e.layoutSlug === null) {
    file.points[e.slug] = { lat: rec.lat, lon: rec.lon, precision: rec.precision, display: rec.display ?? null, osmId: rec.osmId ?? null, source: `geocache:${e.facilitySlug}`, query: null, checked: today };
    fromRecord++;
    continue;
  }
  try {
    const hit = await geocodeCourse(e);
    file.points[e.slug] = hit ?? { lat: null, lon: null, precision: null, display: null, osmId: null, source: "nominatim", query: `${e.name}, ${e.locality}, California`, checked: today };
    if (hit) fetched++; else missed++;
    console.log(`  ${hit ? hit.precision.padEnd(14) : "MISS".padEnd(14)} ${e.slug}`);
  } catch (err) {
    console.log(`  ERROR          ${e.slug}: ${err.message}`);
    missed++;
  }
}

for (const code of [...codes].sort()) {
  const have = file.airports[code];
  if (have?.precision === "manual" || (!REFRESH && !ONLY.has(code) && have?.lat != null)) { fromCache++; continue; }
  const name = AIRPORTS[code];
  if (!name) { console.log(`  no name for airport ${code} — add it to AIRPORTS`); missed++; continue; }
  try {
    const hit = await geocodeAirport(code, name);
    file.airports[code] = hit ?? { lat: null, lon: null, precision: null, display: null, osmId: null, source: "nominatim", query: name, checked: today };
    if (hit) fetched++; else missed++;
    console.log(`  ${hit ? hit.precision.padEnd(14) : "MISS".padEnd(14)} ${code}`);
  } catch (err) {
    console.log(`  ERROR          ${code}: ${err.message}`);
    missed++;
  }
}

const ordered = { _README: file._README, points: Object.fromEntries(Object.entries(file.points).sort()), airports: Object.fromEntries(Object.entries(file.airports).sort()) };
writeFileSync(OUT, JSON.stringify(ordered, null, 2) + "\n");
console.log(`\n  kept ${fromCache} · from the record ${fromRecord} · fetched ${fetched} · missed ${missed} → data/california-100-geo.json`);
