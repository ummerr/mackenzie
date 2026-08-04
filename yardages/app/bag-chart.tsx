"use client";

import { useState } from "react";
import type { ClubProfile, DistanceBasis } from "@/lib/stats";
import { CLUB_RAMP, FAIRWAY_HALF_WIDTH_YD, TURF, clubColor } from "./palette";
import { useMedia } from "./use-media";

/* Plan view of the range, looking down the target line, drawn as the hole it
 * is: mown fairway, rough either side, distance flags up the left edge.
 *
 * The scenery is chrome and only chrome. Every stripe boundary is a real
 * gridline and the fairway edges are a real 30-yard corridor, so nothing
 * decorative sits at a position that means nothing.
 *
 * Two layers of data, and they answer different questions:
 *
 *   the shots  — every trusted shot, one dot, actual distance by actual
 *                offline. This is the dispersion. Nothing is summarised away.
 *   the region — the interquartile distance band (p25–p75) by the
 *                80th-percentile band of deviation ANGLE (p10–p90). Half your
 *                shots stop inside the near-far extent, eight in ten inside the
 *                sideways one.
 *
 * Distance means whichever basis the caller passed, carry or total, and the
 * component never mixes them: the dots, the region, the axis and the caption
 * are all one basis at a time. Both bases carry their own deviation columns in
 * the export, so nothing here is a carry number wearing a total label.
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
 * is ANGULAR, not lateral. The export derives `deviation distance = distance ×
 * sin(deviation angle)`, so a box with parallel sides quietly says the miss is
 * a fixed number of yards wide at every distance, when the thing the club
 * actually did was point somewhere.
 *
 * That identity holds on BOTH bases, which is what makes one cone construction
 * serve both: across this ledger the residual is under 0.02 yd for carry
 * against the carry deviation columns and under 0.02 yd for total against the
 * total ones. The total basis is therefore drawn from its own measured pair,
 * never from carry angles reused at a longer radius.
 *
 * So each club is the region between two rays at its measured p10 and p90
 * deviation angles, cut off at its p25 and p75 distances. Both bounds are still
 * exactly two measured quantile ranges and nothing more — the only change is
 * which units the lateral one is measured in.
 *
 * The plot's y is the radial distance the export reports and its x is that
 * distance's offline component, which is what makes a ray of constant angle a
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

/* Two frames of the same drawing.
 *
 * The frame is a viewBox, so every number below is a ratio and not a pixel:
 * what a frame really sets is how large the type is *relative to the plot*.
 * The wide frame draws 10px labels on a 640-unit plot and is then rendered at
 * whatever width it is given, which is why it has to stop shrinking at 700px —
 * below that the axis renders at five or six pixels.
 *
 * The compact frame draws the same geometry on a 236-unit plot, so the same
 * labels are proportionally more than twice the size and survive being
 * rendered at 340px. The chart fits a phone with no horizontal scroll and no
 * pinching, and — the part that matters — it is still isotropic, still the
 * same quantiles, still 30 real yards of fairway. Nothing is traded but
 * detail: the compact frame carries fewer gridlines, shorter axis titles and
 * no rotated carry title, because those are the things a small frame has no
 * room for and a phone can live without.
 *
 * What is NOT traded is the scale. Fitting the wide frame to a phone by
 * letting it shrink, or by stretching one axis to make it shorter, would break
 * the one promise this chart makes.
 */
interface Frame {
  plotW: number;
  pad: { top: number; right: number; bottom: number; left: number };
  /** Axis numbers, how far the carry ones sit left of the axis, how far the
   *  lateral ones sit below it, and where the title under them lands. */
  tick: number;
  tickPad: number;
  tickDrop: number;
  xTitleY: number;
  /** Axis titles, and the scenery's own words. */
  axis: number;
  /** The club labels in the right-hand gutter, and how far apart they push. */
  label: number;
  labelGap: number;
  /** Where the gutter starts, past the plot, and how big its colour chip is. */
  gutter: number;
  chip: number;
  dot: number;
  dotOn: number;
  distTicks: number;
  offTicks: number;
  /** x of the range flag: outside the plot on the wide frame, on the grass on
   *  the compact one, where there is no gutter to put it in. */
  flagX: number;
  xTitle: string;
  /** False on the compact frame: the rotated title needs a gutter of its own.
   *  Only whether there is room — the words are the basis's, not the frame's. */
  yTitle: boolean;
}

