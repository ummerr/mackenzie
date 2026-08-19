#!/usr/bin/env node
/**
 * Validating inventory of a Grint Export bundle (grint-export/1), the file
 * the grint-extension downloads and the user drops into data/raw/.
 *
 * Run: npm run grint:inventory
 *
 * This is the gate between "a file the browser produced" and "a capture the
 * adapter can be written against": it proves the bundle is structurally
 * sound, shows what was and wasn't captured, and refuses anything that must
 * never be committed (cookies, auth headers). It does NOT parse scorecards —
 * that is the second adapter's job (parse-grint-export.mjs, not yet built),
 * which per house rules gets written against real captured markup, not
 * guessed markup.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW = resolve(__dirname, "../data/raw");

const KNOWN_KINDS = new Set(["trend", "handicap", "scoreIndex", "scorecard", "courseData"]);
const EXPECTED_TREND_VIEWS = 13;

const violations = [];
const notes = [];

// ---- locate the newest bundle ----------------------------------------------

const candidates = readdirSync(RAW)
  .filter((f) => /^grint-export-\d{4}-\d{2}-\d{2}(-\d{4})?\.json$/.test(f))
  .sort();

if (candidates.length === 0) {
  console.error(`No grint-export-*.json in ${RAW}.`);
  console.error("Run the extension (grint-extension/README.md) and move the download here.");
  process.exit(1);
}

const file = resolve(RAW, candidates[candidates.length - 1]);
const rawText = readFileSync(file, "utf8");

// ---- committability: nothing secret-shaped may be in the file ---------------

for (const re of [/set-cookie/i, /phpsessid/i, /\bauthorization\b/i, /document\.cookie/i]) {
  if (re.test(rawText)) violations.push(`secret-shaped content matches ${re}`);
}

// ---- structure ---------------------------------------------------------------

let bundle;
try {
  bundle = JSON.parse(rawText);
} catch (e) {
  console.error(`${file} is not valid JSON: ${e.message}`);
  process.exit(1);
}

if (bundle.format !== "grint-export/1") {
  violations.push(`unknown format ${JSON.stringify(bundle.format)} (expected "grint-export/1")`);
}
for (const key of ["capturedAt", "userId", "resources", "errors", "warnings", "summary", "discovery"]) {
  if (!(key in bundle)) violations.push(`missing top-level key "${key}"`);
}

const resources = Array.isArray(bundle.resources) ? bundle.resources : [];
const byKind = new Map();
let fullPageFallbacks = 0;

for (const r of resources) {
  if (!KNOWN_KINDS.has(r.kind)) {
    violations.push(`unknown resource kind "${r.kind}" at ${r.url}`);
    continue;
  }
  byKind.set(r.kind, (byKind.get(r.kind) || 0) + 1);
  if (r.extraction?.mode === "fullPage") fullPageFallbacks++;
}

// ---- recompute the summary and demand agreement ------------------------------

const recomputed = {
  trendViews: byKind.get("trend") || 0,
  scorecardsOk: byKind.get("scorecard") || 0,
  courses: new Set(
    resources.filter((r) => r.kind === "courseData").map((r) => r.meta?.courseId)
  ).size,
  errors: (bundle.errors || []).length,
};
for (const [k, v] of Object.entries(recomputed)) {
  if (bundle.summary?.[k] !== v) {
    violations.push(`summary.${k} = ${bundle.summary?.[k]} but bundle contains ${v}`);
  }
}

const rounds = bundle.discovery?.roundIdsFound ?? 0;
if (rounds === 0) violations.push("zero rounds discovered — capture is not usable");

// ---- soft findings -------------------------------------------------------------

if (recomputed.trendViews < EXPECTED_TREND_VIEWS) {
  notes.push(`only ${recomputed.trendViews}/${EXPECTED_TREND_VIEWS} trend views captured`);
}
const noData = resources
  .filter((r) => r.kind === "trend" && r.meta?.noData)
  .map((r) => r.meta.view);
if (noData.length) notes.push(`trend views with no chart data (PRO gate?): ${noData.join(", ")}`);
if (!byKind.get("handicap")) notes.push("no handicap resource captured");
// An incremental bundle deliberately skips scorecards its baseline already
// holds; only the remainder is expected to be present.
const skippedScorecards = bundle.baseline?.skippedScorecards ?? 0;
if (bundle.baseline) {
  notes.push(
    `incremental capture against ${bundle.baseline.rawFile}: ` +
      `${bundle.baseline.knownRounds} rounds known, ${skippedScorecards} scorecards skipped — ` +
      `pnpm data:rounds merges it over the newest full bundle`,
  );
}
if (recomputed.scorecardsOk < rounds - skippedScorecards) {
  notes.push(`${rounds - skippedScorecards - recomputed.scorecardsOk} of ${rounds - skippedScorecards} expected rounds have no scorecard resource`);
}
if (bundle.discovery?.paginationPattern) {
  notes.push(`pagination pattern adopted: ${bundle.discovery.paginationPattern}`);
} else if ((bundle.discovery?.scorePagesFetched ?? 0) <= 1) {
  notes.push("no pagination discovered — round list may be truncated to the first listing page");
}
const guessedTees = resources.filter((r) => r.kind === "courseData" && r.meta?.teeGuessed).length;
if (guessedTees) notes.push(`${guessedTees} courseData fetches used a guessed teeId=1`);
if (fullPageFallbacks) notes.push(`${fullPageFallbacks} resources fell back to full-page capture (selector drift)`);

// ---- report ---------------------------------------------------------------------

const kb = Math.round(rawText.length / 1024);
console.log(`\n${candidates[candidates.length - 1]}  (${kb} KB)`);
console.log(`captured ${bundle.capturedAt}  user ${bundle.userId}  extension ${bundle.extensionVersion}\n`);

console.log("resource            count");
console.log("------------------  -----");
for (const kind of KNOWN_KINDS) {
  console.log(`${kind.padEnd(18)}  ${String(byKind.get(kind) || 0).padStart(5)}`);
}
console.log("");
console.log(`score pages fetched   ${bundle.discovery?.scorePagesFetched ?? "?"}`);
console.log(`rounds discovered     ${rounds}`);
console.log(`warnings              ${(bundle.warnings || []).length}`);
console.log(`errors                ${(bundle.errors || []).length}`);

if ((bundle.errors || []).length) {
  console.log("\nerrors:");
  for (const e of bundle.errors) {
    console.log(`  [${e.stage}] ${e.url || ""} ${e.status || ""} ${e.message}`);
  }
}

if (notes.length) {
  console.log("\nfindings:");
  for (const n of notes) console.log(`  - ${n}`);
}

if (violations.length) {
  console.log("\nSTRUCTURAL VIOLATIONS — do not commit this bundle:");
  for (const v of violations) console.log(`  ✗ ${v}`);
  process.exit(1);
}

console.log("\nBundle is structurally sound and committable.");
