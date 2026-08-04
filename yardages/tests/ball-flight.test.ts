/* The start/curve split, and the two checks that it means what it says.
 *
 * The whole decomposition rests on one claim: that `start + curve` is the
 * export's own offline column. If that ever stops holding — a firmware change,
 * a units bug, a sign flip — every sentence in the report becomes wrong while
 * still looking plausible, which is the worst failure this repo has. So the
 * identity is asserted against the real ledger, not a fixture.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFlightReport,
  clubFlight,
  curveYd,
  fitCurveOnFaceToPath,
  isReadable,
  shapeOf,
  startYd,
  STRAIGHT_YD,
} from "../lib/ball-flight";
import type { LedgerShot } from "../lib/ledger";
import { applyHeuristics } from "../lib/stats";

const real: LedgerShot[] = applyHeuristics(
  JSON.parse(readFileSync(join(__dirname, "..", "data", "shots.json"), "utf8")),
);
const readable = real.filter(isReadable);

describe("the split, against the real ledger", () => {
  it("reconstructs the export's own offline column", () => {
    // This is the load-bearing assertion. 0.02 yd is the observed worst case;
    // anything looser would let a real sign error through.
    for (const s of readable) {
      expect(Math.abs(startYd(s) + curveYd(s) - (s.offlineYd as number))).toBeLessThan(0.02);
    }
  });

  it("agrees with the spin axis on which way every real curve bent", () => {
    const curved = readable.filter(
      (s) => s.spinAxisDeg !== null && Math.abs(s.spinAxisDeg) > 2 && Math.abs(curveYd(s)) > 0.5,
    );
    expect(curved.length).toBeGreaterThan(100);
    for (const s of curved) {
      expect(Math.sign(curveYd(s))).toBe(Math.sign(s.spinAxisDeg as number));
    }
  });

  it("reads a start line, not a finish line", () => {
    /* Start must track the FACE and curve must not. If a future change quietly
     * swapped launch direction for deviation angle, this is what would catch
     * it: the correlation would collapse toward the curve's. */
    const withFace = readable.filter((s) => s.faceAngleDeg !== null);
    const corr = (xs: number[], ys: number[]) => {
      const n = xs.length;
      const mx = xs.reduce((a, b) => a + b, 0) / n;
      const my = ys.reduce((a, b) => a + b, 0) / n;
      let sxy = 0, sxx = 0, syy = 0;
      for (let i = 0; i < n; i += 1) {
        const a = xs[i] - mx, b = ys[i] - my;
        sxy += a * b; sxx += a * a; syy += b * b;
      }
      return sxy / Math.sqrt(sxx * syy);
    };
    const face = withFace.map((s) => s.faceAngleDeg as number);
    expect(corr(face, withFace.map(startYd))).toBeGreaterThan(0.9);
    expect(corr(face, withFace.map(curveYd))).toBeLessThan(0.6);
  });

  it("finds wedges that stop shorter than they landed, and calls them real", () => {
    // Four shots genuinely spin back. They are not carry copies and not a bug.
    const back = real.filter(
      (s) => s.carryYd !== null && s.totalYd !== null && (s.totalYd as number) < (s.carryYd as number),
    );
    expect(back.length).toBe(4);
    expect(back.every((s) => !s.totalIsCarryCopy)).toBe(true);
    expect(back.every((s) => /Wedge/.test(s.club))).toBe(true);
  });
});

// ── synthetic geometry, where the answer is known by construction ────────────

function shot(over: Partial<LedgerShot> = {}): LedgerShot {
  return {
    sessionId: "2026-07-01T10:00:00",
    shotIndex: 0,
    shotTimestamp: "2026-07-01T10:00:00",
    club: "7 Iron",
    carryYd: 100,
    launchDirectionDeg: 0,
    carryDeviationAngleDeg: 0,
    offlineYd: 0,
    isExcluded: false,
    faceAngleDeg: null,
    clubPathDeg: null,
    faceToPathDeg: null,
    spinAxisDeg: null,
    ...over,
  } as LedgerShot;
}

describe("startYd / curveYd", () => {
  it("puts a dead-straight shot at zero on both halves", () => {
    const s = shot();
    expect(startYd(s)).toBeCloseTo(0, 9);
    expect(curveYd(s)).toBeCloseTo(0, 9);
  });

  it("calls a shot that starts right and stays there all start, no curve", () => {
    const s = shot({ launchDirectionDeg: 10, carryDeviationAngleDeg: 10 });
    expect(startYd(s)).toBeCloseTo(100 * Math.sin((10 * Math.PI) / 180), 9);
    expect(curveYd(s)).toBeCloseTo(0, 9);
  });

  it("calls a shot that starts on line and finishes right all curve, no start", () => {
    const s = shot({ launchDirectionDeg: 0, carryDeviationAngleDeg: 10 });
    expect(startYd(s)).toBeCloseTo(0, 9);
    expect(curveYd(s)).toBeGreaterThan(0);
  });

  it("signs a hook negative even when it finishes right of target", () => {
    // Started 12 deg right, finished 4 deg right: still bent LEFT.
    const s = shot({ launchDirectionDeg: 12, carryDeviationAngleDeg: 4 });
    expect(startYd(s)).toBeGreaterThan(0);
    expect(curveYd(s)).toBeLessThan(0);
  });

  it("scales with carry: the same angles bend a longer shot further", () => {
    const near = shot({ carryYd: 100, carryDeviationAngleDeg: 6 });
    const far = shot({ carryYd: 200, carryDeviationAngleDeg: 6 });
    expect(curveYd(far)).toBeCloseTo(2 * curveYd(near), 6);
  });
});

