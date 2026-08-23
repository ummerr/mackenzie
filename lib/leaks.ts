/* Where the score leaks, ranked by what each leak costs — the engine behind
 * what /scratch used to say in five hand-written blocks.
 *
 * This answers a different question than lib/tasks.ts and must not merge with
 * it: tasks rank by information gain (what to measure next), leaks rank by
 * strokes (where the score goes). A leak's `move` line joins the two — it
 * names the open task that addresses the leak, computed on render, so the
 * diagnosis points at the prescription without a frozen sentence going stale
 * the way "the 31-yd 5i–6i hole" once did.
 *
 * Ranking, stated once: a leak the record can price is ranked by that price in
 * strokes per round; a leak that is unknown by construction is ranked by how
 * much of the record backs the claim that it exists. Priced leaks outrank
 * unpriced ones — a known cost beats a suspected one. Same spirit as
 * Finding.weight: how much of the record agrees, never how bad it sounds.
 */

import {
  GARMIN_THRESHOLDS,
  shotRounds,
  strokeCategorySplit,
  type GarminShots,
} from "./garmin-shots";
import {
  asOf,
  eighteenHole,
  fairwaySplit,
  mean,
  puttsPerRound,
  since,
  threePuttShare,
  yearlyMeans,
  type RoundHistory,
} from "./round-history";
import type { ClubProfile } from "./stats";
import type { Task } from "./tasks";

/** Which record(s) put the leak on the list — printed beside it. */
export type LeakSource = "scorecards" | "scorecards + range" | "scorecards + watch";

export interface Leak {
  id: string;
  title: string;
  /** The numbers from the record that put this leak on the list. */
  fact: string;
  /** What the leak costs — in strokes where the record can price it, and
   *  said to be unknown where it cannot, because that is itself a finding. */
  cost: string;
  /** The work that addresses it, joined to the open practice task where one
   *  exists. */
  move: string;
  /** The condition that takes it off the list. */
  retiredWhen: string;
  source: LeakSource;
  /** Strokes per round the record can attribute — null when the cost is
   *  unknown by construction. */
  costStrokes: number | null;
  /** Share of the record behind the claim (0..1). */
  coverage: number;
  /** `costStrokes` for priced leaks, `coverage` for unpriced ones — the
   *  number each tier is ranked by. */
  weight: number;
}

export interface LeakInputs {
  roundHistory: RoundHistory | null;
  garminShots: GarminShots | null;
  /** The carry-basis bag, for the clubs the leak implicates. */
  profiles: ClubProfile[];
  /** The ranked practice list, for the `move` joins. */
  tasks: Task[];
  /** The recent window every claim on the site uses — the caller passes
   *  PROFILE_THRESHOLDS.recentMonths, because importing profile.ts here
   *  would cycle (profile.ts calls buildLeaks). */
  recentMonths: number;
}

const f1 = (n: number) => n.toFixed(1);

/** First open task matching any of the given predicates, in list order —
 *  the list is already ranked, so first match is the top fix. */
function topTask(tasks: Task[], match: (t: Task) => boolean): Task | null {
  return tasks.find((t) => !t.done && match(t)) ?? null;
}

/** Editorial targets for the retire lines — chosen numbers, not benchmarks
 *  against any other golfer, same rule as PROFILE_THRESHOLDS. */
export const LEAK_TARGETS = {
  /** Greens a round, sustained, that would lift the ceiling. */
  girPerRound: 9,
  /** Rounds behind the retire lines that say "sustained". */
  sustainRounds: 20,
  /** A three-putt every this-many holes or better retires the putting leak. */
  threePuttHoles: 10,
} as const;

