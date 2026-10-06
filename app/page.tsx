import Link from "next/link";
import { buildDataStatus, type SourceStatus } from "@/lib/data-status";
import { PROFILE_THRESHOLDS } from "@/lib/profile";
import { lastNDistinct } from "@/lib/round-history";
import { buildSiteData } from "@/lib/site-data";
import { GapBar } from "./charts";
import { fmtVal } from "./goal-row";

export const metadata = {
  title: "Now — Mackenzie",
  description:
    "The command center: where the strokes are, this week's goal, the last rounds, and the state of the pipeline.",
};

/* The command center. One question per section, in the order they get asked:
 * where are the strokes to a 79, what is this week's goal, what happened in
 * the last rounds, and is the record current. The plan itself — every area,
 * every rule, the arithmetic — lives on /plan; the full spec, the findings,
 * the roast, the unknowns live in PROFILE.md. This page synthesises, it does
 * not restate. */

export default function Now() {
  const d = buildSiteData();
  const status = buildDataStatus({
    roundHistory: d.roundHistory,
    garminShots: d.garminShots,
    sessions: d.sessions,
  });

  const week = d.goals.latest;
  const plan = d.plan;
  const priced = plan.ledger.filter((o) => o.strokes !== null && o.strokes > 0);
  const lastRounds = d.roundHistory
    ? lastNDistinct(d.roundHistory.rounds, PROFILE_THRESHOLDS.recentRoundCount).reverse()
    : [];
  const scorecardByRound = new Map<string, string>();
  for (const [scorecardId, r] of d.linked) scorecardByRound.set(r.roundId, scorecardId);
  const shotCountByCard = new Map(
    (d.garminShots?.rounds ?? []).map((r) => [r.scorecardId, r.shotCount]),
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8">
      <h1 className="font-serif text-[42px] leading-[0.9] tracking-[-0.01em] sm:text-[56px] lg:text-[72px]">
        NOW
      </h1>
      <p className="stamp mt-3 text-ink-3">
        as of {d.goals.asOf ?? "—"} — the record&rsquo;s clock, not today&rsquo;s
      </p>
      <p className="mt-5 max-w-2xl border-t pt-5 text-[15px] leading-6 text-ink-1 rule">
        What to work on, measured by every record this repo keeps. The strokes
        between the record and a 79, the week&rsquo;s goal, the last rounds, and
        whether the record itself is current — each with its receipts one link
        away.
      </p>

      {/* ── the strokes ───────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="font-serif text-[26px] leading-tight">Where the strokes are</h2>
        <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
          Strokes a round between the record and a 5–7 index, by area, against
          sourced benchmarks — the index gap is the blue tick.{" "}
          {plan.yours.index !== null && plan.indexGap !== null && (
            <>
              Index {plan.yours.index}, target ~{plan.target.indexApprox}: {plan.indexGap} a round.{" "}
            </>
          )}
          <Link href="/plan" className="text-ink-1 underline decoration-1 underline-offset-2">
            The plan
          </Link>{" "}
          has every area, the arithmetic, and the moves.
        </p>
        {priced.length > 0 && (
          <div className="mt-4">
            <GapBar
              compact
              items={priced.map((o) => ({ id: o.id, label: o.label, strokes: o.strokes as number }))}
              total={plan.ledgerTotal}
              gap={plan.indexGap}
              hrefBase="/plan"
            />
          </div>
        )}
        <ol className="mt-4 space-y-px">
          {plan.ledger.slice(0, 3).map((o, i) => (
            <li
              key={o.id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-2 bg-paper-1 px-3 py-2.5 sm:px-4"
              style={{ borderColor: i === 0 ? "var(--accent-ink)" : "var(--line)" }}
            >
              <span className={`font-mono text-[11px] tabular-nums ${i === 0 ? "text-accent-ink" : "text-ink-3"}`}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <Link
                href={`/plan#${o.id}`}
                className={`text-[15px] leading-snug underline decoration-1 underline-offset-2 ${i === 0 ? "text-accent-ink" : "text-ink-0"}`}
              >
                {o.label}
              </Link>
              <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-ink-2">
                you {fmtVal(o.yours.value, o.yours.unit)}
                {o.bench5 ? ` · 5 index ${fmtVal(o.bench5.value, o.bench5.unit)}` : ""}
                {o.strokes !== null ? ` · ${o.strokes} strokes` : " · outcome"}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* ── this week ─────────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="font-serif text-[26px] leading-tight">This week</h2>
        {week === null ? (
          <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
            No goals committed. <code className="text-ink-2">pnpm goals:propose</code>{" "}
            drafts a week from the plan; pasting it into{" "}
            <code className="text-ink-2">data/goals.json</code> is the commit.
          </p>
        ) : (
          <ul className="mt-3 space-y-1 font-mono text-[11px] leading-5">
            {week.goals.map((g) => (
              <li key={g.goal.id} className="flex flex-wrap gap-x-3">
                <span className={`stamp w-16 shrink-0 ${g.status === "achieved" ? "text-accent-ink" : "text-ink-3"}`}>
                  {g.status}
                </span>
                <span className="text-ink-1">
                  {g.label}
                  {g.status !== "invalid" && (
                    <span className="text-ink-2">
                      {" "}— now {fmtVal(g.value, g.unit)}, target {g.direction === "down" ? "at most " : ""}
                      {fmtVal(g.goal.target, g.unit)}
                    </span>
                  )}
                </span>
              </li>
            ))}
            <li className="pt-1 text-[10px] text-ink-3">
              The week of {week.weekOf} in record time — notes and the weeks before on{" "}
              <Link href="/plan#week" className="text-ink-2 underline decoration-1 underline-offset-2">
                the plan
              </Link>
              .
            </li>
          </ul>
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
        is a diff, not a page that quietly reads differently. The leaks engine&rsquo;s
        full accounting is on{" "}
        <Link href="/rounds#leaks" className="text-ink-2 underline decoration-1 underline-offset-2">
          the rounds page
        </Link>
        ; the map of every course played is{" "}
        <Link href="/courses" className="text-ink-2 underline decoration-1 underline-offset-2">
          the courses page
        </Link>
        ; the hundred still to play in California are on{" "}
        <Link href="/california" className="text-ink-2 underline decoration-1 underline-offset-2">
          the CA 100
        </Link>
        .
      </p>
    </div>
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
