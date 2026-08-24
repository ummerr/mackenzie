/* Weekly goals: the one asserted intent file, measured by the record.
 *
 * lib/tasks.ts refuses hand-written goals for a good reason — a static list
 * goes on claiming things the data has disproved. This file is the narrow
 * exception that keeps the rule: data/goals.json asserts only INTENT ("this
 * week I am working on X toward Y"), which no ledger can know, and everything
 * about how the week is going is derived from the record through the metric
 * registry below. The engine proposes (scripts/propose-goals.ts, from the
 * leaks and the open tasks); the human commits — the round-links pattern
 * applied to intent.
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
import { asOfGarmin, GARMIN_THRESHOLDS, shotRounds, type GarminShots } from "./garmin-shots";
import type { Leak } from "./leaks";
import {
  asOf,
  eighteenHole,
  lastNDistinct,
  mean,
  since,
  type RoundHistory,
} from "./round-history";
import type { ClubProfile } from "./stats";
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
  compute: (inp: GoalInputs, club: string | null) => MetricValue;
}

const LAST_N = 20;

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

/* ── progress, in record time ─────────────────────────────────────────────── */

export type GoalStatus = "achieved" | "open" | "missed" | "invalid";

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

function progressOf(goal: GoalEntry, inp: GoalInputs, over: boolean): GoalProgress {
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
  const { value, n, unit } = metric.compute(inp, goal.club ?? null);
  const met =
    value !== null && (metric.direction === "up" ? value >= goal.target : value <= goal.target);
  const orphaned =
    goal.leakId && !inp.leaks.some((l) => l.id === goal.leakId)
      ? `leak "${goal.leakId}" is no longer on the list — retired, or renamed`
      : goal.taskId && !isKnownTaskId(goal.taskId)
        ? `task id "${goal.taskId}" is not one the engine can emit`
        : null;
  return {
    goal,
    status: met ? "achieved" : over ? "missed" : "open",
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
      goals: w.goals.map((g) => progressOf(g, inp, over)),
    };
  });

  return {
    weeks,
    latest: weeks.length ? weeks[weeks.length - 1] : null,
    asOf: recordAsOf,
  };
}
