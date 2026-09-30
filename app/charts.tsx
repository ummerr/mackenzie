/* The site's charts, hand-rolled in SVG. Three rules from app/palette.ts and
 * the dataviz method: colours are set through `style`/attributes as CSS
 * variables, never presentation attributes with `var()` alone; text wears ink
 * tokens, never the series colour; exactly one accent per figure — the thing
 * the figure is about — with the rest in ink shades, and the benchmark series
 * in `--chart-2`.
 */

const f1 = (n: number) => n.toFixed(1);

/* ── the hero: every differential, the trending line, and scratch at zero ── */

export interface ArcPoint {
  seq: number;
  courseName: string | null;
  differential: number;
  trendingHdcp: number | null;
}

export function ArcChart({ pts, handicapIndex }: { pts: ArcPoint[]; handicapIndex: number | null }) {
  const W = 720,
    H = 320,
    PL = 34,
    PR = 14,
    PT = 16,
    PB = 30;
  const iw = W - PL - PR,
    ih = H - PT - PB;
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
  void handicapIndex;
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

/* ── small multiple: one measure over an ordered axis ── */

export interface MiniPoint {
  /** The x label — a year, a date, a course. */
  y: string;
  v: number;
  /** Sample behind the point. */
  n: number;
}

export function Mini({ title, pts, min, max, unit = "", refLine, xLabels, ariaSuffix = "by year" }: {
  title: string;
  pts: MiniPoint[];
  min: number;
  max: number;
  unit?: string;
  /** A sourced benchmark drawn as a hairline in the second series colour. */
  refLine?: { value: number; label: string };
  /** Overrides for the two axis captions; default is the first and last point's label. */
  xLabels?: [string, string];
  ariaSuffix?: string;
}) {
  const W = 226, H = 150, PL = 30, PR = 10, PT = 14, PB = 22;
  const iw = W - PL - PR, ih = H - PT - PB;
  const lo = Math.min(min, ...pts.map((p) => p.v), refLine?.value ?? min);
  const hi = Math.max(max, ...pts.map((p) => p.v), refLine?.value ?? max);
  const x = (i: number) => PL + (pts.length === 1 ? iw / 2 : (i / (pts.length - 1)) * iw);
  const y = (v: number) => PT + (1 - (v - lo) / (hi - lo)) * ih;
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  const first = pts[0];
  const last = pts[pts.length - 1];
  const dense = pts.length > 8;
  return (
    <figure className="m-0 border bg-paper-1 p-4 rule">
      <figcaption className="stamp mb-2 text-ink-3">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" className="block h-auto w-full" aria-label={`${title} ${ariaSuffix}`}>
        <line x1={PL} x2={W - PR} y1={y(lo)} y2={y(lo)} stroke="var(--line)" />
        {refLine && (
          <g>
            <line x1={PL} x2={W - PR} y1={y(refLine.value)} y2={y(refLine.value)}
              stroke="var(--chart-2)" strokeWidth={1.2} />
            <text x={W - PR} y={y(refLine.value) - 4} textAnchor="end" fontSize={9}
              fill="var(--ink-3)" className="font-mono">{refLine.label}</text>
          </g>
        )}
        <path d={line} fill="none" stroke="var(--accent-ink)" strokeWidth={2}
          strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle key={`${p.y}-${i}`} cx={x(i)} cy={y(p.v)} r={dense ? 2.2 : 3.4} fill="var(--accent-ink)"
            stroke="var(--paper-1)" strokeWidth={dense ? 1 : 2}>
            <title>{`${p.y} — ${p.v}${unit}${p.n > 1 ? ` (${p.n} rounds)` : ""}`}</title>
          </circle>
        ))}
        {first && last && (
          <g>
            <text x={x(0)} y={Math.max(10, y(first.v) - 8)} textAnchor="start" fontSize={10}
              fill="var(--ink-2)" className="font-mono">{first.v}{unit}</text>
            <text x={x(pts.length - 1)} y={Math.max(10, y(last.v) - 8)} textAnchor="end" fontSize={10}
              fill="var(--ink-2)" className="font-mono">{last.v}{unit}</text>
            <text x={x(0)} y={H - 6} textAnchor="start" fontSize={10}
              fill="var(--ink-3)" className="font-mono">{xLabels ? xLabels[0] : `’${first.y.slice(2)}`}</text>
            <text x={x(pts.length - 1)} y={H - 6} textAnchor="end" fontSize={10}
              fill="var(--ink-3)" className="font-mono">{xLabels ? xLabels[1] : `’${last.y.slice(2)}`}</text>
          </g>
        )}
      </svg>
    </figure>
  );
}

/* ── the gap bar: the priced strokes, stacked, against the index gap ──
 *
 * One series (strokes a round), segmented by area in ledger order. The first
 * segment — the biggest — is the accent; the rest step down the ink ramp, so
 * the bar reads as a ranking without a rainbow. A 2px surface gap separates
 * segments. Labels sit under their segment when it is wide enough to own
 * one, and the legend row beneath carries every value regardless. The index
 * gap is a tick on the same scale: the sum is not additive, and printing the
 * two side by side is the honesty. */

export interface GapItem {
  id: string;
  label: string;
  strokes: number;
}

const INK_RAMP = ["var(--accent-ink)", "var(--ink-1)", "var(--ink-2)", "var(--ink-3)"];

