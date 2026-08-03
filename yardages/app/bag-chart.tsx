"use client";

import { useState } from "react";
import type { ClubProfile } from "@/lib/stats";
import { CLUB_RAMP, FAIRWAY_HALF_WIDTH_YD, TURF, clubColor } from "./palette";

/* Plan view of the range, looking down the target line, drawn as the hole it
 * is: mown fairway, rough either side, distance flags up the left edge.
 *
 * The scenery is chrome and only chrome. Every stripe boundary is a real
 * gridline and the fairway edges are a real 30-yard corridor, so nothing
 * decorative sits at a position that means nothing.
 *
 * Two layers of data, and they answer different questions:
 *
 *   the shots  — every trusted shot, one dot, actual carry by actual offline.
 *                This is the dispersion. Nothing is summarised away.
 *   the region — the interquartile carry band (p25–p75) by the 80th-percentile
 *                band of deviation ANGLE (p10–p90). Half your shots stop inside
 *                the near-far extent, eight in ten inside the sideways one.
 *
 * The dots came second on purpose: a box alone cannot show you that a club's
 * miss is two clusters rather than one spread, and that is a thing this ledger
 * actually contains.
 *
 * The scale is ISOTROPIC — one yard sideways is one yard long. That is the
 * whole point of a plan view: stretch either axis and the shape of the miss is
 * a lie, which is the thing this chart exists to show honestly.
 *
 * Cones, not rectangles, and not ellipses.
 *
 * An ellipse would imply a bivariate normal nobody has established. A
 * rectangle was honest but wrong about the geometry: lateral miss in this data
 * is ANGULAR, not lateral. The export derives `deviation distance = carry ×
 * sin(deviation angle)`, so a box with parallel sides quietly says the miss is
 * a fixed number of yards wide at every distance, when the thing the club
 * actually did was point somewhere.
 *
 * So each club is the region between two rays at its measured p10 and p90
 * deviation angles, cut off at its p25 and p75 carries. Both bounds are still
 * exactly two measured quantile ranges and nothing more — the only change is
 * which units the lateral one is measured in.
 *
 * The plot's y is the radial carry the export reports and its x is that
 * carry's offline component, which is what makes a ray of constant angle a
 * STRAIGHT line here (x = y·sin θ) rather than a curve. Nothing is
 * reprojected and no dot moves; the sides of the region simply converge on the
 * tee the way the shots did.
 *
 * The rays are drawn on past the region, down toward the tee, because the
 * convergence over one club's interquartile band is about a yard and would
 * otherwise be invisible. They are angle references, not a claim about where
 * any ball was in mid-flight — a ball that curves does not fly down the ray it
 * lands on, and nothing here says it did.
 *
 * Hand-rolled SVG rather than Recharts: this is a to-scale spatial region plot
 * and Recharts has no primitive for it. Wrapping ScatterChart in custom shapes
 * would cost a dependency to fight it for less control over the geometry that
 * matters most here.
 */

const PAD = { top: 26, right: 124, bottom: 56, left: 62 };
const PLOT_W = 640;
/** Below this the 10px tick labels stop being readable, so the frame scrolls. */
const MIN_LEGIBLE_W = 700;

export interface ShotDot {
  club: string;
  carryYd: number;
  offlineYd: number;
}

export interface BagChartProps {
  profiles: ClubProfile[];
  /** Trusted shots only, for the dispersion layer. */
  shots: ShotDot[];
}

interface Box {
  p: ClubProfile;
  color: string;
  carryLo: number;
  carryHi: number;
  /** p10 and p90 deviation angle, as sines — the slope of each cone edge. */
  sinLo: number;
  sinHi: number;
  medCarry: number;
  medOff: number;
}

/** Offline yards at a given carry, for a cone edge of this angle. */
const edgeAt = (sinTheta: number, carry: number) => carry * sinTheta;

