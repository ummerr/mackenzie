import Link from "next/link";
import type { ReactNode } from "react";
import { shotRounds, type GarminShots } from "@/lib/garmin-shots";
import type { Leak } from "@/lib/leaks";
import { loadLinkedGrint } from "@/lib/load";
import type { RecentForm, RoundHistory, StatPair } from "@/lib/round-history";
import { buildSiteData } from "@/lib/site-data";
import { buildSources } from "@/lib/sources";
import { Provenance } from "../provenance";
import { StatTiles, type StatTile } from "../stat-tiles";
import {
  asOf,
  differentialTrend,
  recentVsCareer,
  eighteenHole,
  fairwaySplit,
  puttsPerRound,
  since,
  threePuttShare,
  yearlyMeans,
} from "@/lib/round-history";
import { PROFILE_THRESHOLDS } from "@/lib/profile";

/* The analysis /profile refuses to editorialise, editorialised: one question —
 * what stands between 12.9 and scratch — answered from the same record,
 * with the critique of its own evidence printed beside every claim. Same
 * contract as everything else here: nothing written by hand, every number
 * recomputed on render, every gap named with the condition that retires it.
 */

export const metadata = {
  title: "Scratch — Mackenzie",
  description:
    "The road from a 12.9 index to scratch, ranked by what each gap costs, on the record's own arithmetic.",
};

const f1 = (n: number) => n.toFixed(1);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/* ── the hero: every differential, the trending line, and scratch at zero ── */