export function GapBar({ items, total, gap, compact = false, hrefBase }: {
  items: GapItem[];
  total: number | null;
  /** index − target index, on the same scale. */
  gap: number | null;
  compact?: boolean;
  /** When set, each segment links to `${hrefBase}#${id}`. */
  hrefBase?: string;
}) {
  const W = 720;
  const barH = compact ? 18 : 26;
  const PT = compact ? 6 : 18;
  const labelRow = compact ? 0 : 18;
  const H = PT + barH + (gap !== null ? 22 : 8) + labelRow;
  // Headroom past the longer of the two so the total label never sits on
  // the last segment.
  const max = Math.max(total ?? 0, gap ?? 0, 1) * 1.14;
  const scale = (v: number) => (v / max) * W;
  let cursor = 0;
  const segs = items.map((it, i) => {
    const x0 = scale(cursor);
    const w = scale(it.strokes);
    cursor += it.strokes;
    return { ...it, x0, w, color: INK_RAMP[Math.min(i, INK_RAMP.length - 1)] };
  });
  const GAP = 2;
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" className="block h-auto w-full"
        aria-label={`Strokes a round between this golfer and a 5–7 index, by area: ${items.map((i) => `${i.label} ${i.strokes}`).join(", ")}${gap !== null ? `; the index gap is ${gap}` : ""}`}>
        {segs.map((s, i) => {
          const inner = Math.max(0, s.w - (i < segs.length - 1 ? GAP : 0));
          const fits = !compact && inner > 96;
          const body = (
            <g key={s.id}>
              <rect x={s.x0} y={PT} width={inner} height={barH} fill={s.color}
                rx={i === segs.length - 1 ? 4 : 0} ry={4}>
                <title>{`${s.label} — ${s.strokes} strokes a round`}</title>
              </rect>
              {fits && (
                <text x={s.x0 + 8} y={PT + barH / 2 + 3.5} fontSize={10}
                  fill="var(--paper-1)" className="font-mono hidden sm:block">{s.label} · {s.strokes}</text>
              )}
            </g>
          );
          return hrefBase ? <a key={s.id} href={`${hrefBase}#${s.id}`}>{body}</a> : body;
        })}
        {total !== null && (
          <text x={scale(total) + 6} y={PT + barH / 2 + 3.5} fontSize={11} fontWeight={700}
            fill="var(--ink-0)" className="font-mono hidden sm:block">{total}</text>
        )}
        {gap !== null && (
          <g>
            <line x1={scale(gap)} x2={scale(gap)} y1={PT - 4} y2={PT + barH + 6}
              stroke="var(--chart-2)" strokeWidth={2} />
            <text x={scale(gap)} y={PT + barH + 17} textAnchor={scale(gap) > W - 120 ? "end" : "middle"} fontSize={10}
              fill="var(--ink-2)" className="font-mono hidden sm:block">index gap {gap}</text>
          </g>
        )}
      </svg>
      {!compact && (
        <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-ink-2">
          {segs.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: s.color }} aria-hidden />
              {s.label} <span className="text-ink-0">{s.strokes}</span>
            </span>
          ))}
          {gap !== null && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-[2px]" style={{ background: "var(--chart-2)" }} aria-hidden />
              index gap <span className="text-ink-0">{gap}</span>
            </span>
          )}
        </figcaption>
      )}
    </figure>
  );
}

/* ── the bullet: one number on one scale, with the two bands as ticks ──
 *
 * The record's value is the accent marker; the 13 band and the 5 band are
 * ticks in the second series colour with their band printed above. Text
 * never wears the series colour. Direction is the reader's — the scale
 * runs the same way for "up" and "down" metrics and the label says which
 * way is better. */

export function Bullet({ value, bench13, bench5, unit, ariaLabel }: {
  value: number | null;
  bench13: number | null;
  bench5: number | null;
  unit: string;
  ariaLabel: string;
}) {
  const W = 360, H = 50, PL = 6, PR = 6, PT = 22, TRACK = 6;
  const vals = [value, bench13, bench5].filter((v): v is number => v !== null);
  const max = Math.max(1, ...vals) * 1.18;
  const x = (v: number) => PL + (v / max) * (W - PL - PR);
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  const tick = (v: number, band: string) => (
    <g key={band}>
      <line x1={x(v)} x2={x(v)} y1={PT - 6} y2={PT + TRACK + 6} stroke="var(--chart-2)" strokeWidth={2} />
      <text x={x(v)} y={PT - 9} textAnchor="middle" fontSize={9} fill="var(--ink-3)" className="font-mono">
        {band} · {fmt(v)}
      </text>
    </g>
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" className="block h-auto w-full max-w-[360px]" aria-label={ariaLabel}>
      <rect x={PL} y={PT} width={W - PL - PR} height={TRACK} rx={3} fill="var(--line)" />
      {bench13 !== null && tick(bench13, "13")}
      {bench5 !== null && tick(bench5, "5")}
      {value !== null && (
        <g>
          <circle cx={x(value)} cy={PT + TRACK / 2} r={6} fill="var(--accent-ink)" stroke="var(--paper-1)" strokeWidth={2}>
            <title>{`you: ${fmt(value)}${unit === "%" ? "%" : ` ${unit}`}`}</title>
          </circle>
          <text x={x(value)} y={PT + TRACK + 17} textAnchor="middle" fontSize={10} fontWeight={700}
            fill="var(--ink-0)" className="font-mono">{fmt(value)}{unit === "%" ? "%" : ""}</text>
        </g>
      )}
    </svg>
  );
}