export function BagChart({ profiles, shots }: BagChartProps) {
  const [hover, setHover] = useState<string | null>(null);
  const [showShots, setShowShots] = useState(true);
  const [showCourse, setShowCourse] = useState(true);

  const drawable = profiles.filter(
    (p) =>
      !p.suppressed &&
      p.carryP25Yd !== null &&
      p.carryP75Yd !== null &&
      p.offlineP10Yd !== null &&
      p.offlineP90Yd !== null &&
      p.deviationP10Deg !== null &&
      p.deviationP90Deg !== null &&
      p.medianCarryYd !== null,
  );

  /* One ramp step per drawn club, shortest first, so all eight steps land on
   * marks somebody can see. Eight entries; not worth memoising. */
  const colors = new Map(
    [...drawable]
      .reverse()
      .map((p, i) => [p.club, clubColor(i, drawable.length)]),
  );

  const boxes: Box[] = drawable.map((p) => ({
    p,
    color: colors.get(p.club) ?? CLUB_RAMP[2],
    carryLo: p.carryP25Yd as number,
    carryHi: p.carryP75Yd as number,
    sinLo: Math.sin(((p.deviationP10Deg as number) * Math.PI) / 180),
    sinHi: Math.sin(((p.deviationP90Deg as number) * Math.PI) / 180),
    medCarry: p.medianCarryYd as number,
    medOff: p.medianOfflineYd ?? 0,
  }));

  const drawn = new Set(boxes.map((b) => b.p.club));
  const dots = shots.filter((s) => drawn.has(s.club));

  if (boxes.length === 0) {
    return (
      <p className="font-mono text-[12px] text-cream-2">
        No club has enough shots to draw yet.
      </p>
    );
  }

  /* Extent covers the boxes *and* every dot drawn. Clipping a shot to keep the
   * frame tidy would hide the misses, which are the reason to plot shots. */
  const yLo =
    Math.min(...boxes.map((b) => b.carryLo), ...dots.map((d) => d.carryYd)) - 9;
  const yHi =
    Math.max(...boxes.map((b) => b.carryHi), ...dots.map((d) => d.carryYd)) + 9;
  /* A cone is widest at its far edge, which can sit outside the offline
   * quantile it was built from — measure the corners, not the band. */
  const xMag = Math.max(
    ...boxes.map((b) =>
      Math.max(
        Math.abs(edgeAt(b.sinLo, b.carryHi)),
        Math.abs(edgeAt(b.sinHi, b.carryHi)),
      ),
    ),
    ...dots.map((d) => Math.abs(d.offlineYd)),
    FAIRWAY_HALF_WIDTH_YD,
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

  // Mow stripes land on half a tick, so every stripe edge is also a gridline.
  const tickStep = carryTicks.length > 1 ? carryTicks[1] - carryTicks[0] : 20;
  const stripeStep = tickStep / 2;
  const stripes: number[] = [];
  for (
    let c = Math.floor(yLo / stripeStep) * stripeStep;
    c < yHi;
    c += stripeStep
  ) {
    stripes.push(c);
  }

  const fairL = px(-FAIRWAY_HALF_WIDTH_YD);
  const fairR = px(FAIRWAY_HALF_WIDTH_YD);

  const active = hover ? (boxes.find((b) => b.p.club === hover) ?? null) : null;
  const dim = (club: string) => hover !== null && hover !== club;

  return (
    <figure className="m-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="stamp text-cream-3">
          Plan view · down the target line · scale 1:1 both ways
        </p>
        <div className="flex gap-px">
          <Toggle on={showShots} onClick={() => setShowShots((v) => !v)}>
            {dots.length} shots
          </Toggle>
          <Toggle on={showCourse} onClick={() => setShowCourse((v) => !v)}>
            course
          </Toggle>
        </div>
      </div>

      {/* Scrolls rather than shrinks below MIN_LEGIBLE_W. The viewBox scales the
          tick labels with the frame, so letting it fit a phone would render the
          axis at five pixels; a horizontal scroll keeps the numbers readable and
          the geometry to scale, which is the one thing that cannot be traded. */}
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label="Plan view of carry distance against lateral miss: every trusted shot as a dot, and one region per club"
          style={{ maxWidth: W, minWidth: MIN_LEGIBLE_W, overflow: "visible" }}
        >
          <defs>
            <pattern
              id="rough-tuft"
              width="9"
              height="9"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M1.5 8 L2.2 4.4 M5.6 9 L6.1 5.6 M3.6 4.2 L4.1 1"
                stroke={TURF.roughTuft}
                strokeWidth="0.75"
                fill="none"
                strokeLinecap="round"
              />
            </pattern>
            {/* The rays dissolve as they approach the tee: the further from the
                measured band, the less the line is saying. currentColor lets one
                pair of gradients serve every club. */}
            {[
              { id: "ray-fade", mid: 0.09, top: 0.3 },
              { id: "ray-fade-on", mid: 0.3, top: 0.75 },
            ].map((g) => (
              <linearGradient
                key={g.id}
                id={g.id}
                gradientUnits="userSpaceOnUse"
                x1={0}
                y1={PLOT_H}
                x2={0}
                y2={0}
              >
                <stop offset="0%" stopColor="currentColor" stopOpacity={0} />
                <stop offset="55%" stopColor="currentColor" stopOpacity={g.mid} />
                <stop offset="100%" stopColor="currentColor" stopOpacity={g.top} />
              </linearGradient>
            ))}
            <clipPath id="plot-clip">
              <rect x={0} y={0} width={PLOT_W} height={PLOT_H} />
            </clipPath>
          </defs>

          <g transform={`translate(${PAD.left},${PAD.top})`}>
            <g clipPath="url(#plot-clip)">
              {/* ── the hole ───────────────────────────────────────────────── */}
              {showCourse ? (
                <>
                  <rect width={PLOT_W} height={PLOT_H} fill={TURF.rough} />
                  <rect
                    width={PLOT_W}
                    height={PLOT_H}
                    fill="url(#rough-tuft)"
                  />
                  <rect
                    x={fairL}
                    y={0}
                    width={fairR - fairL}
                    height={PLOT_H}
                    fill={TURF.fairway}
                  />
                  {stripes.map((c, i) =>
                    i % 2 === 0 ? (
                      <rect
                        key={`mow${c}`}
                        x={fairL}
                        y={py(c + stripeStep)}
                        width={fairR - fairL}
                        height={Math.max(py(c) - py(c + stripeStep), 0)}
                        fill={TURF.mow}
                      />
                    ) : null,
                  )}
                  <line
                    x1={fairL}
                    x2={fairL}
                    y1={0}
                    y2={PLOT_H}
                    stroke={TURF.edge}
                    strokeWidth={1.5}
                  />
                  <line
                    x1={fairR}
                    x2={fairR}
                    y1={0}
                    y2={PLOT_H}
                    stroke={TURF.edge}
                    strokeWidth={1.5}
                  />
                  <text
                    transform={`translate(${fairL - 6},${PLOT_H - 14}) rotate(-90)`}
                    fill={TURF.muted}
                    fontSize={9}
                    fontFamily="var(--font-mono)"
                    letterSpacing="0.14em"
                  >
                    FAIRWAY {FAIRWAY_HALF_WIDTH_YD * 2} YD
                  </text>
                </>
              ) : (
                <rect
                  width={PLOT_W}
                  height={PLOT_H}
                  fill="var(--color-ink-1)"
                />
              )}

              {/* ── grid ───────────────────────────────────────────────────── */}
              {carryTicks.map((t) => (
                <line
                  key={`gy${t}`}
                  x1={0}
                  x2={PLOT_W}
                  y1={py(t)}
                  y2={py(t)}
                  stroke={TURF.grid}
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
                  stroke={TURF.grid}
                  strokeWidth={1}
                />
              ))}

              {/* The aim line. Dashed because it is a threshold, not a gridline. */}
              <line
                x1={px(0)}
                x2={px(0)}
                y1={0}
                y2={PLOT_H}
                stroke={TURF.target}
                strokeWidth={1}
                strokeDasharray="5 5"
              />

              {/* Which way the tee is. The frame starts at the shortest carry on
                file, not at zero, so this is an orientation mark and carries no
                value of its own. */}
              <g transform={`translate(${px(0)},${PLOT_H - 16})`}>
                <path
                  d="M-5 -7 L0 0 L5 -7"
                  fill="none"
                  stroke={TURF.muted}
                  strokeWidth={1.25}
                />
                <text
                  y={12}
                  textAnchor="middle"
                  fill={TURF.muted}
                  fontSize={9}
                  fontFamily="var(--font-mono)"
                  letterSpacing="0.16em"
                >
                  TEE
                </text>
              </g>

              {/* ── the cone edges, run back toward the tee ────────────────── */}
              {boxes.map((b) => {
                const on = hover === b.p.club;
                const faded = dim(b.p.club);
                return (
                  <g
                    key={`ray-${b.p.club}`}
                    style={{ color: b.color }}
                    opacity={faded ? 0.25 : 1}
                  >
                    {[b.sinLo, b.sinHi].map((sinT, i) => (
                      <line
                        key={i}
                        x1={px(edgeAt(sinT, yLo))}
                        y1={py(yLo)}
                        x2={px(edgeAt(sinT, b.carryHi))}
                        y2={py(b.carryHi)}
                        stroke={`url(#ray-fade${on ? "-on" : ""})`}
                        strokeWidth={on ? 1.5 : 1}
                      />
                    ))}
                  </g>
                );
              })}

              {/* ── every trusted shot ─────────────────────────────────────── */}
              {showShots &&
                dots.map((d, i) => {
                  const faded = dim(d.club);
                  return (
                    <circle
                      key={i}
                      cx={px(d.offlineYd)}
                      cy={py(d.carryYd)}
                      r={hover === d.club ? 2.9 : 2.2}
                      fill={colors.get(d.club) ?? CLUB_RAMP[2]}
                      fillOpacity={
                        faded ? 0.12 : hover === d.club ? 0.95 : 0.62
                      }
                    />
                  );
                })}
            </g>

            {/* ── club regions ─────────────────────────────────────────────── */}
            {boxes.map((b) => {
              const on = hover === b.p.club;
              const faded = dim(b.p.club);

              /* Four corners: the two carry cuts by the two angle rays. Order
                 matters — near-left, far-left, far-right, near-right. */
              const corners: [number, number][] = [
                [edgeAt(b.sinLo, b.carryLo), b.carryLo],
                [edgeAt(b.sinLo, b.carryHi), b.carryHi],
                [edgeAt(b.sinHi, b.carryHi), b.carryHi],
                [edgeAt(b.sinHi, b.carryLo), b.carryLo],
              ];
              const points = corners
                .map(([o, c]) => `${px(o)},${py(c)}`)
                .join(" ");

              const xs = corners.map(([o]) => px(o));
              const x = Math.min(...xs);
              const w = Math.max(Math.max(...xs) - x, 2);
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
                  aria-label={`${b.p.club}, ${describe(b.p)}`}
                  style={{ outline: "none", cursor: "default" }}
                  opacity={faded ? 0.28 : 1}
                >
                  {/* generous hit area, so a thin region is still hoverable */}
                  <rect
                    x={x - 8}
                    y={y - 8}
                    width={w + 16}
                    height={h + 16}
                    fill="transparent"
                  />
                  <polygon
                    points={points}
                    fill={b.color}
                    fillOpacity={on ? 0.16 : 0.06}
                    stroke={b.color}
                    strokeOpacity={on ? 1 : 0.85}
                    strokeWidth={on ? 2.25 : 1.5}
                    strokeLinejoin="round"
                  />
                  {/* median carry, spanning the cone at exactly that radius */}
                  <line
                    x1={px(edgeAt(b.sinLo, b.medCarry))}
                    x2={px(edgeAt(b.sinHi, b.medCarry))}
                    y1={py(b.medCarry)}
                    y2={py(b.medCarry)}
                    stroke={b.color}
                    strokeWidth={2}
                  />
                  {/* median lateral miss, ringed in turf so it survives an overlap */}
                  <circle
                    cx={px(b.medOff)}
                    cy={py(b.medCarry)}
                    r={4}
                    fill={b.color}
                    stroke={showCourse ? TURF.fairway : "var(--color-ink-1)"}
                    strokeWidth={2}
                  />
                </g>
              );
            })}

            {/* Direct labels in one right-hand gutter, joined by leader lines, each
              with its own colour chip — the legend and the label at once.
              Anchoring each label to its own box's right edge put a narrow
              club's label inside a wider club's region — and nudging labels
              apart without a connector detaches them from their marks. */}
            {labelLayout(boxes, py).map(({ b, y }) => {
              const boxRight = px(edgeAt(b.sinHi, b.medCarry));
              const medY = py(b.medCarry);
              const gutter = PLOT_W + 16;
              const faded = dim(b.p.club);
              return (
                <g key={`lbl-${b.p.club}`} opacity={faded ? 0.35 : 1}>
                  <polyline
                    points={`${boxRight},${medY} ${gutter - 10},${medY} ${gutter - 6},${y}`}
                    fill="none"
                    stroke={b.color}
                    strokeOpacity={0.5}
                    strokeWidth={1}
                  />
                  <rect
                    x={gutter}
                    y={y - 4}
                    width={7}
                    height={7}
                    rx={1}
                    fill={b.color}
                  />
                  <text
                    x={gutter + 13}
                    y={y + 3}
                    fill={hover === b.p.club ? "#ffffff" : "#e7e2d9"}
                    fontSize={11}
                    fontFamily="var(--font-mono)"
                    letterSpacing="0.04em"
                  >
                    {shortClub(b.p.club)}
                    <tspan
                      fill="#8f8981"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {"  "}
                      {b.medCarry.toFixed(0)}
                    </tspan>
                  </text>
                </g>
              );
            })}

            {/* ── axes ─────────────────────────────────────────────────────── */}
            <line
              x1={0}
              x2={PLOT_W}
              y1={PLOT_H}
              y2={PLOT_H}
              stroke={TURF.axis}
              strokeWidth={1}
            />
            <line
              x1={0}
              x2={0}
              y1={0}
              y2={PLOT_H}
              stroke={TURF.axis}
              strokeWidth={1}
            />

            {/* Carry ticks. Fifties get a range flag, the way a range does. */}
            {carryTicks.map((t) => {
              const flag = t % 50 === 0;
              return (
                <g key={`ty${t}`}>
                  {flag && (
                    <g transform={`translate(-34,${py(t)})`}>
                      <line
                        x1={0}
                        x2={0}
                        y1={-11}
                        y2={1}
                        stroke={TURF.tick}
                        strokeWidth={1}
                      />
                      <path d="M0.5 -11 L7 -8.5 L0.5 -6 Z" fill={TURF.tick} />
                    </g>
                  )}
                  <text
                    x={-10}
                    y={py(t) + 4}
                    textAnchor="end"
                    fill={flag ? "#c9c3ba" : TURF.tick}
                    fontSize={10}
                    fontFamily="var(--font-mono)"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {t}
                  </text>
                </g>
              );
            })}
            {offTicks.map((t) => (
              <text
                key={`tx${t}`}
                x={px(t)}
                y={PLOT_H + 18}
                textAnchor="middle"
                fill={TURF.tick}
                fontSize={10}
                fontFamily="var(--font-mono)"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {t > 0 ? `+${t}` : t}
              </text>
            ))}
            <text
              x={PLOT_W / 2}
              y={PLOT_H + 40}
              textAnchor="middle"
              fill={TURF.muted}
              fontSize={9}
              fontFamily="var(--font-mono)"
              letterSpacing="0.16em"
            >
              ← LEFT · LATERAL MISS, YARDS · RIGHT →
            </text>
            <text
              transform={`translate(-46,${PLOT_H / 2}) rotate(-90)`}
              textAnchor="middle"
              fill={TURF.muted}
              fontSize={9}
              fontFamily="var(--font-mono)"
              letterSpacing="0.16em"
            >
              CARRY, YARDS
            </text>
          </g>
        </svg>
      </div>

      <figcaption className="mt-3 border-t pt-2 rule">
        {/* The readout keeps its row whether or not anything is hovered — a
            strip that appears and disappears would shove the page under the
            cursor as you move across the chart. */}
        <div className="flex h-5 items-center gap-x-4 overflow-x-auto font-mono text-[11px] whitespace-nowrap">
          {active ? (
            <>
              <span className="inline-flex items-center gap-2 text-cream-0">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-[1px]"
                  style={{ background: active.color }}
                />
                {active.p.club}
              </span>
              <Read label="median" value={`${active.medCarry.toFixed(1)} yd`} />
              <Read
                label="half inside"
                value={`${active.carryLo.toFixed(0)}–${active.carryHi.toFixed(0)} yd`}
              />
              <Read
                label="8 in 10 inside"
                value={`${deg(active.p.deviationP10Deg)} to ${deg(active.p.deviationP90Deg)}`}
              />
              <Read
                label="= at this carry"
                value={`${edgeAt(active.sinLo, active.medCarry).toFixed(0)} to ${active.sinHi > 0 ? "+" : ""}${edgeAt(active.sinHi, active.medCarry).toFixed(0)} yd`}
              />
              <Read
                label="median miss"
                value={`${Math.abs(active.medOff).toFixed(1)} yd ${active.medOff >= 0 ? "right" : "left"}`}
              />
              <Read label="n" value={String(active.p.active)} />
            </>
          ) : (
            <span className="text-[10px] uppercase tracking-[0.12em] text-cream-3">
              Hover or tab a club for its numbers
            </span>
          )}
        </div>
        <p className="mt-1.5 font-mono text-[10px] leading-4 text-cream-3">
          One dot per trusted shot. Each cone is the middle 50% of that
          club&rsquo;s carries by the middle 80% of its aim, in degrees — so its
          sides converge on the tee, the way a miss does. The bar is median
          carry, the ringed dot median miss, and the faint rays are those same
          two angles run back toward the tee. Scale is one-to-one both ways, so
          the shapes are true and the fairway is really 30 yards wide.
        </p>
      </figcaption>
    </figure>
  );
}

/** Signed degrees, with the sign spelled out — the axis is left/right. */
function deg(v: number | null): string {
  if (v === null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}°`;
}

function Read({ label, value }: { label: string; value: string }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-cream-3">{label} </span>
      <span className="tabular-nums text-cream-1">{value}</span>
    </span>
  );
}

function Toggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors rule ${
        on ? "bg-ink-2 text-cream-0" : "text-cream-3 hover:text-cream-1"
      }`}
    >
      {children}
    </button>
  );
}

function describe(p: ClubProfile | undefined): string {
  if (!p || p.medianCarryYd === null) return "";
  const band =
    p.carryP25Yd !== null && p.carryP75Yd !== null
      ? `${p.carryP25Yd.toFixed(0)}–${p.carryP75Yd.toFixed(0)} yd`
      : "—";
  const lat = `${deg(p.deviationP10Deg)} to ${deg(p.deviationP90Deg)}`;
  return `median ${p.medianCarryYd.toFixed(0)} yd · half inside ${band} · 80% of its aim inside ${lat} · n=${p.active}`;
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
const LABEL_MIN_GAP = 16;

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
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) {
    out.push(Math.round(t * 100) / 100);
  }
  return out;
}
