/* Pure parser: raw CSV text -> normalized session + shots.
 *
 * No I/O, no database, no framework. Everything here is deterministic and
 * unit-tested against the two fixtures in ../fixtures.
 *
 * ── Sign conventions (resolved 2026-08-02, see README) ──────────────────────
 * Positive is RIGHT of target for a right-handed player on every lateral
 * column: club_face, club_path (positive = in-to-out), launch_direction,
 * spin_axis, and both deviation columns.
 *
 * EXCEPT sidespin, which the device signs backwards. The export satisfies
 *     spin_axis = -atan2(sidespin, backspin)
 * to 2e-6 degrees across both fixtures, so negative sidespin pairs with
 * positive spin axis and means a ball curving RIGHT. We store it verbatim so
 * the stored number matches what the Garmin app displays, and no chart or stat
 * reads it — spin_axis carries the same information in the sane convention.
 */

import Papa from "papaparse";
import { isKnownRawOnly, lookupField, type CanonicalField } from "./aliases";
import { convert, FIELD_DIMENSIONS, normalizeUnit, UnknownUnitError } from "./units";

export interface ParsedShot {
  shotIndex: number;
  /** Naive local wall time, `YYYY-MM-DDTHH:mm:ss`. The device emits no zone. */
  shotTimestamp: string;
  club: string;
  carryYd: number | null;
  totalYd: number | null;
  /** The R50 sometimes copies carry into total instead of modelling rollout. */
  totalIsCarryCopy: boolean;
  ballSpeedMph: number | null;
  clubSpeedMph: number | null;
  smashFactor: number | null;
  launchAngleDeg: number | null;
  launchDirectionDeg: number | null;
  attackAngleDeg: number | null;
  backspinRpm: number | null;
  sidespinRpm: number | null;
  spinRateRpm: number | null;
  spinRateType: string | null;
  spinAxisDeg: number | null;
  faceAngleDeg: number | null;
  clubPathDeg: number | null;
  faceToPathDeg: number | null;
  apexFt: number | null;
  descentAngleDeg: number | null;
  offlineYd: number | null;
  carryDeviationAngleDeg: number | null;
  totalDeviationYd: number | null;
  totalDeviationAngleDeg: number | null;
  isExcluded: boolean;
  exclusionReason: string | null;
  raw: Record<string, string>;
}

export interface ParsedSession {
  /** Naive local wall time of the first shot. */
  sessionStartedAt: string;
  shotCount: number;
  airDensityGl: number | null;
  temperatureF: number | null;
  airPressureKpa: number | null;
  relativeHumidityPct: number | null;
  /** Share of rows nulled as phantoms. jgamblin flags sessions at >= 0.10. */
  phantomRate: number;
}

export interface ParseResult {
  session: ParsedSession;
  shots: ParsedShot[];
  /** Row 1 of the file, verbatim, for `raw_imports.original_headers`. */
  headers: string[];
  /** Row 2 of the file, verbatim, for `raw_imports.original_units`. */
  units: string[];
  /** Headers with no alias and no raw-only entry. Non-fatal, but visible. */
  unmappedHeaders: string[];
  warnings: string[];
}

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

/* Fields whose zero value means "the monitor saw a swing but never tracked a
 * ball". jgamblin/golf's `zero_critical_fields`, same three. */
const ZERO_CRITICAL: CanonicalField[] = ["ball_speed", "club_speed", "carry_distance"];

const PHANTOM_SESSION_THRESHOLD = 0.1;

