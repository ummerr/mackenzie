#!/usr/bin/env node
/**
 * Append courses the round record knows but the ranking paste doesn't.
 *
 *   data/rounds.json  ──►  data/layouts.json + data/facilities.json (appended)
 *
 * Run: pnpm data:spine   (after data:parse, before data:geocode)
 *
 * The paste adapter (parse-grint.mjs) is a snapshot: it knows every course as
 * of its capture date and nothing after. New rounds arrive continuously via
 * the export extension, so a course played after the last paste exists in
 * rounds.json but has no map pin. This script closes that gap WITHOUT a new
 * paste: any course in the round record whose slug is missing from the spine
 * is appended with exactly what the record can honestly say about it.
 *
 * ---------------------------------------------------------------------------
 * POLICY
 * ---------------------------------------------------------------------------
 * Nothing is invented (SPEC.md §1). A course arriving this way has:
 *   - grintName        verbatim from the scorecard's ucourse field
 *   - timesPlayed      a count of its rounds in the record — real events
 *   - personalRank     null. The paste is the only source of your ranking.
 *   - avgScore/ratings null. Grint computes those; we don't imitate them.
 *   - locality etc.    null. The scorecard page carries no location; the
 *                      geocoder resolves the pin (and its own provenance
 *                      fields) downstream, precision recorded as always.
 *   - flags            ["rounds_only"] so every reader knows why the rest
 *                      is absent, and origin: "rounds" for provenance.
 *
 * Slug rules and the facility alias table MUST stay in step with
 * parse-grint.mjs — the whole point is that both adapters land on the same
 * slug for the same place. Verified against the full record: 95 distinct
 * course strings, 93 slug-match the paste exactly.
 *
 * A large number of additions is parser drift, not new golf: more than
 * MAX_ADDITIONS unmatched courses fails the run rather than minting a
 * duplicate facility per drifted name.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "../data");

const MAX_ADDITIONS = 10;

/** Same rules as parse-grint.mjs — the two must agree on every slug. */
export function slugify(s) {
  return s
    .toLowerCase()
    .replace(/['‘’]/g, "") // Ke'olu -> keolu, Kings' -> kings
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Same table as parse-grint.mjs — facilities Grint lists under two names —
 *  plus entries only this adapter needs: a course RENAMED between the paste
 *  and a later round is the same physical place under a new name.
 *  Explicit, not fuzzy, same as the paste adapter's table. */
export const FACILITY_ALIASES = {
  "sepulveda-golf-club": "sepulveda-golf-complex",
  // Brambles is the 2024 Kyle Phillips redesign of Hidden Valley Lake G&CC —
  // same property, 19210 Hartmann Road (OSM relation/3570262, which Nominatim
  // still lists under the old name). The paste ranked the pre-redesign course
  // 88th; the Brambles round arrives as a second layout of that facility, so
  // the map keeps one pin on one place.
  "brambles-golf": "hidden-valley-lake-golf-and-country-club",
};

/** "Battlefield | Legends On The Niagara Golf Club" -> { layout, facility } —
 *  the same convention the ranking paste uses. */
export function splitCourseName(name) {
  const idx = name.indexOf("|");
  if (idx === -1) return { layout: null, facility: name.trim() };
  return { layout: name.slice(0, idx).trim(), facility: name.slice(idx + 1).trim() };
}

/**
 * Courses present in the round record but absent from the spine.
 *
 * Returns { layouts, facilities } to append. A new layout at an EXISTING
 * facility pushes its slug onto that facility's layoutSlugs in place — the
 * caller writes both files back, so the mutation is the point.
 */
export function deriveAdditions(rounds, layouts, facilities) {
  const layoutSlugs = new Set(layouts.map((l) => l.slug));
  const facilityBySlug = new Map(facilities.map((f) => [f.slug, f]));

  // Group by the verbatim course string; rounds.json is chronological, so
  // additions land in first-played order.
  const byName = new Map();
  for (const r of rounds) {
    if (!r.courseName) continue;
    if (!byName.has(r.courseName)) byName.set(r.courseName, []);
    byName.get(r.courseName).push(r);
  }

  const newFacilities = [];
  const newLayouts = [];
  for (const [name, courseRounds] of byName) {
    const { layout, facility } = splitCourseName(name);
    const parsedSlug = slugify(facility);
    const facilitySlug = FACILITY_ALIASES[parsedSlug] ?? parsedSlug;
    // An aliased name with no pipe still needs its own layout slug — reusing
    // the facility slug would collide with the layout already there.
    const layoutSlug = layout
      ? `${facilitySlug}--${slugify(layout)}`
      : facilitySlug === parsedSlug
        ? facilitySlug
        : `${facilitySlug}--${parsedSlug}`;
    if (layoutSlugs.has(layoutSlug)) continue;

    let fac =
      facilityBySlug.get(facilitySlug) ??
      newFacilities.find((f) => f.slug === facilitySlug);
    if (fac && parsedSlug !== facilitySlug && !fac.aliases.includes(facility)) {
      fac.aliases.push(facility);
    }
    if (!fac) {
      fac = {
        slug: facilitySlug,
        grintName: facility,
        locality: null,
        region: null,
        country: null,
        layoutSlugs: [],
        aliases: [],
        origin: "rounds",
      };
      newFacilities.push(fac);
    }
    fac.layoutSlugs.push(layoutSlug);

    newLayouts.push({
      slug: layoutSlug,
      facilitySlug,
      grintLayoutName: layout,
      grintFacilityName: facility,
      grintCourseId: courseRounds.find((r) => r.courseGrintId)?.courseGrintId ?? null,
      personalRank: null,
      timesPlayed: courseRounds.length,
      avgScore: null,
      ratings: { overall: null, fun: null, condition: null },
      played: true,
      flags: ["rounds_only"],
      origin: "rounds",
    });
  }
  return { layouts: newLayouts, facilities: newFacilities };
}

// ---------------------------------------------------------------------------

function main() {
  const read = (n) => JSON.parse(readFileSync(resolve(DATA, n), "utf8"));
  const roundsFile = read("rounds.json");
  const layoutsFile = read("layouts.json");
  const facilitiesFile = read("facilities.json");

  const add = deriveAdditions(roundsFile.rounds, layoutsFile.layouts, facilitiesFile.facilities);

  if (add.layouts.length > MAX_ADDITIONS) {
    console.error(
      `${add.layouts.length} unmatched courses — that is parser drift or a name-format change, not new golf.`,
    );
    console.error(add.layouts.map((l) => `  ${l.grintFacilityName}`).join("\n"));
    return 1;
  }
  if (add.layouts.length === 0) {
    console.log("spine already covers the round record — nothing to append");
    return 0;
  }

  layoutsFile.layouts.push(...add.layouts);
  facilitiesFile.facilities.push(...add.facilities);
  writeFileSync(resolve(DATA, "layouts.json"), JSON.stringify(layoutsFile, null, 2) + "\n");
  writeFileSync(resolve(DATA, "facilities.json"), JSON.stringify(facilitiesFile, null, 2) + "\n");

  for (const l of add.layouts) {
    console.log(
      `  + ${l.grintFacilityName}${l.grintLayoutName ? ` (${l.grintLayoutName})` : ""}` +
        `  ${l.timesPlayed} round${l.timesPlayed === 1 ? "" : "s"}, unranked`,
    );
  }
  console.log(
    `appended ${add.layouts.length} layout(s), ${add.facilities.length} facility(ies) from the round record`,
  );
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
