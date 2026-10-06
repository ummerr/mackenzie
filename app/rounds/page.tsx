import Link from "next/link";
import type { ReactNode } from "react";
import { shotRounds, type GarminShots } from "@/lib/garmin-shots";
import type { Leak } from "@/lib/leaks";
import { loadLinkedGrint } from "@/lib/load";
import type { PlayedRound, RecentForm, RoundHistory, StatPair } from "@/lib/round-history";
import { buildSiteData } from "@/lib/site-data";
import { buildSources } from "@/lib/sources";
import { ArcChart, Mini } from "../charts";
import { Provenance } from "../provenance";
import { StatTiles, type StatTile } from "../stat-tiles";
import { WatchSection } from "./watch";
import {
  asOf,
  decodePenaltyCode,
  describePenalties,
  differentialTrend,
  recentVsCareer,
  eighteenHole,
  fairwaySplit,
  PENALTY_CODE,
  PENALTY_LETTERS,
  penaltyTally,
  puttsPerRound,
  roundPenalties,
  since,
  threePuttShare,
  yearlyMeans,
} from "@/lib/round-history";
import { PROFILE_THRESHOLDS } from "@/lib/profile";

/* Every round of golf on file, both records at once: the scorecards' arc and
 * trends, the watch's shot-by-shot diary of the rounds it heard, and the
 * leaks priced from the whole record. The merge of the retired /scratch and
 * /diary pages — one canonical home for the rounds fact-family, joined
 * in-page on scorecardId instead of across two URLs. Same contract as
 * everything here: nothing written by hand, every number recomputed on
 * render, every gap named with the condition that retires it.
 */

export const metadata = {
  title: "Rounds — Mackenzie",
  description:
    "Every round on file — the career arc, the recent form, the watch's shot traces, and the leaks ranked by what they cost.",
};

const f1 = (n: number) => n.toFixed(1);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

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
    { label: "Penalty strokes / card", pair: form.penaltyStrokes, fmt: (v) => num(v), unit: "cards, floor" },
    { label: "Bunker shots / card", pair: form.bunkerShots, fmt: (v) => num(v), unit: "cards, floor" },
  ];
  return (
    <section className="mt-10" id="recent">
      <h2 className="font-serif text-[26px] leading-tight">Recent form</h2>
      <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
        The last {form.months} months (since {form.cutoff}), measured from the
        newest card ({form.asOf}) — never from today, so the page reads the
        same until the record changes. Quick-entry echoes of a card already on
        file are not counted twice. Under each round, the card&apos;s own
        penalty row, hole by hole:{" "}
        {PENALTY_LETTERS.map((l, i) => (
          <span key={l}>
            {i > 0 ? " · " : ""}
            <b className="text-ink-2">{l}</b> {PENALTY_CODE[l].label}
          </span>
        ))}
        . A letter is one event, so <b className="text-ink-2">SS</b> is two
        bunker shots; a blank is a hole Grint did not count — clean, or never
        entered.
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
                      href={`#${scorecardId}`}
                      className="text-ink-1 underline decoration-1 underline-offset-2"
                    >
                      the watch heard {heard} →
                    </Link>
                  </>
                )}
              </span>
              <PenaltyRow round={r} />
            </li>
          );
        })}
      </ul>

      <dl className="mt-4 space-y-1 font-mono text-[11px] leading-5">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-wrap gap-x-3">
            <dt className="w-44 shrink-0 text-ink-1">{row.label}</dt>
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

/* ── one card's penalty row, hole by hole ── */

/* Eighteen cells, one per hole, then the marked holes in the legend's words
 * with the hole's strokes beside them — so "7 on the 3rd" and "drop shot on
 * the 3rd" are the same line. Penalty strokes (W, D, O) print in accent;
 * bunkers in plain ink; a blank cell is a dot, not a zero. */