/** `7/5/26 8:28:51 PM` -> `2026-07-05T20:28:51`. M/D/YY, US locale, confirmed. */
export function parseGarminTimestamp(raw: string): string {
  const s = raw.trim();

  // Already ISO-ish? Accept it rather than mangling a future firmware change.
  const iso = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}T${iso[4]}:${iso[5]}:${iso[6]}`;

  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?$/i.exec(s);
  if (!m) throw new ParseError(`unrecognised timestamp "${raw}"`);

  const [, mo, d, y, hh, mm, ss, ampm] = m;
  let hour = Number(hh);
  if (ampm) {
    const pm = ampm.toUpperCase() === "PM";
    if (hour === 12) hour = pm ? 12 : 0;
    else if (pm) hour += 12;
  }

  // Two-digit years are 20xx. The R50 shipped in 2024; a 19xx range export
  // does not exist, and the device has no way to emit one.
  const year = y.length === 2 ? 2000 + Number(y) : Number(y);
  const p2 = (n: number) => String(n).padStart(2, "0");

  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12) throw new ParseError(`month out of range in "${raw}"`);
  if (day < 1 || day > 31) throw new ParseError(`day out of range in "${raw}"`);

  return `${year}-${p2(month)}-${p2(day)}T${p2(hour)}:${p2(Number(mm))}:${p2(Number(ss))}`;
}

/** Blank cells are absent data, not zero. */
function toNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const s = raw.trim();
  if (s === "") return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

/** A units row is bracketed tokens; a data row is not. */
function looksLikeUnitsRow(row: string[]): boolean {
  const cells = row.map((c) => c.trim()).filter((c) => c !== "");
  if (cells.length === 0) return false;
  return cells.every((c) => /^\[.*\]$/.test(c));
}

export function parseRangeCsv(text: string): ParseResult {
  const clean = text.replace(/^﻿/, "");
  const { data, errors } = Papa.parse<string[]>(clean, {
    skipEmptyLines: "greedy",
  });

  if (errors.length > 0) {
    const fatal = errors.filter((e) => e.type === "Quotes" || e.code === "UndetectableDelimiter");
    if (fatal.length > 0) throw new ParseError(`CSV malformed: ${fatal[0].message}`);
  }
  if (data.length < 2) throw new ParseError("file has no data rows");

  const headers = data[0].map((h) => h.trim());

  // Row 2 is a units row in every R50 export seen. Guard anyway: if a future
  // export drops it, treat row 2 as data instead of silently eating a shot.
  const hasUnitsRow = looksLikeUnitsRow(data[1]);
  const units = hasUnitsRow ? data[1].map((u) => u.trim()) : headers.map(() => "");
  const rows = data.slice(hasUnitsRow ? 2 : 1);

  const warnings: string[] = [];
  if (!hasUnitsRow) {
    warnings.push("no units row found; assuming values are already in yards/mph/feet");
  }
  if (rows.length === 0) throw new ParseError("file has headers but no shots");

  // header index -> canonical field
  const fieldAt = new Map<number, CanonicalField>();
  const unmappedHeaders: string[] = [];
  headers.forEach((h, i) => {
    if (h === "") return;
    const f = lookupField(h);
    if (f) fieldAt.set(i, f);
    else if (!isKnownRawOnly(h)) unmappedHeaders.push(h);
  });

  for (const required of ["date", "club_type"] as CanonicalField[]) {
    if (![...fieldAt.values()].includes(required)) {
      // club_type is where the R50 puts the club; club_name is always empty.
      throw new ParseError(`required column missing: no header mapped to "${required}"`);
    }
  }

  const shots: ParsedShot[] = [];
  let phantomCount = 0;

  rows.forEach((row, rowIdx) => {
    // Trailing short rows happen when an export is truncated mid-write.
    if (row.every((c) => c.trim() === "")) return;

    const raw: Record<string, string> = {};
    headers.forEach((h, i) => {
      const v = (row[i] ?? "").trim();
      if (h !== "" && v !== "") raw[h] = v;
    });

    const vals = new Map<CanonicalField, number | null>();
    const texts = new Map<CanonicalField, string>();

    fieldAt.forEach((field, i) => {
      const cell = (row[i] ?? "").trim();
      if (cell === "") return;
      const dim = FIELD_DIMENSIONS[field];
      if (dim === undefined) {
        texts.set(field, cell);
        return;
      }
      const n = toNumber(cell);
      if (n === null) return;
      try {
        vals.set(field, convert(n, dim, units[i]));
      } catch (e) {
        if (e instanceof UnknownUnitError) {
          throw new ParseError(
            `row ${rowIdx + 1}, column "${headers[i]}": ${e.message}. ` +
              `Refusing to import rather than store an unconverted value.`,
          );
        }
        throw e;
      }
    });

    const club = texts.get("club_type") ?? texts.get("club_name") ?? "";
    if (club === "") throw new ParseError(`row ${rowIdx + 1}: no club recorded`);

    const dateCell = texts.get("date");
    if (!dateCell) throw new ParseError(`row ${rowIdx + 1}: no timestamp`);
    const shotTimestamp = parseGarminTimestamp(dateCell);

    // ── phantom detection, before anything reads a value ─────────────────────
    const zeroed = ZERO_CRITICAL.filter((f) => vals.get(f) === 0);
    const isPhantom = zeroed.length > 0;
    if (isPhantom) {
      phantomCount += 1;
      // Null the metrics rather than drop the row: the swing happened, the
      // ball flight did not. Keeping the row at zero would drag every median.
      for (const f of ZERO_CRITICAL) vals.set(f, null);
    }

    const carryYd = vals.get("carry_distance") ?? null;
    const totalYd = vals.get("total_distance") ?? null;

    shots.push({
      shotIndex: shots.length,
      shotTimestamp,
      club,
      carryYd,
      totalYd,
      totalIsCarryCopy: carryYd !== null && totalYd !== null && carryYd === totalYd,
      ballSpeedMph: vals.get("ball_speed") ?? null,
      clubSpeedMph: vals.get("club_speed") ?? null,
      smashFactor: vals.get("smash_factor") ?? null,
      launchAngleDeg: vals.get("launch_angle") ?? null,
      launchDirectionDeg: vals.get("launch_direction") ?? null,
      attackAngleDeg: vals.get("attack_angle") ?? null,
      backspinRpm: vals.get("backspin") ?? null,
      sidespinRpm: vals.get("sidespin") ?? null,
      spinRateRpm: vals.get("spin_rate") ?? null,
      spinRateType: texts.get("spin_rate_type") ?? null,
      spinAxisDeg: vals.get("spin_axis") ?? null,
      faceAngleDeg: vals.get("club_face") ?? null,
      clubPathDeg: vals.get("club_path") ?? null,
      faceToPathDeg: vals.get("face_to_path") ?? null,
      apexFt: vals.get("apex_height") ?? null,
      descentAngleDeg: vals.get("descent_angle") ?? null,
      offlineYd: vals.get("carry_deviation_distance") ?? null,
      carryDeviationAngleDeg: vals.get("carry_deviation_angle") ?? null,
      totalDeviationYd: vals.get("total_deviation_distance") ?? null,
      totalDeviationAngleDeg: vals.get("total_deviation_angle") ?? null,
      isExcluded: isPhantom,
      exclusionReason: isPhantom ? `phantom:${zeroed.join(",")}` : null,
      raw,
    });
  });

  if (shots.length === 0) throw new ParseError("no parseable shots in file");

  // Environmentals are constant within a session in both fixtures, and differ
  // between them — session-level, not per-shot. Read from the first row.
  const firstRow = rows[0];
  const envOf = (field: CanonicalField): number | null => {
    for (const [i, f] of fieldAt) {
      if (f !== field) continue;
      const n = toNumber(firstRow[i]);
      if (n === null) return null;
      return convert(n, FIELD_DIMENSIONS[field] ?? "passthrough", units[i]);
    }
    return null;
  };

  const phantomRate = phantomCount / shots.length;
  if (phantomRate >= PHANTOM_SESSION_THRESHOLD) {
    warnings.push(
      `${(phantomRate * 100).toFixed(0)}% of shots are phantom detections — ` +
        `check sensor placement and lighting for this session`,
    );
  }
  if (unmappedHeaders.length > 0) {
    warnings.push(`unmapped columns kept in raw only: ${unmappedHeaders.join(", ")}`);
  }

  // Session start is the earliest shot, not the filename — export filenames
  // carry the export time, which in the fixtures is 28 days after the shots.
  const sessionStartedAt = shots.reduce(
    (min, s) => (s.shotTimestamp < min ? s.shotTimestamp : min),
    shots[0].shotTimestamp,
  );

  return {
    session: {
      sessionStartedAt,
      shotCount: shots.length,
      airDensityGl: envOf("air_density"),
      temperatureF: envOf("temperature"),
      airPressureKpa: envOf("air_pressure"),
      relativeHumidityPct: envOf("relative_humidity"),
      phantomRate,
    },
    shots,
    headers,
    units: units.map((u) => normalizeUnit(u)),
    unmappedHeaders,
    warnings,
  };
}
