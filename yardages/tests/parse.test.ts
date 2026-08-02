import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lookupField, normalizeHeader } from "../lib/aliases";
import { ParseError, parseGarminTimestamp, parseRangeCsv } from "../lib/parse";
import { convert, normalizeUnit, UnknownUnitError } from "../lib/units";

const FIXTURES = join(__dirname, "..", "data", "raw");
const SEVEN_IRON = "DrivingRange-2026-08-02 14:54:24 +0000.csv";
const SIX_AND_NINE = "DrivingRange-2026-08-02 14:57:03 +0000.csv";

const read = (name: string) => readFileSync(join(FIXTURES, name), "utf8");

describe("normalizeHeader", () => {
  it("strips BOM, quotes, case and repeated whitespace", () => {
    expect(normalizeHeader("﻿  Club   Type ")).toBe("club type");
    expect(normalizeHeader('"Carry Distance"')).toBe("carry distance");
  });
});

describe("lookupField", () => {
  it("maps the club off Club Type, not Club Name", () => {
    // Club Name is 100% empty in every observed R50 export. Mapping the club
    // off it — as the R10 alias table does — produces an empty bag chart.
    expect(lookupField("Club Type")).toBe("club_type");
    expect(lookupField("Club Name")).toBe("club_name");
  });

  it("keeps backspin and sidespin separate", () => {
    expect(lookupField("Backspin")).toBe("backspin");
    expect(lookupField("Sidespin")).toBe("sidespin");
    expect(lookupField("Spin Rate")).toBe("spin_rate");
  });

  it("returns null for unknown headers rather than guessing", () => {
    expect(lookupField("Wind Speed")).toBeNull();
  });
});

describe("units", () => {
  it("reads the bracketed unit token", () => {
    expect(normalizeUnit("[deg F]")).toBe("deg f");
    expect(normalizeUnit("[Yards]")).toBe("yards");
    expect(normalizeUnit(undefined)).toBe("");
  });

  it("converts metres to yards and km/h to mph", () => {
    expect(convert(100, "distance", "[Meters]")).toBeCloseTo(109.3613, 3);
    expect(convert(100, "speed", "[km/h]")).toBeCloseTo(62.1371, 3);
    expect(convert(0, "temperature", "[deg C]")).toBe(32);
  });

  it("passes yards and mph through untouched", () => {
    expect(convert(126.65, "distance", "[Yards]")).toBe(126.65);
    expect(convert(81.69, "speed", "[mph]")).toBe(81.69);
  });

  it("throws on an unrecognised unit rather than storing an unscaled number", () => {
    expect(() => convert(1, "distance", "[furlongs]")).toThrow(UnknownUnitError);
  });
});

describe("parseGarminTimestamp", () => {
  it("reads M/D/YY with a 12-hour clock", () => {
    expect(parseGarminTimestamp("7/5/26 8:28:51 PM")).toBe("2026-07-05T20:28:51");
    expect(parseGarminTimestamp("7/3/26 6:02:40 PM")).toBe("2026-07-03T18:02:40");
  });

  it("handles the midnight and noon edges", () => {
    expect(parseGarminTimestamp("1/1/26 12:00:00 AM")).toBe("2026-01-01T00:00:00");
    expect(parseGarminTimestamp("1/1/26 12:00:00 PM")).toBe("2026-01-01T12:00:00");
  });

  it("accepts ISO in case a firmware update switches format", () => {
    expect(parseGarminTimestamp("2026-07-05T20:28:51")).toBe("2026-07-05T20:28:51");
  });

  it("throws rather than guessing at garbage", () => {
    expect(() => parseGarminTimestamp("last tuesday")).toThrow(ParseError);
    expect(() => parseGarminTimestamp("13/40/26 8:00:00 PM")).toThrow(ParseError);
  });
});