describe("shapeOf", () => {
  const at = (start: number, finish: number) =>
    shapeOf(shot({ carryYd: 200, launchDirectionDeg: start, carryDeviationAngleDeg: finish }));

  it("names the nine flights", () => {
    expect(at(0, 0)).toBe("on line|straight");
    expect(at(6, 6)).toBe("push|straight");
    expect(at(-6, -6)).toBe("pull|straight");
    expect(at(0, 6)).toBe("on line|slice");
    expect(at(0, -6)).toBe("on line|hook");
    expect(at(6, 12)).toBe("push|slice");
    expect(at(-6, 0)).toBe("pull|slice");
    expect(at(6, 0)).toBe("push|hook");
    expect(at(-6, -12)).toBe("pull|hook");
  });

  it("uses the published threshold, so the label and the number agree", () => {
    // Just inside 3 yd at 200 yd carry is well under a degree.
    const tiny = (STRAIGHT_YD - 0.5) / 200;
    const deg = (Math.asin(tiny) * 180) / Math.PI;
    expect(at(deg, deg)).toBe("on line|straight");
  });
});

describe("clubFlight corroboration", () => {
  const block = (sid: string, n: number, finishDeg: number) =>
    Array.from({ length: n }, (_, i) =>
      shot({ sessionId: sid, shotIndex: i, club: "6 Iron", carryYd: 170, carryDeviationAngleDeg: finishDeg }),
    );

  it("calls one session one session, however many shots it holds", () => {
    expect(clubFlight(block("A", 40, 5), "6 Iron").status).toBe("single");
  });

  it("corroborates two sessions that bend the same way", () => {
    const f = clubFlight([...block("A", 8, 5), ...block("B", 8, 6)], "6 Iron");
    expect(f.sessionCurves).toHaveLength(2);
    expect(f.status).toBe("agree");
  });

  it("flags two sessions that disagree rather than averaging them away", () => {
    const f = clubFlight([...block("A", 8, 5), ...block("B", 8, -5)], "6 Iron");
    expect(f.status).toBe("disagree");
    // the median would have read as roughly straight, hiding both days
    expect(Math.abs(f.curve)).toBeLessThan(2);
  });

  it("ignores a session too thin to have a median", () => {
    const f = clubFlight([...block("A", 8, 5), ...block("B", 3, -20)], "6 Iron");
    expect(f.sessionCurves).toHaveLength(1);
    expect(f.status).toBe("single");
  });
});

describe("fitCurveOnFaceToPath", () => {
  it("returns null rather than a fit when the club was never tracked", () => {
    expect(fitCurveOnFaceToPath([shot(), shot(), shot()])).toBeNull();
  });

  it("recovers a slope it was given", () => {
    // Build shots whose curve is exactly 2 yd per degree of face-to-path.
    const rows = [-4, -2, 0, 2, 4].map((f2p) => {
      const carry = 100;
      const finish = (Math.asin((2 * f2p) / carry) * 180) / Math.PI;
      return shot({ carryYd: carry, faceToPathDeg: f2p, carryDeviationAngleDeg: finish });
    });
    const fit = fitCurveOnFaceToPath(rows)!;
    expect(fit.slope).toBeCloseTo(2, 1);
    expect(fit.r).toBeGreaterThan(0.99);
    expect(fit.n).toBe(5);
  });

  it("finds the real ledger's mechanism pointing the right way", () => {
    const fit = fitCurveOnFaceToPath(readable)!;
    expect(fit.slope).toBeGreaterThan(0); // open face to path bends right
    expect(fit.r).toBeGreaterThan(0.4);
    expect(fit.n).toBeLessThan(readable.length); // not every shot was tracked
  });
});

describe("buildFlightReport", () => {
  const report = buildFlightReport(real);

  it("counts only the shots it can actually read", () => {
    expect(report.n).toBe(readable.length);
    expect(report.n).toBeLessThanOrEqual(report.trusted);
    expect(report.trusted).toBeLessThanOrEqual(report.totalLogged);
  });

  it("keeps every share a share", () => {
    for (const v of [report.straightPct, report.curvedPct, report.offlinePct, report.rightOfCurves]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    expect(Object.values(report.tally).reduce((a, b) => a + b, 0)).toBe(report.n);
  });

  it("gives each club's two halves summing to its total miss", () => {
    for (const c of report.clubs) {
      expect(Math.abs(c.start + c.curve)).toBeLessThan(60);
      expect(c.absStart).toBeGreaterThanOrEqual(0);
      expect(c.absCurve).toBeGreaterThanOrEqual(0);
    }
  });

  it("survives a ledger it cannot read at all", () => {
    const blind = real.map((s) => ({ ...s, launchDirectionDeg: null }));
    const r = buildFlightReport(blind);
    expect(r.n).toBe(0);
    expect(r.clubs).toEqual([]);
    expect(r.rightOfCurves).toBe(0);
  });
});
