"use client";

import { useState } from "react";
import type { ClubProfile } from "@/lib/stats";

/* Plan view of the range, looking down the target line.
 *
 * Each club is drawn as the region it actually finishes in: the interquartile
 * carry band (p25–p75) by the 80th-percentile lateral band (p10–p90 offline).
 * Half your shots with that club stop inside the vertical extent, eight in ten
 * inside the horizontal one.
 *
 * The scale is ISOTROPIC — one yard sideways is one yard long. That is the
 * whole point of a plan view: stretch either axis and the shape of the miss is
 * a lie, which is the thing this chart exists to show honestly.
 *
 * Rectangles, not ellipses. An ellipse would imply a bivariate normal we have
 * not established; a box states exactly the two quantile ranges that were
 * measured and nothing more.
 *
 * Hand-rolled SVG rather than Recharts: this is a to-scale spatial region plot
 * and Recharts has no primitive for it. Wrapping ScatterChart in custom shapes
 * would cost a dependency to fight it for less control over the geometry that
 * matters most here.
 */

const PAD = { top: 28, right: 96, bottom: 44, left: 56 };
const PLOT_W = 620;

export interface BagChartProps {
  profiles: ClubProfile[];
}

interface Box {
  p: ClubProfile;
  carryLo: number;
  carryHi: number;
  offLo: number;
  offHi: number;
  medCarry: number;
  medOff: number;
}

