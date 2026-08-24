import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs script module, no type declarations
import { mergeBundles, parsePuttDist, parseSeries } from "../scripts/parse-grint-export.mjs";

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

/* The chart-series readers behind rounds.json's `series` block. Series names
 * are literals — "4 +Putts" carries a regex metacharacter — and the putt
 * distribution is five lines of one chart zipped by its own x-axis, refused
 * wholesale when the lines disagree. */

const line = (name: string, pts: string) => `name: '${name}',\ndata: [${pts}]`;

describe("parseSeries", () => {
  it("reads the named series' points in chart order", () => {
    const scripts = [line("% Fairways Hit", "{y:62.5,name:'Course A'},{y:50,name:'Course B'}")];
    expect(parseSeries(scripts, "% Fairways Hit")).toEqual([
      { y: 62.5, name: "Course A" },
      { y: 50, name: "Course B" },
    ]);
  });

  it("treats regex metacharacters in the name as literals", () => {
    const scripts = [line("4 +Putts", "{y:1,name:'Course A'}")];
    expect(parseSeries(scripts, "4 +Putts")).toEqual([{ y: 1, name: "Course A" }]);
  });

  it("returns null for a series the view does not chart", () => {
    expect(parseSeries([line("Avg Putts", "{y:35,name:'A'}")], "GIR per round")).toBeNull();
  });

  it("tolerates extra point properties without reading them", () => {
    // The putt chart writes countHoles, the handicap chart writes color.
    const scripts = [line("0 Putts", "{y:2,name:'A',countHoles:18},{y:1,name:'B',color:'#A7CF3F'}")];
    expect(parseSeries(scripts, "0 Putts")).toEqual([
      { y: 2, name: "A" },
      { y: 1, name: "B" },
    ]);
  });
});

describe("parsePuttDist", () => {
  const five = (lens: number[]) =>
    ["0 Putts", "1 Putts", "2 Putts", "3 Putts", "4 +Putts"].map((name, i) =>
      line(
        name,
        Array.from({ length: lens[i] }, (_, j) => `{y:${i},name:'R${j + 1}'}`).join(","),
      ),
    );

  it("zips the five lines by the chart's own x-axis", () => {
    const dist = parsePuttDist(five([2, 2, 2, 2, 2]));
    expect(dist).toEqual([
      { courseName: "R1", putts0: 0, putts1: 1, putts2: 2, putts3: 3, putts4Plus: 4 },
      { courseName: "R2", putts0: 0, putts1: 1, putts2: 2, putts3: 3, putts4Plus: 4 },
    ]);
  });

  it("refuses the whole distribution when the lines disagree in length", () => {
    expect(parsePuttDist(five([2, 2, 1, 2, 2]))).toEqual([]);
  });

  it("refuses when any line is missing", () => {
    expect(parsePuttDist([line("0 Putts", "{y:0,name:'R1'}")])).toEqual([]);
  });
});
