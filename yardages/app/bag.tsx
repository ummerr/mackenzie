"use client";

import { useState } from "react";
import { BagChart, mergeDomains, plotDomain, type ShotDot } from "./bag-chart";
import { VERDICT } from "./palette";
import { short, type BagClub } from "@/lib/clubs";
import {
  DEFAULT_GAPS,
  MIN_SHOTS_TO_DISPLAY,
  type BagCoverage,
  type ClubProfile,
  type CoverageGap,
  type DistanceBasis,
  type Gap,
} from "@/lib/stats";

/* The page body, and the one piece of state it has: which distance you mean.
 *
 * Client rather than server for that single boolean, and it is worth it. The
 * alternative — the toggle living inside the chart — would leave the scorecard
 * beside it and the card below it reporting carry while the chart reported
 * total, and a page showing two bases at once is worse than a page showing the
 * wrong one. Every number here moves together or none of them do.
 *
 * Both bases arrive precomputed from the server component. Nothing statistical
 * happens in this file; switching basis picks a different prepared view, it
 * does not recompute one.
 */

export interface BasisView {
  bag: ClubProfile[];
  gaps: Gap[];
  dots: ShotDot[];
}

export interface BagProps {
  views: Record<DistanceBasis, BasisView>;
  sessionCount: number;
  shotCount: number;
  excludedCount: number;
  coverage: CoverageGap[];
  /** Median rollout per club, from shots that measured both ends of it. */
  rollout: [string, number][];
  /** data/bag.json, in bag order. Empty when the file has not been written. */
  clubs: BagClub[];
  /** Which of those clubs the ledger has anything to say about. */
  bagCoverage: BagCoverage | null;
}

const yd = (v: number | null, d = 0) => (v === null ? "—" : v.toFixed(d));

