import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs script module, no type declarations
import { mergeBundles } from "../scripts/parse-grint-export.mjs";

/* The merge rule for incremental captures: the newest FULL bundle is the base
 * (the only capture that can reflect a round deleted on Grint), incrementals
 * captured after it layer on top, newest scorecard winning per roundId, and
 * aggregates (trend/handicap) come from the newest bundle that has them. */

function scorecard(roundId: string, tag: string) {
  return { kind: "scorecard", meta: { roundId }, payload: { html: tag } };
}

function trend(view: string, tag: string) {
  return { kind: "trend", meta: { view }, payload: { scripts: [tag] } };
}

function bundle(over: Record<string, unknown> = {}) {
  return {
    format: "grint-export/1",
    capturedAt: "2026-08-15T10:00:00.000Z",
    userId: "u1",
    resources: [],
    ...over,
  };
}

describe("mergeBundles", () => {
  it("passes a single full bundle through", () => {
    const merged = mergeBundles([
      {
        file: "grint-export-2026-08-15.json",
        bundle: bundle({ resources: [scorecard("100", "a"), trend("", "t")] }),
      },
    ]);
    expect(merged).not.toBeNull();
    expect(merged!.files).toEqual(["grint-export-2026-08-15.json"]);
    expect(merged!.scorecards.map((r: any) => r.meta.roundId)).toEqual(["100"]);
  });

  it("layers incrementals over the full bundle, newest scorecard winning", () => {
    const merged = mergeBundles([
      {
        file: "grint-export-2026-08-15.json",
        bundle: bundle({
          resources: [scorecard("100", "old-100"), scorecard("101", "old-101"), trend("", "old-trend")],
        }),
      },
      {
        file: "grint-export-2026-08-19-1432.json",
        bundle: bundle({
          capturedAt: "2026-08-19T14:32:00.000Z",
          baseline: { rawFile: "grint-export-2026-08-15.json", knownRounds: 2 },
          resources: [scorecard("101", "re-101"), scorecard("102", "new-102"), trend("", "new-trend")],
        }),
      },
    ]);
    expect(merged!.files).toEqual([
      "grint-export-2026-08-15.json",
      "grint-export-2026-08-19-1432.json",
    ]);
    expect(merged!.capturedAt).toBe("2026-08-19T14:32:00.000Z");
    const byId = new Map(merged!.scorecards.map((r: any) => [r.meta.roundId, r.payload.html]));
    expect(byId.get("100")).toBe("old-100");
    expect(byId.get("101")).toBe("re-101");
    expect(byId.get("102")).toBe("new-102");
    const t = merged!.newestResource((r: any) => r.kind === "trend" && r.meta.view === "");
    expect(t.payload.scripts).toEqual(["new-trend"]);
  });

  it("orders by capturedAt, not filename", () => {
    const merged = mergeBundles([
      {
        file: "grint-export-2026-08-19-1432.json",
        bundle: bundle({
          capturedAt: "2026-08-19T14:32:00.000Z",
          baseline: { rawFile: "x" },
          resources: [scorecard("100", "delta")],
        }),
      },
      {
        file: "grint-export-2026-08-19.json",
        bundle: bundle({
          capturedAt: "2026-08-19T09:00:00.000Z",
          resources: [scorecard("100", "full")],
        }),
      },
    ]);
    // Filename sort puts the delta first, but capturedAt says it came second.
    expect(merged!.scorecards[0].payload.html).toBe("delta");
  });

  it("re-baselines on a newer full bundle, dropping earlier incrementals", () => {
    const merged = mergeBundles([
      {
        file: "grint-export-2026-08-01.json",
        bundle: bundle({
          capturedAt: "2026-08-01T10:00:00.000Z",
          resources: [scorecard("100", "a")],
        }),
      },
      {
        file: "grint-export-2026-08-10-0900.json",
        bundle: bundle({
          capturedAt: "2026-08-10T09:00:00.000Z",
          baseline: { rawFile: "grint-export-2026-08-01.json" },
          resources: [scorecard("101", "later-deleted")],
        }),
      },
      {
        file: "grint-export-2026-08-15.json",
        bundle: bundle({
          capturedAt: "2026-08-15T10:00:00.000Z",
          resources: [scorecard("100", "a2")],
        }),
      },
    ]);
    // Round 101 was deleted on Grint before the 08-15 full re-scrape; the
    // re-baseline is what lets the record reflect that.
    expect(merged!.files).toEqual(["grint-export-2026-08-15.json"]);
    expect(merged!.scorecards.map((r: any) => r.meta.roundId)).toEqual(["100"]);
  });

  it("refuses a record with no full bundle", () => {
    const merged = mergeBundles([
      {
        file: "grint-export-2026-08-19-1432.json",
        bundle: bundle({ baseline: { rawFile: "x" }, resources: [scorecard("100", "a")] }),
      },
    ]);
    expect(merged).toBeNull();
  });
});