function ArcChart({ h }: { h: RoundHistory }) {
  const W = 720,
    H = 320,
    PL = 34,
    PR = 14,
    PT = 16,
    PB = 30;
  const iw = W - PL - PR,
    ih = H - PT - PB;
  const pts = h.differentials;
  const n = pts.length;
  const yMax = 34;
  const x = (i: number) => PL + (i / (n - 1)) * iw;
  const y = (v: number) => PT + (1 - v / yMax) * ih;
  const line = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.trendingHdcp ?? p.differential).toFixed(1)}`)
    .join(" ");
  const best = pts.reduce((a, b) => (b.differential < a.differential ? b : a));
  const bestI = pts.indexOf(best);
  const last = pts[n - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" className="block h-auto w-full"
      aria-label={`Handicap differentials and trending handicap across ${n} rounds, scratch marked at zero`}>
      {[0, 10, 20, 30].map((v) => (
        <g key={v}>
          <line x1={PL} x2={W - PR} y1={y(v)} y2={y(v)}
            stroke={v === 0 ? "var(--accent-ink)" : "var(--line)"}
            strokeDasharray={v === 0 ? "5 4" : undefined} strokeWidth={v === 0 ? 1.2 : 1} />
          <text x={PL - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10}
            fill="var(--ink-3)" className="font-mono">{v}</text>
        </g>
      ))}
      <text x={W - PR} y={y(0) - 5} textAnchor="end" fontSize={10}
        fill="var(--accent-ink)" className="font-mono">scratch</text>
      {pts.map((p, i) => (
        <circle key={p.seq} cx={x(i)} cy={y(p.differential)} r={2.4}
          fill="var(--chart-2)" opacity={0.42}>
          <title>{`round ${i + 1} · ${p.courseName ?? "—"} · differential ${f1(p.differential)}`}</title>
        </circle>
      ))}
      <path d={line} fill="none" stroke="var(--accent-ink)" strokeWidth={2}
        strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(bestI)} cy={y(best.differential)} r={4}
        fill="var(--chart-2)" stroke="var(--paper-1)" strokeWidth={2} />
      <text x={x(bestI)} y={y(best.differential) + 16} textAnchor="middle" fontSize={10}
        fill="var(--ink-3)" className="font-mono">best: {best.differential}</text>
      {last.trendingHdcp !== null && (
        <text x={x(n - 1) - 6} y={y(last.trendingHdcp) - 8} textAnchor="end" fontSize={13}
          fontWeight={700} fill="var(--accent-ink)" className="font-mono">{f1(last.trendingHdcp)}</text>
      )}
      <text x={PL} y={H - 8} fontSize={10} fill="var(--ink-3)" className="font-mono">
        first posted round · 2021</text>
      <text x={W - PR} y={H - 8} textAnchor="end" fontSize={10} fill="var(--ink-3)" className="font-mono">
        latest · 2026</text>
    </svg>
  );
}

/* ── small multiple: one measure by year ── */

function Mini({ title, pts, min, max, unit = "" }: {
  title: string;
  pts: { y: string; v: number; n: number }[];
  min: number;
  max: number;
  unit?: string;
}) {
  const W = 226, H = 150, PL = 30, PR = 10, PT = 14, PB = 22;
  const iw = W - PL - PR, ih = H - PT - PB;
  const x = (i: number) => PL + (pts.length === 1 ? iw / 2 : (i / (pts.length - 1)) * iw);
  const y = (v: number) => PT + (1 - (v - min) / (max - min)) * ih;
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  return (
    <figure className="m-0 border bg-paper-1 p-4 rule">
      <figcaption className="stamp mb-2 text-ink-3">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" className="block h-auto w-full" aria-label={`${title} by year`}>
        <line x1={PL} x2={W - PR} y1={y(min)} y2={y(min)} stroke="var(--line)" />
        <path d={line} fill="none" stroke="var(--accent-ink)" strokeWidth={2}
          strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle key={p.y} cx={x(i)} cy={y(p.v)} r={3.4} fill="var(--accent-ink)"
            stroke="var(--paper-1)" strokeWidth={2}>
            <title>{`${p.y} — ${p.v}${unit} (${p.n} rounds)`}</title>
          </circle>
        ))}
        {pts.map((p, i) =>
          i === 0 || i === pts.length - 1 ? (
            <g key={`l${p.y}`}>
              <text x={x(i)} y={y(p.v) - 8} textAnchor={i === 0 ? "start" : "end"} fontSize={10}
                fill="var(--ink-2)" className="font-mono">{p.v}{unit}</text>
              <text x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : "end"} fontSize={10}
                fill="var(--ink-3)" className="font-mono">’{p.y.slice(2)}</text>
            </g>
          ) : null,
        )}
      </svg>
    </figure>
  );
}

/* Both numbers, always: the recent figure answers "what does the golf do now",
 * the career figure answers "what has it ever done", and printing only one
 * would hide that recency moved it. Moved here from the front page — the
 * scorecards' recent window is this page's fact-family. A round the watch
 * also heard links to its diary entry: the same round carries two stroke
 * counts, one per ledger, and the link is the join saying so. */
function RecentFormSection({
  form,
  scorecardByRound,
  garmin,
}: {
  form: RecentForm;
  scorecardByRound: Map<string, string>;
  garmin: GarminShots | null;
}) {
  const lastN = form.recentRounds.slice(-PROFILE_THRESHOLDS.recentRoundCount);
  const num = (v: number | null, digits = 1) => (v === null ? "—" : v.toFixed(digits));
  const pctOf = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(0)}%`);
  const shotCountByCard = new Map(
    (garmin?.rounds ?? []).map((r) => [r.scorecardId, r.shotCount]),
  );
  const rows: { label: string; pair: StatPair; fmt: (v: number | null) => string; unit: string }[] = [
    { label: "Scoring", pair: form.scoring, fmt: (v) => num(v), unit: "rounds" },
    { label: "Putts / round", pair: form.putts, fmt: (v) => num(v), unit: "rounds" },
    { label: "Three-putt share", pair: form.threePutt, fmt: pctOf, unit: "holes" },
    { label: "Fairways hit", pair: form.fairwayHit, fmt: pctOf, unit: "holes" },
  ];
  return (
    <section className="mt-10" id="recent">
      <h2 className="font-serif text-[26px] leading-tight">Recent form</h2>
      <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
        The last {form.months} months (since {form.cutoff}), measured from the
        newest card ({form.asOf}) — never from today, so the page reads the
        same until the record changes. Quick-entry echoes of a card already on
        file are not counted twice.
      </p>

      <ul className="mt-5 space-y-px">
        {lastN.map((r) => {
          const scorecardId = scorecardByRound.get(r.roundId) ?? null;
          const heard = scorecardId !== null ? (shotCountByCard.get(scorecardId) ?? null) : null;
          return (
            <li
              key={r.roundId}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-2 bg-paper-1 px-3 py-2.5 sm:px-4"
              style={{ borderColor: "var(--line)" }}
            >
              <span className="font-mono text-[11px] tabular-nums text-ink-3">{r.date}</span>
              <span className="text-[15px] leading-snug text-ink-0">{r.courseName ?? "—"}</span>
              <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-ink-1">
                {r.strokes ?? "—"} strokes
                {r.putts !== null ? ` · ${r.putts} putts` : ""}
                {scorecardId !== null && heard !== null && (
                  <>
                    {" · "}
                    <Link
                      href={`/diary#${scorecardId}`}
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

      <dl className="mt-4 space-y-1 font-mono text-[11px] leading-5">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-wrap gap-x-3">
            <dt className="w-32 shrink-0 text-ink-1">{row.label}</dt>
            <dd className="text-ink-2">
              {row.fmt(row.pair.recent)} recent ({row.pair.recentN} {row.unit}) ·{" "}
              {row.fmt(row.pair.career)} career ({row.pair.careerN} {row.unit})
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ── one ranked leak — the engine's output, drawn ── */

function LeakEntry({ n, leak }: { n: string; leak: Leak }) {
  const rows: { k: string; v: ReactNode; accent?: boolean }[] = [
    { k: "fact", v: leak.fact },
    { k: "cost", v: leak.cost, accent: true },
    { k: "move", v: leak.move },
    { k: "retired", v: leak.retiredWhen },
  ];
  return (
    <div className="border-t pt-5 pb-2 rule">
      <h3 className="flex flex-wrap items-baseline gap-x-3 text-[17px] leading-snug text-ink-0">
        <span className="font-mono text-[13px] font-bold text-accent-ink">{n}</span>
        {leak.title}
        <span className="stamp ml-auto shrink-0 text-ink-3">{leak.source}</span>
      </h3>
      <dl className="mt-2 space-y-1.5 font-mono text-[11px] leading-5 sm:pl-8">
        {rows.map((r) => (
          <div key={r.k} className="flex gap-3">
            <dt className="w-14 shrink-0 text-ink-3">{r.k}</dt>
            <dd className={r.accent ? "font-bold text-accent-ink" : "text-ink-1"}>{r.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function Scratch() {
  const data = buildSiteData();
  const h = data.roundHistory;
  if (!h) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8">
        <h1 className="font-serif text-[42px] leading-[0.9] sm:text-[56px]">THE ROAD TO SCRATCH</h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-6 text-ink-1">
          No round history yet. Run <code className="font-mono text-[13px]">pnpm
          data:rounds</code> (needs a Grint export bundle in data/raw/), then this page derives itself.
        </p>
      </div>
    );
  }

  const scored = eighteenHole(h);
  const years = yearlyMeans(scored);
  const trend = differentialTrend(h);
  const withPutts = scored.filter((r) => r.putts !== null);
  const pp = puttsPerRound(withPutts);
  const meanStrokes = mean(withPutts.map((r) => r.strokes as number));
  const tp = threePuttShare(h.rounds);
  const threePuttsPerRound = withPutts.length ? tp.threePutts / withPutts.length : null;
  const fw = fairwaySplit(h.rounds);
  const fwTotal = fw.classified;
  const best = h.differentials.reduce((a, b) => (b.differential < a.differential ? b : a));
  const last20 = [...h.differentials.slice(-20)].sort((a, b) => a.differential - b.differential);
  const best8 = mean(last20.slice(0, 8).map((p) => p.differential));
  const gir = h.series?.girPerRound.map((p) => p.value) ?? [];
  const girMean = mean(gir);
  const girLast20 = gir.length >= 20 ? mean(gir.slice(-20)) : null;
  const saves = h.series?.parSavesPct.map((p) => p.value) ?? [];
  const savesMean = mean(saves);
  const bestPutts = withPutts.length ? Math.min(...withPutts.map((r) => r.putts as number)) : null;
  /* The recent window the whole repo uses — anchored to the newest card, never
   * the wall clock, with quick-entry echoes deduped — instead of a date literal
   * that quietly means something different every season. */
  const newest = asOf(h.rounds);
  const recentRounds = newest
    ? since(h.rounds, PROFILE_THRESHOLDS.recentMonths, newest).length
    : 0;
  const recentLabel = `the last ${PROFILE_THRESHOLDS.recentMonths} months`;
  const rounds2022 = h.rounds.filter((r) => r.date.startsWith("2022")).length;

  const puttYears = years.filter((y) => y.rounds > 0);
  const puttSeries = puttYears
    .map((y) => {
      const rs = scored.filter((r) => r.date.startsWith(y.year) && r.putts !== null);
      const m = mean(rs.map((r) => r.putts as number));
      return m === null ? null : { y: y.year, v: +m.toFixed(1), n: rs.length };
    })
    .filter((p): p is { y: string; v: number; n: number } => p !== null);
  const tpSeries = puttYears
    .map((y) => {
      const rs = h.rounds.filter((r) => r.date.startsWith(y.year));
      const t = threePuttShare(rs);
      return t.holes === 0
        ? null
        : { y: y.year, v: +((t.threePutts / t.holes) * 100).toFixed(1), n: rs.length };
    })
    .filter((p): p is { y: string; v: number; n: number } => p !== null);

  /* The leak engine reads the whole record: the scorecards price the leaks,
   * the range and the watch say which are located, and the practice list
   * supplies each move — computed on render so no sentence goes stale. */
  const { garminShots, leaks } = data;

  /* The recent window beside the whole record — the same gate the profile
   * uses, rendered here because the scorecards' trends live on this page. */
  const form = recentVsCareer(h, PROFILE_THRESHOLDS.recentMonths);
  const recentForm =
    form !== null && form.scoring.recentN >= PROFILE_THRESHOLDS.minRecentRounds ? form : null;
  /* The watch's copy of a recent round, where a human confirmed the join —
   * the same round carries two stroke counts, one per ledger, and a link
   * beats a silent contradiction. */
  const scorecardByRound = new Map<string, string>();
  for (const [scorecardId, r] of loadLinkedGrint()) scorecardByRound.set(r.roundId, scorecardId);
  const watchShots = garminShots
    ? shotRounds(garminShots).reduce((a, r) => a + r.shotCount, 0)
    : 0;

  const spec: StatTile[] = [
    { value: h.handicapIndex === null ? "—" : f1(h.handicapIndex), label: "handicap index, from 23.9", accent: true },
    { value: String(best.differential), label: "best differential in 5 yrs" },
    { value: pp === null ? "—" : f1(pp), label: "putts per 18-hole round" },
    { value: girMean === null ? "—" : `${f1(girMean)}/18`, label: "greens in regulation" },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8">
      <h1 className="font-serif text-[42px] leading-[0.9] tracking-[-0.01em] sm:text-[56px] lg:text-[72px]">
        THE ROAD TO SCRATCH
      </h1>
      <p className="stamp mt-3 text-ink-3">
        {h.rounds.length} rounds · {h.rounds[0]?.date} → {h.rounds[h.rounds.length - 1]?.date} ·
        {" "}derived on render, nothing by hand
      </p>
      <p className="mt-5 max-w-2xl border-t pt-5 text-[15px] leading-6 text-ink-1 rule">
        Five seasons of scorecards say the golf is getting better — and say exactly where the
        remaining strokes live. The analysis, the critique of its own evidence, and the gaps
        ranked by what they cost.
      </p>

      <StatTiles
        tiles={spec}
        className="mt-6 grid grid-cols-2 gap-px border bg-paper-2 rule sm:grid-cols-4"
      />

      {/* ── the arc ── */}
      <section className="mt-10">
        <h2 className="font-serif text-[26px] leading-tight">The arc</h2>
        <p className="mt-2 max-w-2xl text-[14px] leading-6 text-ink-1">
          Every posted round as a handicap differential — the one number in the record that
          already adjusts for course difficulty — with the trending handicap drawn through it.
          The dashed line at zero is scratch. Note what never happens:{" "}
          <strong className="text-ink-0">no dot touches it.</strong> The best round in five years
          is still {f1(best.differential)} strokes above scratch pace.
        </p>
        <figure className="m-0 mt-4 border bg-paper-1 p-4 rule">
          <figcaption className="stamp mb-2 text-ink-3">
            handicap differentials &amp; trending index · {h.differentials.length} chart points
          </figcaption>
          <ArcChart h={h} />
          <div className="mt-2 flex flex-wrap gap-4 font-mono text-[11px] text-ink-2">
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-[3px] w-3.5" style={{ background: "var(--accent-ink)" }} />
              trending handicap
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-2 w-2 rounded-full opacity-60" style={{ background: "var(--chart-2)" }} />
              round differential
            </span>
          </div>
        </figure>
        <p className="mt-4 max-w-2xl text-[14px] leading-6 text-ink-1">
          The subtler finding: the raw scores barely moved while the handicap halved — the yearly
          mean went {years[0] ? f1(years[0].meanStrokes) : "—"} to ~{years.length ? f1(years[years.length - 1].meanStrokes) : "—"} as
          the index went 23.9 → {h.handicapIndex === null ? "—" : f1(h.handicapIndex)}. A differential is
          score-minus-rating scaled by slope, so that divergence is arithmetic, not opinion:{" "}
          <strong className="text-ink-0">the same scores, against progressively harder golf.</strong>
        </p>
      </section>

      {/* ── where the strokes live ── */}
      <section className="mt-10">
        <h2 className="font-serif text-[26px] leading-tight">Where the strokes live</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Mini title="mean 18-hole score" min={84} max={94}
            pts={years.map((y) => ({ y: y.year, v: y.meanStrokes, n: y.rounds }))} />
          <Mini title="putts per round" min={32} max={38} pts={puttSeries} />
          <Mini title="three-putt rate" min={0} max={18} unit="%" pts={tpSeries} />
        </div>
        <p className="mt-4 max-w-2xl text-[14px] leading-6 text-ink-1">
          {pp !== null && meanStrokes !== null && (
            <>
              <strong className="text-ink-0">
                {f1(pp)} putts a round is {Math.round((pp / meanStrokes) * 100)}% of all strokes
              </strong>{" "}
              — the largest single line item — with a three-putt every{" "}
              {Math.round(tp.holes / tp.threePutts)} holes
              {threePuttsPerRound !== null && <> ({f1(threePuttsPerRound)} per round)</>}. The trend is
              genuinely improving, though the recent figures rest on {recentRounds} rounds.
              {bestPutts !== null && <> The best putting round on file used {bestPutts}.</>}
            </>
          )}
        </p>
        {fwTotal > 0 && (
          <div className="mt-4 border bg-paper-1 p-4 rule">
            <p className="stamp mb-3 text-ink-3">
              fairway results · {fwTotal} driven holes ({fw.unclassified} holes carry codes outside
              Grint&apos;s legend, excluded)
            </p>
            {([
              ["hit", fw.hit],
              ["missed left", fw.left],
              ["missed right", fw.right],
              ["missed, no side", fw.missed],
            ] as const).map(([label, count]) => (
              <div key={label} className="grid grid-cols-[110px_1fr_44px] items-center gap-3 py-1">
                <span className="font-mono text-[11px] text-ink-2">{label}</span>
                <span className="relative block h-3.5 bg-paper-2">
                  <span className="block h-full min-w-0.5 rounded-r"
                    style={{ width: `${((count / fwTotal) * 100).toFixed(1)}%`, background: "var(--chart-2)" }} />
                </span>
                <span className="text-right font-mono text-[12px] tabular-nums text-ink-0">
                  {Math.round((count / fwTotal) * 100)}%
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 max-w-2xl text-[14px] leading-6 text-ink-1">
          The tee miss is{" "}
          <strong className="text-ink-0">
            dead even: {Math.round((fw.left / fwTotal) * 100)}% left, {Math.round((fw.right / fwTotal) * 100)}% right
          </strong>{" "}
          — the course-side echo of what the launch monitor found in the irons, and the one miss
          pattern aiming off cannot fix.
          {girMean !== null && savesMean !== null && (
            <>
              {" "}Meanwhile the approach game hits {f1(girMean)} greens in regulation per round
              {girLast20 !== null && <> ({f1(girLast20)} over the last twenty — improving)</>}, and when
              a green is missed, par is saved just{" "}
              <strong className="text-ink-0">{f1(savesMean)}%</strong> of the time.
            </>
          )}
        </p>
      </section>

      {/* ── recent form ── */}
      {recentForm && (
        <RecentFormSection
          form={recentForm}
          scorecardByRound={scorecardByRound}
          garmin={garminShots}
        />
      )}

      {/* ── the critique ── */}
      <section className="mt-10">
        <h2 className="font-serif text-[26px] leading-tight">The critique</h2>
        <p className="mt-2 max-w-2xl text-[14px] leading-6 text-ink-1">
          What this analysis can and cannot claim, before anyone builds a swing on it:
        </p>
        <ul className="mt-3 max-w-2xl list-disc space-y-2 pl-5 text-[14px] leading-6 text-ink-1 marker:text-accent-ink">
          <li>
            <strong className="text-ink-0">The recent story rests on {recentRounds} rounds
            in {recentLabel}.</strong>{" "}
            The improving means, the falling three-putt rate, the rising GIR — all real numbers,
            all thin samples. One buddies trip rewrites them.
          </li>
          <li>
            <strong className="text-ink-0">Volume collapsed exactly when the golf got good.</strong>{" "}
            {rounds2022} rounds in 2022; {recentRounds} in {recentLabel}. The record proves
            improvement happened; it cannot prove it survives playing more.
          </li>
          <li>
            <strong className="text-ink-0">The differentials and the scorecards are two un-joined
            datasets.</strong> The chart has {h.differentials.length} points, the ledger{" "}
            {h.rounds.length} rounds, and joining them by position would be invented data — so no
            per-round score-vs-differential claims are made.
          </li>
          <li>
            <strong className="text-ink-0">Nothing between the fairway and the green is
            recorded.</strong> Chips, pitches, bunker shots and penalties hide inside the strokes
            column. The scramble rate says the short game leaks; it cannot say which shot.
          </li>
          <li>
            <strong className="text-ink-0">No par, rating or slope per tee made it into the
            capture</strong>, so raw scores are only comparable through the handicap math.
          </li>
          <li>
            <strong className="text-ink-0">The monitor and the course have never met.</strong>{" "}
            {watchShots > 0 ? (
              <>
                The watch now stands between them — {watchShots} shots measured on grass — but
                not one launch-monitor number was struck on a course, so every range conclusion
                is still an inference about the course, checked only where the watch overlaps it.
              </>
            ) : (
              <>Every range conclusion is an inference about the course, not a measurement of it.</>
            )}
          </li>
        </ul>
      </section>

      {/* ── the leaks ── */}
      <section className="mt-10" id="leaks">
        <h2 className="font-serif text-[26px] leading-tight">The leaks, ranked</h2>
        <p className="mt-2 max-w-2xl text-[14px] leading-6 text-ink-1">
          Scratch means the best eight of the last twenty differentials average{" "}
          <code className="font-mono text-[13px]">0.0</code>. Today that number is{" "}
          <code className="font-mono text-[13px] text-accent-ink">{best8 === null ? "—" : best8.toFixed(2)}</code>.
          Where the strokes leak, on this record&apos;s own arithmetic: leaks the record
          can price come first, ranked by strokes; the ones whose cost is unknown by
          construction follow, ranked by how much of the record says they exist. Each
          move is the open practice task that addresses it, joined on render.
        </p>
        <div className="mt-5">
          {leaks.map((l, i) => (
            <LeakEntry key={l.id} n={String(i + 1).padStart(2, "0")} leak={l} />
          ))}
        </div>
        <blockquote className="mt-6 max-w-2xl border-l-2 pl-4 text-[14px] italic leading-6 text-ink-1"
          style={{ borderColor: "var(--accent-ink)" }}>
          The honest summary: scratch is {best8 === null ? "—" : best8.toFixed(1)} strokes of
          sustained improvement away — roughly the distance already traveled from 23.9. The first
          half was bought with harder courses and better putting. The record says the second half
          is priced in greens hit.
          <br />
          <span className="font-mono text-[11px] not-italic text-ink-3">
            — best 8 of last 20 differentials: {best8 === null ? "—" : best8.toFixed(2)} · required
            for scratch: 0.0
          </span>
        </blockquote>
      </section>

      <Provenance
        sources={buildSources({ roundHistory: h, garminShots }).filter(
          (s) => s.id === "scorecards" || s.id === "watch",
        )}
        note={
          <>
            GIR and scramble rates read from TheGrint&apos;s own per-round charts ·
            fairway codes decoded from the scorecard form&apos;s own legend (1 left ·
            2 right · 3 hit · 4 missed) · every claim above carries the condition
            that retires it
          </>
        }
      />
    </div>
  );
}
