import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCourseHistory, type CourseHistory, type SourceCourses } from "@/lib/course-history";
import { buildGarminShots, type GarminShots, type SourceGarminRounds } from "@/lib/garmin-shots";
import type { CourseGeo } from "@/lib/hole-geometry";
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

/* The course drawings under the diary's traces — the map's own OSM-drawn
 * geometry (pnpm data:holes). A course the map has not drawn is simply absent,
 * and its holes fall back to the bare trace. */
export function loadCourseGeo(slug: string): CourseGeo | null {
  try {
    return JSON.parse(
      readFileSync(
        join(process.cwd(), "public", "data", "holes", `${slug}.geojson`),
        "utf8",
      ),
    ) as CourseGeo;
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
