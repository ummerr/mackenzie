/* Pure statistics over the ledger. No I/O, no React, no chart library.
 *
 * Everything the bag chart draws is computed here and unit-tested against
 * distributions with known answers. Nothing analytical belongs in a component.
 *
 * Medians throughout, never means. A range session's carry distribution has a
 * long left tail — chunks and thins go short, nothing goes 40 yards long — so
 * the mean of a club sits below its typical shot and moves with how badly you
 * were striking it that day. The median doesn't.
 */

import type { LedgerShot } from "./ledger";

// ── primitives ──────────────────────────────────────────────────────────────

/** Linear-interpolated quantile. Input need not be sorted. */
export function quantile(values: number[], p: number): number {
  if (values.length === 0) throw new Error("quantile of empty set");
  if (p < 0 || p > 1) throw new Error(`quantile p out of range: ${p}`);
  const s = [...values].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
}

export const median = (values: number[]): number => quantile(values, 0.5);

/**
 * Median absolute deviation, scaled to be comparable with a standard
 * deviation on normal data (×1.4826). Used instead of SD because the thing
 * being detected — the mishit — is exactly the outlier that inflates SD and
 * then hides inside the widened threshold.
 */
export function mad(values: number[]): number {
  if (values.length === 0) throw new Error("mad of empty set");
  const m = median(values);
  return 1.4826 * median(values.map((v) => Math.abs(v - m)));
}

// ── bag order ───────────────────────────────────────────────────────────────

/* Loft order, longest first. Gap flags compare clubs that are adjacent *here*,
 * not adjacent by measured carry — the question is "what do I reach for next",
 * and a club that carries out of loft order is the finding, not the sort key. */
const BAG_ORDER = [
  "Driver",
  "3 Wood", "4 Wood", "5 Wood", "7 Wood",
  "2 Hybrid", "3 Hybrid", "4 Hybrid", "5 Hybrid", "6 Hybrid",
  "1 Iron", "2 Iron", "3 Iron", "4 Iron", "5 Iron", "6 Iron",
  "7 Iron", "8 Iron", "9 Iron",
  "Pitching Wedge", "Gap Wedge", "Sand Wedge", "Lob Wedge",
  "Putter",
];

const BAG_INDEX = new Map(BAG_ORDER.map((c, i) => [c, i]));

/** Unknown clubs sort to the end, in name order, rather than throwing. */
export function bagRank(club: string): number {
  return BAG_INDEX.get(club) ?? BAG_ORDER.length;
}

export function sortByBag<T extends { club: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => bagRank(a.club) - bagRank(b.club) || a.club.localeCompare(b.club),
  );
}

// ── exclusion heuristics ────────────────────────────────────────────────────

export interface HeuristicOptions {
  /** Shots at the start of each club's block in a session. */
  warmupShots: number;
  /** Smash factor this many MADs below the club median is a mishit. */
  smashMads: number;
  /** Carry below this fraction of the club median is a mishit. */
  carryFloorFraction: number;
}

export const DEFAULT_HEURISTICS: HeuristicOptions = {
  warmupShots: 3,
  smashMads: 2,
  carryFloorFraction: 0.6,
};

/**
 * Flag warmup and mishit shots. Never mutates, never deletes — returns copies
 * carrying `isExcluded` and a reason, so every exclusion is reversible and
 * attributable.
 *
 * Order matters and is deliberate: warmup is removed FIRST, and the club
 * medians that drive the mishit tests are computed from what survives. Warmup
 * shots are systematically worse, so leaving them in drags the median down,
 * which drags the 60%-of-median floor down with it, which lets genuinely bad
 * shots through the very filter meant to catch them.
 *
 * Shots already excluded upstream (phantoms, manual overrides) are left alone
 * and take no part in any median.
 */
