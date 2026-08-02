/* Unit conversion driven by the export's own units row.
 *
 * The R50 writes units into row 2 as bracketed tokens (`[mph]`, `[Yards]`,
 * `[deg]`, `[ft]`, `[rpm]`, `[g/L]`, `[deg F]`, `[kPa]`, `[%]`). That makes the
 * unit a fact in the file rather than something to infer from a header name, so
 * a metric-locale export converts correctly without a single new alias.
 *
 * Target units, matching the schema: yards, mph, feet (apex), degrees, rpm,
 * degrees Fahrenheit, kPa, g/L.
 */

export type Dimension = "distance" | "speed" | "apex" | "temperature" | "passthrough";

/** Strip the brackets and normalize. `[deg F]` -> `deg f`. Empty -> "". */
export function normalizeUnit(raw: string | undefined): string {
  if (!raw) return "";
  return raw.trim().replace(/^\[/, "").replace(/\]$/, "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Multiplier to yards. */
const TO_YARDS: Record<string, number> = {
  yards: 1,
  yard: 1,
  yds: 1,
  yd: 1,
  meters: 1.0936132983377078,
  meter: 1.0936132983377078,
  m: 1.0936132983377078,
  feet: 1 / 3,
  ft: 1 / 3,
};

/** Multiplier to mph. */
const TO_MPH: Record<string, number> = {
  mph: 1,
  "mi/h": 1,
  kph: 0.6213711922373339,
  "km/h": 0.6213711922373339,
  kmh: 0.6213711922373339,
  "m/s": 2.2369362920544025,
  ms: 2.2369362920544025,
};

/** Multiplier to feet (apex is reported in feet by the R50). */
const TO_FEET: Record<string, number> = {
  ft: 1,
  feet: 1,
  yards: 3,
  yard: 3,
  yds: 3,
  yd: 3,
  meters: 3.280839895013123,
  meter: 3.280839895013123,
  m: 3.280839895013123,
};

export class UnknownUnitError extends Error {
  constructor(
    readonly dimension: Dimension,
    readonly unit: string,
  ) {
    super(`unrecognised ${dimension} unit "${unit}"`);
    this.name = "UnknownUnitError";
  }
}

/* Converts, or throws. Throwing is deliberate: a unit we do not recognise means
 * the numbers are on an unknown scale, and a silently unconverted metric export
 * would put 150-metre carries in a yards column and look entirely plausible. A
 * loud failure at import is recoverable; a quiet one poisons the ledger. */
export function convert(value: number, dimension: Dimension, rawUnit: string | undefined): number {
  const unit = normalizeUnit(rawUnit);
  if (dimension === "passthrough") return value;

  // An absent unit cell means the column is dimensionless (smash factor) or the
  // export omitted it. Treat as already-canonical rather than guessing.
  if (unit === "") return value;

  switch (dimension) {
    case "distance": {
      const f = TO_YARDS[unit];
      if (f === undefined) throw new UnknownUnitError(dimension, unit);
      return value * f;
    }
    case "speed": {
      const f = TO_MPH[unit];
      if (f === undefined) throw new UnknownUnitError(dimension, unit);
      return value * f;
    }
    case "apex": {
      const f = TO_FEET[unit];
      if (f === undefined) throw new UnknownUnitError(dimension, unit);
      return value * f;
    }
    case "temperature": {
      if (unit === "deg f" || unit === "f" || unit === "°f") return value;
      if (unit === "deg c" || unit === "c" || unit === "°c") return value * 1.8 + 32;
      throw new UnknownUnitError(dimension, unit);
    }
  }
}

/** Which dimension each canonical numeric field is measured in. */
export const FIELD_DIMENSIONS: Record<string, Dimension> = {
  club_speed: "speed",
  ball_speed: "speed",
  carry_distance: "distance",
  total_distance: "distance",
  carry_deviation_distance: "distance",
  total_deviation_distance: "distance",
  apex_height: "apex",
  temperature: "temperature",
  // Angles, spin, smash, pressure, density and humidity are already canonical.
  attack_angle: "passthrough",
  club_path: "passthrough",
  club_face: "passthrough",
  face_to_path: "passthrough",
  smash_factor: "passthrough",
  launch_angle: "passthrough",
  launch_direction: "passthrough",
  backspin: "passthrough",
  sidespin: "passthrough",
  spin_rate: "passthrough",
  spin_axis: "passthrough",
  carry_deviation_angle: "passthrough",
  total_deviation_angle: "passthrough",
  descent_angle: "passthrough",
  air_density: "passthrough",
  air_pressure: "passthrough",
  relative_humidity: "passthrough",
};