const WIDE: Frame = {
  plotW: 640,
  pad: { top: 26, right: 124, bottom: 56, left: 62 },
  tick: 10,
  tickPad: 10,
  tickDrop: 18,
  xTitleY: 40,
  axis: 9,
  label: 11,
  labelGap: 16,
  gutter: 16,
  chip: 7,
  dot: 2.2,
  dotOn: 2.9,
  distTicks: 6,
  offTicks: 7,
  flagX: -34,
  xTitle: "← LEFT · LATERAL MISS, YARDS · RIGHT →",
  yTitle: true,
};

const COMPACT: Frame = {
  plotW: 236,
  pad: { top: 14, right: 60, bottom: 38, left: 30 },
  tick: 9,
  tickPad: 8,
  tickDrop: 15,
  xTitleY: 30,
  axis: 8,
  label: 9,
  labelGap: 12,
  gutter: 10,
  chip: 6,
  dot: 1.8,
  dotOn: 2.6,
  distTicks: 5,
  offTicks: 6,
  flagX: 3,
  xTitle: "← MISS, YARDS →",
  yTitle: false,
};

/** Below this the wide frame's 10px tick labels stop being readable, so the
 *  frame scrolls rather than shrinks. */
const MIN_LEGIBLE_W = 700;

/** Under this the compact frame takes over instead. Between the two, a landscape
 *  phone or a small tablet still has the width to scroll the real thing. */
const COMPACT_UNDER = 560;

/** The compact frame is allowed to scale up this far before it stops growing —
 *  past it the type is larger than the page's own body text. */
const COMPACT_MAX_W = 520;

export interface ShotDot {
  club: string;
  /** Carry or total, matching the chart's basis. */
  distanceYd: number;
  offlineYd: number;
}

export interface BagChartProps {
  profiles: ClubProfile[];
  /** Trusted shots only, for the dispersion layer. */
  shots: ShotDot[];
  /** Which distance the profiles and dots are measured to. */
  basis: DistanceBasis;
  /** Rendered between the header and the frame, for basis-specific caveats. */
  children?: React.ReactNode;
  /** A frame to draw inside. Omit and the chart fits itself to its own data. */
  domain?: PlotDomain;
}

interface Box {
  p: ClubProfile;
  color: string;
  distLo: number;
  distHi: number;
  /** p10 and p90 deviation angle, as sines — the slope of each cone edge. */
  sinLo: number;
  sinHi: number;
  medDist: number;
  medOff: number;
}

/**
 * The frame a basis is drawn in: near and far distance, and the half-width of
 * the offline axis. Padding is already in these numbers, so a domain can be
 * merged and handed straight to the chart.
 */
export interface PlotDomain {
  yLo: number;
  yHi: number;
  xMag: number;
}

/** Clubs with enough of everything to draw a cone from. */
export function drawableOf(profiles: ClubProfile[]): ClubProfile[] {
  return profiles.filter(
    (p) =>
      !p.suppressed &&
      p.distanceP25Yd !== null &&
      p.distanceP75Yd !== null &&
      p.offlineP10Yd !== null &&
      p.offlineP90Yd !== null &&
      p.deviationP10Deg !== null &&
      p.deviationP90Deg !== null &&
      p.medianDistanceYd !== null,
  );
}

const sinOf = (deg: number) => Math.sin((deg * Math.PI) / 180);

/**
 * The extent one basis needs: its cones *and* every dot it draws. Clipping a
 * shot to keep the frame tidy would hide the misses, which are the reason to
 * plot shots at all. Null when there is nothing to draw.
 */
