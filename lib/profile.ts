/* The golfer, derived — never written by hand.
 *
 * The bag chart says what a club does. The practice list says what to hit next.
 * Neither says what kind of golfer the record describes, and that is a question
 * both halves of this repo can answer together and neither can answer alone:
 * Yardages knows the swing, Mackenzie knows the scorecard.
 *
 * ── A living spec, not a report ─────────────────────────────────────────────
 *
 * Every finding here carries four things, and none of them is optional:
 *
 *   claim        what the data says, in one sentence
 *   evidence     the numbers that put it on the list
 *   roast        the same fact with the gloves off, where that is honest
 *   falsifiedBy  the condition that takes it off the list
 *
 * The last one is the whole design. A profile without it is a horoscope: it
 * describes you forever, gets vaguer as it ages, and nothing you do can argue
 * with it. With it, the profile is a spec that the next session either
 * confirms or retires — same contract as `tasks.ts` and its `doneWhen`, and
 * the same reason. Hit fifteen drivers and the line about not owning one
 * disappears, because it was never a personality, it was a measurement.
 *
 * ── Nothing is compared to a golfer who is not you ──────────────────────────
 *
 * There are no tour averages here, no handicap model, no "good players do X".
 * Every comparison is internal — this club against that club, these courses
 * against those courses, this half of the record against the other half —
 * because the moment a benchmark appears it needs a source, a population and a
 * conditions caveat, and the repo's own rule is that a claim without a source
 * is the most dangerous kind of data (`facts.json`, and DECISIONS § Every claim
 * carries its own source). An unsourced tour average is exactly that.
 *
 * The roast is allowed to be sharp. It is not allowed to be unsupported: every
 * `roast` string restates its own `evidence` and nothing more.
 */

import { startsAHole, type BagSpec } from "./clubs";
import type { CourseHistory, PlayedLayout } from "./course-history";
import { meanScore, scorable, totalRounds } from "./course-history";
import type { LedgerSession, LedgerShot } from "./ledger";
import type { RoundHistory } from "./round-history";
import {
  differentialTrend,
  eighteenHole,
  fairwaySplit,
  puttsPerRound,
  threePuttShare,
  yearlyMeans,
} from "./round-history";
import {
  bagCoverage,
  median,
  sortByBag,
  type BagCoverage,
  type ClubProfile,
  type Gap,
} from "./stats";
import type { Task } from "./tasks";

/* Every tunable in one place, the same discipline as yardages/thresholds.ts.
 * These are editorial thresholds — where a fact becomes worth printing — not
 * measurement thresholds, and moving one changes what the profile talks about
 * rather than what any number means. */
export const PROFILE_THRESHOLDS = {
  /** A median lateral miss under this is a tendency nobody would feel. */
  biasYd: 5,
  /** Session-to-session median drift worth naming as drift. */
  driftYd: 10,
  /** A carry band wider than this share of its own median is a loose club. */
  carryBandShare: 0.12,
  /** Fairway width in yards, from the chart, so both drawings agree. */
  fairwayYd: 30,
  /** Below this many rounds, a course-side claim is an anecdote. */
  minRounds: 20,
  /** How many favourites make up "the top of the list". */
  favouriteCount: 10,
  /** Strokes between the favourites' mean and the rest before it means anything.
   *  One is inside the noise of an average of averages; two is a pattern. */
  favouriteStrokes: 2,
  /** Smash spread across the bag worth naming as a strike problem. */
  smashSpread: 0.08,
  /** Share of swings discarded that is worth remarking on. */
  discardShare: 0.2,
  /** Putts as a share of all strokes worth naming as the biggest line item. */
  puttShare: 0.35,
  /** Three-putt holes as a share of holes putted worth a finding and a task. */
  threePuttShare: 0.1,
  /** Trending-handicap movement, in strokes, before an arc is a direction. */
  trendStrokes: 2,
} as const;

export type Lens = "range" | "course" | "both";
export type Confidence = "high" | "medium" | "low";

export interface Finding {
  id: string;
  lens: Lens;
  confidence: Confidence;
  /** What the data says, neutrally. */
  claim: string;
  /** The numbers behind it. A claim never ships without one. */
  evidence: string;
  /** The same fact, unsoftened. Null where a fact is simply a fact. */
  roast: string | null;
  /** What would retire this line. The living half of the spec. */
  falsifiedBy: string;
  /**
   * Rank order. The share of the record the finding is computed over, times a
   * multiplier for how firmly it is established — so the top of the list is
   * whatever the most data agrees on, never whatever reads worst.
   */
  weight: number;
}

export interface SpecLine {
  label: string;
  value: string;
  note: string | null;
}

export interface Unknown {
  id: string;
  question: string;
  why: string;
  /** What would have to exist for the question to be answerable at all. */
  needs: string;
}

export interface GolferProfile {
  spec: SpecLine[];
  findings: Finding[];
  unknowns: Unknown[];
  sources: { label: string; detail: string }[];
  /** True when only the range half was available. */
  rangeOnly: boolean;
}

export interface ProfileInput {
  /** After `applyHeuristics`. */
  shots: LedgerShot[];
  sessions: LedgerSession[];
  /** From `buildBag`. */
  profiles: ClubProfile[];
  gaps: Gap[];
  tasks: Task[];
  /** Null when data/course-history.json has not been snapshotted yet. */
  history: CourseHistory | null;
  /** Null when data/round-history.json has not been snapshotted yet. */
  roundHistory?: RoundHistory | null;
  /** data/bag.json. Null when it has not been written. */
  bag?: BagSpec | null;
}

const CONFIDENCE_WEIGHT: Record<Confidence, number> = {
  high: 1,
  medium: 0.6,
  low: 0.3,
};

