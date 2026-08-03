import { describe, expect, it } from "vitest";
import {
  mad,
  madsBelow,
  median,
  medianOrNull,
  percentileInterval,
  quantile,
  weightedMedian,
} from "../../lib/yardages/robust-stats";

describe("median", () => {
  it("is the middle value on an odd count", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([5, 1, 9, 2, 7])).toBe(5);
    expect(median([42])).toBe(42);
  });

  it("is the midpoint of the two middles on an even count", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([10, 20])).toBe(15);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("does not require sorted input and does not mutate it", () => {
    const input = [9, 1, 5];
    expect(median(input)).toBe(5);
    expect(input).toEqual([9, 1, 5]);
  });

  it("throws on an empty set", () => {
    expect(() => median([])).toThrow();
  });
});

describe("quantile", () => {
  it("interpolates between neighbours", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([0, 10], 0.25)).toBe(2.5);
  });

  it("returns the ends at p=0 and p=1", () => {
    expect(quantile([5, 1, 9], 0)).toBe(1);
    expect(quantile([5, 1, 9], 1)).toBe(9);
  });

  it("throws on an out-of-range p", () => {
    expect(() => quantile([1], 1.5)).toThrow();
    expect(() => quantile([1], -0.1)).toThrow();
  });
});

describe("mad", () => {
  it("is the scaled median absolute deviation", () => {
    // deviations from median 3 are [2,1,0,1,2]; their median is 1.
    expect(mad([1, 2, 3, 4, 5])).toBeCloseTo(1.4826, 4);
  });

  it("ignores an outlier that would blow up a standard deviation", () => {
    const clean = [10, 10, 10, 10, 10, 11, 9, 10, 10, 10];
    expect(mad([...clean, 500])).toBeCloseTo(mad(clean), 6);
  });

  it("is zero for a constant series", () => {
    expect(mad([7, 7, 7])).toBe(0);
  });
});

describe("madsBelow", () => {
  it("counts MADs below the median, positive meaning below", () => {
    const values = [1, 2, 3, 4, 5];
    expect(madsBelow(3, values)).toBeCloseTo(0, 6);
    expect(madsBelow(3 - 1.4826, values)).toBeCloseTo(1, 6);
    expect(madsBelow(3 + 1.4826, values)).toBeCloseTo(-1, 6);
  });

  it("returns null when the MAD is zero rather than dividing by it", () => {
    // Every value that is not exactly the median would otherwise be
    // infinitely deviant, and every club-relative rule would fire on it.
    expect(madsBelow(1, [7, 7, 7])).toBeNull();
  });

  it("returns null for an empty set", () => {
    expect(madsBelow(1, [])).toBeNull();
  });
});

describe("weightedMedian", () => {
  it("reproduces the plain median exactly when weights are equal", () => {
    for (const values of [
      [1, 2, 3],
      [1, 2, 3, 4],
      [150, 152, 148, 155, 151, 149],
      [10, 20, 30, 40, 50, 60, 70],
    ]) {
      const equal = values.map(() => 1);
      expect(weightedMedian(values, equal)).toBeCloseTo(median(values), 9);
      // Any constant weight, not just 1.
      expect(weightedMedian(values, values.map(() => 3.7))).toBeCloseTo(median(values), 9);
    }
  });

  it("moves toward the values carrying more weight", () => {
    expect(weightedMedian([100, 200], [9, 1])).toBeLessThan(150);
    expect(weightedMedian([100, 200], [1, 9])).toBeGreaterThan(150);
  });

  it("collapses onto a value that carries almost all the weight", () => {
    expect(weightedMedian([100, 150, 200], [1, 1000, 1])).toBeCloseTo(150, 6);
  });

  it("is continuous in the weights, not a jump between observations", () => {
    // The failure this guards: a selection weighted median steps to the next
    // observation on a hair's difference in weight. The six iron moved three
    // yards on a 0.2% weight change before this was interpolated.
    const values = [140, 150, 160, 170];
    const a = weightedMedian(values, [1, 1, 1, 1]);
    const b = weightedMedian(values, [1, 1, 1.002, 1]);
    expect(Math.abs(a - b)).toBeLessThan(0.1);
  });

  it("ignores zero-weight entries", () => {
    expect(weightedMedian([1, 999, 2, 3], [1, 0, 1, 1])).toBeCloseTo(median([1, 2, 3]), 9);
  });

  it("does not require sorted input", () => {
    expect(weightedMedian([200, 100], [1, 9])).toBeLessThan(150);
  });

  it("throws on mismatched lengths, negative weights or an empty set", () => {
    expect(() => weightedMedian([1, 2], [1])).toThrow();
    expect(() => weightedMedian([1, 2], [1, -1])).toThrow();
    expect(() => weightedMedian([], [])).toThrow();
    expect(() => weightedMedian([1, 2], [0, 0])).toThrow();
  });
});

describe("percentileInterval", () => {
  it("returns the pair at the requested percentiles", () => {
    const values = Array.from({ length: 101 }, (_, i) => i);
    expect(percentileInterval(values, 0.25, 0.75)).toEqual([25, 75]);
    expect(percentileInterval(values, 0.1, 0.9)).toEqual([10, 90]);
  });

  it("nests p25–p75 inside p10–p90", () => {
    const values = [1, 4, 9, 16, 25, 36, 49, 64, 81, 100];
    const inner = percentileInterval(values, 0.25, 0.75)!;
    const outer = percentileInterval(values, 0.1, 0.9)!;
    expect(inner[0]).toBeGreaterThanOrEqual(outer[0]);
    expect(inner[1]).toBeLessThanOrEqual(outer[1]);
  });

  it("is null for an empty set rather than throwing", () => {
    expect(percentileInterval([], 0.25, 0.75)).toBeNull();
  });

  it("throws when lo is above hi", () => {
    expect(() => percentileInterval([1, 2, 3], 0.9, 0.1)).toThrow();
  });
});

describe("medianOrNull", () => {
  it("is null for an empty set and the median otherwise", () => {
    expect(medianOrNull([])).toBeNull();
    expect(medianOrNull([1, 2, 3])).toBe(2);
  });
});
