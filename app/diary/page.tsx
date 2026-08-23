import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildGarminShots,
  shotRounds,
  type GarminHole,
  type GarminRound,
  type GarminShot,
  type GarminShots,
  type SourceGarminRounds,
} from "@/lib/garmin-shots";
import {
  garminCourseSlug,
  paintHole,
  type CourseGeo,
  type CourseKind,
  type HolePaint,
  type XY,
} from "@/lib/hole-geometry";
import {
  buildRoundHistory,
  type PlayedRound,
  type SourceRounds,
} from "@/lib/round-history";

export const metadata = {
  title: "Diary — Mackenzie",
  description:
    "Every shot the watch heard, round by round, hole by hole — traced on each hole's own frame.",
};

function load<T>(name: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), "data", name), "utf8")) as T;
}

function loadGarmin(): GarminShots | null {
  try {
    return buildGarminShots(load<SourceGarminRounds>("garmin-rounds.json"));
  } catch {
    return null;
  }
}

/* The course drawings under the traces — the map's own OSM-drawn geometry
 * (pnpm data:holes). A course the map has not drawn is simply absent, and
 * its holes fall back to the bare trace. */
function loadCourseGeo(slug: string): CourseGeo | null {
  try {
    return JSON.parse(
      readFileSync(
        join(process.cwd(), "public", "data", "holes", `${slug}.geojson`),
        "utf8",
      ),
    ) as CourseGeo;
  } catch {
    return null;
  }
}

/* The one place the two ledgers meet. Only links a human moved to "confirmed"
 * are read — a proposed link is a guess, and a guessed join is invented data.
 * The Grint card contributes what the watch cannot hear: the putts. */
interface RoundLink {
  scorecardId: string;
  roundId: string | null;
  status: string;
}

