import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs script module, no type declarations
import { mergeGarminBundles } from "../scripts/parse-garmin-export.mjs";

/* Same merge contract as the Grint adapter: the newest FULL bundle is the
 * base (the only capture that can reflect a scorecard deleted on Garmin),
 * incrementals captured after it layer on top, the newest detail winning per
 * scorecardId — and a newer bundle's holeShots set replaces the older set
 * WHOLESALE per scorecard, because a capture may be one all-in-one resource
 * or eighteen per-hole ones and interleaving two captures could double holes. */

function detail(scorecardId: string, tag: string) {
  return { kind: "scorecardDetail", meta: { scorecardId }, payload: { json: tag } };
}

function holeShots(scorecardId: string, tag: string, holeNumber?: number) {
  return {
    kind: "holeShots",
    meta: holeNumber ? { scorecardId, pattern: "per-hole", holeNumber } : { scorecardId, pattern: "all-in-one" },
    payload: { json: tag },
  };
}

function clubs(tag: string) {
  return { kind: "clubs", meta: {}, payload: { json: tag } };
}

function bundle(over: Record<string, unknown> = {}) {
  return {
    format: "garmin-export/1",
    capturedAt: "2026-08-23T03:00:00.000Z",
    userId: 1,
    resources: [],
    ...over,
  };
}

describe("mergeGarminBundles", () => {
  it("passes a single full bundle through", () => {
    const merged = mergeGarminBundles([
      {
        file: "garmin-export-2026-08-23.json",
        bundle: bundle({ resources: [detail("100", "a"), holeShots("100", "s"), clubs("c")] }),
      },
    ]);
    expect(merged).not.toBeNull();
    expect(merged!.files).toEqual(["garmin-export-2026-08-23.json"]);
    expect([...merged!.detailById.keys()]).toEqual(["100"]);
    expect(merged!.shotsById.get("100")!.map((r: any) => r.payload.json)).toEqual(["s"]);
  });

  it("layers incrementals over the full bundle, newest detail winning", () => {
    const merged = mergeGarminBundles([
      {
        file: "garmin-export-2026-08-23.json",
        bundle: bundle({
          resources: [detail("100", "old-100"), detail("101", "old-101"), clubs("old-clubs")],
        }),
      },
      {
        file: "garmin-export-2026-09-10-0900.json",
        bundle: bundle({
          capturedAt: "2026-09-10T09:00:00.000Z",
          baseline: { rawFile: "garmin-export-2026-08-23.json", knownScorecards: 2 },
          resources: [detail("101", "re-101"), detail("102", "new-102"), clubs("new-clubs")],
        }),
      },
    ]);
    expect(merged!.capturedAt).toBe("2026-09-10T09:00:00.000Z");
    const byId = (id: string) => merged!.detailById.get(id).payload.json;
    expect(byId("100")).toBe("old-100");
    expect(byId("101")).toBe("re-101");
    expect(byId("102")).toBe("new-102");
    const c = merged!.newestResource((r: any) => r.kind === "clubs");
    expect(c.payload.json).toBe("new-clubs");
  });

  it("replaces a scorecard's holeShots set wholesale, never interleaving", () => {
    const merged = mergeGarminBundles([
      {
        file: "garmin-export-2026-08-23.json",
        bundle: bundle({
          // The first capture fell back to per-hole: two resources for card 100.
          resources: [holeShots("100", "old-h1", 1), holeShots("100", "old-h2", 2)],
        }),
      },
      {
        file: "garmin-export-2026-09-10.json",
        bundle: bundle({
          capturedAt: "2026-09-10T09:00:00.000Z",
          baseline: { rawFile: "garmin-export-2026-08-23.json" },
          resources: [holeShots("100", "new-all")],
        }),
      },
    ]);
    // The newer all-in-one capture replaces BOTH per-hole resources.
    expect(merged!.shotsById.get("100")!.map((r: any) => r.payload.json)).toEqual(["new-all"]);
  });

  it("orders by capturedAt, not filename", () => {
    const merged = mergeGarminBundles([
      {
        file: "garmin-export-2026-09-10-1432.json",
        bundle: bundle({
          capturedAt: "2026-09-10T14:32:00.000Z",
          baseline: { rawFile: "x" },
          resources: [detail("100", "delta")],
        }),
      },
      {
        file: "garmin-export-2026-09-10.json",
        bundle: bundle({
          capturedAt: "2026-09-10T09:00:00.000Z",
          resources: [detail("100", "full")],
        }),
      },
    ]);
    expect(merged!.detailById.get("100").payload.json).toBe("delta");
  });

  it("re-baselines on a newer full bundle, dropping earlier incrementals", () => {
    const merged = mergeGarminBundles([
      {
        file: "garmin-export-2026-08-23.json",
        bundle: bundle({ resources: [detail("100", "a")] }),
      },
      {
        file: "garmin-export-2026-09-01.json",
        bundle: bundle({
          capturedAt: "2026-09-01T09:00:00.000Z",
          baseline: { rawFile: "garmin-export-2026-08-23.json" },
          resources: [detail("101", "later-deleted")],
        }),
      },
      {
        file: "garmin-export-2026-09-10.json",
        bundle: bundle({
          capturedAt: "2026-09-10T09:00:00.000Z",
          resources: [detail("100", "a2")],
        }),
      },
    ]);
    expect(merged!.files).toEqual(["garmin-export-2026-09-10.json"]);
    expect([...merged!.detailById.keys()]).toEqual(["100"]);
  });

  it("refuses a record with no full bundle", () => {
    const merged = mergeGarminBundles([
      {
        file: "garmin-export-2026-09-10.json",
        bundle: bundle({ baseline: { rawFile: "x" }, resources: [detail("100", "a")] }),
      },
    ]);
    expect(merged).toBeNull();
  });
});
