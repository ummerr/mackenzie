/* The course side of the profile, in the shape this app needs it.
 *
 * Yardages knows what the swing does. Mackenzie knows where it was taken and
 * what it shot. Neither half is a golfer on its own: a range ledger is a bag
 * with no scores, and a scorecard history is scores with no cause. The profile
 * is the join, so this file is the seam.
 *
 * It is a SNAPSHOT, not a live read. `scripts/ingest-courses.ts` walks the
 * parent repo's `data/courses.json` and writes `data/course-history.json` here,
 * which is committed. The reason is the deploy: Yardages ships from its own
 * directory as its own Vercel project (README, "Deploy"), so `../data` does not
 * exist at build time on Vercel and a page that read it would render locally
 * and 500 in production. Same contract the rest of the repo already keeps —
 * generated files are committed, and a clean checkout builds with no work.
 *
 * Nothing here recomputes what the parent already decided. In particular the
 * nine-hole flags are the parent's: The Grint averages 9- and 18-hole rounds
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
  /** When the parent repo captured the Grint paste this is derived from. */
  capturedAt: string;
  /** What it was derived from, for the same reason every fact carries a source. */
  source: string;
  facilities: number;
  layouts: number;
  countries: string[];
  usStates: string[];
  played: PlayedLayout[];
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
