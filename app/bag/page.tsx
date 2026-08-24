import { Bag, type BasisView, type CourseMedians } from "../bag";
import type { ShotDot } from "../bag-chart";
import { buildWedgeMatrix } from "@/lib/wedge-matrix";
import { courseClubDistances, shotRounds, type GarminShots } from "@/lib/garmin-shots";
import { buildSiteData } from "@/lib/site-data";
import { buildSources } from "@/lib/sources";
import { Provenance } from "../provenance";
import {
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

/* The on-course medians beside the range's: per-club medians over clear full
 * swings from the AutoShot record. Absent (null) on a checkout that has not
 * run `pnpm data:garmin` — an absence, not a crash, same as every other
 * artifact this app reads. */
function courseMedians(g: GarminShots | null): CourseMedians | null {
  if (g === null) return null;
  const bearing = shotRounds(g);
  if (bearing.length === 0) return null;
  return { rounds: bearing.length, clubs: courseClubDistances(bearing) };
}

export const metadata = {
  title: "Bag — Mackenzie",
  description: "A longitudinal shot ledger for Garmin Approach R50 range sessions.",
};

const BASES: DistanceBasis[] = ["carry", "total"];

export default function Home() {
  const { blocks, shots, sessions, bag: bagSpec, garminShots } = buildSiteData();

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
    <>
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
      course={courseMedians(garminShots)}
      /* Carry basis, always: a partial is measured where it lands, and the
       * R50 never modelled the roll of a half wedge. */
      wedgeMatrix={buildWedgeMatrix(shots, blocks, views.carry.bag)}
    />
    {/* Same container geometry as Bag's own root, so the block lines up. */}
    <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-5">
      <Provenance
        sources={buildSources({ shots, sessions, garminShots }).filter(
          (s) => s.id === "range" || s.id === "watch",
        )}
      />
    </div>
    </>
  );
}
