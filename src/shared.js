/* Cross-file constants and formatters. Globals, no modules — same contract as
 * archetypes-audit/src/shared.js. Loaded before every page script. */

/* Design tokens, mirrored from ummerr.github.io/assets/css/style.css so the map
 * reads as part of the same body of work. Kept in JS as well as CSS because
 * MapLibre paint properties can't read CSS custom properties. */
const TOKENS = {
  ink0: "#0a0a09",
  ink1: "#131211",
  ink2: "#1c1a18",
  cream0: "#f2ede5",
  cream1: "#c9c3ba",
  cream2: "#8f8981",
  cream3: "#5f5a53",
  accent: "#ff6b35",
};

/* Sequential ramp for lens scores: pale = low, hot = high.
 *
 * One warm hue family (OKLCH h 39–58) with BOTH channels moving monotonically
 * — lightness 0.929 → 0.705 descending, chroma 0.032 → 0.193 ascending. Two
 * channels rather than one because on satellite imagery a chroma-only ramp is
 * too subtle to read as a scale, and a lightness-only ramp puts the low end
 * somewhere between invisible-over-fairway and invisible-over-sand.
 *
 * Going light-to-saturated (rather than the usual light-to-dark) is deliberate:
 * the basemap is dark, so the pale end is the *more* visible one, and no course
 * disappears just because it ranks low.
 *
 * Every mark also gets an ink halo and stroke, so separation from the
 * background never depends on the fill at all. */
const RAMP = ["#f9e3d3", "#f6c3a2", "#f5a273", "#fb864f", "#ff6b35"];

/* The bottom rail. `lens` keys must exist in data/weights.json — build.mjs
 * computes a score per lens and validate.mjs fails on an unknown vector. */
const RAIL = [
  { n: "01", label: "RANK", lens: "grint" },
  { n: "02", label: "SCORE", lens: "scoring" },
  { n: "03", label: "FUN", lens: "enjoyment" },
  { n: "04", label: "CONDITION", lens: "conditioning" },
  { n: "05", label: "REPLAY", lens: "revealed" },
  { n: "06", label: "PEDIGREE", lens: "architecture" },
];

const COUNTRY_LABEL = { US: "United States", CA: "Canada", BB: "Barbados" };

/* Geocode precision -> how much to trust the pin. Surfaced in the dossier
 * rather than hidden, because "we know where this is" and "we know what town
 * it's near" are different claims and the map shouldn't pretend otherwise. */
const PRECISION_LABEL = {
  seed: "verified origin",
  manual: "hand-entered",
  osm_polygon: "OSM course boundary",
  osm_bounds: "OSM course bounding box",
  course_feature: "geocoded to course",
  named_place: "geocoded to name",
  city_centroid: "town centre only",
};

const FLAG_LABEL = {
  unplayed: "Rated but never played",
  nine_hole_suspected: "Average looks like 9-hole rounds",
  mixed_round_lengths_suspected: "Average may mix 9- and 18-hole rounds",
  unreviewed: "Not reviewed",
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const place = (f) =>
  [f.locality, f.region].filter(Boolean).join(", ") +
  (f.country !== "US" ? `, ${COUNTRY_LABEL[f.country] ?? f.country}` : "");

/** Interpolate the ramp at t in 0..1. Returns a hex string. */
function rampAt(t) {
  if (t == null || Number.isNaN(t)) return TOKENS.cream3;
  const x = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  const f = x - i;
  const hex = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
  const a = hex(RAMP[i]);
  const b = hex(RAMP[i + 1]);
  const mix = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return "#" + mix.map((v) => v.toString(16).padStart(2, "0")).join("");
}