export function applyHeuristics(
  shots: LedgerShot[],
  opts: HeuristicOptions = DEFAULT_HEURISTICS,
): LedgerShot[] {
  const out = shots.map((s) => ({ ...s }));

  // ── pass 1: warmup, per (session, club) block ─────────────────────────────
  const seen = new Map<string, number>();
  for (const s of [...out].sort(
    (a, b) => a.sessionId.localeCompare(b.sessionId) || a.shotIndex - b.shotIndex,
  )) {
    if (s.isExcluded) continue;
    const key = `${s.sessionId}#${s.club}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n <= opts.warmupShots) {
      s.isExcluded = true;
      s.exclusionReason = "warmup";
    }
  }

  // ── club medians from what survived warmup ────────────────────────────────
  const carriesByClub = new Map<string, number[]>();
  const smashByClub = new Map<string, number[]>();
  for (const s of out) {
    if (s.isExcluded) continue;
    if (s.carryYd !== null) {
      const a = carriesByClub.get(s.club) ?? [];
      a.push(s.carryYd);
      carriesByClub.set(s.club, a);
    }
    if (s.smashFactor !== null) {
      const a = smashByClub.get(s.club) ?? [];
      a.push(s.smashFactor);
      smashByClub.set(s.club, a);
    }
  }

  // ── pass 2: mishits ───────────────────────────────────────────────────────
  for (const s of out) {
    if (s.isExcluded) continue;

    const smashes = smashByClub.get(s.club);
    if (s.smashFactor !== null && smashes && smashes.length >= 5) {
      const m = median(smashes);
      const d = mad(smashes);
      // A MAD of 0 means the club's smash never varies; no threshold to apply.
      if (d > 0 && s.smashFactor < m - opts.smashMads * d) {
        s.isExcluded = true;
        s.exclusionReason = "mishit:smash";
        continue;
      }
    }

    const carries = carriesByClub.get(s.club);
    if (s.carryYd !== null && carries && carries.length >= 5) {
      if (s.carryYd < median(carries) * opts.carryFloorFraction) {
        s.isExcluded = true;
        s.exclusionReason = "mishit:carry";
      }
    }
  }

  return out;
}

// ── club profiles ───────────────────────────────────────────────────────────

export interface ClubProfile {
  club: string;
  /** Every shot with this club, including excluded ones. */
  n: number;
  /** Shots actually behind the numbers below. */
  active: number;
  sessions: number;
  /** True when `active` is under the display threshold. */
  suppressed: boolean;

  medianCarryYd: number | null;
  carryP25Yd: number | null;
  carryP75Yd: number | null;
  carryMinYd: number | null;
  carryMaxYd: number | null;

  /** 80th-percentile lateral band: p10 and p90 of offline, in yards. */
  offlineP10Yd: number | null;
  offlineP90Yd: number | null;
  medianOfflineYd: number | null;

  medianBallSpeedMph: number | null;
  medianClubSpeedMph: number | null;
  medianSmashFactor: number | null;
  medianLaunchAngleDeg: number | null;
  medianBackspinRpm: number | null;

  /** Largest gap between per-session medians. Flags a pooled, bimodal club. */
  sessionSpreadYd: number | null;
}

export const MIN_SHOTS_TO_DISPLAY = 15;

const medOrNull = (v: number[]): number | null => (v.length === 0 ? null : median(v));

export function clubProfile(
  allShots: LedgerShot[],
  club: string,
  minShots = MIN_SHOTS_TO_DISPLAY,
): ClubProfile {
  const mine = allShots.filter((s) => s.club === club);
  const active = mine.filter((s) => !s.isExcluded);
  const pick = (f: (s: LedgerShot) => number | null): number[] =>
    active.map(f).filter((v): v is number => v !== null);

  const carries = pick((s) => s.carryYd);
  const offline = pick((s) => s.offlineYd);

  // Per-session medians, to expose the pooling problem rather than hide it.
  const bySession = new Map<string, number[]>();
  for (const s of active) {
    if (s.carryYd === null) continue;
    const a = bySession.get(s.sessionId) ?? [];
    a.push(s.carryYd);
    bySession.set(s.sessionId, a);
  }
  const sessionMedians = [...bySession.values()]
    .filter((a) => a.length >= 5)
    .map((a) => median(a));

  return {
    club,
    n: mine.length,
    active: active.length,
    sessions: new Set(mine.map((s) => s.sessionId)).size,
    suppressed: active.length < minShots,

    medianCarryYd: medOrNull(carries),
    carryP25Yd: carries.length ? quantile(carries, 0.25) : null,
    carryP75Yd: carries.length ? quantile(carries, 0.75) : null,
    carryMinYd: carries.length ? Math.min(...carries) : null,
    carryMaxYd: carries.length ? Math.max(...carries) : null,

    // The 80th-percentile band: 10th to 90th percentile of lateral miss. Eight
    // shots in ten land inside it, which is the region worth planning against.
    offlineP10Yd: offline.length ? quantile(offline, 0.1) : null,
    offlineP90Yd: offline.length ? quantile(offline, 0.9) : null,
    medianOfflineYd: medOrNull(offline),

    medianBallSpeedMph: medOrNull(pick((s) => s.ballSpeedMph)),
    medianClubSpeedMph: medOrNull(pick((s) => s.clubSpeedMph)),
    medianSmashFactor: medOrNull(pick((s) => s.smashFactor)),
    medianLaunchAngleDeg: medOrNull(pick((s) => s.launchAngleDeg)),
    medianBackspinRpm: medOrNull(pick((s) => s.backspinRpm)),

    sessionSpreadYd:
      sessionMedians.length >= 2
        ? Math.max(...sessionMedians) - Math.min(...sessionMedians)
        : null,
  };
}

export function buildBag(
  shots: LedgerShot[],
  minShots = MIN_SHOTS_TO_DISPLAY,
): ClubProfile[] {
  const clubs = [...new Set(shots.map((s) => s.club))];
  return sortByBag(clubs.map((c) => clubProfile(shots, c, minShots)));
}

// ── coverage ────────────────────────────────────────────────────────────────

export interface CoverageGap {
  field: string;
  label: string;
  missing: number;
  total: number;
  sessions: string[];
}

/**
 * Where a metric the heuristics depend on is simply absent.
 *
 * Not hypothetical: one observed export has 41 columns instead of 42, with no
 * `Smash Factor` at all and every club-delivery metric empty — the monitor
 * tracked the ball but not the club. Those shots pass through the smash-based
 * mishit test untouched, so a third of the ledger is filtered more loosely
 * than the rest. That is worth saying out loud rather than discovering later.
 */
export function coverageGaps(shots: LedgerShot[]): CoverageGap[] {
  const FIELDS: { field: keyof LedgerShot; label: string }[] = [
    { field: "smashFactor", label: "smash factor" },
    { field: "clubSpeedMph", label: "club speed" },
    { field: "carryYd", label: "carry" },
  ];

  const out: CoverageGap[] = [];
  for (const { field, label } of FIELDS) {
    const missingShots = shots.filter((s) => s[field] === null);
    if (missingShots.length === 0) continue;
    out.push({
      field: field as string,
      label,
      missing: missingShots.length,
      total: shots.length,
      sessions: [...new Set(missingShots.map((s) => s.sessionId))].sort(),
    });
  }
  return out;
}

// ── gaps ────────────────────────────────────────────────────────────────────

export type GapVerdict = "ok" | "overlap" | "hole" | "inverted" | "unknown";

export interface Gap {
  longer: string;
  shorter: string;
  /** Median carry of the longer-lofted club minus the shorter. */
  gapYd: number | null;
  verdict: GapVerdict;
  /** True when either club is suppressed, so the gap is not shown. */
  suppressed: boolean;
}

export interface GapOptions {
  /** Below this, the two clubs do the same job. */
  overlapUnderYd: number;
  /** Above this, there is a distance you cannot hit. */
  holeOverYd: number;
}

export const DEFAULT_GAPS: GapOptions = { overlapUnderYd: 8, holeOverYd: 15 };

/**
 * Gaps between clubs adjacent *in the bag*, not adjacent by measured carry.
 * Sorting by carry first would silently repair an inversion — the case where a
 * lower-lofted club goes shorter — by reordering it out of existence, and that
 * is the single most actionable thing this chart can tell you.
 */
export function detectGaps(
  profiles: ClubProfile[],
  opts: GapOptions = DEFAULT_GAPS,
): Gap[] {
  const ordered = sortByBag(profiles);
  const gaps: Gap[] = [];

  for (let i = 0; i < ordered.length - 1; i += 1) {
    const a = ordered[i];
    const b = ordered[i + 1];
    const suppressed = a.suppressed || b.suppressed;
    const gapYd =
      a.medianCarryYd !== null && b.medianCarryYd !== null
        ? a.medianCarryYd - b.medianCarryYd
        : null;

    let verdict: GapVerdict = "unknown";
    if (gapYd !== null) {
      if (gapYd < 0) verdict = "inverted";
      else if (gapYd < opts.overlapUnderYd) verdict = "overlap";
      else if (gapYd > opts.holeOverYd) verdict = "hole";
      else verdict = "ok";
    }

    gaps.push({ longer: a.club, shorter: b.club, gapYd, verdict, suppressed });
  }

  return gaps;
}
