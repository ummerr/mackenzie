#!/usr/bin/env node
/**
 * Parse the raw Grint "Personal Ranking" paste into the two spine files:
 *
 *   data/layouts.json     one record per playable routing (the thing you ranked/played)
 *   data/facilities.json  one record per physical place (the thing that gets a map pin)
 *
 * Run: npm run parse
 *
 * ---------------------------------------------------------------------------
 * ADAPTER SEAM
 * ---------------------------------------------------------------------------
 * This is one implementation of a Grint *source adapter*. The second exists:
 * the Chrome extension in ../grint-extension/ downloads a grint-export-*.json
 * bundle into data/raw/ (inventoried by inventory-grint-export.mjs), and
 * parse-grint-export.mjs parses it — emitting per-round records as the NEW
 * file data/rounds.json, never touching the two spine files above. Nothing
 * downstream — geocode, osm, build, the map — changes shape because a second
 * source arrived.
 *
 * The contract an adapter must satisfy is documented in SPEC.md § Adapter contract.
 *
 * ---------------------------------------------------------------------------
 * POLICY
 * ---------------------------------------------------------------------------
 * This script is VERBATIM. It transcribes what Grint says and flags what looks
 * wrong; it never corrects. "Cherry Downs Golf & Count" stays truncated and
 * "Tpc Of Scottsdale" stays mis-cased here — display-name corrections are an
 * external claim and belong in data/facts.json, where they carry a source.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "../data");
const SRC = resolve(DATA, "raw/grint-played-2026-08-01.txt");

/**
 * Grint leaves the state column empty outside the US. Locality -> ISO country.
 * Enumerated rather than inferred: 12 rows, all verifiable by eye, and a wrong
 * guess here puts a course in the ocean.
 */
const FOREIGN_LOCALITIES = {
  // Ontario, Canada
  Caledon: { country: "CA", region: "ON" },
  "Niagara Falls": { country: "CA", region: "ON" },
  London: { country: "CA", region: "ON" },
  Ontario: { country: "CA", region: "ON" },
  Tecumseth: { country: "CA", region: "ON" },
  Pickering: { country: "CA", region: "ON" },
  "North York": { country: "CA", region: "ON" },
  // Barbados
  "Forest Hills": { country: "BB", region: "St. James" }, // Royal Westmoreland
  "St. James": { country: "BB", region: "St. James" }, // Sandy Lane
  Barbados: { country: "BB", region: null }, // Barbados Golf Club, Christ Church
};

/**
 * Facilities Grint lists under more than one name. Explicit, not fuzzy: with 94
 * rows the full list is inspectable, and fuzzy matching would eventually merge
 * two courses that genuinely are different places.
 *
 * Left = slug as parsed, right = canonical facility slug.
 */
const FACILITY_ALIASES = {
  // Grint has the Balboa row under "Sepulveda Golf Club" and the Encino row
  // under "Sepulveda Golf Complex". Same 36-hole municipal facility in Encino.
  "sepulveda-golf-club": "sepulveda-golf-complex",
};

/** Below this 18-hole average, the round was almost certainly 9 holes. */
const NINE_HOLE_CEILING = 60;
/** Between the two, the average is probably mixing 9- and 18-hole rounds. */
const MIXED_ROUND_CEILING = 72;

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/['‘’]/g, "") // Ke'olu -> keolu, Kings' -> kings
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Extract just the ranking table; the paste also carries nav chrome and the
 *  friends-activity feed, neither of which is data. */
function sliceTable(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^Ranking Course\s/.test(l));
  const end = lines.findIndex((l) => /^FRIENDS COURSE NOTIFICATION/.test(l));
  if (start === -1) throw new Error("could not find the ranking table header");
  return lines.slice(start + 1, end === -1 ? undefined : end);
}

function parseRows(lines) {
  // Non-empty, trimmed. The paste's blank lines and trailing tabs are noise.
  const clean = lines.map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim() !== "");

  const rows = [];
  for (let i = 0; i < clean.length; i++) {
    // Anchor on the rank line. Grint writes "1st, 2st, 3st..." — its own bug;
    // accept any ordinal suffix.
    const m = /^(\d+)(?:st|nd|rd|th)\s+(.+)$/.exec(clean[i]);
    if (!m) continue;

    const [, rankStr, nameField] = m;
    const rest = clean.slice(i + 1, i + 7);
    if (rest.length < 6) {
      throw new Error(`rank ${rankStr} (${nameField}) has only ${rest.length} follow-on lines`);
    }
    const [place, times, avg, rating, fun, condition] = rest;

    rows.push({
      personalRank: Number(rankStr),
      nameField: nameField.trim(),
      place: place.trim(),
      timesPlayed: Number(times),
      avgScore: Number(avg),
      rating: Number(rating),
      fun: Number(fun),
      condition: Number(condition),
    });
    i += 6;
  }
  return rows;
}

/** "Black | Bethpage State Park Golf Course" -> { layout, facility } */
function splitName(nameField) {
  const idx = nameField.indexOf("|");
  if (idx === -1) return { layout: null, facility: nameField.trim() };
  return {
    layout: nameField.slice(0, idx).trim(),
    facility: nameField.slice(idx + 1).trim(),
  };
}

