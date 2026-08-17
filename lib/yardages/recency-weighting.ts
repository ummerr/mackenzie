/* Recency weighting for stock yardages, and the cap that keeps one session
 * from becoming the whole number.
 *
 * ── Why "as of the newest session" and not "as of now" ──────────────────────
 *
 * Ages are measured against a fixed reference date that defaults to the latest
 * session in the ledger, never `Date.now()`. Wall-clock ages would make
 * `pnpm ingest` produce different stock yardages on Tuesday than on Monday
 * from byte-identical inputs, and would make every test that touches a weighted
 * number decay out from under itself. The newest session always weighs 1.0.
 */

import { REVIEW_THRESHOLDS, type ReviewThresholds } from "./thresholds";

/** Naive local wall time, `YYYY-MM-DDTHH:mm:ss`, as the ledger stores it. */
export type NaiveTimestamp = string;

/**
 * Whole and fractional days between two naive wall times.
 *
 * Both are read as UTC. They are naive local times and only their difference is
 * used, so this is exact except across a DST boundary, where reading them as
 * local instead would introduce the hour rather than remove it.
 */
export function ageInDays(when: NaiveTimestamp, asOf: NaiveTimestamp): number {
  const a = Date.parse(`${when}Z`);
  const b = Date.parse(`${asOf}Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) {
    throw new Error(`ageInDays: unparseable timestamp (${when}, ${asOf})`);
  }
  return (b - a) / 86_400_000;
}

/**
 * Exponential decay. See `recencyHalfLifeDays` — it is an e-folding time, not
 * a half-life, and reaches 1/e ≈ 0.368 rather than 0.5 at its named age.
 *
 * A future session (negative age) is clamped to weight 1 rather than allowed to
 * weigh more than the present.
 */
export function recencyWeight(
  ageDays: number,
  halfLifeDays: number = REVIEW_THRESHOLDS.recencyHalfLifeDays,
): number {
  if (halfLifeDays <= 0) throw new Error(`recencyHalfLifeDays must be positive`);
  if (ageDays <= 0) return 1;
  return Math.exp(-ageDays / halfLifeDays);
}

export interface SessionWeight {
  sessionId: string;
  /** Shots this session contributes to the club being weighted. */
  shotCount: number;
  /** `shotCount × recencyWeight`, before capping. */
  rawWeight: number;
  /** After capping. Equal to `rawWeight` when the cap did not bind. */
  weight: number;
  /** `max(maxSessionWeightShare, this session's share of the club's shots)`. */
  cap: number;
  /** True when the cap actually reduced this session's weight. */
  capped: boolean;
}

/**
 * Per-session weights for one club, capped so no session dominates.
 *
 * The cap on a session is `max(maxSessionWeightShare, its share of the shots)`.
 * Recency may therefore shrink a session's influence but can never inflate it
 * past what its raw sample size already justified. A flat share cap would do
 * the opposite: with two sessions it forces 50/50, handing a four-shot session
 * from today the same say as thirty shots from last month.
 *
 * Applied by rescaling every violator to its cap and repeating — each pass
 * lowers the total, which lowers every limit, so the sequence is monotone and
 * converges. `maxPasses` is a backstop, not a tuning knob.
 */
export function sessionWeights(
  shotsPerSession: { sessionId: string; shotCount: number }[],
  asOf: NaiveTimestamp,
  t: ReviewThresholds = REVIEW_THRESHOLDS,
  maxPasses = 100,
): SessionWeight[] {
  const totalShots = shotsPerSession.reduce((n, s) => n + s.shotCount, 0);
  if (totalShots === 0) return [];

  const entries = shotsPerSession.map((s) => {
    const raw = s.shotCount * recencyWeight(ageInDays(s.sessionId, asOf), t.recencyHalfLifeDays);
    return {
      sessionId: s.sessionId,
      shotCount: s.shotCount,
      rawWeight: raw,
      weight: raw,
      cap: Math.max(t.maxSessionWeightShare, s.shotCount / totalShots),
      capped: false,
    };
  });

  const EPSILON = 1e-12;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const total = entries.reduce((sum, e) => sum + e.weight, 0);
    if (total <= 0) break;
    let changed = false;
    for (const e of entries) {
      const limit = e.cap * total;
      if (e.weight > limit + EPSILON) {
        e.weight = limit;
        e.capped = true;
        changed = true;
      }
    }
    if (!changed) break;
  }

  return entries;
}

/**
 * Per-shot weights for one club, keyed by shot. Every shot in a session shares
 * that session's weight evenly — a range session happens in one afternoon, so
 * within it there is no recency to distinguish.
 */
export function shotWeights(
  shots: { sessionId: string }[],
  asOf: NaiveTimestamp,
  t: ReviewThresholds = REVIEW_THRESHOLDS,
): { weights: number[]; sessions: SessionWeight[] } {
  const counts = new Map<string, number>();
  for (const s of shots) counts.set(s.sessionId, (counts.get(s.sessionId) ?? 0) + 1);

  const sessions = sessionWeights(
    [...counts.entries()].map(([sessionId, shotCount]) => ({ sessionId, shotCount })),
    asOf,
    t,
  );

  const perShot = new Map(sessions.map((s) => [s.sessionId, s.weight / s.shotCount]));
  return { weights: shots.map((s) => perShot.get(s.sessionId) ?? 0), sessions };
}

/** The reference date for weighting: the newest session present. */
export function latestSessionId(shots: { sessionId: string }[]): NaiveTimestamp | null {
  let latest: string | null = null;
  for (const s of shots) if (latest === null || s.sessionId > latest) latest = s.sessionId;
  return latest;
}
