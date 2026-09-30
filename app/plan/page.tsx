import Link from "next/link";
import type { Benchmark } from "@/lib/benchmarks";
import type { Break80, Measured, Opportunity, Rule } from "@/lib/break80";
import { buildSiteData } from "@/lib/site-data";
import { buildSources } from "@/lib/sources";
import type { Task } from "@/lib/tasks";
import { Bullet, GapBar, Mini } from "../charts";
import { GoalRow } from "../goal-row";
import { Provenance } from "../provenance";
import { StatTiles, type StatTile } from "../stat-tiles";

/* The plan: how this golfer breaks 80, from the record against sourced
 * benchmarks (lib/break80.ts, data/benchmarks.json). One question per
 * section, in the order they get asked: what is the target, where are the
 * strokes, what is each area's move, what costs nothing on the course, is
 * it moving, and what is this week. Nothing here is written by hand — every
 * number recomputes on render, every benchmark carries its source, every
 * price prints its arithmetic. The range task list rides at the bottom for
 * the bag page's sake; it no longer sets the week.
 */

export const metadata = {
  title: "Plan — Mackenzie",
  description:
    "How this golfer breaks 80: the strokes between the record and a 5–7 index, priced by area against sourced benchmarks, with the move for each.",
};

const fmt = (v: number | null, unit = "") => {
  if (v === null) return "—";
  const n = Number.isInteger(v) ? String(v) : v.toFixed(1);
  return unit === "%" ? `${n}%` : n;
};

