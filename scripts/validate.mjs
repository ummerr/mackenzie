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
import { slugify } from "./rounds-to-spine.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "../data");
const PUB = resolve(__dirname, "../public/data");
const readJson = (n, fb) => {
  const p = resolve(DATA, n);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fb;
};

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// --- benchmarks contract -----------------------------------------------------
// The only file allowed to hold a number about other golfers. Every entry
// carries a source URL, the population it was measured on, and the
// provider's definition of the metric (DECISIONS.md 2026-09-29). Checked
// before the courses artifact so a fresh checkout still gets the verdict.

const BENCH_KEYS = ["id", "metric", "band", "value", "unit", "definition", "population", "source", "sourceTitle", "checked", "verified", "confidence"];
const benchFile = readJson("benchmarks.json", { benchmarks: [] });
const benchIds = new Set();
let benchUnverified = 0;
for (const b of benchFile.benchmarks ?? []) {
  const tag = `benchmarks[${b?.id ?? "?"}]`;
  if (typeof b !== "object" || b === null) { err(`${tag} is not an object`); continue; }
  for (const k of BENCH_KEYS) if (!(k in b)) err(`${tag} is missing "${k}"`);
  if (benchIds.has(b.id)) err(`${tag} duplicate id`);
  benchIds.add(b.id);
  if (typeof b.source !== "string" || !/^https?:\/\//.test(b.source)) err(`${tag} source is not a URL`);
  if (!b.population) err(`${tag} has no population`);
  if (!b.definition) err(`${tag} has no definition`);
  if (!Number.isFinite(b.value)) err(`${tag} value is not a number`);
  if (!["high", "medium", "low"].includes(b.confidence)) err(`${tag} confidence "${b.confidence}" is not high|medium|low`);
  if (!b.verified) benchUnverified++;
}
console.log(`\n  benchmarks ${benchIds.size} · unverified ${benchUnverified}`);

// --- the California 100 contract ---------------------------------------------
// The to-play list (DECISIONS.md 2026-10-06): one compilation of published
// rankings, checked row by row. The join to the spine is explicit — an entry
// names a facility (and layout) or names nothing, and an entry that LOOKS
// like a spine facility while naming nothing must say why. Checked here
// against the spine files directly so a fresh checkout gets the verdict
// before `data:build` has run.

const CA_ENTRY_KEYS = ["rank", "slug", "name", "locality", "area", "architect", "tee", "fee", "access", "status", "rankings", "value", "valueNote", "tags", "facilitySlug", "layoutSlug", "joinNote", "provenance"];
const CA_RANKING_KEYS = ["golfweekCA", "golfweekUS", "golfDigestScore", "golfDigestCA", "golfDigestPublic", "golfYCP"];
const CA_CHECKS = ["rankings", "tee", "fee", "architect"];
const CA_VALUE = /^[A-D](\+\+|\+|-)?$/;
const CA_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CA_URL = /^https?:\/\//;
const numOrNull = (x) => x === null || Number.isFinite(x);
const strOrNull = (x) => x === null || typeof x === "string";

const caFile = readJson("california-100.json", null);
let caStats = null;
if (caFile) {
  const spineFacilities = readJson("facilities.json", { facilities: [] }).facilities;
  const spineBySlug = new Map(spineFacilities.map((f) => [f.slug, f]));
  const spineLayoutSlugs = new Set(readJson("layouts.json", { layouts: [] }).layouts.map((l) => l.slug));
  const sources = caFile._sources ?? {};
  const accessCodes = new Set(Object.keys(caFile._access ?? {}));
  const areaCodes = new Set(Object.keys(caFile._areas ?? {}));
  const tagCodes = new Set(Object.keys(caFile._tags ?? {}));
  const entries = Array.isArray(caFile.entries) ? caFile.entries : [];

  for (const [key, src] of Object.entries(sources)) {
    const tag = `california-100._sources[${key}]`;
    if (!src.title) err(`${tag} has no title`);
    if (src.url === null) {
      if (!src.note) err(`${tag} has neither a URL nor a note saying why`);
    } else if (!CA_URL.test(src.url)) err(`${tag} url is not a URL`);
    if (!Array.isArray(src.fields) || !src.fields.length) err(`${tag} names no fields`);
    for (const f of src.fields ?? []) {
      const head = f.split(".")[0];
      if (!CA_ENTRY_KEYS.includes(head)) err(`${tag} field "${f}" is not an entry key`);
    }
    if (src.verified && !CA_URL.test(src.url ?? "")) err(`${tag} is verified without a URL`);
  }

  if (entries.length !== 100) err(`california-100 has ${entries.length} entries, not 100`);
  const ranks = new Set(), caSlugs = new Set(), joins = new Set();
  let caVerified = 0, caChecks = 0, caLinked = 0;

  /* The join-completeness gate. The first two non-generic tokens of the name
     (before any " — " or "(") must not sit inside a California facility's slug
     or aliases unless the entry either names that facility or carries a
     joinNote. Candidates are suggestions for a human, never a join. */
  const GENERIC = new Set(["golf", "course", "club", "links", "resort", "country", "the", "inn", "spa", "and", "at", "municipal", "gc", "cc"]);
  const tokensOf = (s) => slugify(s).split("-").filter((t) => t && !GENERIC.has(t));
  const contains = (hay, needle) => {
    if (!needle.length || needle.length > hay.length) return false;
    for (let i = 0; i + needle.length <= hay.length; i++) {
      if (needle.every((t, j) => hay[i + j] === t)) return true;
    }
    return false;
  };
  const caFacilities = spineFacilities.filter((f) => f.region === "CA" || f.region === null);
  const candidatesFor = (name) => {
    const head = name.split(/\s+[—–-]\s+|\s*\(/)[0];
    const toks = tokensOf(head);
    const key = toks.slice(0, 2);
    if (key.length === 1 && key[0].length < 8) return [];
    if (!key.length) return [];
    return caFacilities
      .filter((f) => contains(f.slug.split("-"), key) || (f.aliases ?? []).some((a) => contains(slugify(a).split("-"), key)))
      .map((f) => f.slug);
  };

  for (const e of entries) {
    const tag = `california-100[${e?.rank ?? "?"} ${e?.slug ?? "?"}]`;
    if (typeof e !== "object" || e === null) { err(`${tag} is not an object`); continue; }
    for (const k of CA_ENTRY_KEYS) if (!(k in e)) err(`${tag} is missing "${k}"`);
    if (!Number.isInteger(e.rank) || e.rank < 1 || e.rank > 100) err(`${tag} rank is not 1..100`);
    if (ranks.has(e.rank)) err(`${tag} duplicate rank`);
    ranks.add(e.rank);
    if (typeof e.slug !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.slug)) err(`${tag} slug is not kebab-case`);
    if (caSlugs.has(e.slug)) err(`${tag} duplicate slug`);
    caSlugs.add(e.slug);
    if (!e.name) err(`${tag} has no name`);
    if (!e.locality) err(`${tag} has no locality`);
    if (!areaCodes.has(e.area)) err(`${tag} area "${e.area}" is not in _areas`);
    if (!strOrNull(e.architect)) err(`${tag} architect is not a string or null`);
    const t = e.tee ?? {};
    for (const k of ["yards", "slope", "rating"]) if (!numOrNull(t[k])) err(`${tag} tee.${k} is not a number or null`);
    if (t.slope !== null && t.slope !== undefined && (t.slope < 55 || t.slope > 155)) err(`${tag} slope ${t.slope} is outside 55..155`);
    const fee = e.fee ?? {};
    if (!numOrNull(fee.low) || !numOrNull(fee.high)) err(`${tag} fee is not {low, high} numbers or null`);
    if (fee.low !== null && fee.high !== null && fee.low > fee.high) err(`${tag} fee.low > fee.high`);
    if (!Array.isArray(e.access) || !e.access.length) err(`${tag} has no access code`);
    for (const a of e.access ?? []) if (!accessCodes.has(a)) err(`${tag} access "${a}" is not in _access`);
    if (!["open", "closed"].includes(e.status)) err(`${tag} status "${e.status}" is not open|closed`);
    for (const k of CA_RANKING_KEYS) if (!numOrNull(e.rankings?.[k])) err(`${tag} rankings.${k} is not a number or null`);
    if (e.value === null) {
      if (e.status !== "closed") err(`${tag} has no value grade and is not closed`);
    } else if (!CA_VALUE.test(e.value)) err(`${tag} value "${e.value}" is not a grade`);
    for (const tg of e.tags ?? []) if (!tagCodes.has(tg)) err(`${tag} tag "${tg}" is not in _tags`);

    // the join
    if (e.facilitySlug !== null) {
      caLinked++;
      const f = spineBySlug.get(e.facilitySlug);
      if (!f) err(`${tag} facilitySlug "${e.facilitySlug}" is not in facilities.json`);
      else {
        if (e.layoutSlug !== null) {
          if (!e.layoutSlug.startsWith(`${e.facilitySlug}--`)) err(`${tag} layoutSlug does not belong to its facility`);
          if (!spineLayoutSlugs.has(e.layoutSlug) && !e.joinNote) err(`${tag} layoutSlug is not in the spine and there is no joinNote saying so`);
        } else if ((f.layoutSlugs ?? []).length > 1) {
          err(`${tag} names a facility with ${f.layoutSlugs.length} layouts and no layoutSlug — ambiguous`);
        }
      }
      const joinKey = `${e.facilitySlug}|${e.layoutSlug ?? ""}`;
      if (joins.has(joinKey)) err(`${tag} joins the same spine course as another entry`);
      joins.add(joinKey);
    } else {
      if (e.layoutSlug !== null) err(`${tag} has a layoutSlug but no facilitySlug`);
      const cands = candidatesFor(e.name ?? "");
      if (cands.length && !e.joinNote) err(`${tag} looks like ${cands.join(", ")} but names no facility and has no joinNote`);
    }

    // provenance
    const p = e.provenance ?? {};
    if (!["high", "medium", "low"].includes(p.confidence)) err(`${tag} confidence "${p.confidence}" is not high|medium|low`);
    if (!CA_DATE.test(p.checked ?? "")) err(`${tag} provenance.checked is not an ISO date`);
    if (typeof p.verified !== "boolean") err(`${tag} provenance.verified is not a boolean`);
    let allChecked = true;
    for (const g of CA_CHECKS) {
      const c = p.checks?.[g];
      if (!c || typeof c.verified !== "boolean") { err(`${tag} checks.${g} is missing`); allChecked = false; continue; }
      if (c.verified) {
        caChecks++;
        if (!c.source || !(CA_URL.test(c.source) || c.source in sources)) err(`${tag} checks.${g} is verified without a source`);
      } else allChecked = false;
    }
    if (p.verified !== allChecked) err(`${tag} provenance.verified disagrees with its checks`);
    if (p.verified) caVerified++;
  }
  caStats = { entries: entries.length, linked: caLinked, verified: caVerified, checks: caChecks };
  console.log(`  california-100 ${entries.length} · linked ${caLinked} · verified ${caVerified}/100 · checks ${caChecks}/${entries.length * CA_CHECKS.length}`);
}

const builtPath = resolve(PUB, "courses.json");
const built = existsSync(builtPath) ? JSON.parse(readFileSync(builtPath, "utf8")) : null;
if (!built) {
  console.error("public/data/courses.json missing — run `pnpm data:build` first");
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

// --- round links (Garmin ↔ Grint) --------------------------------------------
// Curated joins only: every link must point at rounds that exist, no Grint
// round may be claimed by two confirmed links, and pending proposals are a
// human's to-do, not an error.

const roundLinks = readJson("round-links.json", null);
let linkStats = null;
if (roundLinks) {
  const garminIds = new Set(
    readJson("garmin-rounds.json", { rounds: [] }).rounds.map((r) => r.scorecardId),
  );
  const grintIds = new Set(readJson("rounds.json", { rounds: [] }).rounds.map((r) => r.roundId));
  const confirmedRoundIds = new Map();
  const LINK_STATUSES = new Set(["proposed", "confirmed", "rejected"]);
  for (const l of roundLinks.links) {
    if (!LINK_STATUSES.has(l.status)) {
      err(`round-links: ${l.scorecardId} has unknown status "${l.status}"`);
    }
    if (!garminIds.has(l.scorecardId)) {
      err(`round-links: scorecardId ${l.scorecardId} is not in garmin-rounds.json`);
    }
    if (l.roundId !== null && !grintIds.has(l.roundId)) {
      err(`round-links: roundId ${l.roundId} is not in rounds.json`);
    }
    if (l.status === "confirmed" && l.roundId !== null) {
      const prior = confirmedRoundIds.get(l.roundId);
      if (prior) err(`round-links: Grint round ${l.roundId} confirmed by both ${prior} and ${l.scorecardId}`);
      confirmedRoundIds.set(l.roundId, l.scorecardId);
    }
  }
  const pending = roundLinks.links.filter((l) => l.status === "proposed" && l.roundId !== null).length;
  const unlinked = roundLinks.links.filter((l) => l.roundId === null && l.status !== "rejected").length;
  if (pending > 0) warn(`${pending} round link(s) proposed, awaiting confirmation in data/round-links.json`);
  linkStats = {
    total: roundLinks.links.length,
    confirmed: confirmedRoundIds.size,
    pending,
    unlinked,
  };
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
if (caStats) {
  const builtBySlug = new Map(facilities.map((f) => [f.slug, f]));
  let onListPlayed = 0;
  for (const e of caFile.entries ?? []) {
    const f = e.facilitySlug ? builtBySlug.get(e.facilitySlug) : null;
    if (!f) continue;
    const l = e.layoutSlug ? f.layouts.find((x) => x.slug === e.layoutSlug) : f.layouts.length === 1 ? f.layouts[0] : null;
    if (l?.played) onListPlayed++;
  }
  console.log(`  on the CA 100         ${pct(onListPlayed, 100)}  played`);
}

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
if (linkStats) {
  console.log(
    `  links      ${linkStats.total} Garmin scorecards — ${linkStats.confirmed} confirmed, ${linkStats.pending} proposed, ${linkStats.unlinked} unlinked`,
  );
}

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
