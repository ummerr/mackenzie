import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildLedger, clubCounts, shotKey, type SourceFile } from "../lib/ledger";
import { parseRangeCsv } from "../lib/parse";

const RAW = join(__dirname, "..", "data", "raw");
const SEVEN_IRON = "DrivingRange-2026-08-02 14:54:24 +0000.csv";
const SIX_AND_NINE = "DrivingRange-2026-08-02 14:57:03 +0000.csv";

const read = (name: string) => readFileSync(join(RAW, name), "utf8");

function source(name: string, overrides: Partial<SourceFile> = {}): SourceFile {
  return {
    filename: name,
    sha256: `sha-${name}`,
    parsed: parseRangeCsv(read(name)),
    ...overrides,
  };
}

const BOTH = () => [source(SEVEN_IRON), source(SIX_AND_NINE)];

describe("buildLedger", () => {
  it("merges two files into two sessions and 57 shots", () => {
    const l = buildLedger(BOTH());
    expect(l.sessions).toHaveLength(2);
    expect(l.shots).toHaveLength(57);
    expect(l.duplicatesSkipped).toBe(0);
  });

  it("orders sessions chronologically regardless of input order", () => {
    const forwards = buildLedger(BOTH());
    const backwards = buildLedger(BOTH().reverse());
    expect(forwards.sessions.map((s) => s.id)).toEqual([
      "2026-07-03T18:02:40",
      "2026-07-05T20:28:51",
    ]);
    expect(backwards.sessions.map((s) => s.id)).toEqual(forwards.sessions.map((s) => s.id));
    expect(backwards.shots.map((s) => s.shotTimestamp)).toEqual(
      forwards.shots.map((s) => s.shotTimestamp),
    );
  });

  it("treats a re-upload of the same file as a no-op", () => {
    const l = buildLedger([source(SEVEN_IRON), source(SEVEN_IRON)]);
    expect(l.shots).toHaveLength(34);
    expect(l.duplicatesSkipped).toBe(34);
    expect(l.sessions).toHaveLength(1);
  });

  it("dedupes a re-export of the same session under a different filename", () => {
    // Different bytes, different name, same shots. sha256 would not catch this;
    // (session, shot timestamp) does.
    const l = buildLedger([
      source(SEVEN_IRON),
      source(SEVEN_IRON, { filename: "renamed.csv", sha256: "different" }),
    ]);
    expect(l.shots).toHaveLength(34);
    expect(l.duplicatesSkipped).toBe(34);
    expect(l.sessions[0].sourceFiles).toEqual([SEVEN_IRON, "renamed.csv"]);
  });

  it("renumbers shot_index within each merged session", () => {
    const l = buildLedger(BOTH());
    for (const session of l.sessions) {
      const shots = l.shots.filter((s) => s.sessionId === session.id);
      expect(shots.map((s) => s.shotIndex)).toEqual(shots.map((_, i) => i));
      expect(session.shotCount).toBe(shots.length);
    }
  });

  it("keeps shots sorted by timestamp inside a session", () => {
    const l = buildLedger(BOTH());
    const stamps = l.shots
      .filter((s) => s.sessionId === "2026-07-03T18:02:40")
      .map((s) => s.shotTimestamp);
    expect([...stamps].sort()).toEqual(stamps);
  });

  it("propagates per-file warnings with the filename attached", () => {
    const lines = read(SEVEN_IRON).split("\n");
    lines[0] += ",Wind Speed";
    lines[1] += ",[mph]";
    for (let i = 2; i < lines.length; i += 1) if (lines[i].trim() !== "") lines[i] += ",7";
    const l = buildLedger([
      { filename: "windy.csv", sha256: "x", parsed: parseRangeCsv(lines.join("\n")) },
    ]);
    expect(l.warnings.join(" ")).toContain("windy.csv");
    expect(l.warnings.join(" ")).toContain("Wind Speed");
  });
});

describe("exclusion overrides", () => {
  const FIRST_SHOT = "2026-07-05T20:28:51";

  it("excludes a shot by timestamp with a recorded reason", () => {
    const l = buildLedger(BOTH(), {
      [FIRST_SHOT]: { excluded: true, reason: "phone rang mid-swing" },
    });
    const s = l.shots.find((x) => x.shotTimestamp === FIRST_SHOT)!;
    expect(s.isExcluded).toBe(true);
    expect(s.exclusionReason).toBe("phone rang mid-swing");
  });

  it("wins over the automatic phantom flag, but does not invent the flight", () => {
    // Un-excluding a phantom returns the swing to the ledger. Its nulled
    // metrics stay null — the monitor never saw a ball.
    const lines = read(SEVEN_IRON).split("\n");
    const cells = lines[2].split(",");
    cells[10] = "0";
    lines[2] = cells.join(",");
    const parsed = parseRangeCsv(lines.join("\n"));
    expect(parsed.shots[0].isExcluded).toBe(true);

    const l = buildLedger([{ filename: "p.csv", sha256: "x", parsed }], {
      [FIRST_SHOT]: { excluded: false, reason: "" },
    });
    const s = l.shots.find((x) => x.shotTimestamp === FIRST_SHOT)!;
    expect(s.isExcluded).toBe(false);
    expect(s.exclusionReason).toBeNull();
    expect(s.ballSpeedMph).toBeNull();
  });

  it("reports an override that matches no shot instead of silently ignoring it", () => {
    const l = buildLedger(BOTH(), {
      "1999-01-01T00:00:00": { excluded: true, reason: "typo" },
    });
    expect(l.orphanedOverrides).toEqual(["1999-01-01T00:00:00"]);
    expect(l.warnings.join(" ")).toContain("match no shot");
  });

  it("leaves every other shot untouched", () => {
    const l = buildLedger(BOTH(), {
      [FIRST_SHOT]: { excluded: true, reason: "x" },
    });
    expect(l.shots.filter((s) => s.isExcluded)).toHaveLength(1);
  });
});

describe("clubCounts", () => {
  it("counts total and active shots per club, most-hit first", () => {
    const l = buildLedger(BOTH(), {
      "2026-07-05T20:28:51": { excluded: true, reason: "x" },
    });
    expect(clubCounts(l)).toEqual([
      { club: "7 Iron", n: 34, active: 33 },
      { club: "6 Iron", n: 12, active: 12 },
      { club: "9 Iron", n: 11, active: 11 },
    ]);
  });
});

describe("shotKey", () => {
  it("scopes the timestamp to its session", () => {
    expect(shotKey("2026-07-05T20:28:51", "2026-07-05T20:30:05")).toBe(
      "2026-07-05T20:28:51#2026-07-05T20:30:05",
    );
  });
});
