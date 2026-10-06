import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBenchmarks, type BenchmarkFile } from "@/lib/benchmarks";
import { parseCalifornia100, type California100File } from "@/lib/california100";
import {
  buildCourseHistory,
  type CourseHistory,
  type SourceCourses,
  type SourceFacility,
} from "@/lib/course-history";
import { buildGarminShots, type GarminShots, type SourceGarminRounds } from "@/lib/garmin-shots";
import { parseGoalsFile, type GoalsFile } from "@/lib/goals";
import {
  buildRoundHistory,
  type PlayedRound,
  type RoundHistory,
  type SourceRounds,
} from "@/lib/round-history";

/* Every page reads the same committed artifacts the same way, so the readers
 * live here once. Two contracts:
 *
 * - `loadJson` throws: the R50 ledger (shots, sessions) is the one artifact a
 *   checkout is expected to have, and a missing ledger is a broken checkout.
 * - Everything else returns null: each is a pipeline artifact a fresh checkout
 *   may not have built yet, and its absence is a state the page renders, not a
 *   crash. No source is more entitled to exist than another.
 */

export function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), "data", name), "utf8")) as T;
}

export function loadRounds(): RoundHistory | null {
  try {
    return buildRoundHistory(loadJson<SourceRounds>("rounds.json"));
  } catch {
    return null;
  }
}

export function loadGarmin(): GarminShots | null {
  try {
    return buildGarminShots(loadJson<SourceGarminRounds>("garmin-rounds.json"));
  } catch {
    return null;
  }
}

/** The one asserted-intent file — the week's goals, hand-committed after the
 *  engine proposes them (`pnpm goals:propose`). Absent or unreadable is a
 *  state the pages render, not a crash. */
export function loadGoals(): GoalsFile | null {
  try {
    return parseGoalsFile(loadJson<unknown>("goals.json"));
  } catch {
    return null;
  }
}

export function loadHistory(): CourseHistory | null {
  try {
    const raw = readFileSync(
      join(process.cwd(), "public", "data", "courses.json"),
      "utf8",
    );
    return buildCourseHistory(JSON.parse(raw) as SourceCourses);
  } catch {
    return null;
  }
}

/* The one place the two round ledgers meet. Only links a human moved to
 * "confirmed" are read — a proposed link is a guess, and a guessed join is
 * invented data. Each record hears what the other cannot: the watch the
 * swings, the card the putts. */
interface RoundLink {
  scorecardId: string;
  roundId: string | null;
  status: string;
}

/** The confirmed links themselves — the join, before either side is read. */
export function loadLinks(): { scorecardId: string; roundId: string }[] {
  try {
    return loadJson<{ links: RoundLink[] }>("round-links.json")
      .links.filter((l) => l.status === "confirmed" && l.roundId !== null)
      .map((l) => ({ scorecardId: l.scorecardId, roundId: l.roundId as string }));
  } catch {
    return [];
  }
}

/** The sourced external benchmarks — hand-curated, validated, and absent
 *  on a checkout that never had them: the plan then prices nothing. */
export function loadBenchmarks(): BenchmarkFile | null {
  try {
    return parseBenchmarks(loadJson<unknown>("benchmarks.json"));
  } catch {
    return null;
  }
}

export function loadLinkedGrint(): Map<string, PlayedRound> {
  const out = new Map<string, PlayedRound>();
  try {
    const links = loadJson<{ links: RoundLink[] }>("round-links.json").links.filter(
      (l) => l.status === "confirmed" && l.roundId !== null,
    );
    if (links.length === 0) return out;
    const history = buildRoundHistory(loadJson<SourceRounds>("rounds.json"));
    const byId = new Map(history.rounds.map((r) => [r.roundId, r]));
    for (const l of links) {
      const r = byId.get(l.roundId as string);
      if (r) out.set(l.scorecardId, r);
    }
  } catch {
    // Either file may be absent on a checkout that has not run the pipeline;
    // the join is then simply empty.
  }
  return out;
}

/** The California Public 100 — the to-play list, hand-curated and validated.
 *  Absent on a checkout that never had it: the page then renders the absence. */
export function loadCalifornia100(): California100File | null {
  try {
    return parseCalifornia100(loadJson<unknown>("california-100.json"));
  } catch {
    return null;
  }
}

/** The pipeline artifact's facilities by slug, unplayed ones included.
 *  `loadHistory` reshapes the same file for the profile and drops what was
 *  never played — the one thing a to-play list cannot do without. */
export function loadFacilityIndex(): { capturedAt: string; bySlug: Map<string, SourceFacility> } | null {
  try {
    const raw = readFileSync(join(process.cwd(), "public", "data", "courses.json"), "utf8");
    const src = JSON.parse(raw) as SourceCourses;
    return { capturedAt: src.capturedAt, bySlug: new Map(src.facilities.map((f) => [f.slug, f])) };
  } catch {
    return null;
  }
}
