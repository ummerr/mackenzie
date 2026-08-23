#!/usr/bin/env node
/**
 * Validating inventory of a Garmin Golf Export bundle (garmin-export/1), the
 * file the garmin-extension downloads and the user drops into data/raw/.
 *
 * Run: pnpm data:garmin:inventory
 *
 * This is the gate between "a file the browser produced" and "a capture the
 * adapter can be written against": it proves the bundle is structurally
 * sound, shows what was and wasn't captured, and refuses anything that must
 * never be committed (cookies, tokens, auth headers). It does NOT parse
 * scorecards or shots — that is the adapter's job (parse-garmin-export.mjs),
 * which per house rules gets written against real captured payloads, not
 * guessed ones.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW = resolve(__dirname, "../data/raw");

const KNOWN_KINDS = new Set([
  "scorecardSummary",
  "scorecardDetail",
  "holeShots",
  "clubs",
  "clubTypes",
  "playerStats",
  "shotStats",
]);
const EXPECTED_SHOT_STATS_VIEWS = 4;

const violations = [];
const notes = [];

// ---- locate the newest bundle ----------------------------------------------

const candidates = readdirSync(RAW)
  .filter((f) => /^garmin-export-\d{4}-\d{2}-\d{2}(-\d{4})?\.json$/.test(f))
  .sort();

if (candidates.length === 0) {
  console.error(`No garmin-export-*.json in ${RAW}.`);
  console.error("Run the extension (garmin-extension/README.md) and move the download here.");
  process.exit(1);
}

const file = resolve(RAW, candidates[candidates.length - 1]);
const rawText = readFileSync(file, "utf8");

// ---- committability: nothing secret-shaped may be in the file ---------------
// If Garmin's own JSON someday legitimately trips one of these, narrow the
// pattern with a comment — never delete it.

for (const re of [
  /set-cookie/i,
  /\bauthorization\b/i,
  /\bbearer\b/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /\bjwt\b/i,
  /document\.cookie/i,
  /localStorage/i,
]) {
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

if (bundle.format !== "garmin-export/1") {
  violations.push(`unknown format ${JSON.stringify(bundle.format)} (expected "garmin-export/1")`);
}
for (const key of ["capturedAt", "userId", "resources", "errors", "warnings", "summary", "discovery"]) {
  if (!(key in bundle)) violations.push(`missing top-level key "${key}"`);
}

const resources = Array.isArray(bundle.resources) ? bundle.resources : [];
const byKind = new Map();
let unparseablePayloads = 0;

for (const r of resources) {
  if (!KNOWN_KINDS.has(r.kind)) {
    violations.push(`unknown resource kind "${r.kind}" at ${r.url}`);
    continue;
  }
  byKind.set(r.kind, (byKind.get(r.kind) || 0) + 1);
  // Every payload must be JSON. A stored HTML login page is the JSON-world
  // equivalent of grint's full-page fallback — except here it's a violation,
  // because there is no legitimate non-JSON response from these endpoints.
  try {
    JSON.parse(r.payload?.json ?? "");
  } catch {
    unparseablePayloads++;
    violations.push(`payload is not JSON (login page or error body?) at ${r.url}`);
  }
}

// ---- recompute the summary and demand agreement ------------------------------

const recomputed = {
  scorecardDetails: byKind.get("scorecardDetail") || 0,
  holeShotResources: byKind.get("holeShots") || 0,
  clubs: byKind.get("clubs") || 0,
  playerStats: byKind.get("playerStats") || 0,
  shotStats: byKind.get("shotStats") || 0,
  errors: (bundle.errors || []).length,
};
for (const [k, v] of Object.entries(recomputed)) {
  if (bundle.summary?.[k] !== v) {
    violations.push(`summary.${k} = ${bundle.summary?.[k]} but bundle contains ${v}`);
  }
}

const scorecards = bundle.discovery?.scorecardIdsFound ?? 0;
if (scorecards === 0) violations.push("zero scorecards discovered — capture is not usable");

// ---- coverage: every detail should have its hole shots -----------------------

const detailIds = new Set(
  resources.filter((r) => r.kind === "scorecardDetail").map((r) => String(r.meta?.scorecardId)),
);
const shotIds = new Set(
  resources.filter((r) => r.kind === "holeShots").map((r) => String(r.meta?.scorecardId)),
);
const detailsWithoutShots = [...detailIds].filter((id) => !shotIds.has(id));
if (detailsWithoutShots.length) {
  notes.push(
    `${detailsWithoutShots.length} scorecard details have no hole-shots resource ` +
      `(ids: ${detailsWithoutShots.slice(0, 5).join(", ")}${detailsWithoutShots.length > 5 ? ", …" : ""}) — ` +
      `they will be refetched on the next incremental run`,
  );
}

// ---- soft findings -----------------------------------------------------------

const skippedScorecards = bundle.baseline?.skippedScorecards ?? 0;
if (bundle.baseline) {
  notes.push(
    `incremental capture against ${bundle.baseline.rawFile}: ` +
      `${bundle.baseline.knownScorecards} scorecards known, ${skippedScorecards} skipped — ` +
      `pnpm data:garmin merges it over the newest full bundle`,
  );
}
if (recomputed.scorecardDetails < scorecards - skippedScorecards) {
  notes.push(
    `${scorecards - skippedScorecards - recomputed.scorecardDetails} of ${scorecards - skippedScorecards} expected scorecards have no detail resource`,
  );
}
if (bundle.discovery?.holeShotPattern) {
  notes.push(`hole-shot pattern adopted: ${bundle.discovery.holeShotPattern}`);
}
if ((bundle.discovery?.summaryPages ?? 1) > 1) {
  notes.push("summary needed more than one page — discovery may be truncated (see warnings)");
}
if (!byKind.get("clubs")) {
  notes.push("no clubs resource captured — clubIds will not resolve to club names");
}
if ((byKind.get("shotStats") || 0) < EXPECTED_SHOT_STATS_VIEWS) {
  notes.push(`only ${byKind.get("shotStats") || 0}/${EXPECTED_SHOT_STATS_VIEWS} shot-stats views captured`);
}

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
console.log(`scorecards discovered ${scorecards}`);
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
