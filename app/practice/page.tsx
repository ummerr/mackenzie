import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readBag, readWedgeBlocks } from "@/lib/bag-file";
import { buildWedgeMatrix } from "@/lib/wedge-matrix";
import {
  buildGarminShots,
  type GarminShots,
  type SourceGarminRounds,
} from "@/lib/garmin-shots";
import type { LedgerSession, LedgerShot } from "@/lib/ledger";
import {
  buildRoundHistory,
  type RoundHistory,
  type SourceRounds,
} from "@/lib/round-history";
import { applyHeuristics, buildBag, detectGaps } from "@/lib/stats";
import { buildTasks, type Task, type TaskCategory } from "@/lib/tasks";

export const metadata = {
  title: "Practice — Mackenzie",
  description: "What to hit next, derived from the ledger.",
};

function load<T>(name: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), "data", name), "utf8")) as T;
}

/* Categories are kinds of work, not severities, so they wear ink rather than
 * status colour — nothing here is good or bad, it is just what is unmeasured.
 * The one accent goes to the top task, because a ranked list whose ranking is
 * invisible is just a list. */
const CATEGORY_NOTE: Record<TaskCategory, string> = {
  "blind spot": "a gap that cannot be seen at all until something is measured",
  coverage: "a club below the 15-shot threshold, so it is suppressed",
  consistency: "a number that moves between sessions, or a miss that repeats",
  data: "a metric the monitor did not record",
  gapping: "a distance problem the chart has already confirmed",
  scoring: "a pattern from the scorecards — work no launch monitor will ever see",
  "wedge matrix":
    "a partial-swing cell of the scoring bag — measured only as a block labeled by hand in data/wedge-blocks.json",
};

function loadRounds(): RoundHistory | null {
  try {
    return buildRoundHistory(load<SourceRounds>("rounds.json"));
  } catch {
    return null;
  }
}

function loadGarmin(): GarminShots | null {
  try {
    return buildGarminShots(load<SourceGarminRounds>("garmin-rounds.json"));
  } catch {
    return null;
  }
}

export default function Practice() {
  const blocks = readWedgeBlocks(join(process.cwd(), "data"))?.blocks ?? [];
  const shots = applyHeuristics(load<LedgerShot[]>("shots.json"), undefined, blocks);
  const sessions = load<LedgerSession[]>("sessions.json");
  const profiles = buildBag(shots);
  const bag = readBag(join(process.cwd(), "data"));
  const tasks = buildTasks({
    profiles,
    gaps: detectGaps(profiles, undefined, bag),
    shots,
    sessions,
    bag,
    roundHistory: loadRounds(),
    garminShots: loadGarmin(),
    wedgeMatrix: buildWedgeMatrix(shots, blocks, profiles),
  });

  const categories = [...new Set(tasks.map((t) => t.category))];

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8">
      <h1 className="font-serif text-[42px] leading-[0.9] tracking-[-0.01em] sm:text-[56px] lg:text-[72px]">
        WHAT TO HIT NEXT
      </h1>
      <p className="stamp mt-3 text-ink-3">
        {tasks.length} tasks · ranked by information gain
      </p>
      <p className="mt-5 max-w-2xl border-t pt-5 text-[15px] leading-6 text-ink-1 rule">
        Generated from the ledger, not written by hand. Every task carries the
        numbers that put it on the list and the condition that takes it off, so
        hitting the shots retires it on the next{" "}
        <code className="font-mono text-[13px] text-ink-0">pnpm ingest</code>.
      </p>
      <p className="mt-3 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
        Ranked by what each bucket of balls would <em>tell</em> you, not by how
        few shots it takes. A club with four shots on file is not a noisy
        measurement — it is a blind spot, and the gaps either side of it are
        invisible rather than merely wide.
      </p>

      <ol className="mt-6 space-y-px sm:mt-8">
        {tasks.map((t, i) => (
          <TaskRow key={t.id} task={t} rank={i + 1} first={i === 0} />
        ))}
      </ol>

      {tasks.length === 0 && (
        <p className="mt-8 font-mono text-[12px] text-ink-2">
          Nothing outstanding. Every club is measured, every metric recorded, and
          no gap is flagged.
        </p>
      )}

      <section className="mt-10">
        <h2 className="stamp text-ink-2">What the categories mean</h2>
        <dl className="mt-3 space-y-1 font-mono text-[11px] text-ink-3">
          {categories.map((c) => (
            <div key={c} className="flex gap-3">
              <dt className="w-24 shrink-0 text-ink-1">{c}</dt>
              <dd>{CATEGORY_NOTE[c]}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

function TaskRow({ task, rank, first }: { task: Task; rank: number; first: boolean }) {
  return (
    <li
      className="border-l-2 bg-paper-1 px-3 py-3.5 sm:px-4 sm:py-4"
      style={{ borderColor: first ? "var(--accent-ink)" : "var(--line)" }}
    >
      {/* Wraps rather than truncates: on a phone the category drops onto its own
          line under the title instead of squeezing the title into two words. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className={`font-mono text-[11px] tabular-nums ${
            first ? "text-accent-ink" : "text-ink-3"
          }`}
        >
          {String(rank).padStart(2, "0")}
        </span>
        <h2 className={`text-[15px] leading-snug ${first ? "text-accent-ink" : "text-ink-0"}`}>
          {task.title}
        </h2>
        <span className="stamp ml-auto shrink-0 text-ink-3">{task.category}</span>
      </div>

      <dl className="mt-2 space-y-1.5 font-mono text-[11px] leading-5 sm:pl-8">
        <div className="flex gap-3">
          <dt className="w-10 shrink-0 text-ink-3">why</dt>
          <dd className="text-ink-2">{task.evidence}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-10 shrink-0 text-ink-3">do</dt>
          <dd className="text-ink-0">{task.action}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-10 shrink-0 text-ink-3">done</dt>
          <dd className="text-ink-2">{task.doneWhen}</dd>
        </div>
      </dl>
    </li>
  );
}
