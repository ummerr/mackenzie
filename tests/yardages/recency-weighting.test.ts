import { describe, expect, it } from "vitest";
import {
  ageInDays,
  latestSessionId,
  recencyWeight,
  sessionWeights,
  shotWeights,
} from "../../lib/yardages/recency-weighting";
import { REVIEW_THRESHOLDS } from "../../lib/yardages/thresholds";

const HL = REVIEW_THRESHOLDS.recencyHalfLifeDays;

describe("ageInDays", () => {
  it("counts whole and fractional days between naive wall times", () => {
    expect(ageInDays("2026-07-02T12:00:00", "2026-08-02T12:00:00")).toBeCloseTo(31, 9);
    expect(ageInDays("2026-08-02T00:00:00", "2026-08-02T12:00:00")).toBeCloseTo(0.5, 9);
  });

  it("is zero for the same instant and negative for the future", () => {
    expect(ageInDays("2026-08-02T13:00:00", "2026-08-02T13:00:00")).toBe(0);
    expect(ageInDays("2026-09-01T00:00:00", "2026-08-02T00:00:00")).toBeLessThan(0);
  });

  it("throws on an unparseable timestamp rather than returning NaN", () => {
    expect(() => ageInDays("not a date", "2026-08-02T00:00:00")).toThrow();
  });
});

describe("recencyWeight", () => {
  it("is 1 for today", () => {
    expect(recencyWeight(0)).toBe(1);
  });

  it("decays exponentially", () => {
    expect(recencyWeight(HL)).toBeCloseTo(Math.exp(-1), 9);
    expect(recencyWeight(2 * HL)).toBeCloseTo(Math.exp(-2), 9);
    expect(recencyWeight(30)).toBeCloseTo(Math.exp(-30 / HL), 9);
  });

  it("reaches 1/e and NOT one half at its named age", () => {
    // The constant is called a half-life and is not one. Asserted so the name
    // cannot quietly start meaning what it says without this failing first.
    expect(recencyWeight(HL)).toBeCloseTo(0.3679, 4);
    expect(recencyWeight(HL)).not.toBeCloseTo(0.5, 2);
  });

  it("is monotonically decreasing in age", () => {
    for (let d = 1; d < 200; d += 7) {
      expect(recencyWeight(d)).toBeLessThan(recencyWeight(d - 1));
    }
  });

  it("clamps a future session to 1 rather than weighing it above the present", () => {
    expect(recencyWeight(-10)).toBe(1);
  });

  it("throws on a non-positive decay constant", () => {
    expect(() => recencyWeight(10, 0)).toThrow();
  });
});