export function Bag({
  views,
  sessionCount,
  shotCount,
  excludedCount,
  coverage,
  rollout,
  clubs,
  bagCoverage,
}: BagProps) {
  const [basis, setBasis] = useState<DistanceBasis>("carry");

  const { bag, gaps, dots } = views[basis];

  /* One frame for both bases, so switching moves the cones instead of
   * rescaling the axis under them. Computed across every view rather than the
   * shown one — a frame that changed with the toggle would let a bag that runs
   * seven yards further read as the same size, which is the one comparison the
   * toggle exists to make. Two bags of eight clubs; not worth memoising. */
  const domain =
    mergeDomains(
      Object.values(views).map((v) => plotDomain(v.bag, v.dots)),
    ) ?? undefined;
  const shown = bag.filter((p) => !p.suppressed);
  const hidden = bag.filter((p) => p.suppressed);

  /* What this basis threw away, and what it cost. Both counted against the
   * carry view rather than stated in the abstract: "3 clubs" means nothing
   * without "which were drawn a moment ago". */
  const unusable = bag.reduce((sum, p) => sum + p.unusable, 0);
  const lostClubs = bag
    .filter(
      (p) =>
        p.suppressed &&
        p.unusable > 0 &&
        views.carry.bag.find((c) => c.club === p.club)?.suppressed === false,
    )
    .map((p) => p.club);

  // The headline is whichever flagged gap is worst, not a fixed club.
  const worst =
    gaps
      .filter((g) => !g.suppressed && (g.verdict === "hole" || g.verdict === "inverted"))
      .sort((a, b) => Math.abs(b.gapYd ?? 0) - Math.abs(a.gapYd ?? 0))[0] ?? null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-5 sm:py-8">
      {/* ── masthead ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-5 border-b-2 pb-5 rule-hard">
        <div>
          <h1 className="font-serif text-[52px] leading-[0.86] tracking-[-0.01em] sm:text-[64px] lg:text-[84px]">
            THE BAG
          </h1>
          <p className="stamp mt-3 text-ink-3">
            Every shot on file, drawn where it{" "}
            {basis === "carry" ? "landed" : "stopped"}
          </p>
          <BasisPicker basis={basis} onChange={setBasis} />
        </div>
        {worst && (
          <div
            className="border-l-2 pl-4"
            style={{ borderColor: VERDICT[worst.verdict].color }}
          >
            <p className="stamp text-ink-3">Worst gap on {worst.basis}</p>
            <div
              className="mt-1.5 font-sans text-[44px] font-semibold leading-[0.82] sm:text-[60px]"
              style={{ color: VERDICT[worst.verdict].color }}
            >
              {Math.abs(worst.gapYd ?? 0).toFixed(1)}
              <span className="ml-1 text-[18px] font-normal text-ink-2 sm:text-[22px]">
                yd
              </span>
            </div>
            <p className="stamp mt-2 text-ink-1">
              {VERDICT[worst.verdict].word} · {worst.longer} → {worst.shorter}
            </p>
          </div>
        )}
      </div>

      {/* ── scoreboard ───────────────────────────────────────────────────── */}
      <dl className="mt-px grid grid-cols-2 border-t sm:grid-cols-3 lg:grid-cols-6 rule">
        {/* First, because it is the denominator for everything after it. The
            four tiles that follow all count swings; this one counts clubs, and
            without it "8 clubs drawn" reads as a complete bag. */}
        {bagCoverage && (
          <Stat
            label="In the bag"
            value={bagCoverage.owned}
            note={
              bagCoverage.neverRecorded.length > 0
                ? `${bagCoverage.neverRecorded.length} never measured`
                : "all measured"
            }
          />
        )}
        <Stat label="Sessions" value={sessionCount} />
        <Stat label="Shots logged" value={shotCount} />
        {/* Trusted is a property of the shot, not of the basis, so the count
            does not move — but on total, some of those trusted shots have no
            distance to contribute, and the tile says which. */}
        <Stat
          label="Trusted"
          value={shotCount - excludedCount}
          note={unusable > 0 ? `${unusable} with no total` : undefined}
        />
        <Stat label="Clubs drawn" value={shown.length} />
        <Stat label="Held back" value={hidden.length} note={`under ${MIN_SHOTS_TO_DISPLAY}`} />
      </dl>

      {/* ── the hole, and the scorecard beside it ────────────────────────── */}
      <div className="mt-6 grid gap-6 sm:mt-8 sm:gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section>
          <BagChart profiles={bag} shots={dots} basis={basis} domain={domain}>
            {unusable > 0 && (
              <UnmodelledNote unusable={unusable} lostClubs={lostClubs} />
            )}
          </BagChart>
        </section>

        <aside className="space-y-px self-start">
          <section className="card p-4">
            <h2 className="stamp text-ink-2">Gaps on {basis}, in bag order</h2>
            <table className="mt-3 w-full border-collapse font-mono text-[11px]">
              <tbody>
                {gaps.map((g) => (
                  <GapRow key={`${g.longer}->${g.shorter}`} gap={g} />
                ))}
              </tbody>
            </table>
            <GapScale />
            <p className="mt-2 font-mono text-[10px] leading-4 text-ink-3">
              Compared in loft order, never sorted by measured distance — a club
              that goes shorter than the one above it is the finding, not a
              sorting error. Under {DEFAULT_GAPS.overlapUnderYd} yd apart is an
              overlap; over {DEFAULT_GAPS.holeOverYd} is a hole.
            </p>
            {clubs.length > 0 && (
              <p className="mt-2 font-mono text-[10px] leading-4 text-ink-3">
                The degrees are what the bag was <em>built</em> to do, from{" "}
                <code className="text-ink-2">data/bag.json</code>. An even loft
                gap with no carry gap behind it is a strike or a shaft; a carry
                gap with no loft behind it is the equipment. A dotted figure
                compares two different head types, where the arithmetic holds
                and the meaning does not.
              </p>
            )}
          </section>

          {hidden.length > 0 && (
            <section className="card p-4">
              <h2 className="stamp text-ink-2">Not drawn</h2>
              <ul className="mt-3 space-y-1 font-mono text-[11px] text-ink-3">
                {hidden.map((p) => (
                  <li key={p.club} className="flex justify-between gap-3">
                    <span className="text-ink-1">{p.club}</span>
                    <span className="tabular-nums">
                      n={p.active}
                      {p.n !== p.active && ` of ${p.n}`}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 font-mono text-[10px] leading-4 text-ink-3">
                Under {MIN_SHOTS_TO_DISPLAY} usable shots. Suppressed rather than
                drawn, because a median off a dozen swings is a number you would
                act on and shouldn&rsquo;t.
                {lostClubs.length > 0 && (
                  <>
                    {" "}
                    {lostClubs.join(", ")} {lostClubs.length === 1 ? "clears" : "clear"}{" "}
                    the threshold on carry and{" "}
                    {lostClubs.length === 1 ? "fails" : "fail"} it here, because
                    the shots the monitor never rolled out cannot be counted
                    twice.
                  </>
                )}
              </p>
            </section>
          )}
        </aside>
      </div>

      {clubs.length > 0 && (
        <WhatsInTheBag clubs={clubs} coverage={bagCoverage} bag={bag} />
      )}

      <Caveats
        profiles={shown}
        coverage={coverage}
        basis={basis}
        unusable={unusable}
      />

      {/* ── the card ─────────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="stamp text-ink-2">Every number on this page</h2>
        {/* Sixteen columns is a table, and a table 940px wide on a 390px screen
            is a horizontal scroll through a grid whose header has already left
            the screen — you read a number with nothing to say which column it
            came from. Below `md` the same rows are dealt out as cards instead,
            one club each, every label travelling with its own value. Same
            numbers, same order, same held-back clubs, same basis; only the axis
            they are laid out on changes. */}
        <ul className="mt-3 space-y-px md:hidden">
          {bag.map((p) => (
            <ClubCard
              key={p.club}
              p={p}
              basis={basis}
              roll={rollout.find(([c]) => c === p.club)?.[1] ?? null}
            />
          ))}
        </ul>

        <div className="card mt-3 hidden overflow-x-auto md:block pan-x">
          <table className="w-full min-w-[940px] border-collapse font-mono text-[11px]">
            <thead>
              <tr className="border-b bg-paper-2 text-ink-2 rule">
                {[
                  "Club",
                  "n",
                  "Used",
                  "Sessions",
                  `${basis} p25`,
                  "Median",
                  `${basis} p75`,
                  "Roll",
                  "Offline p10",
                  "Offline p90",
                  "Aim p10",
                  "Aim p90",
                  "Ball",
                  "Smash",
                  "Launch",
                  "Backspin",
                ].map((h, i) => (
                  <th
                    key={h}
                    className={`px-3 py-2.5 text-[10px] font-normal uppercase tracking-[0.12em] ${
                      i === 0 ? "text-left" : "text-right"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bag.map((p) => (
                <tr
                  key={p.club}
                  className={`border-b border-[var(--line-soft)] ${
                    p.suppressed ? "text-ink-3" : "text-ink-1"
                  }`}
                >
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {p.club}
                    {p.suppressed && (
                      <span className="ml-2 text-[9px] uppercase tracking-[0.1em] text-ink-3">
                        held back
                      </span>
                    )}
                  </td>
                  <Num v={p.n} />
                  <Num v={p.active} />
                  <Num v={p.sessions} />
                  <Num v={p.distanceP25Yd} d={1} />
                  <Num v={p.medianDistanceYd} d={1} />
                  <Num v={p.distanceP75Yd} d={1} />
                  <Num v={rollout.find(([c]) => c === p.club)?.[1] ?? null} d={1} />
                  <Num v={p.offlineP10Yd} d={1} />
                  <Num v={p.offlineP90Yd} d={1} />
                  <Num v={p.deviationP10Deg} d={1} />
                  <Num v={p.deviationP90Deg} d={1} />
                  <Num v={p.medianBallSpeedMph} d={1} />
                  <Num v={p.medianSmashFactor} d={3} />
                  <Num v={p.medianLaunchAngleDeg} d={1} />
                  <Num v={p.medianBackspinRpm} d={0} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 font-mono text-[10px] leading-4 text-ink-3">
          The chart&rsquo;s table twin. Every value the plan view draws is here in
          full, held-back clubs included. Offline is in yards, aim in degrees —
          the cone is built from the degrees, because the yards are the degrees
          multiplied by however far the ball went. Roll is the median of{" "}
          <span className="text-ink-1">total minus carry on the same swing</span>,
          not the difference of the two columns above it: the two bases are
          measured over different shot sets, so differencing their medians would
          subtract one population from another and call the answer rollout.
        </p>
      </section>
    </div>
  );
}

/* The one control that governs the page.
 *
 * Both options are spelled out rather than labelled "carry" and "total" alone.
 * The words are jargon to anyone who has not stood on a range, the difference
 * between them is the whole point of the control, and there is room.
 *
 * A radiogroup rather than two pressed buttons, because the two are mutually
 * exclusive and a pair of independent toggles would say they are not. That
 * carries an obligation: a radiogroup is ONE tab stop, and the arrows move
 * within it. Roving tabindex below, or the role would be a label describing
 * keyboard behaviour the control does not have.
 */
const OPTIONS: { key: DistanceBasis; word: string; gloss: string }[] = [
  { key: "carry", word: "carry", gloss: "where it landed" },
  { key: "total", word: "total", gloss: "where it stopped" },
];

function BasisPicker({
  basis,
  onChange,
}: {
  basis: DistanceBasis;
  onChange: (b: DistanceBasis) => void;
}) {
  /* Arrows wrap and select in one move, which is what a radiogroup does: for a
   * two-option group, either arrow means "the other one". */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const step = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
    const i = OPTIONS.findIndex((o) => o.key === basis);
    const next = OPTIONS[(i + step + OPTIONS.length) % OPTIONS.length];
    onChange(next.key);
    e.currentTarget
      .querySelector<HTMLButtonElement>(`[data-basis="${next.key}"]`)
      ?.focus();
  };

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="stamp text-ink-3" id="basis-label">
        Measured to
      </span>
      <div
        role="radiogroup"
        aria-labelledby="basis-label"
        onKeyDown={onKeyDown}
        className="flex gap-px"
      >
        {OPTIONS.map((o) => {
          const on = basis === o.key;
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              data-basis={o.key}
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(o.key)}
              className={`border px-3 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.12em] transition-colors rule ${
                on ? "bg-paper-2 text-ink-0" : "text-ink-3 hover:text-ink-1"
              }`}
            >
              {o.word}
              <span
                className={`ml-2 normal-case tracking-normal ${
                  on ? "text-ink-2" : "text-ink-3"
                }`}
              >
                {o.gloss}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* Said above the chart, not below it. A reader who switches to total and sees
 * three clubs vanish deserves the reason before they go looking for the bug. */
function UnmodelledNote({
  unusable,
  lostClubs,
}: {
  unusable: number;
  lostClubs: string[];
}) {
  return (
    <p
      className="mb-3 border-l-2 pl-3 font-mono text-[10px] leading-4 text-ink-2"
      style={{ borderColor: VERDICT.overlap.color }}
    >
      <span className="text-ink-0">
        {unusable} trusted shots have no total distance
      </span>{" "}
      — the monitor wrote the carry row into the total row verbatim on those
      swings, distance, offline and angle alike, which is a rollout it never
      modelled rather than a ball that stopped where it landed. They are read as
      absent here, because counting them as total would publish a club that
      rolls nothing.
      {lostClubs.length > 0 && (
        <>
          {" "}
          That drops {lostClubs.join(", ")} below the{" "}
          {MIN_SHOTS_TO_DISPLAY}-shot threshold, so{" "}
          {lostClubs.length === 1 ? "it is" : "they are"} not drawn on this
          basis.
        </>
      )}
    </p>
  );
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: number;
  note?: string;
}) {
  return (
    <div className="border-r border-b bg-paper-1 px-4 py-3 rule">
      <dt className="stamp text-ink-3">{label}</dt>
      <dd className="mt-1.5 font-sans text-[28px] font-medium leading-none text-ink-0">
        {value}
        {note && (
          <span className="ml-2 font-mono text-[10px] font-normal tracking-[0.08em] text-ink-3">
            {note}
          </span>
        )}
      </dd>
    </div>
  );
}

function Num({ v, d = 0 }: { v: number | null; d?: number }) {
  return (
    <td className="px-3 py-1.5 text-right tabular-nums">{v === null ? "—" : v.toFixed(d)}</td>
  );
}

/* The table twin's own twin: one club per card, for the widths a sixteen-column
 * table cannot survive. Grouped the way the chart reads rather than the way the
 * table is ordered — near-far first, then sideways in yards, then sideways in
 * degrees, then the strike. */
function ClubCard({
  p,
  basis,
  roll,
}: {
  p: ClubProfile;
  basis: DistanceBasis;
  roll: number | null;
}) {
  return (
    <li className="card p-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className={`text-[14px] ${p.suppressed ? "text-ink-2" : "text-ink-0"}`}>
          {p.club}
        </h3>
        <span className="stamp shrink-0 text-ink-3">
          {p.suppressed && "held back · "}n={p.active}
          {p.n !== p.active && ` of ${p.n}`} · {p.sessions} sess
        </span>
      </div>
      <dl className="mt-2.5 grid grid-cols-[3.75rem_minmax(0,1fr)] gap-y-1.5 font-mono text-[11px]">
        <CardRow
          label={basis}
          cells={[
            ["p25", yd(p.distanceP25Yd, 1)],
            ["med", yd(p.medianDistanceYd, 1)],
            ["p75", yd(p.distanceP75Yd, 1)],
            ["roll", yd(roll, 1)],
          ]}
        />
        <CardRow
          label="offline"
          cells={[
            ["p10", yd(p.offlineP10Yd, 1)],
            ["p90", yd(p.offlineP90Yd, 1)],
          ]}
        />
        <CardRow
          label="aim"
          cells={[
            ["p10", yd(p.deviationP10Deg, 1)],
            ["p90", yd(p.deviationP90Deg, 1)],
          ]}
        />
        <CardRow
          label="strike"
          cells={[
            ["ball", yd(p.medianBallSpeedMph, 1)],
            ["smash", yd(p.medianSmashFactor, 3)],
            ["launch", yd(p.medianLaunchAngleDeg, 1)],
            ["spin", yd(p.medianBackspinRpm, 0)],
          ]}
        />
      </dl>
    </li>
  );
}

function CardRow({ label, cells }: { label: string; cells: [string, string][] }) {
  return (
    <>
      <dt className="stamp self-center text-ink-3">{label}</dt>
      <dd className="flex flex-wrap gap-x-3 gap-y-0.5">
        {cells.map(([k, v]) => (
          <span key={k} className="whitespace-nowrap">
            <span className="text-ink-3">{k} </span>
            <span className="tabular-nums text-ink-1">{v}</span>
          </span>
        ))}
      </dd>
    </>
  );
}

/* The gap ruler.
 *
 * A number alone makes you do the arithmetic against two thresholds on every
 * row. The bar puts the thresholds on the page: the shaded band is the 8–15 yd
 * window where a gap is fine, everything left of it is an overlap, everything
 * right is a hole, and anything drawn left of the zero mark is a club that goes
 * shorter than the one above it. Same domain on every row, so the rows compare.
 *
 * Same domain across BASES too. The thresholds are about what you can club your
 * way around, and that does not change with where you chose to measure to, so
 * switching basis moves the bars and leaves the ruler still.
 */
const RULER_W = 92;
const RULER_LO = -8;
const RULER_HI = 26;
const rulerX = (v: number) =>
  ((Math.min(Math.max(v, RULER_LO), RULER_HI) - RULER_LO) / (RULER_HI - RULER_LO)) * RULER_W;

/** The ruler's key: the same track, its four zones, and where the cuts fall. */
function GapScale() {
  const zones = [
    { at: RULER_LO, to: 0, v: VERDICT.inverted },
    { at: 0, to: DEFAULT_GAPS.overlapUnderYd, v: VERDICT.overlap },
    { at: DEFAULT_GAPS.overlapUnderYd, to: DEFAULT_GAPS.holeOverYd, v: VERDICT.ok },
    { at: DEFAULT_GAPS.holeOverYd, to: RULER_HI, v: VERDICT.hole },
  ];
  return (
    <div className="mt-3 flex items-start gap-3 border-t pt-2.5 rule">
      <svg width={RULER_W} height={18} aria-hidden className="shrink-0">
        {zones.map((z) => (
          <rect
            key={z.v.word}
            x={rulerX(z.at)}
            y={0}
            width={rulerX(z.to) - rulerX(z.at)}
            height={5}
            style={{ fill: z.v.color }}
            fillOpacity={0.45}
          />
        ))}
        {[0, DEFAULT_GAPS.overlapUnderYd, DEFAULT_GAPS.holeOverYd].map((t) => (
          <text
            key={t}
            x={rulerX(t)}
            y={16}
            textAnchor="middle"
            fontSize={9}
            fontFamily="var(--font-mono)"
            style={{ fill: "var(--ink-3)", fontVariantNumeric: "tabular-nums" }}
          >
            {t}
          </text>
        ))}
      </svg>
      <p className="font-mono text-[9px] uppercase leading-[1.5] tracking-[0.08em] text-ink-3">
        Yards apart · inverted, overlap, ok, hole
      </p>
    </div>
  );
}

function GapRow({ gap }: { gap: Gap }) {
  const v = VERDICT[gap.verdict];
  const shownGap = gap.suppressed ? null : gap.gapYd;
  return (
    <tr className="border-b border-[var(--line-soft)]">
      <td className="py-2 pr-2 whitespace-nowrap text-ink-1">
        {short(gap.longer)} <span className="text-ink-3">→</span> {short(gap.shorter)}
      </td>
      <td className="py-2 pr-2 text-right tabular-nums text-ink-0">
        {shownGap === null ? "—" : shownGap.toFixed(1)}
      </td>
      {/* What the bag was BUILT to do, beside what it does. Muted, because it is
          the reference and the carry is the measurement — and dotted where the
          two lofts sit on different head types, which makes the degrees real
          but the comparison not straightforwardly meaningful. */}
      <td
        className={`py-2 pr-2 text-right tabular-nums text-ink-3 ${
          gap.loftGapDeg !== null && !gap.loftComparable
            ? "decoration-dotted underline underline-offset-2"
            : ""
        }`}
        title={
          gap.loftGapDeg === null
            ? "no loft for this pair — either the bag file has none, or unmeasured clubs sit between these two"
            : gap.loftComparable
              ? "loft difference, from data/bag.json"
              : "loft difference across two different head types — the degrees do not compare directly"
        }
      >
        {gap.loftGapDeg === null ? "—" : `${gap.loftGapDeg.toFixed(1)}°`}
      </td>
      <td className="py-2 pr-2">
        {shownGap !== null ? (
          <svg width={RULER_W} height={12} aria-hidden className="block">
            <rect
              x={rulerX(DEFAULT_GAPS.overlapUnderYd)}
              y={0}
              width={rulerX(DEFAULT_GAPS.holeOverYd) - rulerX(DEFAULT_GAPS.overlapUnderYd)}
              height={12}
              style={{ fill: VERDICT.ok.color }}
              fillOpacity={0.14}
            />
            <line
              x1={rulerX(0)}
              x2={rulerX(0)}
              y1={0}
              y2={12}
              style={{ stroke: "var(--line-hard)" }}
              strokeWidth={1}
            />
            <rect
              x={Math.min(rulerX(0), rulerX(shownGap))}
              y={3}
              width={Math.max(Math.abs(rulerX(shownGap) - rulerX(0)), 1.5)}
              height={6}
              rx={1}
              style={{ fill: v.color }}
            />
          </svg>
        ) : (
          <span className="text-ink-3">not drawn</span>
        )}
      </td>
      <td className="py-2 text-right whitespace-nowrap">
        {shownGap !== null && (
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: v.color }}
            />
            <span className="text-[10px] uppercase tracking-[0.08em] text-ink-2">
              {v.word}
            </span>
          </span>
        )}
      </td>
    </tr>
  );
}

/* The bag, as asserted rather than as measured.
 *
 * Everything else on this page is derived from shots. This one section is not:
 * it is `data/bag.json`, written by hand, and it is here because the chart
 * above can only ever draw what was hit. A club with no shots produces no
 * region, no dot and no gap flag, so its absence reads as nothing to report
 * rather than never measured — and the difference between those two is the
 * whole reason to keep a bag file at all.
 *
 * Sorted in bag order, which is the same order as everything above it, so the
 * rows line up with the chart's regions by eye.
 */
function WhatsInTheBag({
  clubs,
  coverage,
  bag,
}: {
  clubs: BagClub[];
  coverage: BagCoverage | null;
  bag: ClubProfile[];
}) {
  const shotsFor = new Map(bag.map((p) => [p.club, p]));
  const withLoft = clubs.filter((c) => c.loftDeg).length;
  const unverified = clubs.filter((c) => c.loftDeg && !c.loftDeg.verified).length;

  /* Shaft and grip, grouped by the run of clubs that share them — eight P790s
   * built identically is one fact, not eight, and stating it once is the only
   * way the phone can drop those columns without losing anything. Grouped by
   * value rather than by model, so a reshafted single club splits its own row
   * out instead of hiding inside the set it came from. */
  const builds = [
    ...clubs
      .filter((c) => c.shaft || c.grip)
      .reduce((acc, c) => {
        const build = [c.shaft, c.grip].filter(Boolean).join(" · ");
        acc.set(build, [...(acc.get(build) ?? []), short(c.club)]);
        return acc;
      }, new Map<string, string[]>()),
  ].map(([build, names]) => ({
    build,
    clubs: names.length > 2 ? `${names[0]}–${names[names.length - 1]}` : names.join(", "),
  }));

  return (
    <section className="mt-10">
      <h2 className="stamp text-ink-2">What is in the bag</h2>
      <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
        The one thing on this page that is not derived from a shot. Written by
        hand in <code className="text-ink-2">data/bag.json</code>, because a
        ledger of what you hit cannot tell you what you did not — a club with no
        shots leaves the chart above looking finished.
      </p>

      {/* Six columns is 670px of text, and a phone is 390. Rather than scroll a
          table sideways until its header leaves the screen — the thing the card
          twin below exists to avoid — the two build columns drop below `sm`.
          They are the least per-club of the six: identical across all eight
          irons and blank for the other five, so the sentence underneath can
          carry them in full without repeating anything. */}
      <div className="mt-3 pan-x">
        <table className="w-full border-collapse font-mono text-[11px] sm:min-w-[560px]">
          <thead>
            <tr className="border-b text-left rule">
              <th className="stamp py-2 pr-3 font-normal text-ink-3">Club</th>
              <th className="stamp py-2 pr-3 text-right font-normal text-ink-3">Loft</th>
              <th className="stamp py-2 pr-3 font-normal text-ink-3">Head</th>
              <th className="stamp hidden py-2 pr-3 font-normal text-ink-3 sm:table-cell">
                Shaft
              </th>
              <th className="stamp hidden py-2 pr-3 font-normal text-ink-3 sm:table-cell">
                Grip
              </th>
              <th className="stamp py-2 text-right font-normal text-ink-3">Shots</th>
            </tr>
          </thead>
          <tbody>
            {clubs.map((c) => {
              const p = shotsFor.get(c.club);
              const never = !p || p.n === 0;
              return (
                <tr
                  key={c.club}
                  className={`border-b border-[var(--line-soft)] ${never ? "text-ink-3" : ""}`}
                >
                  <td className={`py-2 pr-3 whitespace-nowrap ${never ? "" : "text-ink-0"}`}>
                    {c.club}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {c.loftDeg ? `${c.loftDeg.value}°` : "—"}
                  </td>
                  <td className="py-2 pr-3">
                    {[c.brand, c.model].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="hidden py-2 pr-3 sm:table-cell">{c.shaft ?? "—"}</td>
                  <td className="hidden py-2 pr-3 sm:table-cell">{c.grip ?? "—"}</td>
                  {/* The point of the whole table. "never" is not zero — a zero
                      invites you to read it as a small number. */}
                  <td className="py-2 text-right tabular-nums">
                    {never ? (
                      <span className="text-[10px] uppercase tracking-[0.08em]">never</span>
                    ) : (
                      <>
                        {p.active}
                        {p.n !== p.active && <span className="text-ink-3"> of {p.n}</span>}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* The two columns the phone drops, said once instead of thirteen times.
          Shown at every width — above `sm` it is the summary of a column you
          can already read, which is worth the line it costs. */}
      {builds.length > 0 && (
        <dl className="mt-3 space-y-1 font-mono text-[11px] leading-5">
          {builds.map((b) => (
            <div key={b.build} className="flex flex-wrap gap-x-3">
              <dt className="text-ink-1">{b.clubs}</dt>
              <dd className="text-ink-3">{b.build}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="mt-3 max-w-2xl font-mono text-[10px] leading-4 text-ink-3">
        Lofts are what each club left the factory as, and{" "}
        {unverified === withLoft
          ? `not one of the ${withLoft} has been checked`
          : `${unverified} of the ${withLoft} have never been checked`}{" "}
        against a gauge — the driver&rsquo;s sleeve is adjustable and nobody has
        read its setting. A blank is a field nobody has filled in, never a guess.
        {coverage && coverage.unowned.length > 0 && (
          <>
            {" "}
            {coverage.unowned.join(", ")}{" "}
            {coverage.unowned.length === 1 ? "appears" : "appear"} in the ledger
            and not in the bag file — either a club that left the bag, or a key
            that needs adding.
          </>
        )}
      </p>
    </section>
  );
}

/* Pooling across sessions is the largest source of error in these numbers, and
 * it is invisible in the chart. Name it explicitly rather than let a wide band
 * be read as shot-to-shot dispersion. */
function Caveats({
  profiles,
  coverage,
  basis,
  unusable,
}: {
  profiles: ClubProfile[];
  coverage: CoverageGap[];
  basis: DistanceBasis;
  unusable: number;
}) {
  const pooled = profiles.filter((p) => (p.sessionSpreadYd ?? 0) > 10);
  const gaps = coverage.filter((c) => c.field === "smashFactor" || c.field === "clubSpeedMph");
  const rollNote = basis === "total" && unusable > 0;
  if (pooled.length === 0 && gaps.length === 0 && !rollNote) return null;

  return (
    <section
      className="mt-10 border-l-2 pl-4"
      style={{ borderColor: VERDICT.overlap.color }}
    >
      <h2 className="stamp text-ink-2">Read these with care</h2>
      <ul className="mt-2.5 space-y-1.5 font-mono text-[11px] leading-5 text-ink-2">
        {rollNote && (
          <li>
            <span className="text-ink-0">
              Total is derived, and the ledger can prove it
            </span>{" "}
            — on {unusable} trusted shots the export emits a total identical to
            the carry to seven decimal places, which is not something a measured
            stop position does. Whatever produces the other totals is a model,
            and it is a model of rollout on a surface it has no reading of. Carry
            is the number the monitor actually tracked; read total as the better
            of two estimates, not as ground truth.
          </li>
        )}
        {pooled.map((p) => (
          <li key={p.club}>
            <span className="text-ink-0">{p.club}</span> — measured across{" "}
            {p.sessions} sessions whose medians differ by{" "}
            <span className="text-ink-0">{yd(p.sessionSpreadYd, 1)} yd</span>. The
            band in the chart is partly day-to-day drift, not shot-to-shot spread.
          </li>
        ))}
        {gaps.map((c) => (
          <li key={c.field}>
            <span className="text-ink-0">
              No {c.label} on {c.missing} of {c.total} shots
            </span>{" "}
            — {c.sessions.map((s) => s.slice(0, 10)).join(", ")} tracked the ball
            but not the club.
            {c.field === "smashFactor" &&
              " Those shots skip the smash-based mishit test entirely, so they are filtered more loosely than the rest."}
          </li>
        ))}
      </ul>
    </section>
  );
}
