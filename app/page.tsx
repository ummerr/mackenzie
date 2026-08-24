import Link from "next/link";
import { buildDataStatus, type SourceStatus } from "@/lib/data-status";
import { METRICS, proposalForLeak, type GoalProgress } from "@/lib/goals";
import type { GoalInputs } from "@/lib/goals";
import type { Leak } from "@/lib/leaks";
import { loadLinkedGrint } from "@/lib/load";
import { PROFILE_THRESHOLDS } from "@/lib/profile";
import { lastNDistinct } from "@/lib/round-history";
import { buildSiteData } from "@/lib/site-data";

export const metadata = {
  title: "Now — Mackenzie",
  description:
    "The command center: this week's goals, the last rounds, the leaks that cost the most strokes, and the state of the pipeline.",
};

/* The command center. One question per section, in the order they get asked:
 * what am I working on this week, what happened in the last rounds, where do
 * the strokes go, and is the record current. Everything else — the full
 * spec, the findings, the roast, the unknowns — lives in PROFILE.md, the
 * archive twin; the drill-downs live on their canonical pages. This page
 * synthesises, it does not restate. */

export default function Now() {
  const d = buildSiteData();
  const linked = loadLinkedGrint();
  const status = buildDataStatus({
    roundHistory: d.roundHistory,
    garminShots: d.garminShots,
    sessions: d.sessions,
  });

  const goalInputs: GoalInputs = {
    roundHistory: d.roundHistory,
    garminShots: d.garminShots,
    profiles: d.profiles,
    wedgeMatrix: d.wedgeMatrix,
    leaks: d.leaks,
    tasks: d.tasks,
    recentMonths: PROFILE_THRESHOLDS.recentMonths,
  };

  const week = d.goals.latest;
  const lastRounds = d.roundHistory
    ? lastNDistinct(d.roundHistory.rounds, PROFILE_THRESHOLDS.recentRoundCount).reverse()
    : [];
  const scorecardByRound = new Map<string, string>();
  for (const [scorecardId, r] of linked) scorecardByRound.set(r.roundId, scorecardId);
  const shotCountByCard = new Map(
    (d.garminShots?.rounds ?? []).map((r) => [r.scorecardId, r.shotCount]),
  );
  const topLeaks = d.leaks.slice(0, 3);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8">
      <h1 className="font-serif text-[42px] leading-[0.9] tracking-[-0.01em] sm:text-[56px] lg:text-[72px]">
        NOW
      </h1>
      <p className="stamp mt-3 text-ink-3">
        as of {d.goals.asOf ?? "—"} — the record&rsquo;s clock, not today&rsquo;s
      </p>
      <p className="mt-5 max-w-2xl border-t pt-5 text-[15px] leading-6 text-ink-1 rule">
        What to work on, measured by every record this repo keeps. The week&rsquo;s
        goals, the last rounds, the leaks priced in strokes, and whether the
        record itself is current — each with its receipts one link away.
      </p>

      {/* ── this week ─────────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="font-serif text-[26px] leading-tight">This week</h2>
        {week === null ? (
          <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
            No goals committed. <code className="text-ink-2">pnpm goals:propose</code>{" "}
            drafts a week from the top leak and the top open practice task; pasting
            it into <code className="text-ink-2">data/goals.json</code> is the
            commit. The engine proposes; the signature is yours.
          </p>
        ) : (
          <>
            <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
              The week of {week.weekOf}, measured against the newest capture — a
              goal stays open until the record outruns its week, then the record
              says achieved or missed.
            </p>
            <ul className="mt-4 space-y-px">
              {week.goals.map((g) => (
                <GoalRow key={g.goal.id} g={g} />
              ))}
            </ul>
            {d.goals.weeks.length > 1 && (
              <p className="mt-3 font-mono text-[10px] leading-4 text-ink-3">
                Past weeks:{" "}
                {d.goals.weeks
                  .slice(0, -1)
                  .map(
                    (w) =>
                      `${w.weekOf} (${w.goals.filter((g) => g.status === "achieved").length}/${w.goals.length} achieved)`,
                  )
                  .join(" · ")}{" "}
                — history on{" "}
                <Link href="/practice" className="text-ink-2 underline decoration-1 underline-offset-2">
                  the practice page
                </Link>
                .
              </p>
            )}
          </>
        )}
      </section>

      {/* ── the last rounds ───────────────────────────────────────────────── */}
      {lastRounds.length > 0 && (
        <section className="mt-10">
          <h2 className="font-serif text-[26px] leading-tight">The last rounds</h2>
          <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
            The newest {lastRounds.length} on file — every round, the arc, and the
            hole-by-hole traces live on{" "}
            <Link href="/rounds" className="text-ink-1 underline decoration-1 underline-offset-2">
              the rounds page
            </Link>
            .
          </p>
          <ul className="mt-4 space-y-px">
            {lastRounds.map((r) => {
              const scorecardId = scorecardByRound.get(r.roundId) ?? null;
              const heard =
                scorecardId !== null ? (shotCountByCard.get(scorecardId) ?? null) : null;
              return (
                <li
                  key={r.roundId}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-2 bg-paper-1 px-3 py-2.5 sm:px-4"
                  style={{ borderColor: "var(--line)" }}
                >
                  <span className="font-mono text-[11px] tabular-nums text-ink-3">{r.date}</span>
                  <span className="text-[15px] leading-snug text-ink-0">
                    {r.courseName ?? "—"}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-ink-1">
                    {r.strokes ?? "—"} strokes
                    {r.putts !== null ? ` · ${r.putts} putts` : ""}
                    {scorecardId !== null && heard !== null && (
                      <>
                        {" · "}
                        <Link
                          href={`/rounds#${scorecardId}`}
                          className="text-ink-1 underline decoration-1 underline-offset-2"
                        >
                          the watch heard {heard} →
                        </Link>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── the leaks ─────────────────────────────────────────────────────── */}
      {topLeaks.length > 0 && (
        <section className="mt-10">
          <h2 className="font-serif text-[26px] leading-tight">The leaks</h2>
          <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
            Where the strokes go, ranked by what each leak costs — priced in
            strokes where the record can price it. The top {topLeaks.length} of{" "}
            {d.leaks.length}; the{" "}
            <Link href="/rounds#leaks" className="text-ink-1 underline decoration-1 underline-offset-2">
              full accounting
            </Link>{" "}
            runs on the rounds page.
          </p>
          <ol className="mt-4 space-y-px">
            {topLeaks.map((l, i) => (
              <LeakRow key={l.id} leak={l} rank={i + 1} first={i === 0} inputs={goalInputs} />
            ))}
          </ol>
        </section>
      )}

      {/* ── data status ───────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="font-serif text-[26px] leading-tight">The record itself</h2>
        <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
          Every number above is only as current as the last capture. Per source:
          the newest record it carries, when it was captured, and anything
          waiting — new raw bundles, or a join that needs a human. Capture, then{" "}
          <code className="text-ink-2">pnpm refresh</code> runs the rest.
        </p>
        <ul className="mt-4 space-y-px">
          {status.map((s) => (
            <StatusRow key={s.id} s={s} />
          ))}
        </ul>
      </section>

      <p className="mt-10 border-t pt-4 font-mono text-[10px] leading-4 text-ink-3 rule">
        The full spec — every finding, the roast, what the record cannot say — is
        committed as <code className="text-ink-2">PROFILE.md</code>, regenerated by{" "}
        <code className="text-ink-2">pnpm profile</code> so a change in the golfer
        is a diff, not a page that quietly reads differently. The map of every
        course played is{" "}
        <Link href="/courses" className="text-ink-2 underline decoration-1 underline-offset-2">
          the courses page
        </Link>
        .
      </p>
    </div>
  );
}

/* ── one goal ─────────────────────────────────────────────────────────────── */

const STATUS_WORD: Record<GoalProgress["status"], string> = {
  achieved: "achieved",
  open: "open",
  missed: "missed",
  invalid: "invalid",
};

function fmtVal(v: number | null, unit: string): string {
  if (v === null) return "—";
  const n = Number.isInteger(v) ? String(v) : v.toFixed(1);
  return unit === "%" ? `${n}%` : `${n} ${unit}`;
}

function GoalRow({ g }: { g: GoalProgress }) {
  const accent = g.status === "achieved";
  return (
    <li
      className="border-l-2 bg-paper-1 px-3 py-3 sm:px-4"
      style={{ borderColor: accent ? "var(--accent-ink)" : "var(--line)" }}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={`stamp ${accent ? "text-accent-ink" : "text-ink-3"}`}>
          {STATUS_WORD[g.status]}
        </span>
        <span className="text-[15px] leading-snug text-ink-0">{g.label}</span>
      </div>
      {g.status !== "invalid" && (
        <p className="mt-1.5 font-mono text-[11px] leading-5 text-ink-2 sm:pl-8">
          now {fmtVal(g.value, g.unit)} · target{" "}
          {g.direction === "down" ? "under " : ""}
          {fmtVal(g.goal.target, g.unit)}
          {g.sample ? ` · over ${g.sample.n} ${g.sample.unit}` : ""}
        </p>
      )}
      {g.goal.note && (
        <p className="mt-1 font-mono text-[10px] leading-4 text-ink-3 sm:pl-8">{g.goal.note}</p>
      )}
      {g.orphaned && (
        <p className="mt-1 font-mono text-[10px] leading-4 text-ink-3 sm:pl-8">⚠ {g.orphaned}</p>
      )}
    </li>
  );
}

/* ── one leak, with its live number where the registry can price one ──────── */

function LeakRow({
  leak,
  rank,
  first,
  inputs,
}: {
  leak: Leak;
  rank: number;
  first: boolean;
  inputs: GoalInputs;
}) {
  /* The same translation `pnpm goals:propose` uses: the leak's retire line
   * as a metric + target, so the row can print where the number stands
   * today without anyone committing a goal first. */
  const proposal = proposalForLeak(leak);
  const metric = proposal ? METRICS[proposal.metricId] : undefined;
  const now = metric ? metric.compute(inputs, proposal?.club ?? null) : null;
  return (
    <li
      className="border-l-2 bg-paper-1 px-3 py-3.5 sm:px-4 sm:py-4"
      style={{ borderColor: first ? "var(--accent-ink)" : "var(--line)" }}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className={`font-mono text-[11px] tabular-nums ${
            first ? "text-accent-ink" : "text-ink-3"
          }`}
        >
          {String(rank).padStart(2, "0")}
        </span>
        <h3 className={`text-[15px] leading-snug ${first ? "text-accent-ink" : "text-ink-0"}`}>
          {leak.title}
        </h3>
        <span className="stamp ml-auto shrink-0 text-ink-3">{leak.source}</span>
      </div>
      <dl className="mt-2 space-y-1.5 font-mono text-[11px] leading-5 sm:pl-8">
        <div className="flex gap-3">
          <dt className="w-14 shrink-0 text-ink-3">cost</dt>
          <dd className="text-ink-2">{leak.cost}</dd>
        </div>
        {proposal && metric && now && (
          <div className="flex gap-3">
            <dt className="w-14 shrink-0 text-ink-3">stands at</dt>
            <dd className="text-ink-1">
              {fmtVal(now.value, metric.unit)} · retires at{" "}
              {metric.direction === "down" ? "under " : ""}
              {fmtVal(proposal.target, metric.unit)}
            </dd>
          </div>
        )}
        <div className="flex gap-3">
          <dt className="w-14 shrink-0 text-ink-3">move</dt>
          <dd className="text-ink-1">
            {leak.move}
            {" — "}
            <Link href="/practice" className="underline decoration-1 underline-offset-2">
              the drill
            </Link>
          </dd>
        </div>
      </dl>
    </li>
  );
}

/* ── one source's pipeline state ──────────────────────────────────────────── */

function StatusRow({ s }: { s: SourceStatus }) {
  const waiting = s.unprocessed.length > 0 || s.pending !== null;
  return (
    <li
      className="border-l-2 bg-paper-1 px-3 py-2.5 sm:px-4"
      style={{ borderColor: waiting ? "var(--accent-ink)" : "var(--line)" }}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="w-24 shrink-0 stamp text-ink-1">{s.label}</span>
        <span className="font-mono text-[11px] leading-5 text-ink-2">
          {s.asOf !== null ? `newest record ${s.asOf}` : "no artifact on this checkout"}
          {s.capturedAt !== null ? ` · captured ${s.capturedAt}` : ""}
        </span>
      </div>
      {s.unprocessed.length > 0 && (
        <p className="mt-1 font-mono text-[11px] leading-5 text-ink-1 sm:pl-8">
          {s.unprocessed.length} raw file{s.unprocessed.length === 1 ? "" : "s"} newer than
          the artifact — run <code className="text-ink-0">{s.command}</code>
        </p>
      )}
      {s.pending && (
        <p className="mt-1 font-mono text-[11px] leading-5 text-ink-1 sm:pl-8">{s.pending}</p>
      )}
    </li>
  );
}
