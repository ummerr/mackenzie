import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BagChart } from "./bag-chart";
import type { LedgerSession, LedgerShot } from "@/lib/ledger";
import {
  applyHeuristics,
  buildBag,
  coverageGaps,
  detectGaps,
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

/* Status tokens. Reserved for gap verdicts and never used as a series colour;
 * each one always ships beside its word, so the state never rests on hue. */
const VERDICT = {
  ok: { color: "#0ca30c", word: "ok" },
  overlap: { color: "#fab219", word: "overlap" },
  hole: { color: "#ec835a", word: "hole" },
  inverted: { color: "#d03b3b", word: "inverted" },
  unknown: { color: "#5f5a53", word: "—" },
} as const;

const yd = (v: number | null, d = 0) => (v === null ? "—" : v.toFixed(d));

export default function Home() {
  const shots = applyHeuristics(load<LedgerShot[]>("shots.json"));
  const sessions = load<LedgerSession[]>("sessions.json");
  const bag = buildBag(shots);
  const gaps = detectGaps(bag);

  const shown = bag.filter((p) => !p.suppressed);
  const hidden = bag.filter((p) => p.suppressed);
  const excluded = shots.filter((s) => s.isExcluded).length;

  // The headline is whichever flagged gap is worst, not a fixed club.
  const worst =
    gaps
      .filter((g) => !g.suppressed && (g.verdict === "hole" || g.verdict === "inverted"))
      .sort((a, b) => Math.abs(b.gapYd ?? 0) - Math.abs(a.gapYd ?? 0))[0] ?? null;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl leading-none">The bag</h1>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.08em] text-cream-3">
            {sessions.length} sessions · {shots.length} shots · {shown.length} clubs
            with enough data · {excluded} excluded
          </p>
        </div>
        {worst && (
          <div className="text-right">
            <div
              className="font-sans text-[52px] font-medium leading-none"
              style={{ color: VERDICT[worst.verdict].color }}
            >
              {Math.abs(worst.gapYd ?? 0).toFixed(1)}
              <span className="text-[20px] text-cream-2"> yd</span>
            </div>
            <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-cream-2">
              {VERDICT[worst.verdict].word} · {worst.longer} → {worst.shorter}
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section>
          <BagChart profiles={bag} />
        </section>

        <section>
          <h2 className="font-mono text-[11px] uppercase tracking-[0.1em] text-cream-2">
            Gaps, in bag order
          </h2>
          <table className="mt-3 w-full border-collapse font-mono text-[11px]">
            <tbody>
              {gaps.map((g) => (
                <GapRow key={`${g.longer}->${g.shorter}`} gap={g} />
              ))}
            </tbody>
          </table>
          <p className="mt-3 font-mono text-[10px] leading-4 text-cream-3">
            Compared in loft order, never sorted by measured carry — a club that
            goes shorter than the one above it is the finding, not a sorting
            error. Under 8 yd apart is an overlap; over 15 is a hole.
          </p>

          {hidden.length > 0 && (
            <>
              <h2 className="mt-8 font-mono text-[11px] uppercase tracking-[0.1em] text-cream-2">
                Not shown
              </h2>
              <ul className="mt-3 space-y-1 font-mono text-[11px] text-cream-3">
                {hidden.map((p) => (
                  <li key={p.club} className="flex justify-between gap-3">
                    <span className="text-cream-1">{p.club}</span>
                    <span>
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
            </>
          )}
        </section>
      </div>

      <Caveats profiles={shown} coverage={coverageGaps(shots)} />

      <section className="mt-10">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.1em] text-cream-2">
          Every number on this page
        </h2>
        <div className="mt-3 overflow-x-auto border rule">
          <table className="w-full min-w-[880px] border-collapse font-mono text-[11px]">
            <thead>
              <tr className="border-b bg-ink-1 text-cream-3 rule">
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
                  "Ball",
                  "Smash",
                  "Launch",
                  "Backspin",
                ].map((h, i) => (
                  <th
                    key={h}
                    className={`px-3 py-2 font-medium uppercase tracking-[0.08em] ${
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
                  <td className="px-3 py-1.5">
                    {p.club}
                    {p.suppressed && <span className="ml-2 text-cream-3">suppressed</span>}
                  </td>
                  <Num v={p.n} />
                  <Num v={p.active} />
                  <Num v={p.sessions} />
                  <Num v={p.carryP25Yd} d={1} />
                  <Num v={p.medianCarryYd} d={1} />
                  <Num v={p.carryP75Yd} d={1} />
                  <Num v={p.offlineP10Yd} d={1} />
                  <Num v={p.offlineP90Yd} d={1} />
                  <Num v={p.medianBallSpeedMph} d={1} />
                  <Num v={p.medianSmashFactor} d={3} />
                  <Num v={p.medianLaunchAngleDeg} d={1} />
                  <Num v={p.medianBackspinRpm} d={0} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Num({ v, d = 0 }: { v: number | null; d?: number }) {
  return (
    <td className="px-3 py-1.5 text-right tabular-nums">{v === null ? "—" : v.toFixed(d)}</td>
  );
}

function GapRow({ gap }: { gap: Gap }) {
  const v = VERDICT[gap.verdict];
  return (
    <tr className="border-b border-[var(--line-soft)]">
      <td className="py-1.5 pr-2 text-cream-1">
        {gap.longer} <span className="text-cream-3">→</span> {gap.shorter}
      </td>
      <td className="py-1.5 text-right tabular-nums text-cream-1">
        {gap.suppressed || gap.gapYd === null ? "—" : `${gap.gapYd.toFixed(1)} yd`}
      </td>
      <td className="py-1.5 pl-3 text-right whitespace-nowrap">
        {gap.suppressed ? (
          <span className="text-cream-3">not shown</span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: v.color }}
            />
            <span className="text-cream-2">{v.word}</span>
          </span>
        )}
      </td>
    </tr>
  );
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
    <section className="mt-8 border-l-2 pl-4" style={{ borderColor: "#fab219" }}>
      <h2 className="font-mono text-[11px] uppercase tracking-[0.1em] text-cream-2">
        Read these with care
      </h2>
      <ul className="mt-2 space-y-1 font-mono text-[11px] text-cream-2">
        {pooled.map((p) => (
          <li key={p.club}>
            <span className="text-cream-0">{p.club}</span> — measured across{" "}
            {p.sessions} sessions whose medians differ by{" "}
            <span className="text-cream-0">{yd(p.sessionSpreadYd, 1)} yd</span>. The
            band below is partly day-to-day drift, not shot-to-shot spread.
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
