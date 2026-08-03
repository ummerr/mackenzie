/* Colour for the bag chart and the gap scorecard.
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
 *            the meaning; that makes one hue with monotone lightness steps
 *            correct and eight arbitrary hues wrong. One hue, 62° in OKLCH,
 *            lightness 0.905 → 0.455 in equal steps.
 *
 * The ramp is validated, not eyeballed: all four ordinal checks pass against
 * the fairway surface — monotone lightness, every adjacent step ≥ 0.06 apart,
 * hue spread 1°, and the dim end at 2.52:1 against the turf, above the 2:1
 * floor for an ordinal ramp. That dim end is the driver's, and the driver is
 * the club least likely to have shots on file.
 *
 * Identity never rests on hue anyway: every club drawn is also direct-labelled
 * in the right-hand gutter with its own colour chip beside it, which is the
 * legend and the label at once. With more than eight clubs two neighbours would
 * share a step; the labels would still separate them.
 */

/** Ordinal ramp, light → dark. Index 0 goes to the shortest club in the bag. */
export const CLUB_RAMP = [
  "#ffd7b6",
  "#ffba7e",
  "#ff9b2e",
  "#e98600",
  "#cd7605",
  "#b26601",
  "#985600",
  "#7f4600",
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
  rough: "#080d08",
  roughTuft: "#1a2b1c",
  fairway: "#0d180d",
  /** The lighter half of a mown stripe. */
  mow: "#152315",
  edge: "#283d22",
  grid: "rgba(226, 240, 220, 0.055)",
  /** The aim line. A threshold, which is why it is the one dashed line here. */
  target: "rgba(226, 240, 220, 0.24)",
  axis: "#2b3a2b",
  tick: "#7d8f7a",
  muted: "#5d6f5c",
} as const;

/**
 * Fairway width, in yards either side of the target line. Thirty yards total is
 * a real fairway — narrow for a resort course, ordinary for a good one. It is
 * drawn as a reference, so a club whose lateral band overruns it is a club that
 * misses fairways, and you can see which side.
 */
export const FAIRWAY_HALF_WIDTH_YD = 15;

/* Gap verdicts. Status tokens, reserved: never used as a series colour, and
 * always shipped beside their word so the state does not rest on hue. */
export const VERDICT = {
  ok: { color: "#3fae52", word: "ok" },
  overlap: { color: "#e2b02a", word: "overlap" },
  hole: { color: "#ff6b35", word: "hole" },
  inverted: { color: "#e04b4b", word: "inverted" },
  unknown: { color: "#5f5a53", word: "—" },
} as const;