describe("sessionWeights — the single-session cap", () => {
  const share = (w: { weight: number }[], i: number) =>
    w[i].weight / w.reduce((a, b) => a + b.weight, 0);

  it("leaves weights alone when no session exceeds its cap", () => {
    const w = sessionWeights(
      [
        { sessionId: "2026-07-23T10:00:00", shotCount: 20 },
        { sessionId: "2026-08-02T10:00:00", shotCount: 20 },
      ],
      "2026-08-02T10:00:00",
    );
    // Ten days apart: the newer session leads, and stays under the cap.
    expect(w.every((e) => !e.capped)).toBe(true);
    expect(share(w, 1)).toBeGreaterThan(share(w, 0));
    expect(share(w, 1)).toBeLessThan(REVIEW_THRESHOLDS.maxSessionWeightShare);
  });

  it("still lets recency shift two equal sessions, which a 0.5 cap would not", () => {
    // Two 20-shot sessions a month apart. The whole feature dies here if the
    // cap is set to 0.5: it would pin this to 50/50 and recency would be inert
    // on exactly the shape most clubs in this ledger have.
    const w = sessionWeights(
      [
        { sessionId: "2026-07-02T10:00:00", shotCount: 20 },
        { sessionId: "2026-08-02T10:00:00", shotCount: 20 },
      ],
      "2026-08-02T10:00:00",
    );
    expect(share(w, 1)).toBeGreaterThan(0.55);
    expect(share(w, 1)).toBeCloseTo(REVIEW_THRESHOLDS.maxSessionWeightShare, 6);
    expect(w[1].capped).toBe(true);
  });

  it("stops a small recent session from swinging a much larger history", () => {
    // Four shots today against thirty from four months ago. Uncapped, decay
    // alone would hand today the majority; the cap holds it at half.
    const w = sessionWeights(
      [
        { sessionId: "2026-04-02T10:00:00", shotCount: 30 },
        { sessionId: "2026-08-02T10:00:00", shotCount: 4 },
      ],
      "2026-08-02T10:00:00",
    );
    expect(w[1].rawWeight).toBeGreaterThan(w[0].rawWeight);
    expect(share(w, 1)).toBeCloseTo(REVIEW_THRESHOLDS.maxSessionWeightShare, 6);
    expect(w[1].capped).toBe(true);
  });

  it("never caps a session below its own share of the shots", () => {
    // The trap a flat share cap falls into: with two sessions it forces 50/50,
    // which AMPLIFIES a four-shot session against a thirty-shot one. A session
    // holding 95% of the shots is entitled to 95% of the weight.
    const w = sessionWeights(
      [
        { sessionId: "2026-07-02T08:42:41", shotCount: 1 },
        { sessionId: "2026-08-02T13:54:12", shotCount: 19 },
      ],
      "2026-08-02T13:54:12",
    );
    expect(share(w, 1)).toBeGreaterThan(0.9);
    expect(share(w, 1)).toBeCloseTo(0.95, 2);
  });

  it("gives a lone session all of the weight", () => {
    const w = sessionWeights(
      [{ sessionId: "2026-08-02T10:00:00", shotCount: 12 }],
      "2026-08-02T10:00:00",
    );
    expect(share(w, 0)).toBe(1);
  });

  it("caps every violator, not just the worst one", () => {
    const w = sessionWeights(
      [
        { sessionId: "2026-01-02T10:00:00", shotCount: 40 },
        { sessionId: "2026-08-01T10:00:00", shotCount: 10 },
        { sessionId: "2026-08-02T10:00:00", shotCount: 10 },
      ],
      "2026-08-02T10:00:00",
    );
    const total = w.reduce((a, b) => a + b.weight, 0);
    for (const e of w) {
      expect(e.weight / total).toBeLessThanOrEqual(e.cap + 1e-9);
    }
  });

  it("returns nothing for an empty ledger", () => {
    expect(sessionWeights([], "2026-08-02T10:00:00")).toEqual([]);
  });
});

describe("shotWeights", () => {
  it("splits a session's weight evenly across its shots", () => {
    const shots = [
      { sessionId: "2026-08-02T10:00:00" },
      { sessionId: "2026-08-02T10:00:00" },
      { sessionId: "2026-07-02T10:00:00" },
    ];
    const { weights } = shotWeights(shots, "2026-08-02T10:00:00");
    expect(weights[0]).toBeCloseTo(weights[1], 12);
    expect(weights[0]).toBeGreaterThan(weights[2]);
  });

  it("returns one weight per shot, in input order", () => {
    const shots = [
      { sessionId: "2026-07-02T10:00:00" },
      { sessionId: "2026-08-02T10:00:00" },
      { sessionId: "2026-07-02T10:00:00" },
    ];
    const { weights } = shotWeights(shots, "2026-08-02T10:00:00");
    expect(weights).toHaveLength(3);
    expect(weights[0]).toBeCloseTo(weights[2], 12);
  });
});

describe("latestSessionId", () => {
  it("is the newest session present, or null for nothing", () => {
    expect(
      latestSessionId([
        { sessionId: "2026-07-02T10:00:00" },
        { sessionId: "2026-08-02T10:00:00" },
        { sessionId: "2026-07-05T10:00:00" },
      ]),
    ).toBe("2026-08-02T10:00:00");
    expect(latestSessionId([])).toBeNull();
  });
});
