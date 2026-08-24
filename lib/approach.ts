/* The approach game by starting distance — the <150-yard question, answered
 * from the watch's own per-approach detail (lib/garmin-shots.ts stats block).
 *
 * Every number here is derivable from measurements: an attempt is a recorded
 * approach with a starting distance, a green hit is Garmin's own ending lie
 * saying "Green", proximity is the measured distance remaining. No strokes-
 * gained, no baseline golfer — those were refused at the adapter.
 *
 * Course and sim are separate populations, never pooled: where both can speak
 * to the same question, the course figure is the headline and the ranking
 * input, the sim rides in the note (DECISIONS.md 2026-08-24 — the course
 * beats the sim). Today the sim side is empty by construction (R50 sim
 * rounds carry no shots), and the split is what keeps that an observation
 * instead of an assumption.
 *
 * Same gate discipline as everything Garmin: the record publishes at any
 * sample size with its sample sizes attached; anything phrased as a claim
 * waits for GARMIN_THRESHOLDS.minShotRounds. `gated` says which side of that
 * line the record is on.
 */

import type { ApproachDetail, GarminShots } from "./garmin-shots";
import { GARMIN_THRESHOLDS } from "./garmin-shots";
import { median } from "./stats";

export interface ApproachBand {
  /** Printable range, e.g. "inside 100". */
  label: string;
  /** [minYd, maxYd) — max null means unbounded. */
  minYd: number;
  maxYd: number | null;
  attempts: number;
  /** Ending lie "Green", Garmin's own string. */
  greensHit: number;
  greenHitPct: number | null;
  /** Median measured distance remaining after the shot, in yards. */
  medianProximityYd: number | null;
}

export interface ApproachRecord {
  /** Distinct rounds behind the detail rows of this population. */
  rounds: number;
  attempts: number;
  bands: ApproachBand[];
  /** The <150 aggregate the user's question is about — inside-150 attempts,
   *  greens hit, and share. */
  inside150: { attempts: number; greensHit: number; greenHitPct: number | null };
}

export interface ApproachBands {
  course: ApproachRecord;
  sim: ApproachRecord;
  /** True while the shot-bearing round count is under minShotRounds — the
   *  record below is published either way; claims wait. */
  gated: boolean;
}

const BANDS: { label: string; minYd: number; maxYd: number | null }[] = [
  { label: "inside 100", minYd: 0, maxYd: 100 },
  { label: "100–150", minYd: 100, maxYd: 150 },
  { label: "over 150", minYd: 150, maxYd: null },
];

function record(rows: ApproachDetail[]): ApproachRecord {
  const usable = rows.filter((r) => r.startingDistanceToHoleYd !== null);
  const bands = BANDS.map(({ label, minYd, maxYd }) => {
    const inBand = usable.filter(
      (r) =>
        (r.startingDistanceToHoleYd as number) >= minYd &&
        (maxYd === null || (r.startingDistanceToHoleYd as number) < maxYd),
    );
    const greens = inBand.filter((r) => r.endingLie === "Green").length;
    const proximities = inBand
      .map((r) => r.remainingDistanceYd)
      .filter((v): v is number => v !== null);
    return {
      label,
      minYd,
      maxYd,
      attempts: inBand.length,
      greensHit: greens,
      greenHitPct: inBand.length ? (greens / inBand.length) * 100 : null,
      medianProximityYd: proximities.length ? median(proximities) : null,
    };
  });
  const inside = bands.filter((b) => b.maxYd !== null && b.maxYd <= 150);
  const attempts = inside.reduce((a, b) => a + b.attempts, 0);
  const greensHit = inside.reduce((a, b) => a + b.greensHit, 0);
  return {
    rounds: new Set(usable.map((r) => r.scorecardId).filter((id) => id !== null)).size,
    attempts: usable.length,
    bands,
    inside150: {
      attempts,
      greensHit,
      greenHitPct: attempts ? (greensHit / attempts) * 100 : null,
    },
  };
}

/** The approach record by distance band, split course/sim. Null when the
 *  artifact predates the stats block or carries no approach detail. */
export function approachBands(g: GarminShots | null): ApproachBands | null {
  if (g === null || g.stats === null || g.stats.approach.length === 0) return null;
  const simIds = new Set(
    g.rounds.filter((r) => r.flags.includes("simulation")).map((r) => r.scorecardId),
  );
  const rows = g.stats.approach;
  const course = record(rows.filter((r) => r.scorecardId === null || !simIds.has(r.scorecardId)));
  const sim = record(rows.filter((r) => r.scorecardId !== null && simIds.has(r.scorecardId)));
  return {
    course,
    sim,
    gated: course.rounds < GARMIN_THRESHOLDS.minShotRounds,
  };
}
