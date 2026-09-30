/* Weekly goals: the one asserted intent file, measured by the record.
 *
 * lib/tasks.ts refuses hand-written goals for a good reason — a static list
 * goes on claiming things the data has disproved. This file is the narrow
 * exception that keeps the rule: data/goals.json asserts only INTENT ("this
 * week I am working on X toward Y"), which no ledger can know, and everything
 * about how the week is going is derived from the record through the metric
 * registry below. The engine proposes (scripts/propose-goals.ts, from the
 * plan's ledger — the next round's doubles, greens, up-and-downs; never a
 * range-data goal, since 2026-09-29); the human commits — the round-links
 * pattern applied to intent.
 *
 * Time is record time, never wall time. A goal week is measured against the
 * newest capture (`asOf`), so `pnpm profile --check` reads the same on any
 * machine on any day: a week is "open" until the record outruns it, then
 * "achieved" or "missed" by what the record says — a status that can only
 * change when a capture lands, which is the point.
 *
 * Malformed or orphaned entries render as their own state and never crash a
 * page: the file is hand-edited, and absence-of-sense is a state too.
 */

import { approachBands } from "./approach";
import { doublesPerRound, holeViews, troublesomeTees, upAndDowns, type Break80 } from "./break80";
import { asOfGarmin, GARMIN_THRESHOLDS, shotRounds, type GarminShots } from "./garmin-shots";
import { LEAK_TARGETS, type Leak } from "./leaks";
import { parsFor, type ParIndex } from "./pars";
import {
  asOf,
  eighteenHole,
  lastNDistinct,
  mean,
  since,
  type PlayedRound,
  type RoundHistory,
} from "./round-history";
import { MIN_SHOTS_TO_DISPLAY, type ClubProfile } from "./stats";
import { isKnownTaskId, type Task } from "./tasks";
import { WEDGE_MATRIX_THRESHOLDS, type WedgeMatrix } from "./wedge-matrix";

/* ── the asserted file ────────────────────────────────────────────────────── */

export interface GoalEntry {
  id: string;
  /** Which metric measures the week — a key of METRICS. */
  metricId: string;
  /** The number to reach (direction comes from the metric). */
  target: number;
  /** For club-scoped metrics (usable-shots): which club. */
  club?: string;
  /** The leak this goal answers, joined for display; optional. */
  leakId?: string;
  /** The task this goal executes, joined for display; optional. */
  taskId?: string;
  note?: string;
}

export interface GoalWeek {
  /** YYYY-MM-DD — the day the week starts; it runs 7 days. */
  weekOf: string;
  goals: GoalEntry[];
}

export interface GoalsFile {
  weeks: GoalWeek[];
}

/** Validate an unknown parse into a GoalsFile. Throws on a shape that cannot
 *  be read at all (not JSON-object-shaped); entry-level nonsense survives to
 *  render as `invalid` — a hand-edited file's typo is a state, not a crash. */
export function parseGoalsFile(raw: unknown): GoalsFile {
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as GoalsFile).weeks)) {
    throw new Error("goals.json must be an object with a weeks array");
  }
  const weeks = (raw as { weeks: unknown[] }).weeks
    .filter((w): w is GoalWeek => {
      const week = w as GoalWeek;
      return (
        typeof week === "object" &&
        week !== null &&
        typeof week.weekOf === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(week.weekOf) &&
        Array.isArray(week.goals)
      );
    })
    .sort((a, b) => a.weekOf.localeCompare(b.weekOf));
  return { weeks };
}

/* ── the metric registry ──────────────────────────────────────────────────── */

export interface GoalInputs {
  roundHistory: RoundHistory | null;
  garminShots: GarminShots | null;
  profiles: ClubProfile[];
  wedgeMatrix: WedgeMatrix | null;
  leaks: Leak[];
  tasks: Task[];
  /** The recent window every claim on the site uses — passed in, because
   *  importing profile.ts here would cycle (profile.ts carries goals). */
  recentMonths: number;
  /** Par per Grint round, known only through the confirmed links. */
  pars: ParIndex;
  /** Garmin scorecardId → the Grint card, confirmed links only. */
  linked: Map<string, PlayedRound>;
  /** The plan the week is drawn from; null when the caller has none. */
  plan: Break80 | null;
}

/** The week a goal belongs to — the next-round metrics read the first
 *  eligible round dated inside it. */
export interface MetricContext {
  weekOf: string;
  /** First day the week no longer contains. */
  weekEnd: string;
}

export interface MetricValue {
  value: number | null;
  /** Sample behind the value — rounds, holes, shots, cells. */
  n: number;
  unit: string;
}

