/* ../data/rounds.json  ->  data/round-history.json
 *
 *   pnpm ingest:rounds            snapshot the parent repo's round history
 *   pnpm ingest:rounds --dry-run  report what would change, write nothing
 *
 * Same seam, same reason as ingest-courses.ts: Yardages deploys from its own
 * directory, `../data` does not exist at build time, so the parent's file is
 * copied here in the shape lib/round-history.ts declares, and committed.
 *
 * Nothing is recomputed. Strings become numbers, blanks become nulls, and
 * Grint's "0" on the unplayed nine of a nine-hole card becomes null too —
 * that is the parent's own reading of the form (parse-grint-export.mjs), and
 * a zero-putt hole that was never played must not count as a hole.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PlayedRound, RoundHistory } from "../lib/round-history";
import { eighteenHole, puttsPerRound } from "../lib/round-history";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "..", "data", "rounds.json");
const OUT = join(ROOT, "data", "round-history.json");

const dryRun = process.argv.includes("--dry-run");

/* The parent's shape, narrowed to what is read here — a structural record of
 * the contract, same as ingest-courses.ts. */
interface SourceRound {
  roundId: string;
  entry: "full" | "total-only";
  date: string | null;
  courseName: string | null;
  teeName: string | null;
  holesRecorded: number;
  totals: { strokes: number | null; putts: number | null };
  perHole: {
    strokes: (string | null)[];
    putts: (string | null)[];
    fairways: (string | null)[];
  } | null;
  flags: string[];
}

interface SourceRounds {
  capturedAt: string;
  rawFile: string;
  handicapIndex: number | null;
  rounds: SourceRound[];
  differentials: {
    seq: number;
    courseName: string | null;
    differential: number;
    countsTowardHdcp: boolean | null;
    trendingHdcp: number | null;
  }[];
  series?: {
    girPerRound: { courseName: string | null; value: number }[];
    parSavesPct: { courseName: string | null; value: number }[];
  };
}

/** "" and "0"-on-an-unplayed-hole become null; everything else a number. */
function holeNumbers(vals: (string | null)[] | undefined): (number | null)[] | null {
  if (!vals) return null;
  return vals.map((v) => (v === null || v === "" || v === "0" ? null : Number(v)));
}

function main(): number {
  let raw: string;
  try {
    raw = readFileSync(SOURCE, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(
        `no ../data/rounds.json.\n` +
          `This script only runs inside the mackenzie repo — run \`npm run rounds\`\n` +
          `at the repo root first (needs a grint-export bundle in data/raw/).`,
      );
      return 1;
    }
    throw e;
  }

  const src = JSON.parse(raw) as SourceRounds;

  const rounds: PlayedRound[] = src.rounds
    .filter((r) => r.date !== null)
    .map((r) => ({
      roundId: r.roundId,
      date: r.date as string,
      courseName: r.courseName,
      teeName: r.teeName,
      entry: r.entry,
      holes: r.holesRecorded,
      strokes: r.totals.strokes,
      putts: r.totals.putts,
      holeStrokes: holeNumbers(r.perHole?.strokes),
      holePutts: holeNumbers(r.perHole?.putts),
      fairwayCodes: holeNumbers(r.perHole?.fairways),
    }));

  const history: RoundHistory = {
    capturedAt: src.capturedAt,
    source: `../data/rounds.json (${src.rawFile})`,
    handicapIndex: src.handicapIndex,
    rounds,
    differentials: src.differentials,
    ...(src.series ? { series: src.series } : {}),
  };

  const scored = eighteenHole(history);
  console.log(
    `${rounds.length} rounds, ${rounds[0]?.date} to ${rounds[rounds.length - 1]?.date} · ` +
      `${scored.length} over 18 holes · handicap index ${src.handicapIndex ?? "—"}`,
  );
  console.log(
    `putts per 18-hole round ${puttsPerRound(scored)?.toFixed(1) ?? "—"} · ` +
      `${history.differentials.length} differentials`,
  );
  if (src.rounds.length !== rounds.length) {
    console.log(`${src.rounds.length - rounds.length} undated round(s) dropped`);
  }

  const next = JSON.stringify(history, null, 2) + "\n";
  let prev = "";
  try {
    prev = readFileSync(OUT, "utf8");
  } catch {
    /* first run */
  }

  if (prev === next) {
    console.log("data/round-history.json unchanged");
    return 0;
  }
  if (dryRun) {
    console.log(`--dry-run: data/round-history.json would change (${prev ? "update" : "create"})`);
    return 0;
  }

  writeFileSync(OUT, next);
  console.log(`wrote data/round-history.json`);
  return 0;
}

process.exit(main());