describe("parseRangeCsv — 7 iron fixture", () => {
  const r = parseRangeCsv(read(SEVEN_IRON));

  it("skips the units row and reads all 34 shots", () => {
    expect(r.shots).toHaveLength(34);
    expect(r.headers).toHaveLength(42);
    expect(r.units[5]).toBe("mph");
    expect(r.units[20]).toBe("yards");
  });

  it("takes session start from the first shot, not the filename", () => {
    // The filename says 2026-08-02; the shots are from 2026-07-05.
    expect(r.session.sessionStartedAt).toBe("2026-07-05T20:28:51");
  });

  it("reads the club from Club Type", () => {
    expect(new Set(r.shots.map((s) => s.club))).toEqual(new Set(["7 Iron"]));
  });

  it("leaves no unmapped headers", () => {
    expect(r.unmappedHeaders).toEqual([]);
  });

  it("finds no phantom shots in a clean session", () => {
    expect(r.session.phantomRate).toBe(0);
    expect(r.shots.every((s) => !s.isExcluded)).toBe(true);
  });

  it("flags the rows where the R50 copied carry into total", () => {
    expect(r.shots.filter((s) => s.totalIsCarryCopy)).toHaveLength(17);
  });

  it("lifts environmentals to the session", () => {
    expect(r.session.temperatureF).toBe(71.6);
    expect(r.session.airPressureKpa).toBe(100.33);
    expect(r.session.airDensityGl).toBeCloseTo(1.1783168, 6);
  });

  it("preserves the sidespin sign inversion verbatim", () => {
    // spin_axis = -atan2(sidespin, backspin). Storing sidespin flipped would
    // break agreement with what the Garmin app shows.
    for (const s of r.shots) {
      const expected = (-Math.atan2(s.sidespinRpm!, s.backspinRpm!) * 180) / Math.PI;
      expect(expected).toBeCloseTo(s.spinAxisDeg!, 4);
    }
  });

  it("keeps face_to_path consistent with face minus path", () => {
    for (const s of r.shots) {
      expect(s.faceAngleDeg! - s.clubPathDeg!).toBeCloseTo(s.faceToPathDeg!, 9);
    }
  });

  it("keeps the always-empty columns out of the typed fields", () => {
    expect(r.shots.every((s) => s.descentAngleDeg === null)).toBe(true);
    expect(r.shots[0].raw["Target Carry Distance"]).toBeUndefined();
  });

  it("stores unmodelled columns in raw", () => {
    expect(r.shots[0].raw["Player"]).toBe("Amar");
    expect(r.shots[0].raw["Club Type"]).toBe("7 Iron");
  });
});

