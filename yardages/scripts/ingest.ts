/* data/raw/*.csv  ->  data/shots.json + data/sessions.json
 *
 *   pnpm ingest              parse everything, write the ledger
 *   pnpm ingest --dry-run    parse and report, write nothing
 *
 * Same shape as the pipeline scripts in the parent repo: reads a verbatim
 * source directory, writes generated JSON, prints coverage, exits non-zero on
 * error. data/raw is never edited — a correction goes in data/exclusions.json.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLedger, clubCounts, type Overrides, type SourceFile } from "../lib/ledger";
import { ParseError, parseRangeCsv } from "../lib/parse";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW_DIR = join(ROOT, "data", "raw");
const OVERRIDES_PATH = join(ROOT, "data", "exclusions.json");

const dryRun = process.argv.includes("--dry-run");

function loadOverrides(): Overrides {
  try {
    const parsed = JSON.parse(readFileSync(OVERRIDES_PATH, "utf8")) as {
      overrides?: Overrides;
    };
    return parsed.overrides ?? {};
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error(`data/exclusions.json is not valid JSON: ${(e as Error).message}`);
  }
}

function main(): number {
  const filenames = readdirSync(RAW_DIR)
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .sort();

  if (filenames.length === 0) {
    console.error(`no CSVs in data/raw. Drop a Garmin range export there first.`);
    return 1;
  }

  const files: SourceFile[] = [];
  const failures: { filename: string; message: string }[] = [];

  for (const filename of filenames) {
    const bytes = readFileSync(join(RAW_DIR, filename));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    try {
      files.push({ filename, sha256, parsed: parseRangeCsv(bytes.toString("utf8")) });
    } catch (e) {
      // One bad file must not stop the other twenty from importing, but it
      // does make the run fail — a silently skipped session is a hole in the
      // ledger that nothing downstream would ever notice.
      failures.push({
        filename,
        message: e instanceof ParseError ? e.message : (e as Error).message,
      });
    }
  }

  const ledger = buildLedger(files, loadOverrides());

  // ── report ────────────────────────────────────────────────────────────────
  const excluded = ledger.shots.filter((s) => s.isExcluded).length;
  console.log(
    `\n${files.length} file(s) → ${ledger.sessions.length} session(s), ` +
      `${ledger.shots.length} shot(s), ${excluded} excluded` +
      (ledger.duplicatesSkipped > 0 ? `, ${ledger.duplicatesSkipped} duplicate(s) skipped` : ""),
  );

  console.log("\n  club          n   active   median carry");
  console.log("  " + "─".repeat(42));
  for (const { club, n, active } of clubCounts(ledger)) {
    const carries = ledger.shots
      .filter((s) => s.club === club && !s.isExcluded && s.carryYd !== null)
      .map((s) => s.carryYd as number)
      .sort((a, b) => a - b);
    const median = carries.length === 0 ? null : carries[Math.floor(carries.length / 2)];
    // n < 15 is suppressed in the bag chart; say so here rather than let a
    // number that will not render look like one that will.
    const flag = active < 15 ? "  (under 15 — suppressed)" : "";
    console.log(
      `  ${club.padEnd(12)} ${String(n).padStart(2)}   ${String(active).padStart(6)}   ` +
        `${median === null ? "     —" : median.toFixed(1).padStart(6)}${flag}`,
    );
  }

  for (const w of ledger.warnings) console.log(`\n  ! ${w}`);
  for (const f of failures) console.error(`\n  ✗ ${f.filename}: ${f.message}`);

  if (dryRun) {
    console.log(`\ndry run — nothing written\n`);
    return failures.length > 0 ? 1 : 0;
  }

  writeFileSync(
    join(ROOT, "data", "sessions.json"),
    JSON.stringify(ledger.sessions, null, 2) + "\n",
  );
  writeFileSync(join(ROOT, "data", "shots.json"), JSON.stringify(ledger.shots, null, 2) + "\n");
  console.log(`\nwrote data/sessions.json and data/shots.json\n`);

  return failures.length > 0 ? 1 : 0;
}

process.exit(main());
