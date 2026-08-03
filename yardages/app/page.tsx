import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BagChart, type ShotDot } from "./bag-chart";
import { VERDICT } from "./palette";
import type { LedgerSession, LedgerShot } from "@/lib/ledger";
import {
  applyHeuristics,
  buildBag,
  coverageGaps,
  detectGaps,
  DEFAULT_GAPS,
  MIN_SHOTS_TO_DISPLAY,
  type ClubProfile,
  type CoverageGap,
  type Gap,
} from "@/lib/stats";

/* Server component. Everything numeric comes from lib/stats.ts, which is pure
 * and tested; nothing is computed in the markup below. */

function load<T>(name: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), "data", name), "utf8")) as T;
}

const yd = (v: number | null, d = 0) => (v === null ? "—" : v.toFixed(d));

export default function Home() {
  const shots = applyHeuristics(load<LedgerShot[]>("shots.json"));
  const sessions = load<LedgerSession[]>("sessions.json");
  const bag = buildBag(shots);
  const gaps = detectGaps(bag);

  const shown = bag.filter((p) => !p.suppressed);
  const hidden = bag.filter((p) => p.suppressed);
  const excluded = shots.filter((s) => s.isExcluded).length;

  /* The dispersion layer: trusted shots only, and only the two coordinates the
   * plan view plots. Filtering here rather than in the component keeps the
   * client bundle to what is drawn. */
  const dots: ShotDot[] = shots
    .filter((s) => !s.isExcluded && s.carryYd !== null && s.offlineYd !== null)
    .map((s) => ({
      club: s.club,
      carryYd: s.carryYd as number,
      offlineYd: s.offlineYd as number,
    }));

  // The headline is whichever flagged gap is worst, not a fixed club.
  const worst =
    gaps
      .filter((g) => !g.suppressed && (g.verdict === "hole" || g.verdict === "inverted"))
      .sort((a, b) => Math.abs(b.gapYd ?? 0) - Math.abs(a.gapYd ?? 0))[0] ?? null;

  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      {/* ── masthead ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-6 border-b pb-5 rule">
        <div>
          <h1 className="font-serif text-[64px] leading-[0.86] tracking-[-0.01em] sm:text-[84px]">
            THE BAG
          </h1>
          <p className="stamp mt-3 text-cream-3">
            Every shot on file, drawn where it finished
          </p>
        </div>
        {worst && (
          <div
            className="border-l-2 pl-4"
            style={{ borderColor: VERDICT[worst.verdict].color }}
          >
            <p className="stamp text-cream-3">Worst gap in the bag</p>
            <div
              className="mt-1.5 font-sans text-[60px] font-semibold leading-[0.82]"
              style={{ color: VERDICT[worst.verdict].color }}
            >
              {Math.abs(worst.gapYd ?? 0).toFixed(1)}
              <span className="ml-1 text-[22px] font-normal text-cream-2">yd</span>
            </div>
            <p className="stamp mt-2 text-cream-1">
              {VERDICT[worst.verdict].word} · {worst.longer} → {worst.shorter}
            </p>
          </div>
        )}
      </div>

      {/* ── scoreboard ───────────────────────────────────────────────────── */}
      <dl className="mt-px grid grid-cols-2 border-t sm:grid-cols-3 lg:grid-cols-5 rule">
        <Stat label="Sessions" value={sessions.length} />
        <Stat label="Shots logged" value={shots.length} />
        <Stat label="Trusted" value={shots.length - excluded} />
        <Stat label="Clubs drawn" value={shown.length} />
        <Stat label="Held back" value={hidden.length} note={`under ${MIN_SHOTS_TO_DISPLAY}`} />
      </dl>

      {/* ── the hole, and the scorecard beside it ────────────────────────── */}
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section>
          <BagChart profiles={bag} shots={dots} />
        </section>

        <aside className="space-y-px self-start">
          <section className="card p-4">
            <h2 className="stamp text-cream-2">Gaps, in bag order</h2>
            <table className="mt-3 w-full border-collapse font-mono text-[11px]">
              <tbody>
                {gaps.map((g) => (
                  <GapRow key={`${g.longer}->${g.shorter}`} gap={g} />
                ))}
              </tbody>
            </table>
            <GapScale />
            <p className="mt-2 font-mono text-[10px] leading-4 text-cream-3">
              Compared in loft order, never sorted by measured carry — a club
              that goes shorter than the one above it is the finding, not a
              sorting error. Under {DEFAULT_GAPS.overlapUnderYd} yd apart is an
              overlap; over {DEFAULT_GAPS.holeOverYd} is a hole.
            </p>
          </section>

          {hidden.length > 0 && (
            <section className="card p-4">
              <h2 className="stamp text-cream-2">Not drawn</h2>
              <ul className="mt-3 space-y-1 font-mono text-[11px] text-cream-3">
                {hidden.map((p) => (
                  <li key={p.club} className="flex justify-between gap-3">
                    <span className="text-cream-1">{p.club}</span>
                    <span className="tabular-nums">
                      n={p.active}
                      {p.n !== p.active && ` of ${p.n}`}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 font-mono text-[10px] leading-4 text-cream-3">
                Under {MIN_SHOTS_TO_DISPLAY} usable shots. Suppressed rather than
                drawn, because a median off a dozen swings is a number you would
                act on and shouldn&rsquo;t.
              </p>
            </section>
          )}
        </aside>
      </div>

      <Caveats profiles={shown} coverage={coverageGaps(shots)} />

      {/* ── the card ─────────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="stamp text-cream-2">Every number on this page</h2>
        <div className="card mt-3 overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse font-mono text-[11px]">
            <thead>
              <tr className="border-b bg-ink-2 text-cream-2 rule">
                {[
                  "Club",
                  "n",
                  "Used",
                  "Sessions",
                  "Carry p25",
                  "Median",
                  "Carry p75",
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
                    p.suppressed ? "text-cream-3" : "text-cream-1"
                  }`}
                >
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {p.club}
                    {p.suppressed && (
                      <span className="ml-2 text-[9px] uppercase tracking-[0.1em] text-cream-3">
                        held back
                      </span>
                    )}
                  </td>
                  <Num v={p.n} />
                  <Num v={p.active} />
                  <Num v={p.sessions} />
                  <Num v={p.carryP25Yd} d={1} />
                  <Num v={p.medianCarryYd} d={1} />
                  <Num v={p.carryP75Yd} d={1} />
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
        <p className="mt-2 font-mono text-[10px] leading-4 text-cream-3">
          The chart&rsquo;s table twin. Every value the plan view draws is here in
          full, held-back clubs included. Offline is in yards, aim in degrees —
          the cone is built from the degrees, because the yards are the degrees
          multiplied by however far the ball went.
        </p>
      </section>
    </div>
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
    <div className="border-r border-b bg-ink-1 px-4 py-3 rule">
      <dt className="stamp text-cream-3">{label}</dt>
      <dd className="mt-1.5 font-sans text-[28px] font-medium leading-none text-cream-0">
        {value}
        {note && (
          <span className="ml-2 font-mono text-[10px] font-normal tracking-[0.08em] text-cream-3">
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

/* The gap ruler.
 *
 * A number alone makes you do the arithmetic against two thresholds on every
 * row. The bar puts the thresholds on the page: the shaded band is the 8–15 yd
 * window where a gap is fine, everything left of it is an overlap, everything
 * right is a hole, and anything drawn left of the zero mark is a club that goes
 * shorter than the one above it. Same domain on every row, so the rows compare.
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
            fill={z.v.color}
            fillOpacity={0.45}
          />
        ))}
        {[0, DEFAULT_GAPS.overlapUnderYd, DEFAULT_GAPS.holeOverYd].map((t) => (
          <text
            key={t}
            x={rulerX(t)}
            y={16}
            textAnchor="middle"
            fill="#5f5a53"
            fontSize={9}
            fontFamily="var(--font-mono)"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {t}
          </text>
        ))}
      </svg>
      <p className="font-mono text-[9px] uppercase leading-[1.5] tracking-[0.08em] text-cream-3">
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
      <td className="py-2 pr-2 whitespace-nowrap text-cream-1">
        {short(gap.longer)} <span className="text-cream-3">→</span> {short(gap.shorter)}
      </td>
      <td className="py-2 pr-2 text-right tabular-nums text-cream-0">
        {shownGap === null ? "—" : shownGap.toFixed(1)}
      </td>
      <td className="py-2 pr-2">
        {shownGap !== null ? (
          <svg width={RULER_W} height={12} aria-hidden className="block">
            <rect
              x={rulerX(DEFAULT_GAPS.overlapUnderYd)}
              y={0}
              width={rulerX(DEFAULT_GAPS.holeOverYd) - rulerX(DEFAULT_GAPS.overlapUnderYd)}
              height={12}
              fill={VERDICT.ok.color}
              fillOpacity={0.14}
            />
            <line x1={rulerX(0)} x2={rulerX(0)} y1={0} y2={12} stroke="var(--line-hard)" strokeWidth={1} />
            <rect
              x={Math.min(rulerX(0), rulerX(shownGap))}
              y={3}
              width={Math.max(Math.abs(rulerX(shownGap) - rulerX(0)), 1.5)}
              height={6}
              rx={1}
              fill={v.color}
            />
          </svg>
        ) : (
          <span className="text-cream-3">not drawn</span>
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
            <span className="text-[10px] uppercase tracking-[0.08em] text-cream-2">
              {v.word}
            </span>
          </span>
        )}
      </td>
    </tr>
  );
}

function short(club: string): string {
  return club
    .replace("Pitching Wedge", "PW")
    .replace("Gap Wedge", "GW")
    .replace("Sand Wedge", "SW")
    .replace("Lob Wedge", "LW")
    .replace(" Iron", "i")
    .replace(" Hybrid", "H")
    .replace(" Wood", "W");
}

/* Pooling across sessions is the largest source of error in these numbers, and
 * it is invisible in the chart. Name it explicitly rather than let a wide band
 * be read as shot-to-shot dispersion. */
function Caveats({
  profiles,
  coverage,
}: {
  profiles: ClubProfile[];
  coverage: CoverageGap[];
}) {
  const pooled = profiles.filter((p) => (p.sessionSpreadYd ?? 0) > 10);
  const gaps = coverage.filter((c) => c.field === "smashFactor" || c.field === "clubSpeedMph");
  if (pooled.length === 0 && gaps.length === 0) return null;

  return (
    <section
      className="mt-10 border-l-2 pl-4"
      style={{ borderColor: VERDICT.overlap.color }}
    >
      <h2 className="stamp text-cream-2">Read these with care</h2>
      <ul className="mt-2.5 space-y-1.5 font-mono text-[11px] leading-5 text-cream-2">
        {pooled.map((p) => (
          <li key={p.club}>
            <span className="text-cream-0">{p.club}</span> — measured across{" "}
            {p.sessions} sessions whose medians differ by{" "}
            <span className="text-cream-0">{yd(p.sessionSpreadYd, 1)} yd</span>. The
            band in the chart is partly day-to-day drift, not shot-to-shot spread.
          </li>
        ))}
        {gaps.map((c) => (
          <li key={c.field}>
            <span className="text-cream-0">
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
