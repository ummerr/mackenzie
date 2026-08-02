/* Column mapping for launch-monitor CSV exports.
 *
 * Lifted from jgamblin/golf's `src/golf/config/field_aliases.yaml`: raw header
 * name -> canonical field, many-to-one, so a firmware rename or a new locale is
 * a data change rather than a code change.
 *
 * Two deliberate departures from that file:
 *
 * 1. Units are NOT encoded in the alias key. The R50 export puts units in their
 *    own row (`[mph]`, `[Yards]`, `[deg]`), so `units.ts` reads them instead of
 *    inferring them from header text. jgamblin needs three aliases for
 *    `Carry (yds)` / `Carry (Yds)` / `Carry Distance (YDS)`; we need one entry
 *    for `Carry Distance` and a self-describing unit cell. A metric export
 *    changes the unit cell, not the header.
 *
 * 2. Backspin and sidespin stay separate. That file maps both to a single
 *    `spin_rate`, which would destroy the split the R50 actually provides.
 */

/** Canonical field names. `raw`-only columns are absent by design. */
export type CanonicalField =
  | "date"
  | "player"
  | "club_name"
  | "brand_model"
  | "club_type"
  | "club_speed"
  | "attack_angle"
  | "club_path"
  | "club_face"
  | "face_to_path"
  | "ball_speed"
  | "smash_factor"
  | "launch_angle"
  | "launch_direction"
  | "backspin"
  | "sidespin"
  | "spin_rate"
  | "spin_rate_type"
  | "spin_axis"
  | "apex_height"
  | "carry_distance"
  | "carry_deviation_angle"
  | "carry_deviation_distance"
  | "total_distance"
  | "total_deviation_angle"
  | "total_deviation_distance"
  | "descent_angle"
  | "air_density"
  | "temperature"
  | "air_pressure"
  | "relative_humidity";

/** Lowercased, whitespace-collapsed, BOM- and quote-stripped. */
export function normalizeHeader(raw: string): string {
  return raw
    .replace(/^﻿/, "")
    .replace(/^"|"$/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/* Keys are already normalized. Add a locale by adding a line — never by
 * touching the parser. */
const ALIASES: Record<string, CanonicalField> = {
  // ── Garmin Approach R50, Driving Range export (en-US) ──────────────────────
  // Verified against fixtures/DrivingRange-2026-08-02 14:54:24 +0000.csv and
  // ...14:57:03... — 42 columns, two header rows.
  date: "date",
  player: "player",
  "club name": "club_name",
  "brand/model": "brand_model",
  "club type": "club_type",
  "club speed": "club_speed",
  "attack angle": "attack_angle",
  "club path": "club_path",
  "club face": "club_face",
  "face to path": "face_to_path",
  "ball speed": "ball_speed",
  "smash factor": "smash_factor",
  "launch angle": "launch_angle",
  "launch direction": "launch_direction",
  backspin: "backspin",
  sidespin: "sidespin",
  "spin rate": "spin_rate",
  "spin rate type": "spin_rate_type",
  "spin axis": "spin_axis",
  "apex height": "apex_height",
  "carry distance": "carry_distance",
  "carry deviation angle": "carry_deviation_angle",
  "carry deviation distance": "carry_deviation_distance",
  "total distance": "total_distance",
  "total deviation angle": "total_deviation_angle",
  "total deviation distance": "total_deviation_distance",
  "air density": "air_density",
  temperature: "temperature",
  "air pressure": "air_pressure",
  "relative humidity": "relative_humidity",

  // ── Aliases observed on sibling Garmin devices / older app versions ────────
  // The R10 uses "Face Angle" where the R50 says "Club Face". Harmless to
  // accept both; costs one line and saves a re-parse if the app renames it.
  "face angle": "club_face",
  "spin loft": "launch_angle",
  "descent angle": "descent_angle",
  "peak height": "apex_height",
  offline: "carry_deviation_distance",
  carry: "carry_distance",
  total: "total_distance",

  // ── Non-English locales ────────────────────────────────────────────────────
  // Only `Målcarry` is attested, and only by report. Every other Swedish header
  // is unknown, and guessing translations would put fabricated mappings in the
  // one file whose whole job is to be trustworthy. Add the rest from a real
  // export; until then a Swedish file parses partially and reports the misses
  // in `unmappedHeaders` rather than failing silently.
  "målcarry": "carry_distance",
};

/** Columns present in the export that we deliberately keep only in `raw`. */
export const RAW_ONLY_HEADERS = new Set(
  [
    "Target Total Distance",
    "Target Carry Distance",
    "Note",
    "Tag",
    "Back Stroke Length",
    "Target Backswing Time",
    "Target Downswing Time",
    "Forward Stroke Length",
    "Backswing Time",
    "Downswing Time",
    "Target Tempo",
    "Swing Tempo",
  ].map(normalizeHeader),
);

export function lookupField(rawHeader: string): CanonicalField | null {
  return ALIASES[normalizeHeader(rawHeader)] ?? null;
}

export function isKnownRawOnly(rawHeader: string): boolean {
  return RAW_ONLY_HEADERS.has(normalizeHeader(rawHeader));
}