const yd = (v: number, d = 1) => `${v.toFixed(d)} yd`;
const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Why a shot was dropped, as the machine-readable status rather than the
 * sentence.
 *
 * `applyHeuristics` spreads the classified shot, so `reviewStatus` survives on
 * the object even though its declared return type is the narrower `LedgerShot`
 * the rest of the app was written against. Reading it here is a deliberate
 * widening of that shim: grouping by `exclusionReason` instead would mean
 * grouping English sentences, which differ per shot because they quote that
 * shot's own numbers. Falls back to the coarse boolean when a caller passes
 * shots that never went through the classifier.
 */
function statusOf(s: LedgerShot): string {
  const status = (s as LedgerShot & { reviewStatus?: string }).reviewStatus;
  return status ?? "excluded";
}

/**
 * Pairs of clubs the bag itself puts at the same loft, or out of loft order.
 *
 * Walks `bag.json` rather than the profiles, because both halves of the answer
 * may be clubs that have never been hit — which is exactly when this is worth
 * knowing. Adjacent in bag order only: two clubs six slots apart sharing a loft
 * would be a different and much stranger claim.
 */
function loftCollisions(
  bag: BagSpec | null,
): { a: string; b: string; loft: number; headA: string; headB: string }[] {
  const withLoft = (bag?.clubs ?? []).filter((c) => c.loftDeg !== undefined);
  const out: { a: string; b: string; loft: number; headA: string; headB: string }[] = [];
  for (let i = 0; i < withLoft.length - 1; i += 1) {
    const a = withLoft[i];
    const b = withLoft[i + 1];
    const la = a.loftDeg as { value: number };
    const lb = b.loftDeg as { value: number };
    if (lb.value > la.value) continue;
    out.push({
      a: a.club,
      b: b.club,
      loft: la.value,
      headA: a.headType,
      headB: b.headType,
    });
  }
  return out;
}

/** Lateral width, in yards, of a club's measured aim band at its median carry. */
export function coneWidthAt(p: ClubProfile): number | null {
  if (p.deviationP10Deg === null || p.deviationP90Deg === null) return null;
  if (p.medianDistanceYd === null) return null;
  const rad = (d: number) => (d * Math.PI) / 180;
  return (Math.sin(rad(p.deviationP90Deg)) - Math.sin(rad(p.deviationP10Deg))) * p.medianDistanceYd;
}

