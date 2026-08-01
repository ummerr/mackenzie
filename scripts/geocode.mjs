#!/usr/bin/env node
/**
 * Resolve one lat/lon per FACILITY (not per layout — Hualalai gets one pin).
 *
 * Run: npm run geocode
 *
 * Order of preference, cheapest and most trustworthy first:
 *   1. data/geocode-overrides.json  — hand-entered, wins over everything
 *   2. seeds from ~/CodeProj/golf/muni — already-verified origins, zero network
 *   3. data/geocache.json           — a previous run of this script
 *   4. Nominatim                    — keyless, 1 req/s, real User-Agent required
 *
 * Every result carries a `precision`, because a city centroid and a located
 * clubhouse are not the same claim:
 *   course_feature  Nominatim returned an actual leisure=golf_course
 *   named_place     Nominatim matched the name but not as a golf feature
 *   city_centroid   name lookup failed; this is the town, not the course
 *   seed | manual   from muni / from a human
 *
 * Nothing ever gets a silent 0,0. Failures land in data/geocode-unresolved.md.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "../data");
const CACHE_PATH = resolve(DATA, "geocache.json");
const OVERRIDES_PATH = resolve(DATA, "geocode-overrides.json");

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const UA = "mackenzie/0.1 (https://github.com/ummerr; personal golf course map; ummerr@gmail.com)";
const RATE_MS = 1100; // Nominatim usage policy: max 1 req/s. Be a good citizen.

/** Where muni's already-verified course origins live. Absent = skipped, not fatal. */
const MUNI_COURSES = resolve(__dirname, "../../golf/muni/src/data/courses");

/**
 * muni slug -> mackenzie facility slug, for courses that appear in both.
 * Only 4 of muni's 18 baked courses are ones you've played.
 */
const SEED_MAP = {
  "bethpage-black": "bethpage-state-park-golf-course",
  "tobacco-road": "tobacco-road-golf-club",
  battlefield: "legends-on-the-niagara-golf-club",
  "griffith-harding": "griffith-park-golf-club",
};

/**
 * Grint's names are sometimes truncated or mis-cased, which defeats the
 * geocoder. These are search-string repairs only — they do NOT change the
 * stored name (that stays verbatim from Grint) and they are not facts.
 */
const SEARCH_NAME = {
  "cherry-downs-golf-and-count": "Cherry Downs Golf and Country Club",
  "tpc-of-scottsdale": "TPC Scottsdale",
  "pga-west-stadium-clubhouse": "PGA West Stadium Course",
  "edgewood-tahoe-resort-golf": "Edgewood Tahoe Golf Course",
  "royal-westmoreland-golf": "Royal Westmoreland Golf Club",
  "the-creek-club-locust-valley": "The Creek Club",
  "meadow-club-fairfax": "Meadow Club",
  "kukio-makai-beach-golf-club": "Kukio Golf and Beach Club",
  "ojai-valley-inn-and-spa": "Ojai Valley Inn Golf Course",
  "manhattan-country-club": "Westdrift Manhattan Beach Golf Course",
  "the-links-golf-club": "The Links Golf Club Marlton",
  "mid-south-club": "Mid South Club Southern Pines",
  "sepulveda-golf-complex": "Balboa Golf Course Encino",
  "waikoloa-beach-and-kings-golf-course": "Waikoloa Beach Golf Course",
  "industry-hills-golf-club-at-pacific-palms-resort": "Industry Hills Golf Club",
  "ron-jaworskis-valleybrook-golf-course": "Valleybrook Golf Club Blackwood",
};

const COUNTRY_NAME = { US: "United States", CA: "Canada", BB: "Barbados" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback);

/** Pull verified origins out of muni's baked course files. Best-effort. */
function loadSeeds() {
  const seeds = {};
  if (!existsSync(MUNI_COURSES)) {
    console.log("  (muni course data not found — skipping seeds)");
    return seeds;
  }
  for (const [muniSlug, facilitySlug] of Object.entries(SEED_MAP)) {
    const p = join(MUNI_COURSES, `${muniSlug}.json`);
    if (!existsSync(p)) continue;
    const { origin } = JSON.parse(readFileSync(p, "utf8"));
    if (!origin?.lat || !origin?.lon) continue;
    seeds[facilitySlug] = {
      lat: origin.lat,
      lon: origin.lon,
      precision: "seed",
      source: `golf/muni/src/data/courses/${muniSlug}.json`,
    };
  }
  void readdirSync; // kept for future bulk-seed expansion
  return seeds;
}

