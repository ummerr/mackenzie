import Link from "next/link";
import {
  GARMIN_THRESHOLDS,
  onCourseRecord,
  shotRounds,
  type GarminHole,
  type GarminRound,
  type GarminShot,
  type OnCourseRecord,
} from "@/lib/garmin-shots";
import { paintHole, type HolePaint, type XY } from "@/lib/hole-geometry";
import { loadGarmin, loadLinkedGrint, loadRounds } from "@/lib/load";
import type { PlayedRound } from "@/lib/round-history";
import { buildSources } from "@/lib/sources";
import { Provenance } from "../provenance";

export const metadata = {
  title: "Diary — Mackenzie",
  description:
    "Every shot the watch heard, round by round, hole by hole — traced on each hole's own frame.",
};

export default function Diary() {
  const garmin = loadGarmin();
  const linked = loadLinkedGrint();

  if (garmin === null) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8">
        <h1 className="font-serif text-[42px] leading-[0.9] tracking-[-0.01em] sm:text-[56px] lg:text-[72px]">
          THE DIARY
        </h1>
        <p className="mt-5 max-w-2xl border-t pt-5 text-[15px] leading-6 text-ink-1 rule">
          No on-course shot data on this checkout — run the Garmin capture
          extension, then{" "}
          <code className="font-mono text-[13px] text-ink-0">pnpm data:garmin</code>.
        </p>
      </div>
    );
  }

  const heard = shotRounds(garmin).sort((a, b) => b.date.localeCompare(a.date));
  const sims = garmin.rounds
    .filter((r) => r.flags.includes("simulation"))
    .sort((a, b) => b.date.localeCompare(a.date));
  const totalShots = heard.reduce((n, r) => n + r.shotCount, 0);
  const record = onCourseRecord(garmin);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8">
      <h1 className="font-serif text-[42px] leading-[0.9] tracking-[-0.01em] sm:text-[56px] lg:text-[72px]">
        THE DIARY
      </h1>
      <p className="stamp mt-3 text-ink-3">
        {heard.length} round{heard.length === 1 ? "" : "s"} the watch heard ·{" "}
        {totalShots} shots
      </p>
      <p className="mt-5 max-w-2xl border-t pt-5 text-[15px] leading-6 text-ink-1 rule">
        Every AutoShot the watch recorded, round by round, hole by hole. Each
        hole is traced over the hole itself — the shots from the coordinates
        the capture carries, laid on the same satellite imagery the course map
        stands on. The marks are drawn here; nothing is copied from Garmin.
      </p>
      <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
        Imagery &copy; Esri, Maxar, Earthstar Geographics — World Imagery
        tiles, loaded by your browser from Esri&rsquo;s public service.
      </p>
      <p className="mt-3 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
        Each record hears what the other cannot: the watch the swings, the card
        the putts. Putts and some chips never become shots, so every hole
        prints what the watch heard against what the scorecard says happened —
        putts ride in from the Grint card through the confirmed round link, the
        one human-made join in the pipeline, and holes the link cannot explain
        say so.
      </p>

      {record && <TheRecord oc={record} />}

      {heard.map((r) => (
        <RoundEntry
          key={r.scorecardId}
          round={r}
          grint={linked.get(r.scorecardId) ?? null}
        />
      ))}

      {sims.length > 0 && (
        <section className="mt-10">
          <h2 className="stamp text-ink-2">Also on the card</h2>
          <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
            Simulator rounds — the R50 hears clubs, not courses, so there are no
            shots to trace.
          </p>
          <ul className="mt-3 space-y-px">
            {sims.map((r) => (
              <li
                key={r.scorecardId}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-2 bg-paper-1 px-3 py-2 sm:px-4"
                style={{ borderColor: "var(--line)" }}
              >
                <span className="font-mono text-[11px] tabular-nums text-ink-3">{r.date}</span>
                <span className="text-[14px] leading-snug text-ink-1">{r.courseName ?? "—"}</span>
                <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-ink-2">
                  {r.strokes ?? "—"} strokes
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Provenance
        sources={buildSources({ garminShots: garmin, roundHistory: loadRounds() }).filter(
          (s) => s.id === "watch" || s.id === "scorecards",
        )}
        note="The putts arrive through data/round-links.json — machine-proposed, human-confirmed; only confirmed links are read."
      />
    </div>
  );
}

/* ── the aggregate record ─────────────────────────────────────────────── */

/* Gate-independent by design: the profile's findings wait for minShotRounds
 * because a finding is a claim; the record itself is published as soon as it
 * exists, with every sample size printed. Moved here from the front page —
 * this is the on-course record's home, and the per-club course-vs-range
 * table's home is the bag page. */
function TheRecord({ oc }: { oc: OnCourseRecord }) {
  const s = oc.split;
  const pctOf = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");
  const catRows: [string, number][] = [
    ["Tee", s.tee],
    ["Approach", s.approach],
    ["Short game", s.shortGame],
    ["Putts", s.putts],
    ["Unclassified", s.other],
  ];
  return (
    <section className="mt-10">
      <h2 className="stamp text-ink-2">The record</h2>
      <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
        What AutoShot heard over {oc.rounds} round{oc.rounds === 1 ? "" : "s"} (as
        of {oc.asOf}; the record&rsquo;s other {oc.simRounds} rounds are simulator
        rounds with nothing to hear). Findings from this data switch on at{" "}
        {GARMIN_THRESHOLDS.minShotRounds} shot-bearing rounds — until then this is
        the record, not a claim. The watch hears full swings: it caught{" "}
        {s.shots} of the {s.strokes} strokes the scorecards count (
        {pctOf(s.shots, s.strokes)}); putts and some chips never become shots, so
        every share below is a share of recorded shots.
      </p>

      <dl className="mt-5 space-y-1 font-mono text-[11px] leading-5">
        {catRows.map(([label, n]) => (
          <div key={label} className="flex flex-wrap gap-x-3">
            <dt className="w-32 shrink-0 text-ink-1">{label}</dt>
            <dd className="tabular-nums text-ink-2">
              {n} shots · {pctOf(n, s.shots)} of recorded
            </dd>
          </div>
        ))}
      </dl>

      <h3 className="stamp mt-5 text-ink-3">Where the ball was played from</h3>
      <dl className="mt-2 space-y-1 font-mono text-[11px] leading-5">
        {oc.lies.map((l) => (
          <div key={l.lie} className="flex flex-wrap gap-x-3">
            <dt className="w-32 shrink-0 text-ink-1">{l.lie}</dt>
            <dd className="tabular-nums text-ink-2">
              {l.shots} non-tee shot{l.shots === 1 ? "" : "s"}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
        The clubs the course has measured sit beside their range numbers on{" "}
        <Link href="/bag" className="text-ink-1 underline decoration-1 underline-offset-2">
          the bag page →
        </Link>
      </p>
    </section>
  );
}

/* ── one round ────────────────────────────────────────────────────────── */

function RoundEntry({
  round,
  grint,
}: {
  round: GarminRound;
  grint: PlayedRound | null;
}) {
  const heardStrokes = round.strokes;
  return (
    /* Anchored by scorecard id so the scorecards' pages can point at the
     * watch's copy of the same round. */
    <section className="mt-10 scroll-mt-6" id={round.scorecardId}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="stamp text-ink-2">{round.date}</h2>
        <span className="text-[15px] text-ink-0">{round.courseName ?? "—"}</span>
      </div>
      <p className="mt-1 font-mono text-[11px] leading-5 text-ink-3">
        {round.teeBox ?? "—"} tees
        {round.teeBoxRating !== null && round.teeBoxSlope !== null
          ? ` (${round.teeBoxRating}/${round.teeBoxSlope})`
          : ""}{" "}
        · {heardStrokes ?? "—"} strokes
        {grint?.putts != null ? ` · ${grint.putts} putts on the Grint card` : ""} · the
        watch heard {round.shotCount} of{" "}
        {heardStrokes === null ? "?" : heardStrokes} strokes
        {grint === null ? " · no confirmed Grint link, so putts are unlinked" : ""}
      </p>

      <div className="mt-4 grid gap-px sm:grid-cols-2 lg:grid-cols-3">
        {round.holes.map((h) => (
          <HoleEntry
            key={h.number}
            hole={h}
            grintPutts={grint?.holePutts?.[h.number - 1] ?? null}
          />
        ))}
      </div>
    </section>
  );
}

/* ── one hole ─────────────────────────────────────────────────────────── */

function HoleEntry({
  hole,
  grintPutts,
}: {
  hole: GarminHole;
  grintPutts: number | null;
}) {
  const shots = [...hole.shots].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const paint = paintHole(shots, hole.pin);
  // What the scorecard says happened minus what was heard (shots) and linked
  // (putts): the strokes nothing recorded. Zero is silence, not a row.
  const unheard =
    hole.strokes !== null
      ? hole.strokes - shots.length - (grintPutts ?? 0)
      : null;
  return (
    <div className="bg-paper-1 p-3 sm:p-4">
      <div className="flex items-baseline gap-x-2 font-mono text-[11px]">
        <span className="text-ink-0">Hole {hole.number}</span>
        <span className="text-ink-3">par {hole.par ?? "—"}</span>
        <span className="ml-auto tabular-nums text-ink-1">
          {hole.strokes ?? "—"}
          {grintPutts !== null ? ` · ${grintPutts} putt${grintPutts === 1 ? "" : "s"}` : ""}
        </span>
      </div>

      <HoleTrace shots={shots} paint={paint} />

      <ol className="mt-2 space-y-0.5 font-mono text-[11px] leading-5">
        {shots.map((s, i) => (
          <li key={i} className="flex gap-x-2">
            <span className="w-3 shrink-0 tabular-nums text-ink-3">{s.order ?? i + 1}</span>
            <span className="text-ink-0">{shotLabel(s)}</span>
            <span className="ml-auto shrink-0 tabular-nums text-ink-2">
              {s.yards !== null ? `${s.yards.toFixed(0)} yd` : "—"}
            </span>
          </li>
        ))}
        {grintPutts !== null && grintPutts > 0 && (
          <li className="flex gap-x-2 text-ink-2">
            <span className="w-3 shrink-0" />
            <span>
              {grintPutts} putt{grintPutts === 1 ? "" : "s"} · Grint card
            </span>
          </li>
        )}
        {unheard !== null && unheard > 0 && (
          <li className="flex gap-x-2 text-ink-3">
            <span className="w-3 shrink-0" />
            <span>
              {unheard} stroke{unheard === 1 ? "" : "s"} nothing recorded
            </span>
          </li>
        )}
        {shots.length === 0 && (
          <li className="text-ink-3">no shots heard on this hole</li>
        )}
      </ol>
    </div>
  );
}

function shotLabel(s: GarminShot): string {
  const club = s.club ?? (s.shotType ? s.shotType.toLowerCase() : "unrecorded");
  const lies =
    s.startLie || s.endLie ? ` · ${s.startLie ?? "?"} → ${s.endLie ?? "?"}` : "";
  return `${club}${lies}`;
}

/* ── the trace ────────────────────────────────────────────────────────── */

/* Two frames, one record. When the shots carry degrees (lib/hole-geometry),
 * the trace rides over the hole's own satellite photograph — Esri World
 * Imagery, the same tiles the /courses map draws — tee at the bottom, the
 * day's pin at the top. When they do not, the trace falls back to Garmin's
 * per-hole map frame (tee low, green high — y already grows downward, like
 * SVG), bare numbers on a turf-coloured card. Either way the marks are ours;
 * Garmin's raster imagery is never fetched. Solid segments are shots; a
 * dotted segment is the gap between where one shot ended and the next began
 * — a walk, a drop, or the cartography disagreeing with itself. */
function HoleTrace({ shots, paint }: { shots: GarminShot[]; paint: HolePaint | null }) {
  if (paint !== null) return <ImageryTrace paint={paint} />;
  return <BareTrace shots={shots} />;
}

/* The marks both frames share. All colors ride style={} — a var() in an SVG
 * presentation attribute fails silently (app/palette.ts). Over the imagery a
 * `halo` rides under every solid stroke, so the line survives a white bunker
 * as well as a dark treeline. */
function TraceMarks({
  segs,
  r,
  line,
  walk,
  accent,
  halo,
}: {
  segs: { a: XY; b: XY }[];
  r: number;
  line: string;
  walk: string;
  accent: string;
  halo?: string;
}) {
  const haloStroke = (x1: number, y1: number, x2: number, y2: number) =>
    halo ? (
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        strokeWidth={3.5}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        style={{ stroke: halo }}
      />
    ) : null;
  return (
    <>
      {segs.map((s, i) => {
        const prev = i > 0 ? segs[i - 1] : null;
        const walked = prev && (prev.b.x !== s.a.x || prev.b.y !== s.a.y);
        return (
          <g key={i}>
            {walked && prev && (
              <line
                x1={prev.b.x}
                y1={prev.b.y}
                x2={s.a.x}
                y2={s.a.y}
                strokeWidth={1}
                strokeDasharray="3 4"
                vectorEffect="non-scaling-stroke"
                style={{ stroke: walk }}
              />
            )}
            {haloStroke(s.a.x, s.a.y, s.b.x, s.b.y)}
            <line
              x1={s.a.x}
              y1={s.a.y}
              x2={s.b.x}
              y2={s.b.y}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              style={{ stroke: line }}
            />
            <circle
              cx={s.b.x}
              cy={s.b.y}
              r={r}
              style={{ fill: line, ...(halo ? { stroke: halo, strokeWidth: r * 0.5 } : {}) }}
            />
          </g>
        );
      })}
      {/* The tee: where the first shot left from. */}
      <circle
        cx={segs[0].a.x}
        cy={segs[0].a.y}
        r={r * 1.3}
        fill="none"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        style={{ stroke: accent }}
      />
      {/* Where the last heard shot finished. */}
      <circle
        cx={segs[segs.length - 1].b.x}
        cy={segs[segs.length - 1].b.y}
        r={r}
        style={{ fill: accent, ...(halo ? { stroke: halo, strokeWidth: r * 0.5 } : {}) }}
      />
    </>
  );
}

/* The photograph is the photograph in both themes, so every mark over it is
 * a fixed color, not a theme var: white ink with a dark halo, and an amber
 * accent that reads on turf, sand, and shade alike. The background only
 * shows while tiles are still arriving. */
const IMAGERY = {
  loading: "#15251b",
  line: "#ffffff",
  halo: "rgba(0, 0, 0, 0.45)",
  walk: "rgba(255, 255, 255, 0.75)",
  accent: "#ffb03a",
} as const;

function ImageryTrace({ paint }: { paint: HolePaint }) {
  const vb = paint.viewBox;
  // Marker size in viewBox units (metres), so dots stay proportionate.
  const r = Math.max(vb.w, vb.h) * 0.018;
  // The pin flag's pole height.
  const u = Math.max(vb.w, vb.h) * 0.05;
  return (
    <svg
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      preserveAspectRatio="xMidYMid meet"
      className="mt-2 aspect-[3/4] w-full rounded-sm"
      style={{ background: IMAGERY.loading }}
      role="img"
      aria-label={`Shot trace over the hole, ${paint.segs.length} shot${paint.segs.length === 1 ? "" : "s"}`}
    >
      {/* The hole itself — Esri World Imagery, each 256-px tile carried into
       * the rotated frame by its own matrix (lib/hole-geometry). */}
      {paint.tiles.map((t) => (
        <image
          key={t.href}
          href={t.href}
          width={256}
          height={256}
          transform={t.transform}
        />
      ))}
      {/* The day's pin, from the capture's own pinPosition. */}
      {paint.pin && (
        <g>
          <line
            x1={paint.pin.x}
            y1={paint.pin.y}
            x2={paint.pin.x}
            y2={paint.pin.y - u}
            strokeWidth={3}
            vectorEffect="non-scaling-stroke"
            style={{ stroke: IMAGERY.halo }}
          />
          <line
            x1={paint.pin.x}
            y1={paint.pin.y}
            x2={paint.pin.x}
            y2={paint.pin.y - u}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            style={{ stroke: IMAGERY.line }}
          />
          <path
            d={`M${paint.pin.x} ${paint.pin.y - u}L${paint.pin.x + u * 0.55} ${paint.pin.y - u * 0.78}L${paint.pin.x} ${paint.pin.y - u * 0.56}Z`}
            style={{ fill: IMAGERY.accent }}
          />
        </g>
      )}
      <TraceMarks
        segs={paint.segs}
        r={r}
        line={IMAGERY.line}
        walk={IMAGERY.walk}
        accent={IMAGERY.accent}
        halo={IMAGERY.halo}
      />
    </svg>
  );
}

function BareTrace({ shots }: { shots: GarminShot[] }) {
  const segs = shots
    .filter((s) => s.startMap !== null && s.endMap !== null)
    .map((s) => ({
      a: s.startMap as { x: number; y: number },
      b: s.endMap as { x: number; y: number },
    }));
  if (segs.length === 0) return null;

  const xs = segs.flatMap((s) => [s.a.x, s.b.x]);
  const ys = segs.flatMap((s) => [s.a.y, s.b.y]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  // Pad relative to the larger span so a straight par 3 still gets air.
  const pad = Math.max(maxX - minX, maxY - minY, 60) * 0.16;
  const vb = {
    x: minX - pad,
    y: minY - pad,
    w: maxX - minX + pad * 2,
    h: maxY - minY + pad * 2,
  };
  // Marker size in viewBox units, so dots stay proportionate to the hole.
  const r = Math.max(vb.w, vb.h) * 0.018;

  return (
    <svg
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      preserveAspectRatio="xMidYMid meet"
      className="mt-2 h-36 w-full rounded-sm"
      style={{ background: "var(--turf-fairway)" }}
      role="img"
      aria-label={`Shot trace, ${segs.length} shot${segs.length === 1 ? "" : "s"}`}
    >
      <TraceMarks
        segs={segs}
        r={r}
        line="var(--turf-tick)"
        walk="var(--turf-target)"
        accent="var(--accent-ink)"
      />
    </svg>
  );
}
