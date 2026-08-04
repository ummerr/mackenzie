/* Practice tasks, derived from the ledger — never a hand-written checklist.
 *
 * A static list of goals is wrong the moment you hit balls, and worse, it goes
 * on claiming things the data has already disproved. Everything here is
 * computed from the same profiles the bag chart draws, carries the numbers that
 * justify it, and knows the condition that retires it. Hit the shots and the
 * task ticks itself off on the next `pnpm ingest`.
 *
 * ── Priority is information gain, not effort ────────────────────────────────
 *
 * The ordering below encodes a mistake worth not repeating. Asked what to hit
 * at the range, the obvious answer is "top up whatever is closest to the
 * display threshold" — cheapest shots per club unlocked. That is wrong. A club
 * with four shots is not a noisy measurement, it is a BLIND SPOT: `detectGaps`
 * cannot compare against a club that isn't there, so whatever sits beside it is
 * invisible too. A 30-shot wedge session found a 23.9 yd hole that four
 * sessions of irons never could.
 *
 * So: unmeasured ranks above under-measured, which ranks above biased, which
 * ranks above a problem already confirmed. Confirming something you already
 * know is the least valuable thing you can do with a bucket of balls.
 *
 * ── Always carry, never total ───────────────────────────────────────────────
 *
 * The bag chart lets you read the bag to either distance. This list does not,
 * and should not: every task here is about a swing you have or have not
 * measured, and a swing is measured at the point of landing. Rollout is the
 * turf's contribution, it differs by six yards a club between a wedge and a
 * mid-iron on this ledger, and no amount of range work changes it. Ranking
 * practice by a number the range mat decides would put the wedges at the top of
 * the list for reasons that have nothing to do with how they were struck.
 */

import { clubSpec, startsAHole, type BagSpec } from "./clubs";
import type { LedgerSession, LedgerShot } from "./ledger";
import {
  bagCoverage,
  bagRank,
  coverageGaps,
  MIN_SHOTS_TO_DISPLAY,
  sortByBag,
  type ClubProfile,
  type Gap,
} from "./stats";
import { REVIEW_THRESHOLDS } from "./yardages/thresholds";

export type TaskCategory = "blind spot" | "coverage" | "consistency" | "data" | "gapping";

export interface Task {
  id: string;
  category: TaskCategory;
  title: string;
  /** The numbers from the ledger that put this task on the list. */
  evidence: string;
  /** What to actually do at the range. */
  action: string;
  /** The condition that retires it, stated so it can be checked by eye too. */
  doneWhen: string;
  priority: number;
  done: boolean;
}

/* Warmup costs 3 shots per club per session, and roughly one in eight of the
 * rest is excluded as a mishit, so a club needs meaningfully more raw swings
 * than the shortfall suggests. Rounding up is deliberate: coming back one shot
 * short means the club stays suppressed for another whole session. */
export function rawShotsNeeded(
  usableShortfall: number,
  warmupShots = REVIEW_THRESHOLDS.warmupShotsPerClub,
): number {
  if (usableShortfall <= 0) return 0;
  return Math.ceil(usableShortfall * 1.15) + warmupShots;
}

/* Editorial thresholds for the sentences below — where a loft difference is
 * worth naming, not where any measurement changes. */
const LOFT = {
  /** Two clubs this far apart in degrees were built to be different clubs. */
  builtApartDeg: 3,
};

/**
 * What the bag was BUILT to do, said beside what it actually does.
 *
 * This is the whole reason data/bag.json exists. Two clubs four degrees apart
 * carrying two yards apart is a delivery problem; two clubs one degree apart
 * carrying two yards apart is a bag problem, and the range cannot tell you
 * which because both look identical in the ledger. Returns "" when the bag has
 * no loft for one of them, and the task falls back to the sentence it used
 * before there was any loft data at all.
 */
