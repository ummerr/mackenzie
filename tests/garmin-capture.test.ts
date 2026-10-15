import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  API_CONNECT,
  AUTH_STRATEGY,
  captureGarmin,
  loadExtensionConstants,
  // @ts-expect-error — plain .mjs script module, no type declarations
} from "../scripts/capture/garmin.mjs";
// @ts-expect-error — plain .mjs script module, no type declarations
import { SECRET_SHAPED } from "../scripts/capture/secret-shaped.mjs";

/* The nightly Garmin capture must produce the bundle the extension produces:
 * same envelope, same resource kinds and meta, every payload byte-verbatim,
 * nothing secret-shaped. The fake server here IS an extension capture — the
 * fixture's resources keyed by API path — so byte-identity is checkable. */

type Resource = { kind: string; url: string; meta: Record<string, unknown>; payload: { json: string } };
const fixture = JSON.parse(readFileSync("fixtures/garmin-export-fixture.json", "utf8")) as {
  resources: Resource[];
  summary: Record<string, number>;
};
const C = loadExtensionConstants();
const pathOf = (url: string) => url.replace(/^https:\/\/[^/]+(\/[^/]+)?\/gcs-golfcommunity\/api\/v2/, "");

/** A server that answers the fixture's bodies, plus the aggregates the
 *  trimmed fixture lacks, and 404s anything else. Records every call. */
function fakeServer(over: Record<string, { status: number; text: string }> = {}) {
  const bodies = new Map<string, string>();
  for (const r of fixture.resources) bodies.set(pathOf(r.url), r.payload.json);
  bodies.set(C.PLAYER_STATS_PATH, '{"playerStats":{}}');
  for (const v of C.SHOT_STATS_VIEWS) bodies.set(C.SHOT_STATS_PATH(v), `{"view":"${v}"}`);
  const calls: string[] = [];
  const fetchText = async (url: string) => {
    expect(url.startsWith(API_CONNECT)).toBe(true);
    const path = pathOf(url);
    calls.push(path);
    if (over[path]) return { status: over[path].status, url, text: over[path].text };
    const text = bodies.get(path);
    return text === undefined ? { status: 404, url, text: '{"error":"not found"}' } : { status: 200, url, text };
  };
  return { fetchText, calls };
}

const fixedNow = () => new Date("2026-10-13T11:05:00.000Z");
const detailIds = fixture.resources.filter((r) => r.kind === "scorecardDetail").map((r) => String(r.meta.scorecardId));
const summaryIds = (JSON.parse(fixture.resources[0].payload.json).scorecardSummaries as { id: number }[]).map((s) => String(s.id));
const known = new Set(summaryIds.filter((id) => !detailIds.includes(id)));

