/* Par per hole for a Grint round.
 *
 * The card side never captured par (DECISIONS.md: no par, rating or slope
 * per tee made it into the Grint capture). The watch side does — every
 * on-course Garmin scorecard carries `holePars` — so a Grint round whose
 * confirmed link points at an on-course Garmin round knows its pars through
 * the link, and no other Grint round knows them at all.
 *
 * Borrowing pars for other Grint rounds at the same course and tee was
 * designed and cut (2026-09-29): it covers zero extra rounds today — the
 * watch courses are San Francisco one-offs and the record is Los Angeles-
 * heavy — and lending the R50 simulator cards' pars to real rounds at the
 * "same" course would be invented data. NEXT.md carries the unlock.
 */

import type { GarminShots } from "./garmin-shots";
import type { PlayedRound, RoundHistory } from "./round-history";

export interface ParEntry {
  pars: number[];
  /** The Garmin scorecard the pars came from. */
  scorecardId: string;
}

/** roundId → pars. */
export type ParIndex = Map<string, ParEntry>;

export interface ConfirmedLink {
  scorecardId: string;
  roundId: string;
}

/** Only a confirmed link lends pars, only from an on-course round, only when
 *  all 18 holes carry one. */
export function buildParIndex(
  garmin: GarminShots | null,
  links: readonly ConfirmedLink[],
): ParIndex {
  const out: ParIndex = new Map();
  if (!garmin) return out;
  const byScorecard = new Map(garmin.rounds.map((r) => [r.scorecardId, r]));
  for (const l of links) {
    const r = byScorecard.get(l.scorecardId);
    if (!r || r.flags.includes("simulation")) continue;
    if (r.holes.length !== 18) continue;
    const pars = r.holes.map((h) => h.par);
    if (pars.some((p) => p === null || !Number.isFinite(p))) continue;
    out.set(l.roundId, { pars: pars as number[], scorecardId: r.scorecardId });
  }
  return out;
}

export function parsFor(index: ParIndex, round: PlayedRound): number[] | null {
  return index.get(round.roundId)?.pars ?? null;
}

/** How much of the card record has a par — the number the doubles metric is
 *  a share of. */
export function parCoverage(
  index: ParIndex,
  history: RoundHistory | null,
): { known: number; of: number } {
  const of = history?.rounds.filter((r) => r.entry === "full" && r.holes === 18).length ?? 0;
  return { known: index.size, of };
}