async function nominatim(q, countryCode) {
  const url = new URL(NOMINATIM);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");
  if (countryCode) url.searchParams.set("countrycodes", countryCode.toLowerCase());

  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from Nominatim`);
  return res.json();
}

/** Prefer an actual golf feature over a road or a town of the same name.
 *  Note: format=jsonv2 names the field `category`; format=json calls it `class`. */
const categoryOf = (r) => r.category ?? r.class;

function pickResult(results) {
  if (!results?.length) return null;
  const golf =
    results.find((r) => r.type === "golf_course") ??
    results.find((r) => categoryOf(r) === "leisure") ??
    results.find((r) => /golf/i.test(r.display_name));
  if (golf) {
    const isCourse = golf.type === "golf_course" || categoryOf(golf) === "leisure";
    return {
      lat: Number(golf.lat),
      lon: Number(golf.lon),
      precision: isCourse ? "course_feature" : "named_place",
      display: golf.display_name,
      osmId: golf.osm_type && golf.osm_id ? `${golf.osm_type}/${golf.osm_id}` : null,
    };
  }
  const first = results[0];
  return {
    lat: Number(first.lat),
    lon: Number(first.lon),
    precision: "named_place",
    display: first.display_name,
    osmId: first.osm_type && first.osm_id ? `${first.osm_type}/${first.osm_id}` : null,
  };
}

// ---------------------------------------------------------------------------

const { facilities } = readJson(resolve(DATA, "facilities.json"), null) ?? {};
if (!facilities) throw new Error("data/facilities.json missing — run `npm run parse` first");

const cache = readJson(CACHE_PATH, {});
const overrides = readJson(OVERRIDES_PATH, {});
const seeds = loadSeeds();

let fromSeed = 0,
  fromCache = 0,
  fromOverride = 0,
  fetched = 0,
  failed = 0;
const unresolved = [];

console.log(`\n  geocoding ${facilities.length} facilities\n`);

for (const f of facilities) {
  if (overrides[f.slug]) {
    cache[f.slug] = { ...overrides[f.slug], precision: overrides[f.slug].precision ?? "manual" };
    fromOverride++;
    continue;
  }
  if (seeds[f.slug]) {
    cache[f.slug] = seeds[f.slug];
    fromSeed++;
    continue;
  }
  if (cache[f.slug]?.lat != null) {
    fromCache++;
    continue;
  }

  const name = SEARCH_NAME[f.slug] ?? f.grintName;
  const parts = [name, f.locality, f.region, COUNTRY_NAME[f.country]].filter(Boolean);

  let hit = null;
  try {
    hit = pickResult(await nominatim(parts.join(", "), f.country));
    await sleep(RATE_MS);

    // Retry without the region — Grint's Canadian rows have no province and
    // "Ontario, Ontario" confuses the geocoder.
    if (!hit) {
      hit = pickResult(await nominatim([name, f.locality].filter(Boolean).join(", "), f.country));
      await sleep(RATE_MS);
    }

    // Last resort: the town. Flagged so the map can render it differently and
    // the coverage table can count it as not-really-located.
    if (!hit) {
      const town = pickResult(
        await nominatim([f.locality, f.region, COUNTRY_NAME[f.country]].filter(Boolean).join(", "), f.country),
      );
      await sleep(RATE_MS);
      if (town) hit = { ...town, precision: "city_centroid" };
    }
  } catch (err) {
    console.warn(`  ✗ ${f.slug}: ${err.message}`);
  }

  if (!hit) {
    failed++;
    unresolved.push(f);
    console.log(`  ✗ ${f.grintName} (${f.locality})`);
    continue;
  }

  cache[f.slug] = { ...hit, source: "nominatim", query: parts.join(", ") };
  fetched++;
  const mark = hit.precision === "course_feature" ? "●" : hit.precision === "named_place" ? "◐" : "○";
  console.log(`  ${mark} ${f.grintName.padEnd(48).slice(0, 48)} ${hit.lat.toFixed(4)}, ${hit.lon.toFixed(4)}`);
}

writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + "\n");
if (!existsSync(OVERRIDES_PATH)) {
  writeFileSync(
    OVERRIDES_PATH,
    JSON.stringify(
      {
        _README:
          "Hand-entered coordinates. Wins over every other source. Shape: " +
          '"facility-slug": { "lat": 0, "lon": 0, "precision": "manual", "source": "how you found it" }',
      },
      null,
      2,
    ) + "\n",
  );
}

// --- coverage report ---

const byPrecision = {};
for (const v of Object.values(cache)) {
  if (v?.precision) byPrecision[v.precision] = (byPrecision[v.precision] ?? 0) + 1;
}

console.log(`\n  override ${fromOverride}  seed ${fromSeed}  cache ${fromCache}  fetched ${fetched}  failed ${failed}`);
console.log(`  precision  ${Object.entries(byPrecision).map(([k, v]) => `${k}:${v}`).join("  ")}`);

const imprecise = Object.entries(cache).filter(([, v]) => v?.precision === "city_centroid");
if (imprecise.length || unresolved.length) {
  const lines = [
    "# Geocode follow-ups",
    "",
    "Generated by `npm run geocode`. Fix by adding entries to `data/geocode-overrides.json`.",
    "",
  ];
  if (unresolved.length) {
    lines.push("## Unresolved — no coordinate at all", "");
    for (const f of unresolved) lines.push(`- \`${f.slug}\` — ${f.grintName}, ${f.locality} ${f.region ?? ""}`);
    lines.push("");
  }
  if (imprecise.length) {
    lines.push("## City centroid only — pin is the town, not the course", "");
    for (const [slug, v] of imprecise) lines.push(`- \`${slug}\` — ${v.display ?? ""}`);
    lines.push("");
  }
  writeFileSync(resolve(DATA, "geocode-unresolved.md"), lines.join("\n"));
  console.log(`  → data/geocode-unresolved.md (${unresolved.length} unresolved, ${imprecise.length} imprecise)`);
}
console.log();