export function BagChart({ profiles }: BagChartProps) {
  const [hover, setHover] = useState<string | null>(null);

  const boxes: Box[] = profiles
    .filter(
      (p) =>
        !p.suppressed &&
        p.carryP25Yd !== null &&
        p.carryP75Yd !== null &&
        p.offlineP10Yd !== null &&
        p.offlineP90Yd !== null &&
        p.medianCarryYd !== null,
    )
    .map((p) => ({
      p,
      carryLo: p.carryP25Yd as number,
      carryHi: p.carryP75Yd as number,
      offLo: p.offlineP10Yd as number,
      offHi: p.offlineP90Yd as number,
      medCarry: p.medianCarryYd as number,
      medOff: p.medianOfflineYd ?? 0,
    }));

  if (boxes.length === 0) {
    return (
      <p className="font-mono text-[12px] text-cream-2">
        No club has enough shots to draw yet.
      </p>
    );
  }

  // Data extent, padded, and forced to include the target line at 0 offline.
  const yLo = Math.min(...boxes.map((b) => b.carryLo)) - 12;
  const yHi = Math.max(...boxes.map((b) => b.carryHi)) + 12;
  const xMag = Math.max(
    ...boxes.map((b) => Math.max(Math.abs(b.offLo), Math.abs(b.offHi))),
  );
  const xLo = -xMag - 8;
  const xHi = xMag + 8;

  // One scale for both axes. Never two.
  const scale = PLOT_W / (xHi - xLo);
  const PLOT_H = (yHi - yLo) * scale;

  const px = (offline: number) => (offline - xLo) * scale;
  const py = (carry: number) => PLOT_H - (carry - yLo) * scale;

  const W = PLOT_W + PAD.left + PAD.right;
  const H = PLOT_H + PAD.top + PAD.bottom;

  const carryTicks = niceTicks(yLo, yHi, 6);
  const offTicks = niceTicks(xLo, xHi, 7);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label="Plan view of carry distance against lateral miss, one region per club"
        style={{ maxWidth: W, overflow: "visible" }}
      >
        <g transform={`translate(${PAD.left},${PAD.top})`}>
          {/* gridlines — solid hairlines, one step off surface, recessive */}
          {carryTicks.map((t) => (
            <line
              key={`gy${t}`}
              x1={0}
              x2={PLOT_W}
              y1={py(t)}
              y2={py(t)}
              stroke="#2c2c2a"
              strokeWidth={1}
            />
          ))}
          {offTicks.map((t) => (
            <line
              key={`gx${t}`}
              x1={px(t)}
              x2={px(t)}
              y1={0}
              y2={PLOT_H}
              stroke="#2c2c2a"
              strokeWidth={1}
            />
          ))}

          {/* the target line */}
          <line
            x1={px(0)}
            x2={px(0)}
            y1={0}
            y2={PLOT_H}
            stroke="#5f5a53"
            strokeWidth={1}
          />

          {/* club regions */}
          {boxes.map((b) => {
            const on = hover === b.p.club;
            const x = px(b.offLo);
            const w = Math.max(px(b.offHi) - px(b.offLo), 2);
            const y = py(b.carryHi);
            const h = Math.max(py(b.carryLo) - py(b.carryHi), 2);
            return (
              <g
                key={b.p.club}
                onMouseEnter={() => setHover(b.p.club)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(b.p.club)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                style={{ outline: "none", cursor: "default" }}
              >
                {/* generous hit area, so a thin region is still hoverable */}
                <rect
                  x={x - 6}
                  y={y - 6}
                  width={w + 12}
                  height={h + 12}
                  fill="transparent"
                />
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  rx={3}
                  fill="#ff6b35"
                  fillOpacity={on ? 0.2 : 0.1}
                  stroke="#ff6b35"
                  strokeOpacity={on ? 1 : 0.55}
                  strokeWidth={on ? 2 : 1}
                />
                {/* median carry */}
                <line
                  x1={x}
                  x2={x + w}
                  y1={py(b.medCarry)}
                  y2={py(b.medCarry)}
                  stroke="#ff6b35"
                  strokeWidth={2}
                />
                {/* median lateral miss */}
                <circle
                  cx={px(b.medOff)}
                  cy={py(b.medCarry)}
                  r={4}
                  fill="#ff6b35"
                  stroke="#0a0a09"
                  strokeWidth={2}
                />
              </g>
            );
          })}

          {/* Direct labels in one right-hand gutter, joined by leader lines.
              Anchoring each label to its own box's right edge put a narrow
              club's label inside a wider club's region — and nudging labels
              apart without a connector detaches them from their marks. */}
          {labelLayout(boxes, py).map(({ b, y }) => {
            const boxRight = px(b.offHi);
            const medY = py(b.medCarry);
            const gutter = PLOT_W + 14;
            return (
              <g key={`lbl-${b.p.club}`}>
                <polyline
                  points={`${boxRight},${medY} ${gutter - 8},${medY} ${gutter - 4},${y}`}
                  fill="none"
                  stroke="#5f5a53"
                  strokeWidth={1}
                />
                <text
                  x={gutter}
                  y={y + 4}
                  fill="#f2ede5"
                  fontSize={11}
                  fontFamily="var(--font-mono)"
                >
                  {shortClub(b.p.club)}
                  <tspan fill="#8f8981" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {"  "}
                    {b.medCarry.toFixed(0)}
                  </tspan>
                </text>
              </g>
            );
          })}

          {/* axes */}
          <line x1={0} x2={PLOT_W} y1={PLOT_H} y2={PLOT_H} stroke="#383835" strokeWidth={1} />
          <line x1={0} x2={0} y1={0} y2={PLOT_H} stroke="#383835" strokeWidth={1} />

          {carryTicks.map((t) => (
            <text
              key={`ty${t}`}
              x={-10}
              y={py(t) + 4}
              textAnchor="end"
              fill="#898781"
              fontSize={10}
              fontFamily="var(--font-mono)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {t}
            </text>
          ))}
          {offTicks.map((t) => (
            <text
              key={`tx${t}`}
              x={px(t)}
              y={PLOT_H + 18}
              textAnchor="middle"
              fill="#898781"
              fontSize={10}
              fontFamily="var(--font-mono)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {t > 0 ? `+${t}` : t}
            </text>
          ))}
          <text
            x={PLOT_W / 2}
            y={PLOT_H + 38}
            textAnchor="middle"
            fill="#5f5a53"
            fontSize={10}
            fontFamily="var(--font-mono)"
            letterSpacing="0.08em"
          >
            LATERAL MISS — YARDS, LEFT / RIGHT
          </text>
          <text
            transform={`translate(-40,${PLOT_H / 2}) rotate(-90)`}
            textAnchor="middle"
            fill="#5f5a53"
            fontSize={10}
            fontFamily="var(--font-mono)"
            letterSpacing="0.08em"
          >
            CARRY — YARDS
          </text>
        </g>
      </svg>

      <figcaption className="mt-3 font-mono text-[10px] leading-4 text-cream-3">
        Each box is one club: the middle 50% of its carries by the middle 80% of
        its lateral misses. The bar is median carry, the dot median miss. Scale
        is one-to-one both ways, so the shapes are true.
        {hover && (
          <span className="ml-2 text-accent">
            {hover} — {describe(profiles.find((p) => p.club === hover))}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

function describe(p: ClubProfile | undefined): string {
  if (!p || p.medianCarryYd === null) return "";
  const band =
    p.carryP25Yd !== null && p.carryP75Yd !== null
      ? `${p.carryP25Yd.toFixed(0)}–${p.carryP75Yd.toFixed(0)} yd`
      : "—";
  const lat =
    p.offlineP10Yd !== null && p.offlineP90Yd !== null
      ? `${p.offlineP10Yd.toFixed(0)} to ${p.offlineP90Yd > 0 ? "+" : ""}${p.offlineP90Yd.toFixed(0)} yd`
      : "—";
  return `median ${p.medianCarryYd.toFixed(0)} yd · half inside ${band} · 80% inside ${lat} · n=${p.active}`;
}

function shortClub(club: string): string {
  return club
    .replace("Pitching Wedge", "PW")
    .replace("Gap Wedge", "GW")
    .replace("Sand Wedge", "SW")
    .replace("Lob Wedge", "LW")
    .replace(" Iron", "i")
    .replace(" Hybrid", "H")
    .replace(" Wood", "W");
}

/**
 * Push labels apart to a minimum spacing without letting them drift far from
 * their marks. Two clubs 2 yd apart — which is exactly the overlap this chart
 * is meant to expose — would otherwise print on top of each other.
 */
const LABEL_MIN_GAP = 15;

function labelLayout(
  boxes: Box[],
  py: (carry: number) => number,
): { b: Box; y: number }[] {
  const items = boxes
    .map((b) => ({ b, y: py(b.medCarry) }))
    .sort((a, b) => a.y - b.y);

  for (let i = 1; i < items.length; i += 1) {
    const gap = items[i].y - items[i - 1].y;
    if (gap < LABEL_MIN_GAP) items[i].y = items[i - 1].y + LABEL_MIN_GAP;
  }
  return items;
}

/** Round tick values, so the axis reads 100 / 120 / 140 rather than 107.3. */
function niceTicks(lo: number, hi: number, target: number): number[] {
  const raw = (hi - lo) / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) {
    out.push(Math.round(t * 100) / 100);
  }
  return out;
}