export function plotDomain(
  profiles: ClubProfile[],
  shots: ShotDot[],
): PlotDomain | null {
  const drawable = drawableOf(profiles);
  if (drawable.length === 0) return null;
  const drawn = new Set(drawable.map((p) => p.club));
  const dots = shots.filter((s) => drawn.has(s.club));

  const near = drawable.map((p) => p.distanceP25Yd as number);
  const far = drawable.map((p) => p.distanceP75Yd as number);
  return {
    yLo: Math.min(...near, ...dots.map((d) => d.distanceYd)) - 9,
    yHi: Math.max(...far, ...dots.map((d) => d.distanceYd)) + 9,
    /* A cone is widest at its far edge, which can sit outside the offline
     * quantile it was built from — measure the corners, not the band. */
    xMag: Math.max(
      ...drawable.map((p) => {
        const edge = p.distanceP75Yd as number;
        return Math.max(
          Math.abs(edge * sinOf(p.deviationP10Deg as number)),
          Math.abs(edge * sinOf(p.deviationP90Deg as number)),
        );
      }),
      ...dots.map((d) => Math.abs(d.offlineYd)),
      FAIRWAY_HALF_WIDTH_YD,
    ),
  };
}

/**
 * One frame wide enough for every basis, so the axis holds still while the data
 * moves. Without this the frame refits itself to each basis and a bag that runs
 * seven yards further on total can look the same size or smaller — the axis
 * quietly absorbing the very difference the toggle exists to show.
 */
export function mergeDomains(domains: (PlotDomain | null)[]): PlotDomain | null {
  const real = domains.filter((d): d is PlotDomain => d !== null);
  if (real.length === 0) return null;
  return {
    yLo: Math.min(...real.map((d) => d.yLo)),
    yHi: Math.max(...real.map((d) => d.yHi)),
    xMag: Math.max(...real.map((d) => d.xMag)),
  };
}

/** Offline yards at a given distance, for a cone edge of this angle. */
const edgeAt = (sinTheta: number, distance: number) => distance * sinTheta;