/** "Mt. Laurel,NJ" -> { locality, region, country }. Split on the LAST comma so
 *  localities containing periods or commas survive. */
function splitPlace(place) {
  const idx = place.lastIndexOf(",");
  const locality = (idx === -1 ? place : place.slice(0, idx)).trim();
  const stateRaw = idx === -1 ? "" : place.slice(idx + 1).trim();

  if (stateRaw) return { locality, region: stateRaw, country: "US" };

  const foreign = FOREIGN_LOCALITIES[locality];
  if (!foreign) {
    throw new Error(
      `"${locality}" has no state and is not in FOREIGN_LOCALITIES — ` +
        `add it there rather than defaulting to a country.`,
    );
  }
  return { locality, region: foreign.region, country: foreign.country };
}

function flagsFor(row) {
  const flags = [];
  if (row.timesPlayed === 0) flags.push("unplayed");
  if (row.timesPlayed > 0 && row.avgScore > 0) {
    if (row.avgScore < NINE_HOLE_CEILING) flags.push("nine_hole_suspected");
    else if (row.avgScore < MIXED_ROUND_CEILING) flags.push("mixed_round_lengths_suspected");
  }
  if (row.rating === 0 && row.fun === 0 && row.condition === 0) flags.push("unreviewed");
  return flags;
}

// ---------------------------------------------------------------------------

const raw = readFileSync(SRC, "utf8");
const rows = parseRows(sliceTable(raw));

const facilities = new Map();
const layouts = [];

for (const row of rows) {
  const { layout, facility } = splitName(row.nameField);
  const { locality, region, country } = splitPlace(row.place);

  const parsedSlug = slugify(facility);
  const facilitySlug = FACILITY_ALIASES[parsedSlug] ?? parsedSlug;
  const layoutSlug = layout ? `${facilitySlug}--${slugify(layout)}` : facilitySlug;

  if (!facilities.has(facilitySlug)) {
    facilities.set(facilitySlug, {
      slug: facilitySlug,
      grintName: facility,
      locality,
      region,
      country,
      layoutSlugs: [],
      aliases: [],
    });
  }
  const f = facilities.get(facilitySlug);
  f.layoutSlugs.push(layoutSlug);
  if (parsedSlug !== facilitySlug && !f.aliases.includes(facility)) f.aliases.push(facility);

  layouts.push({
    slug: layoutSlug,
    facilitySlug,
    grintLayoutName: layout,
    grintFacilityName: facility,
    personalRank: row.personalRank,
    timesPlayed: row.timesPlayed,
    avgScore: row.avgScore || null,
    ratings: {
      overall: row.rating || null,
      fun: row.fun || null,
      condition: row.condition || null,
    },
    played: row.timesPlayed > 0,
    flags: flagsFor(row),
  });
}

// --- integrity checks: fail loudly rather than emit a plausible-looking file ---

const dupes = layouts.map((l) => l.slug).filter((s, i, a) => a.indexOf(s) !== i);
if (dupes.length) throw new Error(`duplicate layout slugs: ${[...new Set(dupes)].join(", ")}`);

const ranks = layouts.map((l) => l.personalRank).sort((a, b) => a - b);
const gaps = ranks.filter((r, i) => r !== i + 1);
if (gaps.length) throw new Error(`personalRank is not 1..N — first break at ${gaps[0]}`);

const out = {
  source: "thegrint.com personal ranking",
  adapter: "paste",
  capturedAt: "2026-08-01",
  rawFile: "raw/grint-played-2026-08-01.txt",
  layouts,
};

writeFileSync(resolve(DATA, "layouts.json"), JSON.stringify(out, null, 2) + "\n");
writeFileSync(
  resolve(DATA, "facilities.json"),
  JSON.stringify(
    { capturedAt: out.capturedAt, facilities: [...facilities.values()] },
    null,
    2,
  ) + "\n",
);

// --- report against numbers Grint itself publishes, so drift is detectable ---

const played = layouts.filter((l) => l.played);
const usRegions = new Set(
  [...facilities.values()].filter((f) => f.country === "US").map((f) => f.region),
);
const countries = new Set([...facilities.values()].map((f) => f.country));
const flagged = (name) => layouts.filter((l) => l.flags.includes(name));

console.log(`\n  layouts        ${layouts.length}`);
console.log(`  facilities     ${facilities.size}`);
console.log(`  played         ${played.length}   (Grint header says 93)`);
console.log(`  US states      ${usRegions.size}   (Grint header says 11)`);
console.log(`  countries      ${countries.size}   (Grint header says 3)  [${[...countries].join(" ")}]`);
console.log(`\n  flags`);
for (const f of ["unplayed", "nine_hole_suspected", "mixed_round_lengths_suspected", "unreviewed"]) {
  const hits = flagged(f);
  if (hits.length) console.log(`    ${f.padEnd(30)} ${String(hits.length).padStart(2)}`);
}

const multi = [...facilities.values()].filter((f) => f.layoutSlugs.length > 1);
console.log(`\n  multi-layout facilities (${multi.length})`);
for (const f of multi) console.log(`    ${f.grintName}  →  ${f.layoutSlugs.length}`);
console.log();