export function buildProfile({
  shots,
  sessions,
  profiles,
  gaps,
  tasks,
  history,
  roundHistory = null,
  bag = null,
}: ProfileInput): GolferProfile {
  const findings: Finding[] = [];
  const trusted = shots.filter((s) => !s.isExcluded);
  const drawn = sortByBag(profiles.filter((p) => !p.suppressed));
  const onFile = new Set(shots.map((s) => s.club));
  const coverage = bagCoverage(profiles, bag);

  const add = (f: Omit<Finding, "weight"> & { coverage: number }) => {
    const { coverage, ...rest } = f;
    findings.push({ ...rest, weight: coverage * CONFIDENCE_WEIGHT[f.confidence] });
  };

  // ── the range half ────────────────────────────────────────────────────────

  const longest = drawn[0] ?? null;

  /* The tee game, counted twice: how many of those clubs are *measured*, and
   * how many swings exist at all. The distinction is the whole finding — a
   * driver with one shot on file is not a driver you have data about, but
   * saying "no driver shots" when the ledger holds one is exactly the kind of
   * round number this repo does not print. */
  const measuredTee = drawn.filter((p) => startsAHole(p.club));
  const teeShots = shots.filter((s) => startsAHole(s.club));
  const teeClubsOnFile = [...new Set(teeShots.map((s) => s.club))];

  if (measuredTee.length === 0 && trusted.length > 0) {
    const rounds = history ? totalRounds(history) : null;
    add({
      id: "no-tee-game",
      lens: rounds === null ? "range" : "both",
      confidence: "high",
      coverage: 1,
      claim:
        "There is no measured tee game. Every club with numbers is a club you " +
        "reach for after the shot that decided where you were standing.",
      evidence:
        `${trusted.length} trusted shots across ${sessions.length} sessions, and ` +
        (teeShots.length === 0
          ? "not one with a driver, wood, hybrid or long iron. "
          : `only ${teeShots.length} with a driver, wood, hybrid or long iron ` +
            `(${teeClubsOnFile.join(", ")}) — under the 15 a club needs to be drawn. `) +
        `The longest club measured is the ${longest?.club ?? "—"}` +
        `${longest?.medianDistanceYd != null ? `, ${yd(longest.medianDistanceYd, 0)}` : ""}` +
        (rounds !== null ? `, against ${rounds} rounds played.` : "."),
      roast:
        rounds !== null
          ? `${rounds} rounds played, ${teeShots.length} measured swing${teeShots.length === 1 ? "" : "s"} ` +
            "with anything that starts a hole. This is a very thorough study of the second shot."
          : "This is a very thorough study of the second shot.",
      falsifiedBy: "Any tee club drawn on the bag page — 15+ usable shots with it.",
    });
  }

  /* ── the bag half ────────────────────────────────────────────────────────
   *
   * The only two findings here that the ledger cannot produce on its own. Both
   * come from data/bag.json, which is asserted by hand precisely because a
   * record of what you hit can never tell you what you did not.
   */

  if (coverage && coverage.neverRecorded.length > 0) {
    const names = coverage.neverRecorded;
    add({
      id: "unmeasured-bag",
      lens: "range",
      confidence: "high",
      coverage: names.length / coverage.owned,
      claim:
        "Part of the bag has never been to a monitor. The chart is not a picture " +
        "of what you carry, it is a picture of what you happened to hit.",
      evidence:
        `${coverage.owned} clubs in the bag, ${coverage.recorded.length} with any shots on file. ` +
        `Never recorded: ${names.join(", ")}.` +
        (coverage.underSampled.length > 0
          ? ` A further ${coverage.underSampled.length} — ` +
            `${coverage.underSampled
              .map((u) => `${u.club} (${u.active} usable of ${u.n})`)
              .join(", ")} — ` +
            `${coverage.underSampled.length === 1 ? "sits" : "sit"} under the threshold to be drawn.`
          : ""),
      roast:
        `You own ${coverage.owned} clubs and have measured ${coverage.recorded.length}. ` +
        `The ${names[names.length - 1]} is carried around every round as a decoration.`,
      falsifiedBy: "Every club in data/bag.json with at least one shot in the ledger.",
    });
  }

  /* Two clubs built to the same number. This one needs no range data at all —
   * it is a claim about the bag, checkable the day it is written, and it is the
   * kind of thing a ledger of what you hit structurally cannot notice. */
  const collisions = loftCollisions(bag);
  if (collisions.length > 0) {
    const c = collisions[0];
    add({
      id: "same-loft-twice",
      lens: "range",
      confidence: "medium",
      coverage: (collisions.length * 2) / Math.max(coverage?.owned ?? 14, 1),
      claim:
        "Two clubs in the bag are built to the same loft. Which of them goes " +
        "further is a question about the heads, and nothing on file answers it.",
      evidence:
        collisions
          .map((x) => `${x.a} and ${x.b} are both ${x.loft}°`)
          .join("; ") +
        `. Different head types — ${c.headA} against ${c.headB} — so this is not a duplicate ` +
        "club, but it is not a gap either, and the ledger has never had both on the same day.",
      roast: null,
      falsifiedBy: `Both clubs measured, or one of them re-lofted. ${c.a} and ${c.b} carrying more than 8 yd apart settles it.`,
    });
  }

  /* Direction. Two findings, and which one fires matters: a bag that misses one
   * way has an aim problem, and a bag that misses both ways has a different one
   * — the second is not the first with more of it. */
  const biased = drawn.filter(
    (p) =>
      p.medianOfflineYd !== null &&
      Math.abs(p.medianOfflineYd) >= PROFILE_THRESHOLDS.biasYd,
  );
  const right = biased.filter((p) => (p.medianOfflineYd as number) > 0);
  const left = biased.filter((p) => (p.medianOfflineYd as number) < 0);

  if (right.length > 0 && left.length > 0) {
    const worstR = [...right].sort(
      (a, b) => (b.medianOfflineYd as number) - (a.medianOfflineYd as number),
    )[0];
    const worstL = [...left].sort(
      (a, b) => (a.medianOfflineYd as number) - (b.medianOfflineYd as number),
    )[0];
    add({
      id: "two-way-miss",
      lens: "range",
      confidence: "high",
      coverage: biased.length / Math.max(drawn.length, 1),
      claim:
        "The miss is two-way. Some clubs sit right of the target line by their " +
        "median and others sit left, which is a different problem from one bias " +
        "you could aim off.",
      evidence:
        `${right.length} of ${drawn.length} drawn clubs miss right by their median ` +
        `(worst: ${worstR.club}, ${yd(worstR.medianOfflineYd as number)} right), ` +
        `${left.length} miss left (worst: ${worstL.club}, ` +
        `${yd(Math.abs(worstL.medianOfflineYd as number))} left).`,
      roast:
        `The ${worstR.club} goes right and the ${worstL.club} goes left, so aiming ` +
        "off fixes exactly half your bag and breaks the other half.",
      falsifiedBy:
        `Every drawn club's median offline inside ±${PROFILE_THRESHOLDS.biasYd} yd, ` +
        "or all of them on the same side.",
    });
  } else if (biased.length >= 2) {
    const side = right.length > 0 ? "right" : "left";
    const worst = [...biased].sort(
      (a, b) =>
        Math.abs(b.medianOfflineYd as number) - Math.abs(a.medianOfflineYd as number),
    )[0];
    add({
      id: "one-way-miss",
      lens: "range",
      confidence: "high",
      coverage: biased.length / Math.max(drawn.length, 1),
      claim: `The miss is one-way: ${biased.length} of ${drawn.length} drawn clubs sit ${side} of the target by their median.`,
      evidence: `Worst is the ${worst.club} at ${yd(Math.abs(worst.medianOfflineYd as number))} ${side} of target.`,
      roast: `A bag that misses one way is an alignment you have not measured, not a swing you cannot make.`,
      falsifiedBy: `Median offline inside ±${PROFILE_THRESHOLDS.biasYd} yd on most drawn clubs.`,
    });
  }

  /* Dispersion against something real. A cone is abstract; a fairway is not. */
  const cones = drawn
    .map((p) => ({ p, width: coneWidthAt(p) }))
    .filter((c): c is { p: ClubProfile; width: number } => c.width !== null);
  const overFairway = cones.filter((c) => c.width > PROFILE_THRESHOLDS.fairwayYd);
  if (overFairway.length > 0) {
    const worst = [...overFairway].sort((a, b) => b.width - a.width)[0];
    add({
      id: "wider-than-the-fairway",
      lens: "range",
      confidence: "high",
      coverage: overFairway.length / Math.max(cones.length, 1),
      claim:
        `${overFairway.length} of ${cones.length} drawn clubs spray wider than a ` +
        `${PROFILE_THRESHOLDS.fairwayYd}-yard fairway at their own median carry.`,
      evidence:
        `Worst is the ${worst.p.club}: eight in ten of its shots land inside a ` +
        `${yd(worst.width, 0)} corridor at ${yd(worst.p.medianDistanceYd as number, 0)}. ` +
        `A good fairway is ${PROFILE_THRESHOLDS.fairwayYd} yd wide.`,
      roast:
        `Eight in ten ${worst.p.club}s finish inside ${yd(worst.width, 0)} of each other. ` +
        "That is not a target, that is a postcode.",
      falsifiedBy: `Every drawn club's 80% aim band under ${PROFILE_THRESHOLDS.fairwayYd} yd wide at its median carry.`,
    });
  }

  /* Gapping, stated as a conclusion. The scorecard on the bag page has the
   * table; this is what the table amounts to. */
  const flagged = gaps.filter(
    (g) => !g.suppressed && (g.verdict === "hole" || g.verdict === "inverted"),
  );
  const overlaps = gaps.filter((g) => !g.suppressed && g.verdict === "overlap");
  if (flagged.length > 0 || overlaps.length > 0) {
    const worst = [...flagged].sort(
      (a, b) => Math.abs(b.gapYd ?? 0) - Math.abs(a.gapYd ?? 0),
    )[0];
    const inverted = flagged.filter((g) => g.verdict === "inverted");
    /* Pairs are not clubs: three overlapping pairs can be four clubs in a chain
     * or six in three separate collisions, and only the set knows which. */
    const overlappingClubs = new Set(overlaps.flatMap((g) => [g.longer, g.shorter]));
    add({
      id: "gapping",
      lens: "range",
      confidence: "high",
      coverage: (flagged.length + overlaps.length) / Math.max(gaps.length, 1),
      claim:
        "The bag is not evenly spaced: there are distances it cannot cover and " +
        "distances it covers twice.",
      evidence:
        [
          worst
            ? `Worst gap ${yd(Math.abs(worst.gapYd ?? 0))} between ${worst.longer} and ${worst.shorter}`
            : null,
          overlaps.length > 0
            ? `${overlaps.length} overlapping pair${overlaps.length > 1 ? "s" : ""} under 8 yd apart`
            : null,
          inverted.length > 0
            ? `${inverted.length} pair${inverted.length > 1 ? "s" : ""} carrying out of loft order`
            : null,
        ]
          .filter(Boolean)
          .join(" · ") + ".",
      roast:
        overlaps.length > 0 && worst
          ? `${overlaps.length} pairs of clubs land within 8 yd of each other — ` +
            `${overlappingClubs.size} clubs doing the work of ${overlaps.length} — and none of ` +
            `them covers the ${yd(Math.abs(worst.gapYd ?? 0), 0)} hole between the ` +
            `${worst.longer} and the ${worst.shorter}.`
          : null,
      falsifiedBy: "No gap flagged as a hole, an inversion or an overlap on the bag page.",
    });
  }

  /* Consistency, from the ledger's own memory of when each shot was hit. */
  const drifting = drawn.filter(
    (p) => (p.sessionSpreadYd ?? 0) > PROFILE_THRESHOLDS.driftYd && p.sessions > 1,
  );
  if (drifting.length > 0) {
    const worst = [...drifting].sort(
      (a, b) => (b.sessionSpreadYd ?? 0) - (a.sessionSpreadYd ?? 0),
    )[0];
    add({
      id: "day-to-day-drift",
      lens: "range",
      confidence: "medium",
      coverage: drifting.length / Math.max(drawn.length, 1),
      claim:
        "Some clubs are a different club depending on the day. Their session " +
        "medians move by more than the gaps between neighbouring clubs.",
      evidence:
        `${drifting.length} drawn club${drifting.length > 1 ? "s" : ""} drift more than ` +
        `${PROFILE_THRESHOLDS.driftYd} yd between sessions. Worst: ${worst.club}, ` +
        `${yd(worst.sessionSpreadYd as number)} between its session medians over ` +
        `${worst.sessions} sessions.`,
      roast:
        `Your ${worst.club} has a ${yd(worst.sessionSpreadYd as number, 0)} opinion about what ` +
        "day of the week it is. A yardage book cannot help with that.",
      falsifiedBy: `Every drawn club's session spread under ${PROFILE_THRESHOLDS.driftYd} yd.`,
    });
  }

  /* Strike — and the only sound way to compare it inside one bag.
   *
   * The obvious version of this finding is wrong, and was written before it was
   * caught: take the highest and lowest median smash in the bag and call the
   * spread a strike problem. Smash factor falls with loft for everybody — a
   * sand wedge returns less ball speed per unit of club speed than a 5 iron by
   * construction, not by mishitting — so that comparison flags physics and
   * calls it a flaw.
   *
   * What IS a finding is an *inversion*: a longer, less lofted club returning
   * less smash than the shorter club right beside it in the bag. That breaks
   * the order rather than sitting somewhere on it, and it is the same logic the
   * gap chart already uses for carries — a club out of loft order is the
   * finding, not the sort key. */
  const smashOrder = drawn.filter((p) => p.medianSmashFactor !== null);
  const inversions: { longer: ClubProfile; shorter: ClubProfile; drop: number }[] = [];
  for (let i = 0; i < smashOrder.length - 1; i += 1) {
    const longer = smashOrder[i];
    const shorter = smashOrder[i + 1];
    const drop = (shorter.medianSmashFactor as number) - (longer.medianSmashFactor as number);
    if (drop >= PROFILE_THRESHOLDS.smashSpread) inversions.push({ longer, shorter, drop });
  }
  if (inversions.length > 0) {
    const worst = [...inversions].sort((a, b) => b.drop - a.drop)[0];
    add({
      id: "smash-inversion",
      lens: "range",
      confidence: "medium",
      coverage: inversions.length / Math.max(smashOrder.length - 1, 1),
      claim:
        "Strike runs backwards somewhere in the bag: a longer club returns less " +
        "ball speed per unit of club speed than the shorter club next to it, which " +
        "loft alone does not explain.",
      evidence:
        `${worst.longer.club} median smash ${(worst.longer.medianSmashFactor as number).toFixed(3)} ` +
        `against ${worst.shorter.club} at ${(worst.shorter.medianSmashFactor as number).toFixed(3)} — ` +
        `the shorter club is ${worst.drop.toFixed(3)} better, and it should be the other way round. ` +
        `${inversions.length} such pair${inversions.length > 1 ? "s" : ""} in the bag.`,
      roast:
        `Your ${worst.shorter.club} strikes the ball better than your ${worst.longer.club}, ` +
        `by ${worst.drop.toFixed(3)} of smash. Loft is supposed to make that impossible.`,
      falsifiedBy:
        `No adjacent pair where the shorter club's median smash exceeds the longer ` +
        `club's by ${PROFILE_THRESHOLDS.smashSpread} or more.`,
    });
  }

  /* What the heuristics threw away. A high discard rate is not automatically a
   * bad thing — warmup is real — but it is always worth knowing. */
  const excluded = shots.length - trusted.length;
  if (shots.length > 0 && excluded / shots.length >= PROFILE_THRESHOLDS.discardShare) {
    const reasons = new Map<string, number>();
    for (const s of shots) {
      if (!s.isExcluded) continue;
      reasons.set(statusOf(s), (reasons.get(statusOf(s)) ?? 0) + 1);
    }
    const top = [...reasons.entries()].sort((a, b) => b[1] - a[1]);
    add({
      id: "discard-rate",
      lens: "range",
      confidence: "high",
      coverage: excluded / shots.length,
      claim:
        `${pct(excluded / shots.length)} of logged swings do not count toward any ` +
        "number on this site.",
      evidence:
        `${excluded} of ${shots.length} shots excluded — ` +
        top.map(([r, n]) => `${r} ${n}`).join(", ") +
        ". Warmup and partials are deliberate exclusions, not bad swings.",
      roast: null,
      falsifiedBy: `Under ${pct(PROFILE_THRESHOLDS.discardShare)} of logged shots excluded.`,
    });
  }

  // ── the course half ───────────────────────────────────────────────────────

  if (history) {
    const rounds = totalRounds(history);
    const scored = scorable(history);
    const mean = meanScore(scored);
    const enough = rounds >= PROFILE_THRESHOLDS.minRounds;

    if (mean !== null) {
      const byScore = [...scored].sort(
        (a, b) => (a.avgScore as number) - (b.avgScore as number),
      );
      const low = byScore[0];
      const high = byScore[byScore.length - 1];
      add({
        id: "scoring",
        lens: "course",
        confidence: enough ? "high" : "low",
        coverage: 1,
        claim: `Over 18 holes the record averages ${mean.toFixed(1)}, weighted by how often each course was played.`,
        evidence:
          `${scored.length} layouts with comparable 18-hole averages across ${rounds} rounds. ` +
          `Best average ${low.avgScore?.toFixed(1)} at ${low.facility}, worst ` +
          `${high.avgScore?.toFixed(1)} at ${high.facility}. ` +
          `${history.played.length - scored.length} layouts held out as short or unscored rounds.`,
        roast: null,
        falsifiedBy: "A new snapshot of the map's course history with a different mean.",
      });
    }

    const once = history.played.filter((l) => l.timesPlayed === 1);
    if (history.played.length >= 10) {
      const share = once.length / history.played.length;
      const repeats = [...history.played].sort((a, b) => b.timesPlayed - a.timesPlayed)[0];
      add({
        id: "collector",
        lens: "course",
        confidence: "high",
        coverage: share,
        claim:
          share >= 0.5
            ? "This is a collector's record, not a member's: most courses were played once and never again."
            : "The record leans on a small number of home courses played repeatedly.",
        evidence:
          `${once.length} of ${history.played.length} layouts played exactly once ` +
          `(${pct(share)}). Most played: ${repeats.facility}` +
          `${repeats.layout ? ` (${repeats.layout})` : ""} at ${repeats.timesPlayed} rounds.`,
        roast:
          share >= 0.5
            ? `${pct(share)} of the courses in this record got exactly one chance to make an ` +
              "impression, which is also how many chances they got to be learned."
            : null,
        falsifiedBy: "A course history where under half the layouts are one-and-done.",
      });
    }

    const rated = history.played.filter(
      (l) => l.ratingFun !== null && l.ratingCondition !== null,
    );
    if (rated.length >= 10) {
      const fun = median(rated.map((l) => l.ratingFun as number));
      const cond = median(rated.map((l) => l.ratingCondition as number));
      const delta = (fun ?? 0) - (cond ?? 0);
      add({
        id: "taste",
        lens: "course",
        confidence: "medium",
        coverage: rated.length / history.played.length,
        claim:
          Math.abs(delta) < 1
            ? "Fun and conditioning are rated almost identically — the ratings do not separate a good time from a good surface."
            : delta > 0
              ? "Courses are rated for fun ahead of conditioning."
              : "Courses are rated for conditioning ahead of fun.",
        evidence: `Median fun ${fun?.toFixed(1)}, median conditioning ${cond?.toFixed(1)}, across ${rated.length} rated layouts.`,
        roast:
          Math.abs(delta) < 1
            ? "Fun and conditioning track each other point for point, which suggests one number is being filled in from the other."
            : null,
        falsifiedBy: "Median fun and conditioning ratings within a point of each other.",
      });
    }

    /* The join inside the course data: do the favourites beat you? */
    const ranked = scored
      .filter((l) => l.personalRank !== null)
      .sort((a, b) => (a.personalRank as number) - (b.personalRank as number));
    if (ranked.length >= PROFILE_THRESHOLDS.favouriteCount * 2) {
      const top = ranked.slice(0, PROFILE_THRESHOLDS.favouriteCount);
      const rest = ranked.slice(PROFILE_THRESHOLDS.favouriteCount);
      const topMean = meanScore(top);
      const restMean = meanScore(rest);
      if (
        topMean !== null &&
        restMean !== null &&
        Math.abs(topMean - restMean) >= PROFILE_THRESHOLDS.favouriteStrokes
      ) {
        const harder = topMean > restMean;
        add({
          id: "favourites-punish",
          lens: "course",
          confidence: "medium",
          coverage: ranked.length / Math.max(scored.length, 1),
          claim: harder
            ? "The favourite courses are the ones that beat you."
            : "The favourite courses are also the ones you score best on.",
          evidence:
            `Top ${top.length} by personal rank average ${topMean.toFixed(1)}; the other ` +
            `${rest.length} average ${restMean.toFixed(1)} — a difference of ` +
            `${Math.abs(topMean - restMean).toFixed(1)} strokes.`,
          roast: harder
            ? `You rank a course higher the more strokes it takes off you — ` +
              `${Math.abs(topMean - restMean).toFixed(1)} of them on average. That is either taste or Stockholm syndrome.`
            : "Your favourite courses are the ones that let you play well, which is a shorter word than taste.",
          falsifiedBy: `Under ${PROFILE_THRESHOLDS.favouriteStrokes} strokes between the top-ranked layouts' mean and the rest.`,
        });
      }
    }

    // ── the join ────────────────────────────────────────────────────────────

    if (drawn.length > 0 && rounds > 0) {
      const shortest = drawn[drawn.length - 1];
      add({
        id: "measured-half",
        lens: "both",
        confidence: "high",
        coverage: 1,
        claim:
          "Nothing on this site was measured on a golf course. The played record and " +
          "the measured record share no shots at all.",
        evidence:
          `${drawn.length} clubs measured, from the ${longest?.club} down to the ` +
          `${shortest.club}, over ${trusted.length} trusted shots — every one of them ` +
          `hit off a mat in front of a monitor. ${rounds} rounds played across ` +
          `${history.facilities} facilities, none of which put a single shot in this ledger.`,
        roast:
          `${rounds} rounds. ${trusted.length} measured shots. The two sets do not intersect: ` +
          "not one number on this site came from a golf course.",
        falsifiedBy:
          "Any on-course shot data in the ledger — a round imported from the R50's " +
          "on-course mode, or a hand-entered card with clubs.",
      });
    }
  }

  // ── the round half: scorecards with dates, from the Grint export ──────────
  //
  // course-history answers "where and how well on average"; this answers
  // "when, and which strokes". The differentials are the one number in the
  // whole record that normalises for course difficulty — that is what a
  // differential is — so the trajectory finding leans on them rather than on
  // raw scores, and the gap between the two IS one of the findings.

  if (roundHistory && roundHistory.rounds.length >= PROFILE_THRESHOLDS.minRounds) {
    const scored = eighteenHole(roundHistory);
    const years = yearlyMeans(scored);
    const trend = differentialTrend(roundHistory);

    if (
      trend &&
      trend.firstTrending !== null &&
      trend.lastTrending !== null &&
      Math.abs(trend.firstTrending - trend.lastTrending) >= PROFILE_THRESHOLDS.trendStrokes
    ) {
      const better = trend.lastTrending < trend.firstTrending;
      const first = years[0];
      const last = years[years.length - 1];
      const rawMoved = first && last ? first.meanStrokes - last.meanStrokes : null;
      /* Trending handicap fell far while raw means barely moved. A differential
       * is (score − rating) scaled by slope, so that divergence is arithmetic,
       * not interpretation: the same scores against harder setups. */
      const harderGolf =
        better && rawMoved !== null && rawMoved < (trend.firstTrending - trend.lastTrending) / 2;
      add({
        id: "trajectory",
        lens: "course",
        confidence: "high",
        coverage: 1,
        claim: better
          ? harderGolf
            ? "The golf is getting better, and the raw scores hide it: the handicap fell while the scorecards stood still, which is what improvement looks like when the courses get harder too."
            : "The golf is getting better, and the record can finally say so with dates on it."
          : "The golf is getting worse by its own trending handicap.",
        evidence:
          `Trending handicap ${trend.firstTrending.toFixed(1)} at the record's start, ` +
          `${trend.lastTrending.toFixed(1)} now, across ${trend.points} differentials ` +
          `(mean of the first 20: ${trend.firstMean.toFixed(1)}; the last 20: ${trend.lastMean.toFixed(1)}). ` +
          `Meanwhile the raw 18-hole mean moved from ${first?.meanStrokes.toFixed(1)} (${first?.year}, ` +
          `${first?.rounds} rounds) to ${last?.meanStrokes.toFixed(1)} (${last?.year}, ${last?.rounds}).`,
        roast: harderGolf
          ? `Five years took ${(trend.firstTrending - trend.lastTrending).toFixed(0)} strokes off the ` +
            `handicap and ${rawMoved === null ? "?" : rawMoved.toFixed(1)} off the scorecard. You did not ` +
            "learn to score, you learned to lose by the same amount at harder courses."
          : null,
        falsifiedBy: better
          ? "A capture whose trending handicap ends no lower than it starts."
          : "A capture whose trending handicap ends lower than it starts.",
      });
    }

    const withPutts = scored.filter((r) => r.putts !== null);
    const pp = puttsPerRound(withPutts);
    const meanStrokesWithPutts =
      withPutts.length > 0
        ? withPutts.reduce((a, r) => a + (r.strokes as number), 0) / withPutts.length
        : null;
    const tp = threePuttShare(roundHistory.rounds);
    if (
      pp !== null &&
      meanStrokesWithPutts !== null &&
      pp / meanStrokesWithPutts >= PROFILE_THRESHOLDS.puttShare
    ) {
      const share = pp / meanStrokesWithPutts;
      const tpShare = tp.holes > 0 ? tp.threePutts / tp.holes : null;
      add({
        id: "putt-share",
        lens: "course",
        confidence: "high",
        coverage: withPutts.length / Math.max(scored.length, 1),
        claim:
          "Putting is the biggest single line item in the score: " +
          `${pct(share)} of all strokes happen on the green.`,
        evidence:
          `${withPutts.length} eighteen-hole rounds carry putts: ${pp.toFixed(1)} per round ` +
          `against a ${meanStrokesWithPutts.toFixed(1)} mean score.` +
          (tpShare === null
            ? ""
            : ` ${tp.threePutts} holes took three or more putts, of ${tp.holes} recorded — ` +
              `one in ${Math.round(1 / tpShare)}.`),
        roast:
          tpShare !== null && tpShare >= PROFILE_THRESHOLDS.threePuttShare
            ? `${pp.toFixed(1)} putts a round, and a three-putt every ` +
              `${Math.round(1 / tpShare)} holes. The greens are charging a second green fee.`
            : null,
        falsifiedBy:
          `A capture with putts under ${pct(PROFILE_THRESHOLDS.puttShare)} of strokes, or ` +
          `three-putts under one hole in ${Math.round(1 / PROFILE_THRESHOLDS.threePuttShare)}.`,
      });
    }

    const fw = fairwaySplit(roundHistory.rounds);
    if (fw.classified >= 500) {
      const off = fw.left + fw.right + fw.missed;
      const sym = Math.abs(fw.left - fw.right) / Math.max(off, 1);
      add({
        id: "tee-two-way",
        lens: "course",
        confidence: "high",
        coverage: fw.classified / Math.max(fw.classified + fw.unclassified, 1),
        claim:
          sym < 0.15
            ? "The tee ball misses both ways in nearly equal measure — the course-side echo of the range's two-way miss, and the one pattern aiming off cannot fix."
            : fw.left > fw.right
              ? "The tee ball's miss leans left."
              : "The tee ball's miss leans right.",
        evidence:
          `${fw.classified} driven holes carry a fairway result: ${pct(fw.hit / fw.classified)} hit, ` +
          `${pct(fw.left / fw.classified)} missed left, ${pct(fw.right / fw.classified)} missed right` +
          (fw.missed > 0 ? `, ${pct(fw.missed / fw.classified)} marked missed without a side` : "") +
          `. ${fw.unclassified} holes carry codes outside Grint's own legend and are excluded.`,
        roast:
          sym < 0.15
            ? `${fw.left} fairways missed left, ${fw.right} missed right. At least the misses are fair.`
            : null,
        falsifiedBy:
          "A capture where one side owns two-thirds of the misses, or the hit rate moves by five points.",
      });
    }
  }

  // ── practice, which is the profile's own to-do list ───────────────────────

  const openTasks = tasks.filter((t) => !t.done);
  if (openTasks.length > 0) {
    add({
      id: "open-questions",
      lens: "range",
      confidence: "high",
      coverage: 0.5,
      claim: `${openTasks.length} practice tasks are open, and the top one is aimed at the biggest blind spot above.`,
      evidence: `First on the list: ${openTasks[0].title} — ${openTasks[0].evidence}`,
      roast: null,
      falsifiedBy: "An empty practice list.",
    });
  }

  findings.sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));

  return {
    spec: buildSpec({ shots, trusted, sessions, drawn, history, roundHistory, coverage }),
    findings,
    unknowns: buildUnknowns(history, roundHistory, bag),
    sources: [
      {
        label: "Range",
        detail:
          `${shots.length} shots over ${sessions.length} Garmin R50 sessions` +
          (sessions.length > 0
            ? `, ${sessions[0].id.slice(0, 10)} to ${sessions[sessions.length - 1].id.slice(0, 10)}`
            : ""),
      },
      history
        ? {
            label: "Courses",
            detail: `${totalRounds(history)} rounds over ${history.played.length} layouts, from The Grint, captured ${history.capturedAt}`,
          }
        : {
            label: "Courses",
            detail: "not snapshotted — run `pnpm ingest:courses` inside the mackenzie repo",
          },
      roundHistory
        ? {
            label: "Rounds",
            detail:
              `${roundHistory.rounds.length} dated scorecards, ` +
              `${roundHistory.rounds[0]?.date} to ${roundHistory.rounds[roundHistory.rounds.length - 1]?.date}, ` +
              `from the Grint export bundle, captured ${roundHistory.capturedAt.slice(0, 10)}`,
          }
        : {
            label: "Rounds",
            detail: "not snapshotted — run `pnpm ingest:rounds` inside the mackenzie repo",
          },
    ],
    rangeOnly: history === null,
  };
}