function PenaltyRow({ round }: { round: PlayedRound }) {
  const pen = roundPenalties(round);
  if (pen === null) {
    return (
      <p className="w-full font-mono text-[11px] leading-5 text-ink-3">
        no penalty row on this card (quick entry)
      </p>
    );
  }
  const cells = (round.penaltyCodes ?? []).map((c, i) => ({
    hole: i + 1,
    strokes: round.holeStrokes?.[i] ?? null,
    hp: decodePenaltyCode(c),
  }));
  const played = cells.filter((c) => c.strokes !== null);
  const marked = played.filter((c) => c.hp !== null);
  return (
    <div className="mt-1.5 w-full">
      <div
        className="grid gap-px"
        style={{ gridTemplateColumns: `repeat(${played.length || 1}, minmax(0, 1fr))` }}
      >
        {played.map((c) => (
          <div
            key={c.hole}
            className="bg-paper-2 py-1 text-center font-mono leading-none"
            title={
              c.hp === null
                ? `Hole ${c.hole} · ${c.strokes} · penalty row blank`
                : `Hole ${c.hole} · ${c.strokes} · ${describePenalties(c.hp)}`
            }
          >
            <div className="text-[9px] text-ink-3">{c.hole}</div>
            <div
              className={`mt-0.5 text-[11px] font-bold ${
                c.hp === null
                  ? "text-ink-3"
                  : c.hp.penaltyStrokes > 0
                    ? "text-accent-ink"
                    : "text-ink-1"
              }`}
            >
              {c.hp === null ? "·" : c.hp.code}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-1.5 font-mono text-[11px] leading-5 text-ink-2">
        {marked.length === 0 ? (
          <span className="text-ink-3">penalty row blank on every hole — a clean card, or one never filled in</span>
        ) : (
          <>
            <span className="text-ink-1">
              {pen.penaltyStrokes} penalty stroke{pen.penaltyStrokes === 1 ? "" : "s"},{" "}
              {pen.bunkerShots} bunker shot{pen.bunkerShots === 1 ? "" : "s"} on {marked.length} hole
              {marked.length === 1 ? "" : "s"}:
            </span>{" "}
            {marked.map((c, i) => (
              <span key={c.hole}>
                {i > 0 ? " / " : ""}
                <b className={c.hp!.penaltyStrokes > 0 ? "text-accent-ink" : "text-ink-1"}>
                  H{c.hole}
                </b>{" "}
                {c.strokes} · {describePenalties(c.hp!)}
              </span>
            ))}
          </>
        )}
      </p>
    </div>
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

export default function Rounds() {
  const data = buildSiteData();
  const h = data.roundHistory;
  if (!h) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8">
        <h1 className="font-serif text-[42px] leading-[0.9] sm:text-[56px]">THE ROUNDS</h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-6 text-ink-1">
          No round history yet. Run <code className="font-mono text-[13px]">pnpm
          data:rounds</code> (needs a Grint export bundle in data/raw/), then this page derives itself.
        </p>
        <WatchSection garmin={data.garminShots} linked={loadLinkedGrint()} />
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
  /* The penalty row over the whole record and over the recent window — both
   * numbers, always. Rates divide by every card that has a row, blank rows
   * counted as clean, so each is a floor and is labelled one. */
  const penCareer = penaltyTally(scored);
  const penRecent = newest
    ? penaltyTally(
        since(h.rounds, PROFILE_THRESHOLDS.recentMonths, newest).filter(
          (r) => r.holes === 18 && r.strokes !== null,
        ),
      )
    : null;
  const penEvents = PENALTY_LETTERS.reduce((n, l) => n + penCareer.byCode[l], 0);
  const perCard = (n: number, cards: number) => (cards > 0 ? f1(n / cards) : "—");

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
  const watchRounds = garminShots ? shotRounds(garminShots).length : 0;

  const spec: StatTile[] = [
    { value: h.handicapIndex === null ? "—" : f1(h.handicapIndex), label: "handicap index, from 23.9", accent: true },
    { value: String(best.differential), label: "best differential in 5 yrs" },
    { value: pp === null ? "—" : f1(pp), label: "putts per 18-hole round" },
    { value: girMean === null ? "—" : `${f1(girMean)}/18`, label: "greens in regulation" },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8">
      <h1 className="font-serif text-[42px] leading-[0.9] tracking-[-0.01em] sm:text-[56px] lg:text-[72px]">
        THE ROUNDS
      </h1>
      <p className="stamp mt-3 text-ink-3">
        {h.rounds.length} rounds · {h.rounds[0]?.date} → {h.rounds[h.rounds.length - 1]?.date} ·
        {" "}{watchRounds} the watch heard · derived on render, nothing by hand
      </p>
      <p className="mt-5 max-w-2xl border-t pt-5 text-[15px] leading-6 text-ink-1 rule">
        Five seasons of scorecards say the golf is getting better — and say exactly where the
        remaining strokes live. The arc, the recent form, every shot the watch heard, the
        critique of the evidence, and the gaps ranked by what they cost.
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
          <ArcChart pts={h.differentials} handicapIndex={h.handicapIndex} />
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
            pts={years.map((y) => ({ y: y.year, v: +y.meanStrokes.toFixed(1), n: y.rounds }))} />
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

        {penCareer.cards > 0 && penEvents > 0 && (
          <>
            <div className="mt-4 border bg-paper-1 p-4 rule">
              <p className="stamp mb-3 text-ink-3">
                the penalty row · {penEvents} marks on {penCareer.holesMarked} holes across{" "}
                {penCareer.cards} cards · {penCareer.cardsMarked} cards carry at least one
                {penCareer.unknown > 0 && <> · {penCareer.unknown} letters outside Grint&apos;s legend, excluded</>}
              </p>
              {PENALTY_LETTERS.map((l) => {
                const count = penCareer.byCode[l];
                return (
                  <div key={l} className="grid grid-cols-[136px_1fr_44px] items-center gap-3 py-1">
                    <span className="font-mono text-[11px] text-ink-2">
                      <b className="text-ink-1">{l}</b> {PENALTY_CODE[l].label}
                    </span>
                    <span className="relative block h-3.5 bg-paper-2">
                      <span
                        className="block h-full min-w-0.5 rounded-r"
                        style={{
                          width: `${((count / penEvents) * 100).toFixed(1)}%`,
                          background: PENALTY_CODE[l].stroke ? "var(--accent-ink)" : "var(--chart-2)",
                        }}
                      />
                    </span>
                    <span className="text-right font-mono text-[12px] tabular-nums text-ink-0">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 max-w-2xl text-[14px] leading-6 text-ink-1">
              The card&apos;s penalty row is the one thing it records between the fairway and the
              green. Over the whole record it says{" "}
              <strong className="text-ink-0">
                {perCard(penCareer.penaltyStrokes, penCareer.cards)} penalty strokes and{" "}
                {perCard(penCareer.bunkerShots, penCareer.cards)} bunker shots a card
              </strong>
              {penRecent && penRecent.cards > 0 && (
                <>
                  ; over {recentLabel} it says {perCard(penRecent.penaltyStrokes, penRecent.cards)} and{" "}
                  {perCard(penRecent.bunkerShots, penRecent.cards)} ({penRecent.cards} cards)
                </>
              )}
              . Every one of those is a floor: {penCareer.cards - penCareer.cardsMarked} of the{" "}
              {penCareer.cards} cards have a blank row, and Grint&apos;s own form says a blank cell
              is not counted — it is a clean hole or a hole never entered, and the record cannot
              tell which. A penalty stroke is a stroke by definition, so this is the one leak the
              card prices without a benchmark. The hole-by-hole rows are under each recent round
              below, and on every hole the watch heard.
            </p>
          </>
        )}
      </section>

      {/* ── recent form ── */}
      {recentForm && (
        <RecentFormSection
          form={recentForm}
          scorecardByRound={scorecardByRound}
          garmin={garminShots}
        />
      )}

      {/* ── the watch's diary of the rounds it heard ── */}
      <WatchSection garmin={garminShots} linked={loadLinkedGrint()} />

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
            <strong className="text-ink-0">Only the penalty row records anything between the
            fairway and the green.</strong> Bunker visits and penalty strokes are marked hole by
            hole where the card was filled in; chips and pitches still hide inside the strokes
            column, and a blank row cannot say whether the hole was clean or never entered. The
            scramble rate says the short game leaks; the row says where the sand and the drops
            were, not which chip.
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
            2 right · 3 hit · 4 missed) · penalty codes from the same form&apos;s
            Penalties legend (W penalty area · D drop shot · O out of bounds · S
            greenside bunker · F fairway bunker; one letter per event, a blank
            is not counted) · putts and penalties on the watch&apos;s rounds arrive
            through data/round-links.json — machine-proposed, human-confirmed;
            only confirmed links are read · every claim above carries the
            condition that retires it
          </>
        }
      />
    </div>
  );
}
