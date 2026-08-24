import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs script module, no type declarations
import { planRefresh } from "../scripts/refresh.mjs";

/* The refresh planner is pure: file lists in, ordered steps out. The runner
 * shells the steps; nothing here touches the filesystem. */

const base = {
  rawFiles: [] as string[],
  roundsRawFile: null as string | null,
  garminRawFile: null as string | null,
  sessionCount: 0,
};

const cmds = (p: Parameters<typeof planRefresh>[0]) =>
  planRefresh(p).map((s: { cmd: string }) => s.cmd);

describe("planRefresh", () => {
  it("always ends with links → validate → profile → flight", () => {
    expect(cmds(base)).toEqual([
      "pnpm data:links",
      "pnpm data:validate",
      "pnpm run profile",
      "pnpm flight",
    ]);
  });

  it("ingests when there are more range CSVs than ledger sessions", () => {
    const plan = cmds({
      ...base,
      rawFiles: ["DrivingRange-1.csv", "DrivingRange-2.csv"],
      sessionCount: 1,
    });
    expect(plan[0]).toBe("pnpm ingest");
  });

  it("skips ingest when the ledger already matches the CSVs", () => {
    const plan = cmds({ ...base, rawFiles: ["DrivingRange-1.csv"], sessionCount: 1 });
    expect(plan).not.toContain("pnpm ingest");
  });

  it("runs the grint chain only for bundles newer than the artifact's chain", () => {
    const files = [
      "grint-export-2026-08-15.json",
      "grint-export-2026-08-19.json",
      "grint-export-2026-08-23-0235.json",
    ];
    // Artifact already folds the 08-19 full + 08-23 delta: the older 08-15
    // full is legitimately absent from the chain and must not re-trigger.
    const current = cmds({
      ...base,
      rawFiles: files,
      roundsRawFile: "raw/grint-export-2026-08-19.json + raw/grint-export-2026-08-23-0235.json",
    });
    expect(current).not.toContain("pnpm data:rounds");

    const behind = cmds({
      ...base,
      rawFiles: files,
      roundsRawFile: "raw/grint-export-2026-08-19.json",
    });
    expect(behind).toContain("pnpm data:inventory");
    expect(behind).toContain("pnpm data:rounds");
    expect(behind).toContain("pnpm data:spine");
  });

  it("treats a missing artifact as everything-is-new", () => {
    const plan = cmds({ ...base, rawFiles: ["garmin-export-2026-08-23-0358.json"] });
    expect(plan).toContain("pnpm data:garmin:inventory");
    expect(plan).toContain("pnpm data:garmin");
  });

  it("gates the map chain on the spine actually changing, not on the plan", () => {
    const plan = planRefresh({
      ...base,
      rawFiles: ["grint-export-2026-08-25.json"],
      roundsRawFile: "raw/grint-export-2026-08-19.json",
    });
    const spine = plan.find((s: { cmd: string }) => s.cmd === "pnpm data:spine");
    expect(spine?.then?.ifChanged).toEqual(["data/facilities.json", "data/layouts.json"]);
    expect(spine?.then?.cmds).toEqual([
      "pnpm data:geocode",
      "pnpm data:osm",
      "pnpm data:holes",
      "pnpm data:build",
    ]);
  });

  it("never plans a step that confirms round links", () => {
    const all = planRefresh({
      ...base,
      rawFiles: ["grint-export-2026-08-25.json", "garmin-export-2026-08-25.json"],
    });
    for (const s of all) {
      expect(s.cmd).not.toMatch(/confirm/i);
    }
    expect(all.map((s: { cmd: string }) => s.cmd)).toContain("pnpm data:links");
  });
});