export function BagChart({
  profiles,
  shots,
  basis,
  children,
  domain,
}: BagChartProps) {
  const [hover, setHover] = useState<string | null>(null);
  const [showShots, setShowShots] = useState(true);
  const [showCourse, setShowCourse] = useState(true);

  const compact = useMedia(`(max-width: ${COMPACT_UNDER - 1}px)`);
  const F = compact ? COMPACT : WIDE;
  const PAD = F.pad;
  const PLOT_W = F.plotW;

  const drawable = drawableOf(profiles);

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
    distLo: p.distanceP25Yd as number,
    distHi: p.distanceP75Yd as number,
    sinLo: Math.sin(((p.deviationP10Deg as number) * Math.PI) / 180),
    sinHi: Math.sin(((p.deviationP90Deg as number) * Math.PI) / 180),
    medDist: p.medianDistanceYd as number,
    medOff: p.medianOfflineYd ?? 0,
  }));

  const drawn = new Set(boxes.map((b) => b.p.club));
  const dots = shots.filter((s) => drawn.has(s.club));

  if (boxes.length === 0) {
    return (
      <p className="font-mono text-[12px] text-ink-2">
        No club has enough shots to draw yet.
      </p>
    );
  }

  /* The frame. Given one, the component draws inside it rather than fitting
   * itself to its own data — which is what lets both bases share a frame, so
   * switching from carry to total MOVES the cones instead of rescaling the
   * axis under them. Falling back to its own extent keeps the component
   * usable on its own. */
  const { yLo, yHi, xMag } = domain ?? (plotDomain(profiles, shots) as PlotDomain);
  const xLo = -xMag - 8;
  const xHi = xMag + 8;

  // One scale for both axes. Never two.
  const scale = PLOT_W / (xHi - xLo);
  const PLOT_H = (yHi - yLo) * scale;

  const px = (offline: number) => (offline - xLo) * scale;
  const py = (distance: number) => PLOT_H - (distance - yLo) * scale;

  const W = PLOT_W + PAD.left + PAD.right;
  const H = PLOT_H + PAD.top + PAD.bottom;

  const distTicks = niceTicks(yLo, yHi, F.distTicks);
  const offTicks = niceTicks(xLo, xHi, F.offTicks);

  // Mow stripes land on half a tick, so every stripe edge is also a gridline.
  const tickStep = distTicks.length > 1 ? distTicks[1] - distTicks[0] : 20;
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

  /* Hover is a mouse idea. A finger has no hover state, so on touch the same
   * highlight is a selection: tap a club to hold it, tap it again to let go.
   * Gating on `pointerType` rather than on the compact frame keeps a mouse
   * behaving like a mouse in a narrow window, and keeps a touchscreen laptop
   * from selecting a club the cursor merely passed over. */
  const pointFrom = (club: string | null) => setHover(club);
  const toggle = (club: string) => setHover((h) => (h === club ? null : club));

  return (
    <figure className="m-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div>
          <p className="stamp text-ink-3">
            Plan view · to {basis === "carry" ? "where it landed" : "where it stopped"} ·
            scale 1:1 both ways
          </p>
          {/* The compact frame has no room for a rotated axis title, so the
              axis it drops is named here instead. */}
          {compact && (
            <p className="stamp mt-1 text-ink-3">Up the page is {basis}</p>
          )}
        </div>
        <div className="flex gap-px">
          <Toggle on={showShots} onClick={() => setShowShots((v) => !v)}>
            {dots.length} shots
          </Toggle>
          <Toggle on={showCourse} onClick={() => setShowCourse((v) => !v)}>
            course
          </Toggle>
        </div>
      </div>

      {children}

      {/* The wide frame scrolls rather than shrinks below MIN_LEGIBLE_W, because
          the viewBox scales the tick labels with the frame and letting it fit a
          phone would render the axis at five pixels. A phone gets the compact
          frame instead, which fits at full size — the geometry is identical and
          only the type is proportionally larger, so nothing scrolls and the
          scale is still one to one. */}
      <div className={compact ? undefined : "pan-x"}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={`Plan view of ${basis} distance against lateral miss: every trusted shot as a dot, and one region per club`}
          style={{
            maxWidth: compact ? COMPACT_MAX_W : W,
            minWidth: compact ? undefined : MIN_LEGIBLE_W,
            overflow: "visible",
          }}
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
                style={{ stroke: TURF.roughTuft }}
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
                  <rect
                    width={PLOT_W}
                    height={PLOT_H}
                    style={{ fill: TURF.rough }}
                  />
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
                    style={{ fill: TURF.fairway }}
                  />
                  {stripes.map((c, i) =>
                    i % 2 === 0 ? (
                      <rect
                        key={`mow${c}`}
                        x={fairL}
                        y={py(c + stripeStep)}
                        width={fairR - fairL}
                        height={Math.max(py(c) - py(c + stripeStep), 0)}
                        style={{ fill: TURF.mow }}
                      />
                    ) : null,
                  )}
                  <line
                    x1={fairL}
                    x2={fairL}
                    y1={0}
                    y2={PLOT_H}
                    style={{ stroke: TURF.edge }}
                    strokeWidth={1.5}
                  />
                  <line
                    x1={fairR}
                    x2={fairR}
                    y1={0}
                    y2={PLOT_H}
                    style={{ stroke: TURF.edge }}
                    strokeWidth={1.5}
                  />
                  <text
                    transform={`translate(${fairL - 6},${PLOT_H - 14}) rotate(-90)`}
                    style={{ fill: TURF.muted }}
                    fontSize={F.axis}
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
                  style={{ fill: "var(--paper-1)" }}
                />
              )}

              {/* ── grid ───────────────────────────────────────────────────── */}
              {distTicks.map((t) => (
                <line
                  key={`gy${t}`}
                  x1={0}
                  x2={PLOT_W}
                  y1={py(t)}
                  y2={py(t)}
                  style={{ stroke: TURF.grid }}
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
                  style={{ stroke: TURF.grid }}
                  strokeWidth={1}
                />
              ))}

              {/* The aim line. Dashed because it is a threshold, not a gridline. */}
              <line
                x1={px(0)}
                x2={px(0)}
                y1={0}
                y2={PLOT_H}
                style={{ stroke: TURF.target }}
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
                  style={{ stroke: TURF.muted }}
                  strokeWidth={1.25}
                />
                <text
                  y={12}
                  textAnchor="middle"
                  style={{ fill: TURF.muted }}
                  fontSize={F.axis}
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
                        x2={px(edgeAt(sinT, b.distHi))}
                        y2={py(b.distHi)}
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
                      cy={py(d.distanceYd)}
                      r={hover === d.club ? F.dotOn : F.dot}
                      style={{ fill: colors.get(d.club) ?? CLUB_RAMP[2] }}
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

              /* Four corners: the two distance cuts by the two angle rays.
                 Order matters — near-left, far-left, far-right, near-right. */
              const corners: [number, number][] = [
                [edgeAt(b.sinLo, b.distLo), b.distLo],
                [edgeAt(b.sinLo, b.distHi), b.distHi],
                [edgeAt(b.sinHi, b.distHi), b.distHi],
                [edgeAt(b.sinHi, b.distLo), b.distLo],
              ];
              const points = corners
                .map(([o, c]) => `${px(o)},${py(c)}`)
                .join(" ");

              const xs = corners.map(([o]) => px(o));
              const x = Math.min(...xs);
              const w = Math.max(Math.max(...xs) - x, 2);
              const y = py(b.distHi);
              const h = Math.max(py(b.distLo) - py(b.distHi), 2);
              return (
                <g
                  key={b.p.club}
                  onPointerEnter={(e) => {
                    if (e.pointerType === "mouse") pointFrom(b.p.club);
                  }}
                  onPointerLeave={(e) => {
                    if (e.pointerType === "mouse") pointFrom(null);
                  }}
                  onPointerUp={(e) => {
                    if (e.pointerType !== "mouse") toggle(b.p.club);
                  }}
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
                    style={{ fill: b.color, stroke: b.color }}
                    fillOpacity={on ? 0.16 : 0.06}
                    strokeOpacity={on ? 1 : 0.85}
                    strokeWidth={on ? 2.25 : 1.5}
                    strokeLinejoin="round"
                  />
                  {/* median distance, spanning the cone at exactly that radius */}
                  <line
                    x1={px(edgeAt(b.sinLo, b.medDist))}
                    x2={px(edgeAt(b.sinHi, b.medDist))}
                    y1={py(b.medDist)}
                    y2={py(b.medDist)}
                    style={{ stroke: b.color }}
                    strokeWidth={2}
                  />
                  {/* median lateral miss, ringed in turf so it survives an overlap */}
                  <circle
                    cx={px(b.medOff)}
                    cy={py(b.medDist)}
                    r={4}
                    style={{
                      fill: b.color,
                      stroke: showCourse ? TURF.fairway : "var(--paper-1)",
                    }}
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
            {labelLayout(boxes, py, F.labelGap).map(({ b, y }) => {
              const boxRight = px(edgeAt(b.sinHi, b.medDist));
              const medY = py(b.medDist);
              const gutter = PLOT_W + F.gutter;
              const faded = dim(b.p.club);
              return (
                <g key={`lbl-${b.p.club}`} opacity={faded ? 0.35 : 1}>
                  <polyline
                    points={`${boxRight},${medY} ${gutter - 10},${medY} ${gutter - 6},${y}`}
                    fill="none"
                    style={{ stroke: b.color }}
                    strokeOpacity={0.5}
                    strokeWidth={1}
                  />
                  <rect
                    x={gutter}
                    y={y - F.chip / 2 - 0.5}
                    width={F.chip}
                    height={F.chip}
                    rx={1}
                    style={{ fill: b.color }}
                  />
                  <text
                    x={gutter + F.chip + 6}
                    y={y + 3}
                    style={{
                      fill: hover === b.p.club ? "var(--ink-0)" : "var(--ink-1)",
                    }}
                    fontSize={F.label}
                    fontFamily="var(--font-mono)"
                    letterSpacing="0.04em"
                  >
                    {shortClub(b.p.club)}
                    <tspan
                      style={{
                        fill: "var(--ink-2)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {"  "}
                      {b.medDist.toFixed(0)}
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
              style={{ stroke: TURF.axis }}
              strokeWidth={1}
            />
            <line
              x1={0}
              x2={0}
              y1={0}
              y2={PLOT_H}
              style={{ stroke: TURF.axis }}
              strokeWidth={1}
            />

            {/* Distance ticks. Fifties get a range flag, the way a range does —
                in the gutter on the wide frame, and just inside the left edge on
                the compact one, which has no gutter to spare and where a marker
                standing on the grass is if anything more literal. */}
            {distTicks.map((t) => {
              const flag = t % 50 === 0;
              return (
                <g key={`ty${t}`}>
                  {flag && (
                    <g transform={`translate(${F.flagX},${py(t)})`}>
                      <line
                        x1={0}
                        x2={0}
                        y1={-11}
                        y2={1}
                        style={{ stroke: TURF.tick }}
                        strokeWidth={1}
                      />
                      {/* The one accent mark inside the plot. A range marks its
                          hundreds with a flag, and so does this. */}
                      <path
                        d="M0.5 -11 L7 -8.5 L0.5 -6 Z"
                        style={{ fill: "var(--accent)" }}
                      />
                    </g>
                  )}
                  <text
                    x={-F.tickPad}
                    y={py(t) + 4}
                    textAnchor="end"
                    fontSize={F.tick}
                    fontFamily="var(--font-mono)"
                    style={{
                      fill: flag ? "var(--ink-1)" : TURF.tick,
                      fontVariantNumeric: "tabular-nums",
                    }}
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
                y={PLOT_H + F.tickDrop}
                textAnchor="middle"
                fontSize={F.tick}
                fontFamily="var(--font-mono)"
                style={{ fill: TURF.tick, fontVariantNumeric: "tabular-nums" }}
              >
                {t > 0 ? `+${t}` : t}
              </text>
            ))}
            <text
              x={PLOT_W / 2}
              y={PLOT_H + F.xTitleY}
              textAnchor="middle"
              style={{ fill: TURF.muted }}
              fontSize={F.axis}
              fontFamily="var(--font-mono)"
              letterSpacing="0.16em"
            >
              {F.xTitle}
            </text>
            {F.yTitle && (
              <text
                transform={`translate(${-(PAD.left - 16)},${PLOT_H / 2}) rotate(-90)`}
                textAnchor="middle"
                style={{ fill: TURF.muted }}
                fontSize={F.axis}
                fontFamily="var(--font-mono)"
                letterSpacing="0.16em"
              >
                {basis === "carry" ? "CARRY, YARDS" : "TOTAL, YARDS"}
              </text>
            )}
          </g>
        </svg>
      </div>

      {/* The club rail. A cone on a phone is a target a few millimetres across
          that overlaps its neighbours — which is the chart working, and no way
          to pick a club. The rail is the same eight marks at 36px, in the same
          bag order and the same ramp, and it doubles as the legend the gutter
          gives a mouse. Touch only: with a cursor the cones are already the
          control. */}
      {compact && (
        <div className="mt-3 flex flex-wrap gap-px">
          {boxes.map((b) => {
            const on = hover === b.p.club;
            return (
              <button
                key={`rail-${b.p.club}`}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(b.p.club)}
                className={`flex min-h-9 items-center gap-2 border px-2.5 font-mono text-[11px] transition-colors rule ${
                  on ? "bg-paper-2 text-ink-0" : "text-ink-2"
                }`}
              >
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-[1px]"
                  style={{ background: b.color }}
                />
                {shortClub(b.p.club)}
                <span className="tabular-nums text-ink-3">
                  {b.medDist.toFixed(0)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <figcaption className="mt-3 border-t pt-2 rule">
        {/* The readout keeps its row whether or not anything is hovered — a
            strip that appears and disappears would shove the page under the
            cursor as you move across the chart. On a phone it is a block
            instead of a row: six statistics on one scrolling line is a line
            nobody scrolls, and the selection is deliberate there rather than
            incidental, so it can afford the height. */}
        <div
          className={
            compact
              ? "flex min-h-16 flex-col gap-1 font-mono text-[11px]"
              : "flex h-5 items-center gap-x-4 overflow-x-auto font-mono text-[11px] whitespace-nowrap pan-x"
          }
        >
          {active ? (
            <>
              <span className="inline-flex items-center gap-2 text-ink-0">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-[1px]"
                  style={{ background: active.color }}
                />
                {active.p.club}
              </span>
              <Read
                stacked={compact}
                label={`median ${basis}`}
                value={`${active.medDist.toFixed(1)} yd`}
              />
              <Read
                stacked={compact}
                label="half inside"
                value={`${active.distLo.toFixed(0)}–${active.distHi.toFixed(0)} yd`}
              />
              <Read
                stacked={compact}
                label="8 in 10 inside"
                value={`${deg(active.p.deviationP10Deg)} to ${deg(active.p.deviationP90Deg)}`}
              />
              <Read
                stacked={compact}
                label={compact ? `which is, at median ${basis}` : "= at that distance"}
                value={`${edgeAt(active.sinLo, active.medDist).toFixed(0)} to ${active.sinHi > 0 ? "+" : ""}${edgeAt(active.sinHi, active.medDist).toFixed(0)} yd`}
              />
              <Read
                stacked={compact}
                label="median miss"
                value={`${Math.abs(active.medOff).toFixed(1)} yd ${active.medOff >= 0 ? "right" : "left"}`}
              />
              <Read stacked={compact} label="n" value={String(active.p.active)} />
            </>
          ) : (
            <span className="text-[10px] uppercase tracking-[0.12em] text-ink-3">
              {compact
                ? "Tap a club for its numbers"
                : "Hover or tab a club for its numbers"}
            </span>
          )}
        </div>
        <p className="mt-1.5 font-mono text-[10px] leading-4 text-ink-3">
          One dot per trusted shot, drawn where the ball{" "}
          {basis === "carry" ? "landed" : "stopped"}. Each cone is the middle 50%
          of that club&rsquo;s {basis} distances by the middle 80% of its aim, in
          degrees — so its sides converge on the tee, the way a miss does. The
          bar is the median, the ringed dot median miss, and the faint rays are
          those same two angles run back toward the tee. Scale is one-to-one both
          ways, so the shapes are true and the fairway is really 30 yards wide.
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

/* Inline on one line with a mouse, and a ruled row per statistic on a phone.
 * Six of these wrapped into two columns collided the moment a value carried two
 * signed angles — a scorecard sets a label against its number across the page,
 * so this does too. */
function Read({
  label,
  value,
  stacked = false,
}: {
  label: string;
  value: string;
  stacked?: boolean;
}) {
  if (stacked) {
    return (
      <span className="flex items-baseline justify-between gap-3 border-b border-[var(--line-soft)] pb-1 last:border-b-0">
        <span className="text-ink-3">{label}</span>
        <span className="shrink-0 tabular-nums text-ink-1">{value}</span>
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap">
      <span className="text-ink-3">{label} </span>
      <span className="tabular-nums text-ink-1">{value}</span>
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
      className={`flex min-h-9 items-center border px-3 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors sm:min-h-0 sm:px-2.5 sm:py-1 rule ${
        on ? "bg-paper-2 text-ink-0" : "text-ink-3 hover:text-ink-1"
      }`}
    >
      {children}
    </button>
  );
}

function describe(p: ClubProfile | undefined): string {
  if (!p || p.medianDistanceYd === null) return "";
  const band =
    p.distanceP25Yd !== null && p.distanceP75Yd !== null
      ? `${p.distanceP25Yd.toFixed(0)}–${p.distanceP75Yd.toFixed(0)} yd`
      : "—";
  const lat = `${deg(p.deviationP10Deg)} to ${deg(p.deviationP90Deg)}`;
  return `median ${p.basis} ${p.medianDistanceYd.toFixed(0)} yd · half inside ${band} · 80% of its aim inside ${lat} · n=${p.active}`;
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
 *
 * The minimum comes from the frame: the compact one sets its labels smaller and
 * has a shorter plot to spread them over, so a spacing fixed at the wide
 * frame's would push the top label clean off the drawing.
 */
function labelLayout(
  boxes: Box[],
  py: (carry: number) => number,
  minGap: number,
): { b: Box; y: number }[] {
  const items = boxes
    .map((b) => ({ b, y: py(b.medDist) }))
    .sort((a, b) => a.y - b.y);

  for (let i = 1; i < items.length; i += 1) {
    const gap = items[i].y - items[i - 1].y;
    if (gap < minGap) items[i].y = items[i - 1].y + minGap;
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