function buildSpec({
  shots,
  trusted,
  sessions,
  drawn,
  history,
  roundHistory,
  coverage,
}: {
  shots: LedgerShot[];
  trusted: LedgerShot[];
  sessions: LedgerSession[];
  drawn: ClubProfile[];
  history: CourseHistory | null;
  roundHistory: RoundHistory | null;
  coverage: BagCoverage | null;
}): SpecLine[] {
  const longest = drawn[0] ?? null;
  const shortest = drawn[drawn.length - 1] ?? null;
  const lines: SpecLine[] = [
    {
      label: "Measured range",
      value:
        longest?.medianDistanceYd != null && shortest?.medianDistanceYd != null
          ? `${shortest.medianDistanceYd.toFixed(0)}–${longest.medianDistanceYd.toFixed(0)} yd`
          : "—",
      note: longest && shortest ? `${shortest.club} to ${longest.club}` : null,
    },
    { label: "Clubs measured", value: String(drawn.length), note: "15+ usable shots" },
    ...(coverage
      ? [
          {
            label: "Clubs in the bag",
            value: String(coverage.owned),
            note: `${coverage.recorded.length} with any shots on file`,
          },
        ]
      : []),
    {
      label: "Shots on file",
      value: String(trusted.length),
      note: `of ${shots.length} logged`,
    },
    { label: "Range sessions", value: String(sessions.length), note: null },
  ];

  if (history) {
    const scored = scorable(history);
    const mean = meanScore(scored);
    lines.push(
      { label: "Rounds played", value: String(totalRounds(history)), note: null },
      {
        label: "Courses played",
        value: String(history.facilities),
        note: `${history.usStates.length} US states, ${history.countries.length} countries`,
      },
      {
        label: "Mean score",
        value: mean === null ? "—" : mean.toFixed(1),
        note: `${scored.length} layouts, 18 holes`,
      },
      {
        label: "Favourite",
        value: favouriteName(history),
        note: "own ranking, no. 1",
      },
    );
  }

  if (roundHistory) {
    const trend = differentialTrend(roundHistory);
    lines.push({
      label: "Handicap index",
      value: roundHistory.handicapIndex === null ? "—" : roundHistory.handicapIndex.toFixed(1),
      note:
        trend && trend.firstTrending !== null
          ? `WHS, from ${trend.firstTrending.toFixed(1)} at the record's start`
          : "WHS",
    });
    const first = roundHistory.rounds[0];
    const last = roundHistory.rounds[roundHistory.rounds.length - 1];
    if (first && last) {
      lines.push({
        label: "Scored span",
        value: `${first.date} → ${last.date}`,
        note: `${roundHistory.rounds.length} dated rounds`,
      });
    }
  }
  return lines;
}