export default function Plan() {
  const d = buildSiteData();
  const p = d.plan;
  const week = d.goals.latest;
  const pastWeeks = [...d.goals.weeks].reverse();
  const priced = p.ledger.filter((o) => o.strokes !== null && o.strokes > 0);

  const sf = p.target.differentialAt.filter((t) => t.rating >= 70);
  const diffs = sf.map((t) => t.differential);
  const diffBand = diffs.length
    ? `${fmt(Math.min(...diffs))}–${fmt(Math.max(...diffs))}`
    : "—";

  const tiles: StatTile[] = [
    {
      label: "a 79 is",
      value: diffBand,
      note: sf.length ? `differential at your ${sf.length} rated SF tees${p.target.differentialAt.length > sf.length ? " · 14+ at Lincoln" : ""}` : "no rated watch round yet",
    },
    {
      label: "index",
      value: p.yours.index === null ? "—" : `${fmt(p.yours.index)} → ~${p.target.indexApprox}`,
      note: p.indexGap === null ? undefined : `${fmt(p.indexGap)} strokes a round, by the index`,
      accent: true,
    },
    {
      label: "priced in the ledger",
      value: p.ledgerTotal === null ? "—" : fmt(p.ledgerTotal),
      note: "strokes a round, four areas, not additive",
    },
    {
      label: "a 5 index breaks 80",
      value: p.target.breakShare ? `${fmt(p.target.breakShare.value)}%` : "—",
      note: p.target.breakShare ? "of rounds — two in five, not most" : "benchmark absent",
    },
  ];

  const bench5 = (o: Opportunity) => o.bench5?.value ?? null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8">
      <h1 className="font-serif text-[42px] leading-[0.9] tracking-[-0.01em] sm:text-[56px] lg:text-[72px]">
        BREAK 80
      </h1>
      <p className="stamp mt-3 text-ink-3">
        the record against a 5–7 index · {p.yours.watchRounds} watch rounds, {p.yours.linkedRounds} linked ·
        as of {d.goals.asOf ?? "—"}
      </p>
      <p className="mt-5 max-w-2xl border-t pt-5 text-[15px] leading-6 text-ink-1 rule">
        The research says the strokes between a 13 and a 5–7 index are mostly
        greens hit and up-and-downs, and they arrive as double bogeys. Fairways
        and driving distance are not separators. This page applies that to the
        record: each area&rsquo;s own number, the 13-band and 5-band numbers
        beside it with their sources, and the gap priced in strokes a round with
        the arithmetic shown.
      </p>

      <StatTiles tiles={tiles} className="mt-6 grid grid-cols-2 gap-px border bg-paper-2 rule sm:grid-cols-4" />

      {/* ── where the strokes are ─────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="font-serif text-[26px] leading-tight">Where the strokes are</h2>
        <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
          Strokes a round between your number and the 5 band, by area. The areas
          overlap — a chunked chip is a short-game miss and a double — so the bar
          is an ordering, and the blue tick is the index gap it should roughly
          agree with.
        </p>
        <div className="mt-4">
          <GapBar
            items={priced.map((o) => ({ id: o.id, label: o.label, strokes: o.strokes as number }))}
            total={p.ledgerTotal}
            gap={p.indexGap}
            hrefBase=""
          />
        </div>
      </section>

      {/* ── the opportunities ─────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="font-serif text-[26px] leading-tight">The opportunities</h2>
        <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
          In order of strokes. Each card: your number on a scale with the two
          bands marked, what the provider counted beside what the record
          counted, the price and its arithmetic, one move on the course and one
          on the range, and the number that retires it.
        </p>
        <ol className="mt-4 space-y-3">
          {p.ledger.map((o, i) => (
            <OpportunityCard key={o.id} o={o} rank={i + 1} first={i === 0 && o.strokes !== null} />
          ))}
        </ol>
        <p className="mt-3 font-mono text-[10px] leading-4 text-ink-3">
          {p.coverage.pinSnapped} of {p.coverage.holes} watch holes end their last heard shot exactly on
          the pin — the watch has no putts, so that pin is where the shot stopped. Those
          shots are excluded from every leave and short-of-the-hole call above.
        </p>
      </section>

      {/* ── on the course ─────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="font-serif text-[26px] leading-tight">On the course, for nothing</h2>
        <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
          Decisions with a sourced number behind them and no practice cost. The
          record&rsquo;s own figure sits beside each so the rule is about you, not
          about golfers.
        </p>
        <ol className="mt-4 space-y-px">
          {p.rules.map((r, i) => (
            <RuleRow key={r.id} r={r} rank={i + 1} />
          ))}
        </ol>
      </section>

      {/* ── is it moving ──────────────────────────────────────────────────── */}
      {(p.trend.gir.length > 1 || p.trend.threePutt.length > 1) && (
        <section className="mt-10">
          <h2 className="font-serif text-[26px] leading-tight">Is it moving</h2>
          <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
            The last {p.trend.gir.length} charted rounds, oldest to newest, with the 5-band
            benchmark as the blue line. Positional, not dated: Grint&rsquo;s charts skip
            nine-hole rounds.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {p.trend.gir.length > 1 && (
              <Mini title="greens in regulation" min={0} max={12} ariaSuffix="over the last 20 rounds"
                pts={p.trend.gir.map((t, i) => ({ y: t.label || String(i + 1), v: t.value, n: 1 }))}
                xLabels={["−19", "now"]}
                refLine={bench5(p.ledger.find((o) => o.id === "approach")!) !== null ? { value: bench5(p.ledger.find((o) => o.id === "approach")!) as number, label: "5 index" } : undefined} />
            )}
            {p.trend.parSaves.length > 1 && (
              <Mini title="par saves" min={0} max={60} unit="%" ariaSuffix="over the last 20 rounds"
                pts={p.trend.parSaves.map((t, i) => ({ y: t.label || String(i + 1), v: t.value, n: 1 }))}
                xLabels={["−19", "now"]} />
            )}
            {p.trend.threePutt.length > 1 && (
              <Mini title="three-putt share" min={0} max={20} unit="%" ariaSuffix="over the last 20 cards"
                pts={p.trend.threePutt.map((t) => ({ y: t.label, v: +t.value.toFixed(1), n: 1 }))}
                xLabels={[p.trend.threePutt[0].label, "now"]}
                refLine={bench5(p.ledger.find((o) => o.id === "putting")!) !== null ? { value: bench5(p.ledger.find((o) => o.id === "putting")!) as number, label: "5 index" } : undefined} />
            )}
          </div>
        </section>
      )}

      {/* ── this week ─────────────────────────────────────────────────────── */}
      <section className="mt-10" id="week">
        <h2 className="font-serif text-[26px] leading-tight">This week</h2>
        {week === null ? (
          <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
            No goals committed. <code className="text-ink-2">pnpm goals:propose</code> drafts a week
            from the ledger above; pasting it into <code className="text-ink-2">data/goals.json</code>{" "}
            is the commit.
          </p>
        ) : (
          <>
            <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
              The week of {week.weekOf}, measured against the newest capture — a goal
              stays open until the record outruns its week, then the record says
              achieved or missed. Goals are about the next round, not the range.
            </p>
            <ul className="mt-4 space-y-px">
              {week.goals.map((g) => (
                <GoalRow key={g.goal.id} g={g} />
              ))}
            </ul>
          </>
        )}
        {pastWeeks.length > 1 && (
          <details className="mt-4">
            <summary className="cursor-pointer stamp text-ink-2">The weeks before</summary>
            <ul className="mt-3 space-y-1 font-mono text-[11px] leading-5">
              {pastWeeks.slice(1).map((w) => (
                <li key={w.weekOf} className="flex flex-wrap gap-x-3">
                  <span className="w-24 shrink-0 text-ink-1">{w.weekOf}</span>
                  <span className="text-ink-2">
                    {w.goals.map((g) => `${g.status}: ${g.goal.note ?? g.label}`).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* ── the range list, demoted ───────────────────────────────────────── */}
      <section className="mt-10">
        <details>
          <summary className="cursor-pointer font-serif text-[22px] leading-tight text-ink-1">
            For the bag page: {d.tasks.length} range tasks
          </summary>
          <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
            Ranked by what a bucket of balls would tell the bag page — unmeasured
            clubs first. This list fills in the yardage chart; it does not set the
            week. A club measured at a monitor is a number on <Link href="/bag" className="underline decoration-1 underline-offset-2">the bag</Link>,
            not a stroke on the card.
          </p>
          <ol className="mt-4 space-y-px">
            {d.tasks.map((t, i) => (
              <TaskRow key={t.id} task={t} rank={i + 1} />
            ))}
          </ol>
        </details>
      </section>

      <Provenance
        sources={buildSources({
          shots: d.shots,
          sessions: d.sessions,
          roundHistory: d.roundHistory,
          garminShots: d.garminShots,
        }).filter((s) => s.id !== "map")}
        note={
          <>
            Benchmarks from <code className="text-ink-2">data/benchmarks.json</code> — every entry a
            source URL, a population and the provider&rsquo;s definition; <code className="text-ink-2">pnpm data:validate</code>{" "}
            refuses one without.
          </>
        }
      />
    </div>
  );
}

/* ── one opportunity ──────────────────────────────────────────────────────── */

function measuredLine(m: Measured): string {
  return `${fmt(m.value, m.unit)}${m.unit === "%" ? "" : ` ${m.unit}`} · n ${m.n} · ${m.source}`;
}

function benchLine(b: Benchmark | null, band: string): string {
  if (!b) return `${band}: no sourced number`;
  return `${band}: ${fmt(b.value, b.unit)}${b.unit === "%" ? "" : ` ${b.unit}`}`;
}

function OpportunityCard({ o, rank, first }: { o: Opportunity; rank: number; first: boolean }) {
  return (
    <li
      id={o.id}
      className="scroll-mt-16 border-l-2 bg-paper-1 px-3 py-4 sm:px-4 sm:py-5"
      style={{ borderColor: first ? "var(--accent-ink)" : "var(--line)" }}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={`font-mono text-[11px] tabular-nums ${first ? "text-accent-ink" : "text-ink-3"}`}>
          {String(rank).padStart(2, "0")}
        </span>
        <h3 className={`text-[18px] leading-snug ${first ? "text-accent-ink" : "text-ink-0"}`}>{o.label}</h3>
        <span className="ml-auto shrink-0 font-mono text-[13px] tabular-nums text-ink-0">
          {o.strokes === null ? "unpriced" : `${fmt(o.strokes)} strokes a round`}
        </span>
      </div>

      <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,360px)_1fr] sm:pl-8">
        <div>
          <Bullet
            value={o.yours.value}
            bench13={o.bench13?.value ?? null}
            bench5={o.bench5?.value ?? null}
            unit={o.yours.unit}
            ariaLabel={`${o.label}: you ${fmt(o.yours.value, o.yours.unit)}; 13 band ${o.bench13 ? fmt(o.bench13.value, o.bench13.unit) : "unknown"}; 5 band ${o.bench5 ? fmt(o.bench5.value, o.bench5.unit) : "unknown"}`}
          />
          <dl className="mt-1 space-y-1 font-mono text-[11px] leading-5">
            <div className="flex gap-3">
              <dt className="w-12 shrink-0 text-ink-3">you</dt>
              <dd className="text-ink-0">{measuredLine(o.yours)}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-12 shrink-0 text-ink-3">bands</dt>
              <dd className="text-ink-2">
                {benchLine(o.bench13, "13")} · {benchLine(o.bench5, "5")} ·{" "}
                {o.direction === "up" ? "higher is better" : "lower is better"}
              </dd>
            </div>
          </dl>
        </div>
        <dl className="space-y-1.5 font-mono text-[11px] leading-5">
          <div className="flex gap-3">
            <dt className="w-16 shrink-0 text-ink-3">price</dt>
            <dd className="text-ink-2">{o.formula}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-16 shrink-0 text-ink-3">on course</dt>
            <dd className="text-ink-0">{o.move.course}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-16 shrink-0 text-ink-3">practice</dt>
            <dd className="text-ink-0">{o.move.practice}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-16 shrink-0 text-ink-3">retired</dt>
            <dd className="text-ink-2">{o.retiredWhen}</dd>
          </div>
        </dl>
      </div>

      <details className="mt-3 sm:pl-8">
        <summary className="cursor-pointer stamp text-ink-3">definitions · sources · {o.confidence} confidence</summary>
        <dl className="mt-2 space-y-1.5 font-mono text-[10px] leading-4 text-ink-3">
          <div className="flex gap-3">
            <dt className="w-16 shrink-0">you count</dt>
            <dd>{o.yours.definition}</dd>
          </div>
          {[o.bench13, o.bench5].map((b, i) =>
            b ? (
              <div key={b.id} className="flex gap-3">
                <dt className="w-16 shrink-0">{i === 0 ? "13 counts" : "5 counts"}</dt>
                <dd>
                  {b.definition} — {b.population} —{" "}
                  <a href={b.source} className="underline decoration-1 underline-offset-2" rel="noreferrer">
                    {b.sourceTitle}
                  </a>
                  {" · "}checked {b.checked}
                </dd>
              </div>
            ) : null,
          )}
        </dl>
      </details>
    </li>
  );
}

/* ── one on-course rule ───────────────────────────────────────────────────── */

function RuleRow({ r, rank }: { r: Rule; rank: number }) {
  return (
    <li className="border-l-2 bg-paper-1 px-3 py-3 sm:px-4" style={{ borderColor: "var(--line)" }}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-[11px] tabular-nums text-ink-3">{String(rank).padStart(2, "0")}</span>
        <p className="text-[15px] leading-snug text-ink-0">{r.text}</p>
      </div>
      <dl className="mt-1.5 space-y-1 font-mono text-[11px] leading-5 sm:pl-8">
        {r.yours && (
          <div className="flex gap-3">
            <dt className="w-12 shrink-0 text-ink-3">you</dt>
            <dd className="text-ink-1">
              {fmt(r.yours.value, r.yours.unit)}{r.yours.unit === "%" ? "" : ` ${r.yours.unit}`} · n {r.yours.n} —{" "}
              {r.yours.definition}
            </dd>
          </div>
        )}
        {r.benchmark && (
          <div className="flex gap-3">
            <dt className="w-12 shrink-0 text-ink-3">source</dt>
            <dd className="text-ink-3">
              {fmt(r.benchmark.value, r.benchmark.unit)}{r.benchmark.unit === "%" ? "" : ` ${r.benchmark.unit}`} —{" "}
              {r.benchmark.definition} —{" "}
              <a href={r.benchmark.source} className="underline decoration-1 underline-offset-2" rel="noreferrer">
                {r.benchmark.sourceTitle}
              </a>
            </dd>
          </div>
        )}
      </dl>
    </li>
  );
}

/* ── one range task, demoted ──────────────────────────────────────────────── */

function TaskRow({ task, rank }: { task: Task; rank: number }) {
  return (
    <li className="border-l-2 bg-paper-1 px-3 py-3 sm:px-4" style={{ borderColor: "var(--line)" }}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-[11px] tabular-nums text-ink-3">{String(rank).padStart(2, "0")}</span>
        <h3 className="text-[15px] leading-snug text-ink-0">{task.title}</h3>
        <span className="stamp ml-auto shrink-0 text-ink-3">{task.category}</span>
      </div>
      <dl className="mt-2 space-y-1 font-mono text-[11px] leading-5 sm:pl-8">
        <div className="flex gap-3">
          <dt className="w-10 shrink-0 text-ink-3">why</dt>
          <dd className="text-ink-2">{task.evidence}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-10 shrink-0 text-ink-3">do</dt>
          <dd className="text-ink-1">{task.action}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-10 shrink-0 text-ink-3">done</dt>
          <dd className="text-ink-2">{task.doneWhen}</dd>
        </div>
      </dl>
    </li>
  );
}
