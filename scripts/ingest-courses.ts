/* ../data/courses.json  ->  data/course-history.json
 *
 *   pnpm ingest:courses            snapshot the parent repo's course history
 *   pnpm ingest:courses --dry-run  report what would change, write nothing
 *
 * The one place this app reaches outside its own directory, and it reaches
 * exactly once, at author time. See lib/course-history.ts for why a snapshot
 * rather than a live read — short version: Yardages deploys from `yardages/`
 * and `../data` is not there when it does.
 *
 * Nothing is recomputed. Fields are copied, renamed, and dropped; the parent's
 * nine-hole flags come across as they are. If a number here disagrees with the
 * map, the map is right and this file is stale — re-run it.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CourseHistory, PlayedLayout } from "../lib/course-history";
import { meanScore, scorable, totalRounds } from "../lib/course-history";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "..", "data", "courses.json");
const OUT = join(ROOT, "data", "course-history.json");

const dryRun = process.argv.includes("--dry-run");

/* The parent's shape, narrowed to what is read here. Deliberately not imported
 * from the map — it has no TypeScript to import, and a structural type written
 * out is a record of the contract this snapshot depends on. */
interface SourceFacility {
  name: string;
  slug: string;
  region: string | null;
  country: string;
  played: boolean;
  facts?: {
    architect?: { value: string };
    access?: { value: string };
  };
  layouts: {
    grintLayoutName: string | null;
    timesPlayed: number;
    avgScore: number | null;
    personalRank: number | null;
    played: boolean;
    flags: string[];
    ratings: {
      overall: number | null;
      fun: number | null;
      condition: number | null;
    };
  }[];
}

interface SourceCourses {
  capturedAt: string;
  generatedFrom: string;
  stats: { facilities: number; layouts: number; countries: string[]; usStates: string[] };
  facilities: SourceFacility[];
}

/** Any flag that makes this layout's average incomparable to an 18-hole one. */
const SHORT_ROUND_FLAGS = ["nine_hole_suspected", "mixed_round_lengths_suspected"];

function main(): number {
  let raw: string;
  try {
    raw = readFileSync(SOURCE, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(
        `no ../data/courses.json.\n` +
          `This script only runs inside the mackenzie repo, where the map's\n` +
          `pipeline writes it — run \`npm run build\` at the repo root first.`,
      );
      return 1;
    }
    throw e;
  }

  const src = JSON.parse(raw) as SourceCourses;

  const played: PlayedLayout[] = [];
  for (const f of src.facilities) {
    if (!f.played) continue;
    for (const l of f.layouts) {
      if (!l.played) continue;
      played.push({
        facility: f.name,
        facilitySlug: f.slug,
        layout: l.grintLayoutName,
        region: f.region,
        country: f.country,
        timesPlayed: l.timesPlayed,
        avgScore: l.avgScore,
        shortRounds: l.flags.some((flag) => SHORT_ROUND_FLAGS.includes(flag)),
        personalRank: l.personalRank,
        ratingOverall: l.ratings.overall,
        ratingFun: l.ratings.fun,
        ratingCondition: l.ratings.condition,
        architect: f.facts?.architect?.value ?? null,
        access: f.facts?.access?.value ?? null,
      });
    }
  }

  // Bag order for courses: favourite first, and never file order, so a diff of
  // this file is a diff of the history rather than of the parent's iteration.
  played.sort(
    (a, b) =>
      (a.personalRank ?? Infinity) - (b.personalRank ?? Infinity) ||
      a.facilitySlug.localeCompare(b.facilitySlug) ||
      (a.layout ?? "").localeCompare(b.layout ?? ""),
  );

  const history: CourseHistory = {
    capturedAt: src.capturedAt,
    source: `../data/courses.json (${src.generatedFrom})`,
    facilities: src.stats.facilities,
    layouts: src.stats.layouts,
    countries: src.stats.countries,
    usStates: src.stats.usStates,
    played,
  };

  const scored = scorable(history);
  const mean = meanScore(scored);
  console.log(
    `${played.length} played layouts · ${totalRounds(history)} rounds · ` +
      `${history.facilities} facilities · ${history.usStates.length} US states`,
  );
  console.log(
    `${scored.length} layouts scored over 18 holes, mean ${mean?.toFixed(1) ?? "—"} · ` +
      `${played.length - scored.length} held out (short or unscored rounds)`,
  );

  const next = JSON.stringify(history, null, 2) + "\n";
  let prev = "";
  try {
    prev = readFileSync(OUT, "utf8");
  } catch {
    /* first run */
  }

  if (prev === next) {
    console.log("data/course-history.json unchanged");
    return 0;
  }
  if (dryRun) {
    console.log(`--dry-run: data/course-history.json would change (${prev ? "update" : "create"})`);
    return 0;
  }

  writeFileSync(OUT, next);
  console.log(`wrote data/course-history.json`);
  return 0;
}

process.exit(main());
