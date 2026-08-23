import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Bag, type BasisView, type CourseCheck } from "../bag";
import type { ShotDot } from "../bag-chart";
import { readBag } from "@/lib/bag-file";
import {
  buildGarminShots,
  courseClubDistances,
  shotRounds,
  type SourceGarminRounds,
} from "@/lib/garmin-shots";
import type { LedgerSession, LedgerShot } from "@/lib/ledger";
import {
  applyHeuristics,
  bagCoverage,
  buildBag,
  coverageGaps,
  detectGaps,
  medianRolloutYd,
  plotPoint,
  type DistanceBasis,
} from "@/lib/stats";

/* Server component. Everything numeric comes from lib/stats.ts, which is pure
 * and tested; nothing is computed in the markup below or in the client
 * component this hands off to.
 *
 * Both bases are built here, in full, and shipped together. The toggle picks
 * between two prepared answers rather than recomputing one — which keeps every
 * statistic on the server where it is tested, and makes switching basis a
 * render rather than a round trip. The cost is one extra bag and one extra dot
 * list in the payload, on a ledger of a few hundred shots.
 */

function load<T>(name: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), "data", name), "utf8")) as T;
}

/* The on-course check on the range numbers: per-club medians over clear full
 * swings from the AutoShot record. Absent (null) on a checkout that has not
 * run `pnpm data:garmin` — an absence, not a crash, same as every other
 * artifact this app reads. */
function loadCourse(): CourseCheck | null {
  try {
    const g = buildGarminShots(load<SourceGarminRounds>("garmin-rounds.json"));
    const bearing = shotRounds(g);
    if (bearing.length === 0) return null;
    return { rounds: bearing.length, clubs: courseClubDistances(bearing) };
  } catch {
    return null;
  }
}

export const metadata = {
  title: "Bag — Mackenzie",
  description: "A longitudinal shot ledger for Garmin Approach R50 range sessions.",
};

const BASES: DistanceBasis[] = ["carry", "total"];

export default function Home() {
  const shots = applyHeuristics(load<LedgerShot[]>("shots.json"));
  const sessions = load<LedgerSession[]>("sessions.json");
  /* The clubs owned, which is not the same set as the clubs measured — the
   * whole reason it is asserted by hand. Null when the file is absent, and
   * every consumer below falls back to what the ledger alone can say. */
  const bagSpec = readBag(join(process.cwd(), "data"));

  const views = Object.fromEntries(
    BASES.map((basis) => {
      const bag = buildBag(shots, undefined, basis);
      /* The dispersion layer: trusted shots only, and only the two coordinates
       * the plan view plots. `plotPoint` is the same reader the medians use, so
       * a shot this basis cannot place is a shot it also does not count. */
      const dots: ShotDot[] = shots
        .filter((s) => !s.isExcluded)
        .flatMap((s) => {
          const at = plotPoint(s, basis);
          return at ? [{ club: s.club, ...at }] : [];
        });
      return [
        basis,
        { bag, gaps: detectGaps(bag, undefined, bagSpec), dots } satisfies BasisView,
      ];
    }),
  ) as Record<DistanceBasis, BasisView>;

  return (
    <Bag
      views={views}
      sessionCount={sessions.length}
      shotCount={shots.length}
      excludedCount={shots.filter((s) => s.isExcluded).length}
      coverage={coverageGaps(shots)}
      rollout={[...medianRolloutYd(shots)]}
      clubs={bagSpec?.clubs ?? []}
      /* Coverage is basis-independent: whether a club was ever hit is not a
       * question about where the ball stopped. Built on carry, the basis every
       * shot has. */
      bagCoverage={bagCoverage(views.carry.bag, bagSpec)}
      course={loadCourse()}
    />
  );
}