describe("parseRangeCsv — mixed-club fixture", () => {
  const r = parseRangeCsv(read(SIX_AND_NINE));

  it("reads two clubs from one file", () => {
    const counts = r.shots.reduce<Record<string, number>>((acc, s) => {
      acc[s.club] = (acc[s.club] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual({ "6 Iron": 12, "9 Iron": 11 });
  });

  it("sorts to an earlier session than the other fixture", () => {
    expect(r.session.sessionStartedAt).toBe("2026-07-03T18:02:40");
  });

  it("finds rollout on every shot here", () => {
    // 0 of 23, against 17 of 34 in the other fixture: the carry-copy behaviour
    // is session-dependent, not a fixed device quirk.
    expect(r.shots.filter((s) => s.totalIsCarryCopy)).toHaveLength(0);
  });

  it("carries distinct environmentals from the other session", () => {
    expect(r.session.airPressureKpa).toBe(100.27);
  });

  it("gives every shot a unique timestamp, so the dedupe key holds", () => {
    const stamps = new Set(r.shots.map((s) => s.shotTimestamp));
    expect(stamps.size).toBe(r.shots.length);
  });
});

describe("parseRangeCsv — phantom handling", () => {
  const withPhantom = (() => {
    const lines = read(SEVEN_IRON).split("\n");
    const cells = lines[2].split(",");
    // Ball Speed, Club Speed, Carry Distance -> exactly 0, as the R50 writes
    // them when it sees a swing but never tracks a ball.
    cells[10] = "0";
    cells[5] = "0";
    cells[20] = "0";
    lines[2] = cells.join(",");
    return lines.join("\n");
  })();

  it("nulls the zero metrics instead of dropping the row", () => {
    const r = parseRangeCsv(withPhantom);
    expect(r.shots).toHaveLength(34);
    const s = r.shots[0];
    expect(s.ballSpeedMph).toBeNull();
    expect(s.clubSpeedMph).toBeNull();
    expect(s.carryYd).toBeNull();
  });

  it("records the reason and marks the shot excluded", () => {
    const r = parseRangeCsv(withPhantom);
    expect(r.shots[0].isExcluded).toBe(true);
    expect(r.shots[0].exclusionReason).toContain("phantom");
    expect(r.shots[0].exclusionReason).toContain("ball_speed");
  });

  it("reports a phantom rate but stays under the session threshold at 1 of 34", () => {
    const r = parseRangeCsv(withPhantom);
    expect(r.session.phantomRate).toBeCloseTo(1 / 34, 6);
    expect(r.warnings.join(" ")).not.toContain("sensor placement");
  });

  it("warns on the session when phantoms reach 10%", () => {
    const lines = read(SEVEN_IRON).split("\n");
    for (let i = 2; i <= 6; i += 1) {
      const cells = lines[i].split(",");
      cells[10] = "0";
      lines[i] = cells.join(",");
    }
    const r = parseRangeCsv(lines.join("\n"));
    expect(r.session.phantomRate).toBeGreaterThanOrEqual(0.1);
    expect(r.warnings.join(" ")).toContain("sensor placement");
  });
});

describe("parseRangeCsv — failure modes", () => {
  it("refuses a file with no data rows", () => {
    const header = read(SEVEN_IRON).split("\n").slice(0, 2).join("\n");
    expect(() => parseRangeCsv(header)).toThrow(ParseError);
  });

  it("refuses a file with no club column", () => {
    const lines = read(SEVEN_IRON).split("\n");
    lines[0] = lines[0].replace("Club Type", "Mystery Column");
    expect(() => parseRangeCsv(lines.join("\n"))).toThrow(/club_type/);
  });

  it("refuses an unrecognised unit rather than importing an unscaled number", () => {
    const lines = read(SEVEN_IRON).split("\n");
    lines[1] = lines[1].replace("[Yards]", "[furlongs]");
    expect(() => parseRangeCsv(lines.join("\n"))).toThrow(/furlongs/);
  });

  it("survives an unknown extra column by recording it", () => {
    const lines = read(SEVEN_IRON).split("\n");
    lines[0] += ",Wind Speed";
    lines[1] += ",[mph]";
    for (let i = 2; i < lines.length; i += 1) if (lines[i].trim() !== "") lines[i] += ",7";
    const r = parseRangeCsv(lines.join("\n"));
    expect(r.unmappedHeaders).toEqual(["Wind Speed"]);
    expect(r.shots[0].raw["Wind Speed"]).toBe("7");
  });

  it("treats a missing units row as already-canonical and says so", () => {
    const lines = read(SEVEN_IRON).split("\n");
    lines.splice(1, 1);
    const r = parseRangeCsv(lines.join("\n"));
    expect(r.shots).toHaveLength(34);
    expect(r.warnings.join(" ")).toContain("no units row");
  });
});

describe("metric locale", () => {
  it("converts a metres-and-km/h export to yards and mph", () => {
    const lines = read(SEVEN_IRON).split("\n");
    lines[1] = lines[1].replace(/\[Yards\]/g, "[Meters]").replace(/\[mph\]/g, "[km/h]");
    const r = parseRangeCsv(lines.join("\n"));
    // 126.65 "metres" -> 138.51 yards. Nothing in the header changed; only the
    // unit cell did, which is the whole point of reading row 2.
    expect(r.shots[0].carryYd).toBeCloseTo(126.65135 * 1.0936133, 3);
    expect(r.shots[0].clubSpeedMph).toBeCloseTo(81.69291 * 0.62137119, 3);
  });
});
