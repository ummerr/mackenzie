/* The course side of the profile, in the shape this app needs it.
 *
 * The range ledger knows what the swing does. The map knows where it was taken
 * and what it shot. Neither half is a golfer on its own: a range ledger is a
 * bag with no scores, and a scorecard history is scores with no cause. The
 * profile is the join, so this file is the seam.
 *
 * `buildCourseHistory` reads the map pipeline's own artifact —
 * `public/data/courses.json`, the same file the /courses map fetches — and
 * reshapes it. It used to be a committed snapshot (data/course-history.json,
 * written by an ingest script) because the app deployed from its own
 * subdirectory and the pipeline's output was outside the deploy root; since
 * the two sites merged into one project, the artifact is in the deploy root
 * and the reshape happens at build time instead.
 *
 * Nothing here recomputes what the pipeline already decided. In particular the
 * nine-hole flags are the pipeline's: The Grint averages 9- and 18-hole rounds
 * into one number per layout, so a 40 and a 90 sit in the same column and any
 * mean over both is meaningless. `courses.json` marks them, this carries the
 * mark forward, and `profile.ts` splits on it rather than re-deriving it.
 */

export interface PlayedLayout {
  facility: string;
  facilitySlug: string;
  /** Null when the facility has exactly one unnamed layout. */
  layout: string | null;
  region: string | null;
  country: string;
  timesPlayed: number;
  /** The Grint's average, over rounds of whatever length. Null if never scored. */
  avgScore: number | null;
  /** True when the parent flagged this layout's scores as 9-hole or mixed. */
  shortRounds: boolean;
  /** Personal ordering, 1 = favourite. */
  personalRank: number | null;
  ratingOverall: number | null;
  ratingFun: number | null;
  ratingCondition: number | null;
  architect: string | null;
  access: string | null;
}

export interface CourseHistory {
  /** When the Grint paste this is derived from was captured. */
  capturedAt: string;
  /** What it was derived from, for the same reason every fact carries a source. */
  source: string;
  facilities: number;
  layouts: number;
  countries: string[];
  usStates: string[];
  played: PlayedLayout[];
}

/* The pipeline artifact's shape, narrowed to what is read here. Deliberately
 * not imported from the map — it has no TypeScript to import, and a structural
 * type written out is a record of the contract this reshape depends on. */
export interface SourceFacility {
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

export interface SourceCourses {
  capturedAt: string;
  generatedFrom: string;
  stats: { facilities: number; layouts: number; countries: string[]; usStates: string[] };
  facilities: SourceFacility[];
}

/** Any flag that makes this layout's average incomparable to an 18-hole one. */
const SHORT_ROUND_FLAGS = ["nine_hole_suspected", "mixed_round_lengths_suspected"];

/** Reshape the map pipeline's courses.json. Nothing is recomputed — fields are
 *  copied, renamed, and dropped; the pipeline's nine-hole flags come across as
 *  they are. */
export function buildCourseHistory(src: SourceCourses): CourseHistory {
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

  // Bag order for courses: favourite first, and never file order, so any diff
  // of this history is a diff of the record rather than of iteration order.
  played.sort(
    (a, b) =>
      (a.personalRank ?? Infinity) - (b.personalRank ?? Infinity) ||
      a.facilitySlug.localeCompare(b.facilitySlug) ||
      (a.layout ?? "").localeCompare(b.layout ?? ""),
  );

  return {
    capturedAt: src.capturedAt,
    source: `public/data/courses.json (${src.generatedFrom})`,
    facilities: src.stats.facilities,
    layouts: src.stats.layouts,
    countries: src.stats.countries,
    usStates: src.stats.usStates,
    played,
  };
}

/** Rounds, not layouts: a course played nine times is nine rounds of evidence. */
export function totalRounds(h: CourseHistory): number {
  return h.played.reduce((n, l) => n + l.timesPlayed, 0);
}

/** The layouts whose scores are comparable to each other — 18 holes, scored. */
export function scorable(h: CourseHistory): PlayedLayout[] {
  return h.played.filter((l) => l.avgScore !== null && !l.shortRounds);
}

/** Rounds-weighted, because a course played nine times says nine times as much
 *  about the player as one played once. */
export function meanScore(layouts: PlayedLayout[]): number | null {
  const rounds = layouts.reduce((n, l) => n + l.timesPlayed, 0);
  if (rounds === 0) return null;
  const total = layouts.reduce((n, l) => n + (l.avgScore as number) * l.timesPlayed, 0);
  return total / rounds;
}
