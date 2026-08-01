#!/usr/bin/env node
/**
 * Assert the invariants and print a coverage table. Writes nothing.
 *
 * Run: npm run validate
 *
 * Pattern borrowed from archetypes-audit/scripts/validate-data.js: walk the
 * data, count errors, exit non-zero if any. The difference here is that most
 * of what we want to know is not "is it broken" but "how much of it is real" —
 * so coverage is a first-class output, not a footnote.
 *
 * Errors fail the build. Warnings are things a human should look at.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "../data");
const readJson = (n, fb) => {
  const p = resolve(DATA, n);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fb;
};

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const built = readJson("courses.json", null);
if (!built) {
  console.error("data/courses.json missing — run `npm run build` first");
  process.exit(1);
}
const { facilities, lenses, stats } = built;
const { layouts } = readJson("layouts.json", { layouts: [] });
const facts = readJson("facts.json", {});
const { lenses: weightLenses } = readJson("weights.json", { lenses: {} });

/** Rough country bounding boxes. Catches the classic geocoder failure of
 *  putting a Barbados course off the coast of West Africa at 0,0. */
const COUNTRY_BBOX = {
  US: [-180, 15, -64, 72], // includes Hawaii and Alaska
  CA: [-141, 41, -52, 84],
  BB: [-60.0, 12.8, -59.2, 13.4],
};

// --- structural invariants ---------------------------------------------------

const slugs = new Set();
for (const f of facilities) {
  if (slugs.has(f.slug)) err(`duplicate facility slug: ${f.slug}`);
  slugs.add(f.slug);
  if (!f.layouts.length) err(`facility has no layouts: ${f.slug}`);
}

const layoutSlugs = new Set();
for (const l of layouts) {
  if (layoutSlugs.has(l.slug)) err(`duplicate layout slug: ${l.slug}`);
  layoutSlugs.add(l.slug);
  if (!slugs.has(l.facilitySlug)) err(`layout ${l.slug} points at unknown facility ${l.facilitySlug}`);
}

if (layouts.length !== facilities.reduce((s, f) => s + f.layouts.length, 0)) {
  err("layout count in courses.json does not match layouts.json");
}

// --- geography ---------------------------------------------------------------

for (const f of facilities) {
  if (f.lat == null || f.lon == null) {
    warn(`no coordinate: ${f.slug} (${f.locality})`);
    continue;
  }
  if (f.lat === 0 && f.lon === 0) err(`null island: ${f.slug}`);
  const box = COUNTRY_BBOX[f.country];
  if (!box) {
    warn(`no bounding box defined for country ${f.country} (${f.slug})`);
    continue;
  }
  const [w, s, e, n] = box;
  if (f.lon < w || f.lon > e || f.lat < s || f.lat > n) {
    err(`${f.slug} is at ${f.lat.toFixed(3)},${f.lon.toFixed(3)} — outside ${f.country}`);
  }
  if (f.precision === "city_centroid") warn(`still a town centroid, not the course: ${f.slug}`);
}

// --- provenance contract -----------------------------------------------------

let claims = 0, unverified = 0, sourceless = 0;
const CLAIM_KEYS = ["value", "source", "confidence", "checked", "verified"];

for (const [slug, rec] of Object.entries(facts)) {
  if (slug.startsWith("_")) continue;
  if (!slugs.has(slug)) err(`facts.json has an entry for unknown facility: ${slug}`);

  for (const [field, claim] of Object.entries(rec)) {
    if (field === "rankings") {
      for (const r of claim) {
        claims++;
        if (!r.source) { sourceless++; err(`${slug}.rankings[${r.list}] has no source`); }
        if (!r.verified) unverified++;
        if (!Number.isFinite(r.rank)) err(`${slug}.rankings[${r.list}] rank is not a number`);
      }
      continue;
    }
    claims++;
    if (typeof claim !== "object" || claim === null) {
      err(`${slug}.${field} is a bare value — every claim must be {value, source, confidence, checked, verified}`);
      continue;
    }
    for (const k of CLAIM_KEYS) {
      if (!(k in claim)) err(`${slug}.${field} is missing "${k}"`);
    }
    if (!claim.source) { sourceless++; err(`${slug}.${field} has an empty source`); }
    if (!["high", "medium", "low"].includes(claim.confidence)) {
      err(`${slug}.${field} confidence "${claim.confidence}" is not high|medium|low`);
    }
    if (!claim.verified) unverified++;
  }
}

// --- lenses ------------------------------------------------------------------

const KNOWN_VECTORS = new Set(
  Object.keys(facilities.find((f) => f.layouts.length)?.layouts[0]?.vectors ?? {}),
);
for (const [id, lens] of Object.entries(weightLenses)) {
  for (const v of Object.keys(lens.weights)) {
    if (!KNOWN_VECTORS.has(v)) err(`lens "${id}" weights unknown vector "${v}"`);
  }
}

// --- coverage ----------------------------------------------------------------

const pct = (n, d) => `${String(n).padStart(3)}/${d}  ${String(Math.round((n / d) * 100)).padStart(3)}%`;
const n = facilities.length;
const has = (fn) => facilities.filter(fn).length;

const precision = {};
for (const f of facilities) precision[f.precision ?? "none"] = (precision[f.precision ?? "none"] ?? 0) + 1;

console.log(`\n  ── coverage ──────────────────────────────────────────`);
console.log(`  coordinate            ${pct(has((f) => f.lat != null), n)}`);
console.log(`  OSM polygon           ${pct(has((f) => f.hasPolygon), n)}`);
console.log(`  curated facts         ${pct(has((f) => f.facts), n)}`);
console.log(`  architect (curated)   ${pct(has((f) => f.facts?.architect), n)}`);
console.log(`  architect (OSM tag)   ${pct(has((f) => f.osmTags?.architect), n)}`);
console.log(`  year opened           ${pct(has((f) => f.facts?.yearOpened), n)}`);
console.log(`  access                ${pct(has((f) => f.facts?.access || f.osmTags?.access), n)}`);
console.log(`  external ranking      ${pct(has((f) => f.facts?.rankings?.length), n)}`);
console.log(`  hole count (OSM tag)  ${pct(has((f) => f.osmTags?.holes), n)}`);

console.log(`\n  ── geocode precision ─────────────────────────────────`);
for (const [k, v] of Object.entries(precision).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(22)}${String(v).padStart(4)}`);
}

console.log(`\n  ── provenance ────────────────────────────────────────`);
console.log(`  claims                ${claims}`);
console.log(`  unverified            ${unverified}  ← run the verification pass`);
console.log(`  sourceless            ${sourceless}`);

console.log(`\n  ── spine ─────────────────────────────────────────────`);
console.log(`  facilities ${stats.facilities}   layouts ${stats.layouts}   played ${stats.played}`);
console.log(`  countries ${stats.countries.join(" ")}   US states ${stats.usStates.length}`);
console.log(`  lenses     ${Object.keys(lenses).join(", ")}`);

// --- verdict -----------------------------------------------------------------

if (warnings.length) {
  console.log(`\n  ── warnings (${warnings.length}) ───────────────────────────────`);
  for (const w of warnings.slice(0, 25)) console.log(`  ! ${w}`);
  if (warnings.length > 25) console.log(`  … and ${warnings.length - 25} more`);
}
if (errors.length) {
  console.log(`\n  ── ERRORS (${errors.length}) ─────────────────────────────────`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  console.log();
  process.exit(1);
}
console.log(`\n  ✓ no errors\n`);
