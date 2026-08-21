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

/* ------------------------------------------------------------------------- *
 * Recent form. Every window below anchors to the newest round in the record,
 * never the wall clock — the same rule lib/yardages/recency-weighting.ts
 * documents: byte-identical inputs must produce byte-identical output, or
 * `pnpm profile --check` fails on a Tuesday and every test decays under
 * itself.
 * ------------------------------------------------------------------------- */

/** The date of the newest dated round — the record's "as of". */
export function asOf(rounds: PlayedRound[]): string | null {
  let max: string | null = null;
  for (const r of rounds) {
    if (max === null || r.date > max) max = r.date;
  }
  return max;
}

function daysInMonth(year: number, month1: number): number {
  if (month1 === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month1 - 1];
}

/** `date` minus `months` calendar months, day clamped to the target month's
 *  last day ("2026-03-31" − 1 → "2026-02-28", leap-aware). Pure string and
 *  integer arithmetic — a Date here would overflow Feb 31 into Mar 3 and
 *  drag the wall clock's timezone in with it. */
export function monthsBefore(date: string, months: number): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const total = year * 12 + (month - 1) - months;
  const ty = Math.floor(total / 12);
  const tm = total - ty * 12 + 1;
  const td = Math.min(day, daysInMonth(ty, tm));
  return `${String(ty).padStart(4, "0")}-${String(tm).padStart(2, "0")}-${String(td).padStart(2, "0")}`;
}

/** One entry per real round: a `total-only` entry is dropped when a `full`
 *  entry shares its date, course, and strokes — Grint's quick-entry echo of
 *  the same card. Everything else survives: two full cards on one date at one
 *  course is a 36-hole day, and a total-only card with different strokes is a
 *  second round, not a duplicate. This is a windowing rule, not a correction —
 *  `RoundHistory.rounds` itself is never touched. */
export function distinctRounds(rounds: PlayedRound[]): PlayedRound[] {
  const fullKeys = new Set(
    rounds
      .filter((r) => r.entry === "full")
      .map((r) => `${r.date}|${r.courseName}|${r.strokes}`),
  );
  return rounds.filter(
    (r) => r.entry !== "total-only" || !fullKeys.has(`${r.date}|${r.courseName}|${r.strokes}`),
  );
}

/** The last `n` of `distinctRounds(rounds)`, ascending by date. */
export function lastNDistinct(rounds: PlayedRound[], n: number): PlayedRound[] {
  return [...distinctRounds(rounds)].sort((a, b) => a.date.localeCompare(b.date)).slice(-n);
}

/** Distinct rounds dated on or after `monthsBefore(asOfDate, months)`. */
export function since(rounds: PlayedRound[], months: number, asOfDate: string): PlayedRound[] {
  const cutoff = monthsBefore(asOfDate, months);
  return distinctRounds(rounds).filter((r) => r.date >= cutoff);
}

/** A stat with both of its answers: what the recent window says and what the
 *  whole record says, each with the n behind it. Publishing only one would
 *  hide that recency moved it — the club-profile module's rule, kept here. */
export interface StatPair {
  recent: number | null;
  career: number | null;
  /** Rounds behind the number — or holes, for the per-hole shares. */
  recentN: number;
  careerN: number;
}

export interface RecentForm {
  /** The newest round's date — every window is measured from here. */
  asOf: string;
  /** `monthsBefore(asOf, months)`. */
  cutoff: string;
  months: number;
  /** Distinct 18-hole scored rounds in the window, ascending by date. */
  recentRounds: PlayedRound[];
  /** Mean 18-hole strokes. */
  scoring: StatPair;
  /** Putts per round, over rounds that recorded them. */
  putts: StatPair;
  /** Three-putt holes as a share of holes putted; n is holes. */
  threePutt: StatPair;
  /** Fairways hit as a share of classified holes; n is classified holes. */
  fairwayHit: StatPair;
}

/** Recent window vs the whole record, side by side. Career means the WHOLE
 *  record, recent included — that dilutes the deltas, which biases toward
 *  "no finding", the conservative direction; the evidence strings print both
 *  numbers and both n's so nothing is hidden. */
export function recentVsCareer(h: RoundHistory, months: number): RecentForm | null {
  const anchor = asOf(h.rounds);
  if (anchor === null) return null;
  const cutoff = monthsBefore(anchor, months);

  const career = [...distinctRounds(h.rounds)].sort((a, b) => a.date.localeCompare(b.date));
  const recent = career.filter((r) => r.date >= cutoff);
  const career18 = career.filter((r) => r.holes === 18 && r.strokes !== null);
  const recent18 = recent.filter((r) => r.holes === 18 && r.strokes !== null);

  const pair = (
    rec: number | null,
    car: number | null,
    recentN: number,
    careerN: number,
  ): StatPair => ({ recent: rec, career: car, recentN, careerN });

  const withPutts = (rs: PlayedRound[]) => rs.filter((r) => r.putts !== null);
  const tpRecent = threePuttShare(recent);
  const tpCareer = threePuttShare(career);
  const fwRecent = fairwaySplit(recent);
  const fwCareer = fairwaySplit(career);

  return {
    asOf: anchor,
    cutoff,
    months,
    recentRounds: recent18,
    scoring: pair(
      mean(recent18.map((r) => r.strokes as number)),
      mean(career18.map((r) => r.strokes as number)),
      recent18.length,
      career18.length,
    ),
    putts: pair(
      puttsPerRound(recent18),
      puttsPerRound(career18),
      withPutts(recent18).length,
      withPutts(career18).length,
    ),
    threePutt: pair(
      tpRecent.holes > 0 ? tpRecent.threePutts / tpRecent.holes : null,
      tpCareer.holes > 0 ? tpCareer.threePutts / tpCareer.holes : null,
      tpRecent.holes,
      tpCareer.holes,
    ),
    fairwayHit: pair(
      fwRecent.classified > 0 ? fwRecent.hit / fwRecent.classified : null,
      fwCareer.classified > 0 ? fwCareer.hit / fwCareer.classified : null,
      fwRecent.classified,
      fwCareer.classified,
    ),
  };
}

/**
 * The tail of the handicap chart: mean differential over the last `window`
 * points, and where the trending line stood at the tail's start and end.
 * Sliced by POSITION only — the chart is its own provenance and is never
 * joined to rounds by date (a guessed join is invented data), so this tail
 * knowingly carries whatever duplicates the chart itself carries.
 */
export function differentialTail(
  h: RoundHistory,
  window: number,
): {
  mean: number;
  trendingStart: number | null;
  trendingEnd: number | null;
  points: number;
} | null {
  const pts = h.differentials;
  if (pts.length < window) return null;
  const tail = pts.slice(-window);
  return {
    mean: mean(tail.map((p) => p.differential)) as number,
    trendingStart: tail[0]?.trendingHdcp ?? null,
    trendingEnd: tail[tail.length - 1]?.trendingHdcp ?? null,
    points: tail.length,
  };
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