interface MetricDef {
  label: string;
  unit: string;
  /** Which way is better — the side of `target` that means achieved. */
  direction: "up" | "down";
  /** True when the metric needs a `club` on the goal entry. */
  needsClub?: boolean;
  /** True for a metric read off the first round played in the goal's week:
   *  null until a round lands, and a week that ends without one is
   *  "unplayed", not "missed". */
  nextRound?: boolean;
  compute: (inp: GoalInputs, club: string | null, ctx: MetricContext) => MetricValue;
}

const LAST_N = 20;

/* ── the next round ───────────────────────────────────────────────────────
 *
 * The first full 18-hole card dated inside the week — the first, not the
 * newest, so a second round cannot rescue the first. Each metric says what
 * else it needs: par (through a link), putts (a full card), or the watch
 * (a linked shot-bearing round). A round that lacks it is not eligible. */

interface NextRound {
  card: PlayedRound;
  pars: number[] | null;
  /** The watch's hole views for this card, when it is linked and heard. */
  views: ReturnType<typeof holeViews>;
}

function nextRound(inp: GoalInputs, ctx: MetricContext, need: "par" | "putts" | "watch"): NextRound | null {
  if (!inp.roundHistory) return null;
  const inWeek = inp.roundHistory.rounds
    .filter((r) => r.date >= ctx.weekOf && r.date < ctx.weekEnd && r.entry === "full" && r.holes === 18)
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const card of inWeek) {
    const pars = parsFor(inp.pars, card);
    let views: ReturnType<typeof holeViews> = [];
    if (inp.garminShots) {
      const scorecardId = [...inp.linked].find(([, r]) => r.roundId === card.roundId)?.[0] ?? null;
      const gr = scorecardId ? inp.garminShots.rounds.find((r) => r.scorecardId === scorecardId) : null;
      if (gr && gr.shotCount > 0) {
        views = holeViews({ ...inp.garminShots, rounds: [gr] }, inp.linked);
      }
    }
    if (need === "par" && (pars === null || card.holeStrokes === null)) continue;
    if (need === "putts" && card.holePutts === null) continue;
    if (need === "watch" && views.length === 0) continue;
    return { card, pars, views };
  }
  return null;
}