function favouriteName(history: CourseHistory): string {
  const top = history.played
    .filter((l) => l.personalRank !== null)
    .sort((a, b) => (a.personalRank as number) - (b.personalRank as number))[0] as
    | PlayedLayout
    | undefined;
  if (!top) return "—";
  /* The map's display name already carries the layout for a facility whose
   * layouts are courses in their own right — "Bethpage State Park (Black)" —
   * so appending it again produces "(Black) (Black)". */
  if (!top.layout || top.facility.includes(top.layout)) return top.facility;
  return `${top.facility} (${top.layout})`;
}

/* The half of a profile that most profiles leave out. Everything above is
 * something the record can support; this is what it structurally cannot, listed
 * so that nobody — including a later session of this project — mistakes silence
 * for a finding. */
function buildUnknowns(
  history: CourseHistory | null,
  roundHistory: RoundHistory | null,
  bag: BagSpec | null,
): Unknown[] {
  const unknowns: Unknown[] = [
    roundHistory
      ? {
          id: "short-game",
          question: "How much of the score is the chipping and the sand?",
          why:
            "The scorecards now carry putts per hole, so the green's share of the score is a " +
            "finding rather than a gap. Everything between the fairway and the green is still " +
            "invisible: chips, pitches, bunker shots and penalties all hide inside the strokes " +
            "column with nothing to separate them.",
          needs: "Shot-level on-course data, or a hand-kept ups-and-downs card.",
        }
      : {
          id: "short-game",
          question: "How much of the score is the short game?",
          why:
            "A range export has no putts, no chips and no bunker shots. On any ordinary " +
            "scorecard those are around half the strokes, and none of them are here.",
          needs: "Shot-level on-course data, or a hand-kept putts-and-ups card.",
        },
    {
      id: "lies",
      question: "What happens from a real lie?",
      why:
        "Every measured shot was hit off a mat to a flat range with a monitor watching. " +
        "Nothing in the ledger has been hit from rough, sand, a slope or under pressure.",
      needs: "On-course tracking, which the R50 does not export.",
    },
    {
      id: "conditions",
      question: "How much of each number is the weather?",
      why:
        "The R50 records environmentals per session, not per shot, and nothing here is " +
        "altitude-, temperature- or wind-adjusted. A summer session at sea level and a " +
        "cold one are averaged together as if they were the same day.",
      needs: "Per-shot environmentals, or enough sessions to model the correction.",
    },
  ];

  /* Writing data/bag.json did not answer this question, it created it. Before
   * the file existed there was no loft to be wrong about; now every gap in
   * degrees on the bag page rests on a spec sheet nobody has checked against
   * the clubs in the garage. */
  if (bag && bag.clubs.length > 0) {
    const lofts = bag.clubs.filter((c) => c.loftDeg !== undefined);
    const verified = lofts.filter((c) => c.loftDeg?.verified).length;
    unknowns.push({
      id: "loft-unverified",
      question: "Are the lofts on this page the lofts in the bag?",
      why:
        `${lofts.length} clubs carry a loft and ${verified} of them have been verified. ` +
        "Every number is what the club left the factory as: the driver's sleeve is " +
        "adjustable and its setting has never been read, irons bend a degree in a " +
        "car boot, and a wedge is ground to order. Any finding below that compares " +
        "degrees is comparing spec sheets, not clubs.",
      needs: "One session on a loft-and-lie gauge, then `verified: true` in data/bag.json.",
    });
  }

  if (history) {
    /* "Is the golf getting better?" retired 2026-08-15: the round snapshot
     * carries dates, so the answer is a finding now (see `trajectory`). */
    if (!roundHistory) {
      unknowns.push({
        id: "round-dates",
        question: "Is the golf getting better?",
        why:
          "The course snapshot carries an average per layout, not a round-by-round history " +
          "with dates, so nothing here can be plotted against time or against a practice session.",
        needs: "Round-level scores with dates — `pnpm ingest:rounds`, run inside the mackenzie repo.",
      });
    }
    unknowns.push({
      id: "par-and-tees",
      question: "Is a score of 88 good on this course?",
      why: roundHistory
        ? "The rounds carry a course, a tee name and a differential, but still no par or " +
          "yardage per layout, so a raw score is only comparable through the handicap math, " +
          "never on the card's own terms."
        : "The snapshot has no par, no yardage and no tee for any layout, so every average " +
          "is compared against every other average as though all 18-hole golf were equal.",
      needs: roundHistory
        ? "Par and rating/slope per tee. The export's get_course_data calls came back empty " +
          "for guessed tee ids — the real tee ids the scorecard page loads by JS are the missing key."
        : "Par and rating/slope per layout, which The Grint has and the paste did not carry.",
    });
  } else {
    unknowns.push({
      id: "no-course-half",
      question: "What does any of this do to a score?",
      why: "The course history has not been snapshotted, so this profile is the range half only.",
      needs: "`pnpm ingest:courses`, run inside the mackenzie repo.",
    });
  }

  return unknowns;
}