function builtApart(g: Gap): string {
  if (g.loftGapDeg === null) return "";
  const deg = `${g.loftGapDeg.toFixed(1)}°`;
  if (!g.loftComparable) {
    return `The bag has them ${deg} apart, but across two different head types, so the degrees do not compare directly.`;
  }
  return g.loftGapDeg >= LOFT.builtApartDeg
    ? `The bag has them ${deg} apart, so they were built to be different clubs.`
    : `The bag has them only ${deg} apart, so they were barely built to be different clubs.`;
}

export interface TaskInput {
  profiles: ClubProfile[];
  gaps: Gap[];
  shots: LedgerShot[];
  sessions: LedgerSession[];
  minShots?: number;
  /** data/bag.json. Null when it has not been written; every bag task is then skipped. */
  bag?: BagSpec | null;
}

export function buildTasks({
  profiles,
  gaps,
  shots,
  sessions,
  minShots = MIN_SHOTS_TO_DISPLAY,
  bag = null,
}: TaskInput): Task[] {
  const tasks: Task[] = [];
  const shown = sortByBag(profiles.filter((p) => !p.suppressed));
  const longest = shown[0];

  // ── 0. clubs you own that the monitor has never seen ──────────────────────
  //
  // Above everything else, because it is the only blind spot the ledger cannot
  // see for itself. Every other task below starts from a club that appears in
  // an export; these clubs appear in the bag and nowhere else, so without
  // data/bag.json they produce no row, no dot, no gap flag and no task, and
  // the page looks finished.
  for (const club of bagCoverage(profiles, bag, minShots)?.neverRecorded ?? []) {
    const spec = clubSpec(bag, club);
    const named = [spec?.brand, spec?.model].filter(Boolean).join(" ");
    const loft = spec?.loftDeg;
    tasks.push({
      id: `unrecorded-${club}`,
      category: "blind spot",
      title: `The ${club} has never been measured`,
      evidence:
        `${named || club} is in the bag${loft ? ` at ${loft.value}°` : ""} and has not one shot ` +
        `on file across ${sessions.length} session${sessions.length === 1 ? "" : "s"}. ` +
        "Both gaps beside it are guesses about a club nobody has hit at a monitor.",
      action: `Hit ${rawShotsNeeded(minShots)} in one block, the same as any other club.`,
      doneWhen: `${minShots} usable shots with the ${club}.`,
      /* A club that starts a hole first: the gaps at the top of the bag are the
       * widest, so the same bucket of balls buys more yardage up there. */
      priority: 105 + (startsAHole(club) ? 5 : 0),
      done: false,
    });
  }

  // ── 1. blind spots: nothing measured at all above the longest club ────────
  // The top of the bag is where a missing club hides the most yardage, because
  // the gaps up there are the widest.
  if (longest?.medianDistanceYd != null) {
    const unmeasuredLonger = profiles.filter(
      (p) => p.suppressed && bagRank(p.club) < bagRank(longest.club),
    );
    if (unmeasuredLonger.length > 0) {
      const names = sortByBag(unmeasuredLonger).map((p) => p.club);
      tasks.push({
        id: "blind-spot-long",
        category: "blind spot",
        title: `Nothing is measured above ${longest.medianDistanceYd.toFixed(0)} yd`,
        evidence:
          `${longest.club} at ${longest.medianDistanceYd.toFixed(0)} yd is the longest club with enough data. ` +
          `${names.join(", ")} ${names.length === 1 ? "is" : "are"} in the ledger but below the threshold, ` +
          `so every gap above ${longest.medianDistanceYd.toFixed(0)} yd is invisible — not wide, invisible.`,
        action: `Hit 20 each of ${names.join(", ")}, plus anything else you carry longer than a ${longest.club}.`,
        doneWhen: `Every club longer than the ${longest.club} has ${minShots}+ usable shots.`,
        priority: 100,
        done: false,
      });
    }
  }

  // ── 2. coverage: clubs in the ledger but under the threshold ──────────────
  for (const p of profiles) {
    if (!p.suppressed) continue;
    const shortfall = minShots - p.active;
    const raw = rawShotsNeeded(shortfall);
    tasks.push({
      id: `coverage-${p.club}`,
      category: "coverage",
      title: `Measure the ${p.club}`,
      evidence:
        p.n === 0
          ? "No shots on file."
          : `${p.active} usable shot${p.active === 1 ? "" : "s"} of ${p.n} hit. ` +
            `Below ${minShots}, so it is suppressed and both gaps beside it read "not shown".`,
      action:
        `Hit about ${raw} in one block — ${shortfall} more usable, plus ` +
        `${REVIEW_THRESHOLDS.warmupShotsPerClub} warmup and a mishit or two.`,
      doneWhen: `${minShots} usable shots.`,
      // Cheaper clubs first: the same bucket of balls unlocks more of the bag.
      priority: 70 + Math.max(0, minShots - shortfall),
      done: false,
    });
  }

  // ── 3. consistency: a club pooled across sessions that disagree ───────────
  for (const p of profiles) {
    if (p.suppressed || (p.sessionSpreadYd ?? 0) <= 10) continue;
    tasks.push({
      id: `pooled-${p.club}`,
      category: "consistency",
      title: `Settle what the ${p.club} actually carries`,
      evidence:
        `Measured across ${p.sessions} sessions whose medians differ by ${p.sessionSpreadYd!.toFixed(1)} yd. ` +
        `Its band is partly day-to-day drift, so the median is an average of two different versions of you.`,
      action: `Hit 20 in a single session, full swings only, and don't mix partial shots into the block.`,
      doneWhen: "Two sessions agree within 10 yd.",
      priority: 50 + (p.sessionSpreadYd ?? 0),
      done: false,
    });
  }

  // ── 4. consistency: a club that starts well off line ──────────────────────
  for (const p of profiles) {
    if (p.suppressed || p.medianOfflineYd === null) continue;
    if (Math.abs(p.medianOfflineYd) < 8) continue;
    const side = p.medianOfflineYd > 0 ? "right" : "left";
    const band =
      p.offlineP10Yd !== null && p.offlineP90Yd !== null
        ? p.offlineP90Yd - p.offlineP10Yd
        : null;
    /* `sessions` counts any session the club appears in, including one with a
     * single shot in it. `sessionSpreadYd` is null unless at least two sessions
     * carry enough shots to have a meaningful median, so it is the honest test
     * of whether a bias has actually been seen twice. Counting a 4-shot block
     * as corroboration is how "one bad day" gets promoted to "a tendency". */
    const oneSession = p.sessions === 1 || p.sessionSpreadYd === null;
    tasks.push({
      id: `bias-${p.club}`,
      category: "consistency",
      title: `The ${p.club} finishes ${Math.abs(p.medianOfflineYd).toFixed(0)} yd ${side}`,
      evidence:
        `Median miss ${p.medianOfflineYd > 0 ? "+" : ""}${p.medianOfflineYd.toFixed(1)} yd` +
        // Phrased to avoid an indefinite article: "an 8 yd" and "a 38 yd" both
        // occur, and picking between them by leading digit is not worth a helper.
        (band === null ? "" : `, 80% band ${band.toFixed(0)} yd wide`) +
        (oneSession
          ? ` — but from a single session, so this may be one bad day rather than a tendency.`
          : ` across sessions that agree, so it is a tendency rather than a bad day.`),
      action: oneSession
        ? `Hit 20 more on a different day before reading anything into it.`
        : `Worth a lesson or a face-to-path check — the number is consistent enough to be real.`,
      doneWhen: oneSession
        ? "A second session confirms or clears it."
        : "Median miss inside 8 yd of the target line.",
      // An unconfirmed bias is a measurement task, not a swing task, and ranks
      // accordingly — chasing a one-session number is how you fix a problem
      // you never had.
      priority: oneSession ? 55 : 40 + Math.abs(p.medianOfflineYd),
      done: false,
    });
  }

  // ── 5. data: metrics the monitor failed to record ─────────────────────────
  // Club speed, smash, attack angle and path all fail together — they come from
  // the same club tracking. One cause, one fix, so one task rather than four
  // identical rows with different nouns in them.
  const clubDelivery = coverageGaps(shots).filter(
    (c) => c.field === "smashFactor" || c.field === "clubSpeedMph",
  );
  if (clubDelivery.length > 0) {
    const worst = clubDelivery.reduce((a, b) => (b.missing > a.missing ? b : a));
    tasks.push({
      id: "data-club-delivery",
      category: "data",
      title: `No club data on ${worst.missing} of ${worst.total} shots`,
      evidence:
        `${worst.sessions.map((s) => s.slice(0, 10)).join(", ")} recorded the ball but not the club — ` +
        `${clubDelivery.map((c) => c.label).join(" and ")} are both missing. ` +
        `Those shots skip the smash-based mishit test, so part of the ledger is filtered more loosely than the rest.`,
      action:
        "Check the club tracking sticker and the monitor's placement before the next session — club speed, smash, attack angle and path all depend on it.",
      doneWhen: "New sessions record club data.",
      priority: 45,
      done: false,
    });
  }

  // ── 6. gapping: problems already confirmed ────────────────────────────────
  for (const g of gaps) {
    if (g.suppressed || g.gapYd === null) continue;
    if (g.verdict === "hole") {
      tasks.push({
        id: `hole-${g.longer}-${g.shorter}`,
        category: "gapping",
        title: `${g.gapYd.toFixed(1)} yd hole between ${g.longer} and ${g.shorter}`,
        evidence: `Their medians are ${g.gapYd.toFixed(1)} yd apart. Any shot landing in that window needs a swing you have not measured.`,
        action: `Build a repeatable partial ${g.longer} for the middle of the gap, and measure it as its own block.`,
        doneWhen: "A measured shot type covers the middle of the window.",
        priority: 30 + Math.abs(g.gapYd),
        done: false,
      });
    }
    if (g.verdict === "overlap") {
      const built = builtApart(g);
      tasks.push({
        id: `overlap-${g.longer}-${g.shorter}`,
        category: "gapping",
        title: `${g.longer} and ${g.shorter} do the same job`,
        evidence:
          `Only ${g.gapYd.toFixed(1)} yd apart. One of the two is redundant, which is where a ` +
          `hole elsewhere in the bag comes from.` + (built ? ` ${built}` : ""),
        action:
          g.loftGapDeg === null
            ? `Check loft and shaft on both. On the range, hit them back to back and see whether the difference is real.`
            : g.loftGapDeg >= LOFT.builtApartDeg
              ? `The heads are not the problem — hit them back to back in one block and watch the strike on the ${g.longer}.`
              : `They were built to do nearly the same job. Hit them back to back, then decide which one leaves the bag.`,
        doneWhen: "The two sit more than 8 yd apart, or one leaves the bag.",
        priority: 20,
        done: false,
      });
    }
    if (g.verdict === "inverted") {
      const built = builtApart(g);
      tasks.push({
        id: `inverted-${g.longer}-${g.shorter}`,
        category: "gapping",
        title: `${g.longer} carries shorter than ${g.shorter}`,
        evidence:
          `${Math.abs(g.gapYd).toFixed(1)} yd the wrong way round. Either a strike problem with the ` +
          `longer club or a genuine equipment issue.` + (built ? ` ${built}` : ""),
        action:
          g.loftGapDeg !== null && g.loftComparable && g.loftGapDeg >= LOFT.builtApartDeg
            ? `Hit both in one block on the same day. If it holds with the lofts that far apart, it is the strike or the shaft, not the heads.`
            : `Hit both in one block on the same day. If it holds, get the lofts checked.`,
        doneWhen: "Bag order matches carry order.",
        priority: 65,
        done: false,
      });
    }
  }

  if (sessions.length === 0) return [];

  return tasks.sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title));
}