describe("captureGarmin", () => {
  it("produces the extension's bundle, payloads byte-verbatim, as an incremental", async () => {
    const { fetchText, calls } = fakeServer();
    const out = await captureGarmin({
      fetchText,
      knownScorecards: known,
      baselineRawFile: "garmin-export-2026-10-06-1604.json",
      now: fixedNow,
      wait: async () => {},
      constants: C,
    });
    expect(out.nothingNew).toBe(false);
    expect(out.filename).toBe("garmin-export-2026-10-13-1105.json");
    expect(out.newScorecardIds.sort()).toEqual([...detailIds].sort());

    const b = out.bundle;
    expect(Object.keys(b)).toEqual([
      "format", "capturedAt", "source", "userId", "extensionVersion", "discovery",
      "resources", "errors", "warnings", "summary", "baseline",
    ]);
    expect(b.format).toBe("garmin-export/1");
    expect(b.extensionVersion).toBe(`ci-${C.VERSION}`);
    expect(b.discovery.authStrategy).toBe(AUTH_STRATEGY);
    expect(b.discovery.scorecardIdsFound).toBe(summaryIds.length);
    expect(b.discovery.newScorecardIds).toBe(detailIds.length);
    expect(b.discovery.holeShotPattern).toBe("all-in-one");
    expect(b.baseline).toEqual({
      rawFile: "garmin-export-2026-10-06-1604.json",
      knownScorecards: known.size,
      skippedScorecards: known.size,
    });
    expect(b.errors).toEqual([]);

    // Every resource the extension captured for these scorecards is here,
    // with the same kind, the same meta, and the same bytes.
    for (const want of fixture.resources) {
      const got = b.resources.find((r: Resource) => pathOf(r.url) === pathOf(want.url));
      expect(got, want.url).toBeDefined();
      expect(got.kind).toBe(want.kind);
      expect(got.meta).toEqual(want.meta);
      expect(got.payload.json).toBe(want.payload.json);
      expect(got.extraction).toEqual({ mode: "verbatim-json", selectors: ["raw response body"] });
      expect(got.method).toBe("GET");
    }
    // The summary agrees with the resources, as the inventory gate recomputes it.
    const byKind = (k: string) => b.resources.filter((r: Resource) => r.kind === k).length;
    expect(b.summary).toEqual({
      scorecardDetails: byKind("scorecardDetail"),
      holeShotResources: byKind("holeShots"),
      clubs: byKind("clubs"),
      playerStats: byKind("playerStats"),
      shotStats: byKind("shotStats"),
      errors: 0,
      skippedScorecards: known.size,
    });
    expect(byKind("shotStats")).toBe(4);
    // Known scorecards were never fetched; the per-hole fill never ran.
    for (const id of known) expect(calls.some((p) => p.includes(id))).toBe(false);
    expect(calls.some((p) => /hole-numbers=/.test(p))).toBe(false);
  });

  it("passes the inventory gate's secret-shaped refusal", async () => {
    const { fetchText } = fakeServer();
    const { bundle } = await captureGarmin({
      fetchText, knownScorecards: known, baselineRawFile: "x.json", now: fixedNow, wait: async () => {}, constants: C,
    });
    const text = JSON.stringify(bundle, null, 2);
    for (const re of SECRET_SHAPED) expect(text, String(re)).not.toMatch(re);
  });

  it("writes nothing when every scorecard is already in the record", async () => {
    const { fetchText, calls } = fakeServer();
    const out = await captureGarmin({
      fetchText, knownScorecards: new Set(summaryIds), baselineRawFile: "x.json", now: fixedNow, wait: async () => {}, constants: C,
    });
    expect(out.nothingNew).toBe(true);
    expect(out.bundle).toBeNull();
    expect(calls).toEqual([C.SUMMARY_PATH]);
  });

  it("fills per-hole only the holes the all-in-one call did not return", async () => {
    const id = detailIds[0];
    const allPath = C.HOLE_SHOTS_ALL_PATH(id);
    const full = JSON.parse(fixture.resources.find((r) => pathOf(r.url) === allPath)!.payload.json);
    const trimmed = { ...full, holeShots: full.holeShots.filter((h: { holeNumber: number }) => h.holeNumber !== 18) };
    const { fetchText, calls } = fakeServer({
      [allPath]: { status: 200, text: JSON.stringify(trimmed) },
      [C.HOLE_SHOTS_PATH(id, 18)]: { status: 200, text: '{"holeShots":[{"holeNumber":18}]}' },
    });
    const { bundle } = await captureGarmin({
      fetchText, knownScorecards: new Set(summaryIds.filter((s) => s !== id)), baselineRawFile: "x.json", now: fixedNow, wait: async () => {}, constants: C,
    });
    const perHole = calls.filter((p) => /hole-numbers=/.test(p));
    expect(perHole).toEqual([C.HOLE_SHOTS_PATH(id, 18)]);
    const shots = bundle.resources.filter((r: Resource) => r.kind === "holeShots");
    expect(shots.map((r: Resource) => r.meta.pattern)).toEqual(["all-in-one", "per-hole"]);
    expect(bundle.summary.holeShotResources).toBe(2);
  });

  it("stops on a dead token and reports a partial bundle", async () => {
    const { fetchText } = fakeServer({ [C.SUMMARY_PATH]: { status: 401, text: "" } });
    await expect(
      captureGarmin({ fetchText, knownScorecards: known, baselineRawFile: "x.json", now: fixedNow, wait: async () => {}, constants: C }),
    ).rejects.toThrow(/Could not read the scorecard summary/);
  });

  it("does a full capture, plain-dated, when the record is empty", async () => {
    const { fetchText } = fakeServer();
    const out = await captureGarmin({
      fetchText, knownScorecards: new Set(), baselineRawFile: null, now: fixedNow, wait: async () => {}, constants: C,
    });
    expect(out.filename).toBe("garmin-export-2026-10-13.json");
    expect(out.bundle.baseline).toBeUndefined();
    expect(out.bundle.summary.skippedScorecards).toBeUndefined();
  });
});

// @ts-expect-error — plain .mjs script module, no type declarations
import { grintSecretViolations } from "../scripts/capture/secret-shaped.mjs";

describe("grintSecretViolations", () => {
  const helper = 'expires = "; expires=" + date.toUTCString();\n document.cookie = name + "=" + (value || "") + expires + "; path=/";';
  it("exempts the sponsor banner's cookie-write helper a fresh session is served", () => {
    expect(grintSecretViolations(`<script>${helper}</script>`)).toEqual([]);
  });
  it("still refuses a cookie read, a session id, or a header", () => {
    expect(grintSecretViolations("var c = document.cookie;").map((v: { re: RegExp }) => String(v.re))).toEqual(["/document\\.cookie/i"]);
    expect(grintSecretViolations("PHPSESSID=abc").length).toBe(1);
    expect(grintSecretViolations("Set-Cookie: x").length).toBe(1);
    expect(grintSecretViolations(`${helper} and later document.cookie.split`).length).toBe(1);
  });
});