export function buildLeaks({
  roundHistory: h,
  garminShots,
  profiles,
  tasks,
  recentMonths,
}: LeakInputs): Leak[] {
  /* No scorecards, no leaks: every cost here is priced against the round
   * record, and a leak without a record behind it is just a worry. */
  if (h === null || h.rounds.length === 0) return [];

  const leaks: Leak[] = [];
  const scored = eighteenHole(h);

  const gir = h.series?.girPerRound.map((p) => p.value) ?? [];
  const girMean = mean(gir);
  const girLast20 = gir.length >= 20 ? mean(gir.slice(-20)) : null;
  const saves = h.series?.parSavesPct.map((p) => p.value) ?? [];
  const savesMean = mean(saves);

  /* ── 01 · the approach ceiling ─────────────────────────────────────────── */
  if (girMean !== null) {
    const missed = 18 - girMean;
    const cost = savesMean === null ? null : missed * (1 - savesMean / 100);
    const fix = topTask(
      tasks,
      (t) => t.category === "gapping" || t.category === "blind spot" || t.category === "coverage",
    );
    leaks.push({
      id: "gir-ceiling",
      title: `The approach game caps everything: ${f1(girMean)} greens a round`,
      fact:
        `${f1(girMean)} GIR per round career` +
        (girLast20 === null ? "" : `, ${f1(girLast20)} over the last 20`) +
        `; ~${Math.round(missed)} missed greens per round`,
      cost:
        cost === null
          ? "the structural ceiling — every missed green is a save the short game has to make before the putter or driver say anything"
          : `the structural ceiling — at a ${f1(savesMean as number)}% save rate, ~${Math.round(cost)} of those misses are bogey-or-worse before the putter or driver say anything`,
      move: fix
        ? `the approach clubs are the practice list's whole top end — first up: ${fix.title}`
        : "nothing open on the practice list — play, and let the capture say where the misses come from",
      retiredWhen: `a capture averaging ${LEAK_TARGETS.girPerRound}+ GIR over ${LEAK_TARGETS.sustainRounds} rounds`,
      source: "scorecards",
      costStrokes: cost,
      coverage: h.rounds.length ? Math.min(1, gir.length / h.rounds.length) : 0,
      weight: 0,
    });
  }

  /* ── 02 · the green gives it back ──────────────────────────────────────── */
  const withPutts = scored.filter((r) => r.putts !== null);
  const pp = puttsPerRound(withPutts);
  const tp = threePuttShare(h.rounds);
  if (pp !== null && withPutts.length > 0) {
    const perRound = tp.threePutts / withPutts.length;
    const bestPutts = Math.min(...withPutts.map((r) => r.putts as number));
    const fix = topTask(tasks, (t) => t.id === "three-putts" || t.id === "recent-putting");
    leaks.push({
      id: "putting-giveback",
      title: `The green gives back ${f1(perRound)} strokes a round`,
      fact:
        `${f1(pp)} putts per round; ${tp.threePutts} three-putts over ${tp.holes} recorded holes; ` +
        `own best round used ${bestPutts}`,
      cost:
        `~${f1(perRound)} strokes/round in three-putts alone; the gap between mean and own-best ` +
        `putting is ${f1(pp - bestPutts)} strokes`,
      move: fix
        ? `already on the practice list: ${fix.title}`
        : "the lag drill has retired from the practice list — the recent numbers say it worked; the sample says keep proving it",
      retiredWhen: `three-putts under one hole in ${LEAK_TARGETS.threePuttHoles}, sustained over a season`,
      source: "scorecards",
      costStrokes: perRound,
      coverage: scored.length ? withPutts.length / scored.length : 0,
      weight: 0,
    });
  }

  /* ── 03 · the unmeasured two-way tee ball ──────────────────────────────── */
  const fw = fairwaySplit(h.rounds);
  if (fw.classified > 0) {
    const t = fw.classified;
    const missedPct = Math.round(((fw.left + fw.right + fw.missed) / t) * 100);
    const driver = profiles.find((p) => p.club === "Driver");
    const driverN = driver?.n ?? 0;
    const fix = topTask(
      tasks,
      (t) => t.id.toLowerCase().includes("driver") || t.id === "screen-tee-miss",
    );
    leaks.push({
      id: "tee-unmeasured",
      title: "The tee ball is unmeasured and misses both ways",
      fact:
        `${missedPct}% of fairways missed, split ${Math.round((fw.left / t) * 100)}/${Math.round((fw.right / t) * 100)} left/right; ` +
        `the driver has ${driverN === 1 ? "one launch-monitor swing" : `${driverN} launch-monitor swings`} on file`,
      cost: "unknown by construction — a two-way miss can't be aimed off, and an unmeasured club can't be diagnosed",
      move: fix
        ? `on the practice list: ${fix.title}`
        : "fifteen measured drivers; until then every tee-ball theory is a guess wearing a number",
      retiredWhen: "the driver drawn on the bag page, and one side owning two-thirds of the misses",
      source: "scorecards + range",
      costStrokes: null,
      coverage: fw.classified / (fw.classified + fw.unclassified || 1),
      weight: 0,
    });
  }

  /* ── 04 · the sample the story rests on ────────────────────────────────── */
  const newest = asOf(h.rounds);
  if (newest !== null) {
    const months = recentMonths;
    const recent = since(h.rounds, months, newest).length;
    const years = yearlyMeans(scored);
    const peak = years.reduce((a, b) => (b.rounds > a.rounds ? b : a), years[0]);
    leaks.push({
      id: "thin-sample",
      title: `${recent} rounds in the last ${months} months`,
      fact: `${peak.rounds} rounds in ${peak.year} → ${recent} in the last ${months} months`,
      cost: "not strokes — proof. Every encouraging recent number rests on a sample one trip could overturn",
      move: `the cheapest fix on this list: play. ${LEAK_TARGETS.sustainRounds} rounds makes every other line here trustworthy`,
      retiredWhen: `a season with ${LEAK_TARGETS.sustainRounds}+ posted rounds`,
      source: "scorecards",
      costStrokes: null,
      coverage: Math.min(1, recent / LEAK_TARGETS.sustainRounds),
      weight: 0,
    });
  }

  /* ── 05 · the short game, from invisible to half-heard ─────────────────── */
  const bearing = garminShots === null ? [] : shotRounds(garminShots);
  if (savesMean !== null) {
    const gate = GARMIN_THRESHOLDS.minShotRounds;
    if (bearing.length >= gate) {
      /* The watch has heard enough rounds for the split to be a claim — the
       * leak is no longer invisible, it is located to a share. */
      const split = strokeCategorySplit(bearing);
      const sharePct = split.shots ? Math.round((split.shortGame / split.shots) * 100) : 0;
      leaks.push({
        id: "short-game",
        title: "The short game, located",
        fact:
          `par saved on ${f1(savesMean)}% of missed greens; the watch heard ${split.shortGame} ` +
          `short-game shots — ${sharePct}% of ${split.shots} recorded shots — across ${bearing.length} rounds`,
        cost: `every unsaved miss is a stroke; the save rate prices the approach leak above, and the watch now says where the saves die`,
        move: "keep wearing the watch — the split now retires or confirms itself round by round",
        retiredWhen: "par saved on a third of missed greens, sustained over a season",
        source: "scorecards + watch",
        costStrokes: null,
        coverage: split.strokes ? split.shots / split.strokes : 0,
        weight: 0,
      });
    } else {
      const short = gate - bearing.length;
      leaks.push({
        id: "short-game",
        title: "The invisible 60 yards",
        fact:
          `par saved on ${f1(savesMean)}% of missed greens; ` +
          (bearing.length === 0
            ? "no shot between fairway and green is recorded anywhere"
            : `${bearing.length} round${bearing.length === 1 ? "" : "s"} of AutoShot shot data exist, ${short} short of a claim`),
        cost: "unknown — which is the finding. The scramble rate says the leak exists; nothing on file locates it",
        move:
          bearing.length === 0
            ? "a hand-kept ups-and-downs card for ten rounds would locate it for the price of a pencil"
            : `keep wearing the watch: ${short} more shot-bearing round${short === 1 ? "" : "s"} and the short-game split becomes a finding instead of a guess`,
        retiredWhen: `${gate} shot-bearing rounds on the watch, or any hand-kept short-game card`,
        source: bearing.length === 0 ? "scorecards" : "scorecards + watch",
        costStrokes: null,
        coverage: bearing.length / gate,
        weight: 0,
      });
    }
  }

  /* Priced leaks first, by price; then the unpriced, by how much of the
   * record says they exist. */
  for (const l of leaks) l.weight = l.costStrokes ?? l.coverage;
  leaks.sort((a, b) => {
    const at = a.costStrokes === null ? 1 : 0;
    const bt = b.costStrokes === null ? 1 : 0;
    if (at !== bt) return at - bt;
    return b.weight - a.weight;
  });
  return leaks;
}