export const METRICS: Record<string, MetricDef> = {
  "gir-last-20": {
    label: `greens in regulation, last ${LAST_N} charted rounds`,
    unit: "greens/round",
    direction: "up",
    compute: ({ roundHistory }) => {
      const pts = roundHistory?.series?.girPerRound ?? [];
      const tail = pts.slice(-LAST_N).map((p) => p.value);
      return { value: mean(tail), n: tail.length, unit: "rounds" };
    },
  },
  "par3-hit-last-20": {
    label: `par-3 greens hit, last ${LAST_N} charted rounds`,
    unit: "%",
    direction: "up",
    compute: ({ roundHistory }) => {
      const pts = roundHistory?.series?.par3HitPct ?? [];
      const tail = pts.slice(-LAST_N).map((p) => p.value);
      return { value: mean(tail), n: tail.length, unit: "rounds" };
    },
  },
  "three-putt-share-last-20": {
    label: `holes three-putted, last ${LAST_N} putted rounds`,
    unit: "%",
    direction: "down",
    compute: ({ roundHistory }) => {
      if (!roundHistory) return { value: null, n: 0, unit: "holes" };
      const withPutts = eighteenHole(roundHistory).filter((r) => r.holePutts !== null);
      let holes = 0;
      let three = 0;
      for (const r of lastNDistinct(withPutts, LAST_N)) {
        for (const p of r.holePutts ?? []) {
          if (p === null) continue;
          holes += 1;
          if (p >= 3) three += 1;
        }
      }
      return { value: holes ? (three / holes) * 100 : null, n: holes, unit: "holes" };
    },
  },
  "rounds-in-window": {
    label: "rounds posted in the recent window",
    unit: "rounds",
    direction: "up",
    compute: ({ roundHistory, recentMonths }) => {
      if (!roundHistory) return { value: null, n: 0, unit: "rounds" };
      const newest = asOf(roundHistory.rounds);
      const n = newest ? since(roundHistory.rounds, recentMonths, newest).length : 0;
      return { value: n, n, unit: "rounds" };
    },
  },
  "shot-bearing-rounds": {
    label: `rounds the watch has heard (findings switch on at ${GARMIN_THRESHOLDS.minShotRounds})`,
    unit: "rounds",
    direction: "up",
    compute: ({ garminShots }) => {
      const n = garminShots ? shotRounds(garminShots).length : 0;
      return { value: garminShots ? n : null, n, unit: "rounds" };
    },
  },
  "inside-150-green-rate": {
    label: "approaches inside 150 yd finding the green, on the course",
    unit: "%",
    direction: "up",
    compute: ({ garminShots }) => {
      const inside = approachBands(garminShots)?.course.inside150;
      return {
        value: inside?.greenHitPct ?? null,
        n: inside?.attempts ?? 0,
        unit: "approaches",
      };
    },
  },
  "usable-shots": {
    label: "usable shots on file with the club",
    unit: "shots",
    direction: "up",
    needsClub: true,
    compute: ({ profiles }, club) => {
      if (club === null) return { value: null, n: 0, unit: "shots" };
      const p = profiles.find((x) => x.club === club);
      return { value: p?.n ?? 0, n: p?.n ?? 0, unit: "shots" };
    },
  },
  "next-round-doubles": {
    label: "doubles or worse in the week's first round",
    unit: "holes",
    direction: "down",
    nextRound: true,
    compute: (inp, _club, ctx) => {
      const r = nextRound(inp, ctx, "par");
      if (!r) return { value: null, n: 0, unit: "holes" };
      const pars = r.pars as number[];
      let doubles = 0;
      let holes = 0;
      (r.card.holeStrokes as (number | null)[]).forEach((s, i) => {
        if (s === null) return;
        holes++;
        if (s - pars[i] >= 2) doubles++;
      });
      return { value: doubles, n: holes, unit: "holes" };
    },
  },
  "next-round-gir": {
    label: "greens in regulation in the week's first round",
    unit: "greens",
    direction: "up",
    nextRound: true,
    compute: (inp, _club, ctx) => {
      // Arithmetic GIR: strokes − putts ≤ par − 2. A holed chip counts as a
      // green; the definition is printed with the number.
      const r = nextRound(inp, ctx, "par");
      if (!r || r.card.holePutts === null) return { value: null, n: 0, unit: "holes" };
      const pars = r.pars as number[];
      let gir = 0;
      let holes = 0;
      (r.card.holeStrokes as (number | null)[]).forEach((s, i) => {
        const p = (r.card.holePutts as (number | null)[])[i];
        if (s === null || p === null) return;
        holes++;
        if (s - p <= pars[i] - 2) gir++;
      });
      return { value: gir, n: holes, unit: "holes" };
    },
  },
  "next-round-three-putts": {
    label: "three-putts in the week's first round",
    unit: "holes",
    direction: "down",
    nextRound: true,
    compute: (inp, _club, ctx) => {
      const r = nextRound(inp, ctx, "putts");
      if (!r) return { value: null, n: 0, unit: "holes" };
      let three = 0;
      let holes = 0;
      for (const p of r.card.holePutts as (number | null)[]) {
        if (p === null) continue;
        holes++;
        if (p >= 3) three++;
      }
      return { value: three, n: holes, unit: "holes" };
    },
  },
  "next-round-up-and-downs": {
    label: "up-and-downs in the week's first watch round",
    unit: "holes",
    direction: "up",
    nextRound: true,
    compute: (inp, _club, ctx) => {
      const r = nextRound(inp, ctx, "watch");
      if (!r) return { value: null, n: 0, unit: "chances" };
      const ud = upAndDowns(r.views);
      return { value: ud.made, n: ud.chances, unit: "chances" };
    },
  },
  "next-round-troublesome-tees": {
    label: "troublesome tee balls in the week's first watch round",
    unit: "tee shots",
    direction: "down",
    nextRound: true,
    compute: (inp, _club, ctx) => {
      const r = nextRound(inp, ctx, "watch");
      if (!r) return { value: null, n: 0, unit: "tee shots" };
      const t = troublesomeTees(r.views);
      return { value: t.troublesome, n: t.teeShots, unit: "tee shots" };
    },
  },
  "measured-wedge-cells": {
    label: "partial-wedge cells measured as labeled blocks",
    unit: "cells",
    direction: "up",
    compute: ({ wedgeMatrix }) => {
      if (!wedgeMatrix) return { value: null, n: 0, unit: "cells" };
      const lit = wedgeMatrix.cells.filter(
        (c) =>
          c.source === "blocks" && c.active >= WEDGE_MATRIX_THRESHOLDS.minShotsPerCell,
      ).length;
      return { value: lit, n: wedgeMatrix.cells.length, unit: "cells" };
    },
  },
};

/* ── proposals: a leak or task, translated to its own retire line ─────────── */

export interface GoalProposal {
  metricId: string;
  target: number;
  club?: string;
  leakId?: string;
  taskId?: string;
  why: string;
}

