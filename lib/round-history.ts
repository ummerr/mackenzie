/* The round-by-round side of the profile, in the shape this app needs it.
 *
 * The course history carries an average per layout; this carries the rounds
 * themselves — dates, strokes, putts, fairway codes — which is the difference
 * between "the record averages 88" and "the golf is getting better". Same
 * seam, same rules as lib/course-history.ts: `buildRoundHistory` reshapes the
 * pipeline's `data/rounds.json` (itself parsed from the Grint export bundle)
 * at build time. It used to be a committed snapshot for the same
 * separate-deploy reason, retired when the two sites merged.
 *
 * Nothing here recomputes what the pipeline decided. Fairway codes are Grint's
 * own: the scorecard form's hidden inputs declare 1 = left, 2 = right,
 * 3 = hit, 4 = missed, and codes outside that map (7, 8 appear) are carried
 * but never guessed at — they count as "unclassified", not as misses.
 *
 * The differentials are a separate array on purpose. They come from the
 * handicap chart in chart order, which is not one-to-one with the scorecards
 * (combined scores appear once, short rounds not at all), and joining them to
 * rounds by position would be invented data. Two arrays, two provenances.
 */

export interface PlayedRound {
  roundId: string;
  /** YYYY-MM-DD. */
  date: string;
  /** The Grint display string, verbatim. */
  courseName: string | null;
  teeName: string | null;
  /** "full" is a hole-by-hole card; "total-only" is a quick-entry total. */
  entry: "full" | "total-only";
  /** Holes actually played — 18, 9, or 0 when the entry has no hole data. */
  holes: number;
  strokes: number | null;
  putts: number | null;
  /** 18 slots on full entries; null per hole where nothing was recorded. */
  holeStrokes: (number | null)[] | null;
  holePutts: (number | null)[] | null;
  fairwayCodes: (number | null)[] | null;
}

export interface DifferentialPoint {
  /** Chart order, 1-based — chronological, but NOT a round index. */
  seq: number;
  courseName: string | null;
  differential: number;
  countsTowardHdcp: boolean | null;
  trendingHdcp: number | null;
}

export interface TrendPoint {
  courseName: string | null;
  value: number;
}

export interface RoundHistory {
  capturedAt: string;
  source: string;
  handicapIndex: number | null;
  /** Ascending by date. */
  rounds: PlayedRound[];
  differentials: DifferentialPoint[];
  /** Per-round series from Grint's own charts, in chart order — same
   *  provenance rule as the differentials: never joined to rounds.
   *  Absent on snapshots taken before 2026-08-16. */
  series?: {
    girPerRound: TrendPoint[];
    parSavesPct: TrendPoint[];
  };
}

/* The pipeline artifact's shape, narrowed to what is read here — a structural
 * record of the contract, same as lib/course-history.ts. */
export interface SourceRound {
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

export interface SourceRounds {
  capturedAt: string;
  rawFile: string;
  handicapIndex: number | null;
  rounds: SourceRound[];
  differentials: DifferentialPoint[];
  series?: {
    girPerRound: TrendPoint[];
    parSavesPct: TrendPoint[];
  };
}

/** "" and "0"-on-an-unplayed-hole become null; everything else a number. */
function holeNumbers(vals: (string | null)[] | undefined): (number | null)[] | null {
  if (!vals) return null;
  return vals.map((v) => (v === null || v === "" || v === "0" ? null : Number(v)));
}

/** Reshape the pipeline's rounds.json. Nothing is recomputed. Strings become
 *  numbers, blanks become nulls, and Grint's "0" on the unplayed nine of a
 *  nine-hole card becomes null too — that is the pipeline's own reading of the
 *  form (parse-grint-export.mjs), and a zero-putt hole that was never played
 *  must not count as a hole. Undated rounds are dropped. */
export function buildRoundHistory(src: SourceRounds): RoundHistory {
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

  return {
    capturedAt: src.capturedAt,
    source: `data/rounds.json (${src.rawFile})`,
    handicapIndex: src.handicapIndex,
    rounds,
    differentials: src.differentials,
    ...(src.series ? { series: src.series } : {}),
  };
}

/** Grint's fairway codes, as declared by its own form (lval/rval/hval/mval). */
export const FAIRWAY_CODE = { left: 1, right: 2, hit: 3, missed: 4 } as const;

/** The rounds whose totals are comparable to each other. */
export function eighteenHole(h: RoundHistory): PlayedRound[] {
  return h.rounds.filter((r) => r.holes === 18 && r.strokes !== null);
}

export function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Putts per 18-hole round, over the rounds that recorded them. */
export function puttsPerRound(rounds: PlayedRound[]): number | null {
  return mean(rounds.filter((r) => r.putts !== null).map((r) => r.putts as number));
}

/** Holes taking three or more putts, as a share of holes with putts recorded. */
export function threePuttShare(rounds: PlayedRound[]): {
  threePutts: number;
  holes: number;
} {
  let threePutts = 0;
  let holes = 0;
  for (const r of rounds) {
    for (const p of r.holePutts ?? []) {
      if (p === null || p === 0) continue;
      holes += 1;
      if (p >= 3) threePutts += 1;
    }
  }
  return { threePutts, holes };
}

/** Fairway results over every hole that recorded a classifiable code. */
export function fairwaySplit(rounds: PlayedRound[]): {
  hit: number;
  left: number;
  right: number;
  missed: number;
  classified: number;
  unclassified: number;
} {
  const out = { hit: 0, left: 0, right: 0, missed: 0, classified: 0, unclassified: 0 };
  for (const r of rounds) {
    for (const c of r.fairwayCodes ?? []) {
      if (c === null || c === 0) continue;
      if (c === FAIRWAY_CODE.hit) out.hit += 1;
      else if (c === FAIRWAY_CODE.left) out.left += 1;
      else if (c === FAIRWAY_CODE.right) out.right += 1;
      else if (c === FAIRWAY_CODE.missed) out.missed += 1;
      else {
        out.unclassified += 1;
        continue;
      }
      out.classified += 1;
    }
  }
  return out;
}

/** Mean 18-hole score by calendar year, ascending. */
export function yearlyMeans(
  rounds: PlayedRound[],
): { year: string; rounds: number; meanStrokes: number }[] {
  const byYear = new Map<string, number[]>();
  for (const r of rounds) {
    if (r.strokes === null) continue;
    const y = r.date.slice(0, 4);
    byYear.set(y, [...(byYear.get(y) ?? []), r.strokes]);
  }
  return [...byYear.entries()]
    .map(([year, xs]) => ({ year, rounds: xs.length, meanStrokes: mean(xs) as number }))
    .sort((a, b) => a.year.localeCompare(b.year));
}

/**
 * The handicap's own arc: mean differential over the first and last `window`
 * chart points, plus where the trending line started and ended. Differentials
 * already normalise for course difficulty — that is what they are for — so
 * this is the one comparison across five years that does not need par.
 */
export function differentialTrend(
  h: RoundHistory,
  window = 20,
): {
  firstMean: number;
  lastMean: number;
  firstTrending: number | null;
  lastTrending: number | null;
  points: number;
} | null {
  const pts = h.differentials;
  if (pts.length < window * 2) return null;
  const first = pts.slice(0, window).map((p) => p.differential);
  const last = pts.slice(-window).map((p) => p.differential);
  return {
    firstMean: mean(first) as number,
    lastMean: mean(last) as number,
    firstTrending: pts[0]?.trendingHdcp ?? null,
    lastTrending: pts[pts.length - 1]?.trendingHdcp ?? null,
    points: pts.length,
  };
}
