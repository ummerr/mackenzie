/* Colour for the bag chart and the gap scorecard.
 *
 * The values are not here. Every name below resolves to a custom property
 * defined once per theme in globals.css, because these colours have to change
 * with the theme and a TypeScript constant cannot. What is here is the
 * *structure* — which names exist, what each one is for, and the rules the
 * values have to satisfy.
 *
 * Because these are `var(...)` and not hex, they must be set through `style`
 * rather than as SVG presentation attributes: `fill="var(--x)"` is not reliably
 * resolved, and it fails silently to no-fill when it is not. Every call site in
 * bag-chart.tsx and page.tsx uses `style={{ fill: ... }}` for this reason.
 *
 * Two separate systems, deliberately never mixed:
 *
 *   TURF   — chart chrome. Fairway, mow stripes, rough, edges. It is scenery,
 *            never an encoding. Nothing in it carries a number, so it is free
 *            to be a golf hole. It stays within a few points of the page
 *            background so the data sits a clear step above it.
 *
 *   CLUB_RAMP — an *ordinal* ramp, not a categorical palette. Clubs have a real
 *            order (loft, i.e. bag order), so swapping two of them would change
 *            the meaning; that keeps eight arbitrary hues wrong. Order still
 *            rides on monotone lightness, but the ramp now runs between two
 *            hue poles — warm 64° OKLCH at the pale end, blue 240° at the deep
 *            end — so the distance between two clubs is *nameable*: coral vs
 *            violet sorts where two browns a step apart never did. Two poles
 *            is the ceiling; a third would make it categorical (DECISIONS.md,
 *            "Two hue poles in the club ramp too"). Equal lightness steps:
 *            0.905 → 0.455 in dark, 0.735 → 0.295 in light. Only the band
 *            moves between themes, never the order and never the poles.
 *
 * The ramp is validated, not eyeballed — the four ordinal checks run in
 * tests/palette.test.ts against globals.css itself, per theme against the
 * fairway surface: monotone lightness, every adjacent step ≥ 0.06 apart, one
 * strictly monotone hue path from the warm pole to the cool with every step
 * outside the turf's green band (90°–200°), and the end nearest the turf above
 * the 2:1 floor for an ordinal ramp. In dark that binding end is the deep one,
 * which is the driver's, and the driver is the club least likely to have shots
 * on file; in light it is the pale one, for the same reason inverted.
 *
 * Identity never rests on hue anyway: every club drawn is also direct-labelled
 * in the right-hand gutter with its own colour chip beside it, which is the
 * legend and the label at once. With more than eight clubs two neighbours would
 * share a step; the labels would still separate them.
 */

/** Ordinal ramp, pale → deep. Index 0 goes to the shortest club in the bag. */
export const CLUB_RAMP = [
  "var(--club-0)",
  "var(--club-1)",
  "var(--club-2)",
  "var(--club-3)",
  "var(--club-4)",
  "var(--club-5)",
  "var(--club-6)",
  "var(--club-7)",
] as const;

/**
 * A club's step, by its position among the clubs actually drawn — shortest
 * first, so the ramp deepens as the hole gets longer.
 *
 * Keyed to position among *drawn* clubs rather than to the 24-slot canonical
 * bag order, for two reasons. With 24 slots, a 6 iron and a 7 iron would land a
 * twenty-fourth of the ramp apart and read as the same colour, which is exactly
 * the pair this chart exists to separate. And spending steps on clubs that are
 * suppressed spends them on nothing: the pale and the deep end would both go to
 * marks nobody can see, leaving every visible club in the middle of the ramp.
 *
 * The cost is that a club crossing the display threshold re-steps the ramp. An
 * ordinal ramp encodes position in a sequence, so a change in the sequence
 * moving the colours is correct rather than a bug — and the chip travels with
 * the club's own label either way, so nothing is identified by hue alone.
 */
export function clubColor(index: number, count: number): string {
  if (count <= 1) return CLUB_RAMP[2];
  const i = Math.round((index / (count - 1)) * (CLUB_RAMP.length - 1));
  return CLUB_RAMP[Math.min(Math.max(i, 0), CLUB_RAMP.length - 1)];
}

/** Scenery. Never an encoding. */
export const TURF = {
  rough: "var(--turf-rough)",
  roughTuft: "var(--turf-tuft)",
  fairway: "var(--turf-fairway)",
  /** The lighter half of a mown stripe. */
  mow: "var(--turf-mow)",
  edge: "var(--turf-edge)",
  grid: "var(--turf-grid)",
  /** The aim line. A threshold, which is why it is the one dashed line here. */
  target: "var(--turf-target)",
  axis: "var(--turf-axis)",
  tick: "var(--turf-tick)",
  muted: "var(--turf-muted)",
} as const;

/**
 * Fairway width, in yards either side of the target line. Thirty yards total is
 * a real fairway — narrow for a resort course, ordinary for a good one. It is
 * drawn as a reference, so a club whose lateral band overruns it is a club that
 * misses fairways, and you can see which side.
 */
export const FAIRWAY_HALF_WIDTH_YD = 15;

/* Gap verdicts. Status tokens, reserved: never used as a series colour, and
 * always shipped beside their word so the state does not rest on hue. They are
 * set as text as often as they are set as fill, so each one clears 4.5:1 on the
 * page ground in both themes. */
export const VERDICT = {
  ok: { color: "var(--verdict-ok)", word: "ok" },
  overlap: { color: "var(--verdict-overlap)", word: "overlap" },
  hole: { color: "var(--verdict-hole)", word: "hole" },
  inverted: { color: "var(--verdict-inverted)", word: "inverted" },
  unknown: { color: "var(--verdict-unknown)", word: "—" },
} as const;