/** The metric + target a leak's own retire line names. The command center
 *  uses this to print "now → target" beside a leak; `pnpm goals:propose`
 *  uses it to draft the week. Null for a leak no metric measures yet. */
export function proposalForLeak(leak: Leak): GoalProposal | null {
  switch (leak.id) {
    case "gir-ceiling":
      return {
        metricId: "gir-last-20",
        target: LEAK_TARGETS.girPerRound,
        leakId: leak.id,
        why: leak.title,
      };
    case "putting-giveback":
      return {
        metricId: "three-putt-share-last-20",
        target: 100 / LEAK_TARGETS.threePuttHoles,
        leakId: leak.id,
        why: leak.title,
      };
    case "thin-sample":
      return {
        metricId: "rounds-in-window",
        target: LEAK_TARGETS.sustainRounds,
        leakId: leak.id,
        why: leak.title,
      };
    case "short-game":
      return {
        metricId: "shot-bearing-rounds",
        target: GARMIN_THRESHOLDS.minShotRounds,
        leakId: leak.id,
        why: leak.title,
      };
    case "tee-unmeasured":
      return {
        metricId: "usable-shots",
        club: "Driver",
        target: MIN_SHOTS_TO_DISPLAY,
        leakId: leak.id,
        why: leak.title,
      };
    default:
      return null;
  }
}

/** The top open task, translated the same way. Range-measurement tasks map
 *  to usable-shots on their club; wedge blocks to measured cells; putting
 *  tasks to the three-putt share. A task with no metric yet returns null
 *  rather than a guessed number. */
export function proposalForTask(task: Task, measuredWedgeCells: number): GoalProposal | null {
  const club = (prefix: string) =>
    task.id.startsWith(prefix) ? task.id.slice(prefix.length) : null;
  const unrecorded = club("unrecorded-") ?? club("coverage-");
  if (unrecorded !== null) {
    return {
      metricId: "usable-shots",
      club: unrecorded,
      target: MIN_SHOTS_TO_DISPLAY,
      taskId: task.id,
      why: task.title,
    };
  }
  if (task.id === "wedge-matrix-empty" || task.id.startsWith("wedge-cell-")) {
    return {
      metricId: "measured-wedge-cells",
      target: measuredWedgeCells + 1,
      taskId: task.id,
      why: task.title,
    };
  }
  if (task.id === "three-putts" || task.id === "recent-putting") {
    return {
      metricId: "three-putt-share-last-20",
      target: 100 / LEAK_TARGETS.threePuttHoles,
      taskId: task.id,
      why: task.title,
    };
  }
  return null;
}

/* ── proposals from the plan ──────────────────────────────────────────────── */

/** The week the plan proposes: the two biggest priced areas as next-round
 *  targets, then the doubles line. Never a range-data goal — a club
 *  measured at a monitor is a number on the bag page, not a stroke. */
export function proposalForPlan(plan: Break80): GoalProposal[] {
  const out: GoalProposal[] = [];
  const priced = plan.ledger.filter((o) => o.id !== "doubles" && o.strokes !== null).slice(0, 2);
  for (const o of priced) {
    switch (o.id) {
      case "short-game": {
        const chances = plan.ledger.find((x) => x.id === "short-game")?.yours.n ?? 0;
        const perRound = plan.yours.linkedRounds ? chances / plan.yours.linkedRounds : 6;
        const rate = (o.bench13?.value ?? 35) / 100;
        out.push({
          metricId: "next-round-up-and-downs",
          target: Math.max(1, Math.ceil(perRound * rate)),
          why: `${o.label}: you get up and down ${o.yours.value ?? "—"}% of the time, a 13 index ${o.bench13?.value ?? "—"}%. ${o.move.course}`,
        });
        break;
      }
      case "approach":
        out.push({
          metricId: "next-round-gir",
          target: Math.round(o.bench13?.value ?? 5),
          why: `${o.label}: ${o.yours.value ?? "—"} greens a round, a 13 index ${o.bench13?.value ?? "—"}. ${o.move.course}`,
        });
        break;
      case "putting":
        out.push({
          metricId: "next-round-three-putts",
          target: 1,
          why: `${o.label}: ${o.yours.value ?? "—"}% of holes three-putted, a 5 index ${o.bench5?.value ?? "—"}%. ${o.move.course}`,
        });
        break;
      case "tee":
        out.push({
          metricId: "next-round-troublesome-tees",
          target: Math.round(o.bench5?.value ?? 2),
          why: `${o.label}: ${o.yours.value ?? "—"} a round, a 70s scorer ${o.bench5?.value ?? "—"}. ${o.move.course}`,
        });
        break;
      default:
        break;
    }
  }
  const dbl = plan.ledger.find((o) => o.id === "doubles");
  out.push({
    metricId: "next-round-doubles",
    target: 2,
    why: `${dbl?.label ?? "Doubles or worse"}: ${dbl?.yours.value ?? "—"} a round, a 5 index ${dbl?.bench5?.value ?? "—"}. Bogey is fine; the second dropped stroke is the one to refuse.`,
  });
  return out;
}