function loadLinkedGrint(): Map<string, PlayedRound> {
  const out = new Map<string, PlayedRound>();
  try {
    const links = load<{ links: RoundLink[] }>("round-links.json").links.filter(
      (l) => l.status === "confirmed" && l.roundId !== null,
    );
    if (links.length === 0) return out;
    const history = buildRoundHistory(load<SourceRounds>("rounds.json"));
    const byId = new Map(history.rounds.map((r) => [r.roundId, r]));
    for (const l of links) {
      const r = byId.get(l.roundId as string);
      if (r) out.set(l.scorecardId, r);
    }
  } catch {
    // Either file may be absent on a checkout that has not run the pipeline;
    // the diary then simply says the putts are unlinked.
  }
  return out;
}

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
  // One read per distinct course across the heard rounds.
  const courseBySlug = new Map<string, CourseGeo | null>();
  for (const r of heard) {
    if (r.courseName === null) continue;
    const slug = garminCourseSlug(r.courseName);
    if (!courseBySlug.has(slug)) courseBySlug.set(slug, loadCourseGeo(slug));
  }
  const sims = garmin.rounds
    .filter((r) => r.flags.includes("simulation"))
    .sort((a, b) => b.date.localeCompare(a.date));
  const totalShots = heard.reduce((n, r) => n + r.shotCount, 0);

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
        the capture carries, the course from the same OSM geometry the map
        draws. All of it drawn here, not copied from anywhere.
      </p>
      <p className="mt-3 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
        The watch hears full swings; putts and some chips never become shots, so
        every hole prints what it heard against what the scorecard says
        happened. Putts ride in from the Grint card through the confirmed round
        link — the one human-made join in the pipeline — and holes the link
        cannot explain say so.
      </p>

      {heard.map((r) => (
        <RoundEntry
          key={r.scorecardId}
          round={r}
          grint={linked.get(r.scorecardId) ?? null}
          course={
            r.courseName === null
              ? null
              : (courseBySlug.get(garminCourseSlug(r.courseName)) ?? null)
          }
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
    </div>
  );
}

/* ── one round ────────────────────────────────────────────────────────── */

function RoundEntry({
  round,
  grint,
  course,
}: {
  round: GarminRound;
  grint: PlayedRound | null;
  course: CourseGeo | null;
}) {
  const heardStrokes = round.strokes;
  return (
    <section className="mt-10">
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
            course={course}
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
  course,
  grintPutts,
}: {
  hole: GarminHole;
  course: CourseGeo | null;
  grintPutts: number | null;
}) {
  const shots = [...hole.shots].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const paint = paintHole(course, shots, hole.pin);
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

/* Two frames, one record. When the map has drawn this course (lib/
 * hole-geometry projects the shots' own degrees over the OSM geometry from
 * public/data/holes), the trace rides over the hole itself — tee at the
 * bottom, the day's pin at the top. When it has not, the trace falls back to
 * Garmin's per-hole map frame (tee low, green high — y already grows
 * downward, like SVG), bare numbers on a turf-coloured card. Either way the
 * drawing is ours; Garmin's raster imagery is never fetched. Solid segments
 * are shots; a dotted segment is the gap between where one shot ended and
 * the next began — a walk, a drop, or the cartography disagreeing with
 * itself. */
function HoleTrace({ shots, paint }: { shots: GarminShot[]; paint: HolePaint | null }) {
  if (paint !== null) return <CourseTrace paint={paint} />;
  return <BareTrace shots={shots} />;
}

/* The marks both frames share. All colors ride style={} — a var() in an SVG
 * presentation attribute fails silently (app/palette.ts). */
function TraceMarks({
  segs,
  r,
  line,
  walk,
}: {
  segs: { a: XY; b: XY }[];
  r: number;
  line: string;
  walk: string;
}) {
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
            <line
              x1={s.a.x}
              y1={s.a.y}
              x2={s.b.x}
              y2={s.b.y}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              style={{ stroke: line }}
            />
            <circle cx={s.b.x} cy={s.b.y} r={r} style={{ fill: line }} />
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
        style={{ stroke: "var(--accent-ink)" }}
      />
      {/* Where the last heard shot finished. */}
      <circle
        cx={segs[segs.length - 1].b.x}
        cy={segs[segs.length - 1].b.y}
        r={r}
        style={{ fill: "var(--accent-ink)" }}
      />
    </>
  );
}

/* Scenery, never an encoding — the course palette from globals.css, painted
 * bottom-to-top in lib/hole-geometry's order. Only the surfaces whose edge
 * matters get a hairline: the green, the sand, the water. */
const COURSE_FILL: Record<CourseKind, string> = {
  rough: "var(--course-rough)",
  fairway: "var(--course-fairway)",
  tee: "var(--course-tee)",
  water: "var(--course-water)",
  penalty: "var(--course-penalty)",
  bunker: "var(--course-sand)",
  green: "var(--course-green)",
};
const COURSE_EDGE: Partial<Record<CourseKind, string>> = {
  green: "var(--course-green-edge)",
  bunker: "var(--course-sand-edge)",
  water: "var(--course-water-edge)",
};

function CourseTrace({ paint }: { paint: HolePaint }) {
  const vb = paint.viewBox;
  // Marker size in viewBox units (metres), so dots stay proportionate.
  const r = Math.max(vb.w, vb.h) * 0.018;
  // The pin flag's pole height.
  const u = Math.max(vb.w, vb.h) * 0.05;
  return (
    <svg
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      preserveAspectRatio="xMidYMid meet"
      className="mt-2 h-52 w-full rounded-sm"
      style={{ background: "var(--course-wash)" }}
      role="img"
      aria-label={`Shot trace over the hole, ${paint.segs.length} shot${paint.segs.length === 1 ? "" : "s"}`}
    >
      {paint.polys.map((p, i) => {
        const edge = COURSE_EDGE[p.kind];
        return (
          <path
            key={i}
            d={p.d}
            strokeWidth={edge ? 1 : undefined}
            vectorEffect={edge ? "non-scaling-stroke" : undefined}
            style={{ fill: COURSE_FILL[p.kind], ...(edge ? { stroke: edge } : {}) }}
          />
        );
      })}
      {/* The day's pin, from the capture's own pinPosition. */}
      {paint.pin && (
        <g>
          <line
            x1={paint.pin.x}
            y1={paint.pin.y}
            x2={paint.pin.x}
            y2={paint.pin.y - u}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            style={{ stroke: "var(--accent-ink)" }}
          />
          <path
            d={`M${paint.pin.x} ${paint.pin.y - u}L${paint.pin.x + u * 0.55} ${paint.pin.y - u * 0.78}L${paint.pin.x} ${paint.pin.y - u * 0.56}Z`}
            style={{ fill: "var(--accent-ink)" }}
          />
        </g>
      )}
      <TraceMarks segs={paint.segs} r={r} line="var(--ink-0)" walk="var(--ink-2)" />
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
      <TraceMarks segs={segs} r={r} line="var(--turf-tick)" walk="var(--turf-target)" />
    </svg>
  );
}
