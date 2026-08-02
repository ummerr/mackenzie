import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LedgerSession, LedgerShot } from "@/lib/ledger";
import { applyHeuristics, buildBag, detectGaps } from "@/lib/stats";
import { buildTasks, type Task, type TaskCategory } from "@/lib/tasks";

export const metadata = {
  title: "Practice — Yardages",
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
};

export default function Practice() {
  const shots = applyHeuristics(load<LedgerShot[]>("shots.json"));
  const sessions = load<LedgerSession[]>("sessions.json");
  const profiles = buildBag(shots);
  const tasks = buildTasks({ profiles, gaps: detectGaps(profiles), shots, sessions });

  const categories = [...new Set(tasks.map((t) => t.category))];

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <h1 className="font-serif text-3xl leading-none">What to hit next</h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-6 text-cream-1">
        Generated from the ledger, not written by hand. Every task carries the
        numbers that put it on the list and the condition that takes it off, so
        hitting the shots retires it on the next{" "}
        <code className="font-mono text-[13px] text-cream-0">pnpm ingest</code>.
      </p>
      <p className="mt-3 max-w-2xl font-mono text-[11px] leading-5 text-cream-3">
        Ranked by what each bucket of balls would <em>tell</em> you, not by how
        few shots it takes. A club with four shots on file is not a noisy
        measurement — it is a blind spot, and the gaps either side of it are
        invisible rather than merely wide.
      </p>

      <ol className="mt-8 space-y-px">
        {tasks.map((t, i) => (
          <TaskRow key={t.id} task={t} rank={i + 1} first={i === 0} />
        ))}
      </ol>

      {tasks.length === 0 && (
        <p className="mt-8 font-mono text-[12px] text-cream-2">
          Nothing outstanding. Every club is measured, every metric recorded, and
          no gap is flagged.
        </p>
      )}

      <section className="mt-10">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.1em] text-cream-2">
          What the categories mean
        </h2>
        <dl className="mt-3 space-y-1 font-mono text-[11px] text-cream-3">
          {categories.map((c) => (
            <div key={c} className="flex gap-3">
              <dt className="w-24 shrink-0 text-cream-1">{c}</dt>
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
    <li className="border-b bg-ink-1 px-4 py-4 rule">
      <div className="flex items-baseline gap-3">
        <span
          className={`font-mono text-[11px] tabular-nums ${
            first ? "text-accent" : "text-cream-3"
          }`}
        >
          {String(rank).padStart(2, "0")}
        </span>
        <h2 className={`text-[15px] leading-snug ${first ? "text-accent" : "text-cream-0"}`}>
          {task.title}
        </h2>
        <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-cream-3">
          {task.category}
        </span>
      </div>

      <dl className="mt-2 space-y-1.5 pl-8 font-mono text-[11px] leading-5">
        <div className="flex gap-3">
          <dt className="w-10 shrink-0 text-cream-3">why</dt>
          <dd className="text-cream-2">{task.evidence}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-10 shrink-0 text-cream-3">do</dt>
          <dd className="text-cream-0">{task.action}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-10 shrink-0 text-cream-3">done</dt>
          <dd className="text-cream-2">{task.doneWhen}</dd>
        </div>
      </dl>
    </li>
  );
}