/* ── progress, in record time ─────────────────────────────────────────────── */

/** `unplayed`: a next-round goal whose week ended with no eligible round —
 *  neither achieved nor missed, and left out of the n/m tally. */
export type GoalStatus = "achieved" | "open" | "missed" | "unplayed" | "invalid";

export interface GoalProgress {
  goal: GoalEntry;
  status: GoalStatus;
  /** The metric's printable label, or the reason the entry is invalid. */
  label: string;
  unit: string;
  direction: "up" | "down";
  value: number | null;
  /** Sample behind the value, with its own unit. */
  sample: { n: number; unit: string } | null;
  /** Set when leakId/taskId no longer resolves — the reference retired or
   *  was renamed; the goal still measures, the join is just gone. */
  orphaned: string | null;
}

export interface WeekProgress {
  weekOf: string;
  /** First day the week no longer contains — weekOf + 7 days. */
  weekEnd: string;
  /** True once the record's asOf has reached weekEnd. */
  over: boolean;
  goals: GoalProgress[];
}

export interface GoalsProgress {
  weeks: WeekProgress[];
  /** The newest committed week — the command center's "this week". Position,
   *  not the clock, decides: the file is append-only by convention. */
  latest: WeekProgress | null;
  /** Newest capture date across the records — the clock goals run on. */
  asOf: string | null;
}

/** date + n days in pure UTC arithmetic — no local timezone anywhere. */
export function daysAfter(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function progressOf(goal: GoalEntry, inp: GoalInputs, over: boolean, ctx: MetricContext): GoalProgress {
  const metric = typeof goal.metricId === "string" ? METRICS[goal.metricId] : undefined;
  if (!metric || typeof goal.target !== "number" || (metric.needsClub && !goal.club)) {
    return {
      goal,
      status: "invalid",
      label: !metric
        ? `unknown metric "${String(goal.metricId)}"`
        : typeof goal.target !== "number"
          ? "target is not a number"
          : `metric "${goal.metricId}" needs a club`,
      unit: metric?.unit ?? "",
      direction: metric?.direction ?? "up",
      value: null,
      sample: null,
      orphaned: null,
    };
  }
  const { value, n, unit } = metric.compute(inp, goal.club ?? null, ctx);
  const met =
    value !== null && (metric.direction === "up" ? value >= goal.target : value <= goal.target);
  const status: GoalStatus = met
    ? "achieved"
    : !over
      ? "open"
      : metric.nextRound && value === null
        ? "unplayed"
        : "missed";
  const orphaned =
    goal.leakId && !inp.leaks.some((l) => l.id === goal.leakId)
      ? `leak "${goal.leakId}" is no longer on the list — retired, or renamed`
      : goal.taskId && !isKnownTaskId(goal.taskId)
        ? `task id "${goal.taskId}" is not one the engine can emit`
        : null;
  return {
    goal,
    status,
    label: metric.label + (goal.club ? ` — ${goal.club}` : ""),
    unit: metric.unit,
    direction: metric.direction,
    value,
    sample: { n, unit },
    orphaned,
  };
}

export function buildGoalProgress(file: GoalsFile | null, inp: GoalInputs): GoalsProgress {
  const recordAsOf = [
    inp.roundHistory ? asOf(inp.roundHistory.rounds) : null,
    inp.garminShots ? asOfGarmin(inp.garminShots) : null,
  ]
    .filter((d): d is string => d !== null)
    .sort()
    .pop() ?? null;

  const weeks = (file?.weeks ?? []).map((w): WeekProgress => {
    const weekEnd = daysAfter(w.weekOf, 7);
    const over = recordAsOf !== null && recordAsOf >= weekEnd;
    return {
      weekOf: w.weekOf,
      weekEnd,
      over,
      goals: w.goals.map((g) => progressOf(g, inp, over, { weekOf: w.weekOf, weekEnd })),
    };
  });

  return {
    weeks,
    latest: weeks.length ? weeks[weeks.length - 1] : null,
    asOf: recordAsOf,
  };
}
