/* Robust statistics. Pure, total, independently testable.
 *
 * Percentile-based throughout. A range session's carry distribution is not
 * normal — it has a long left tail, because chunks and thins go short and
 * nothing goes forty yards long — so anything derived from a mean and a
 * standard deviation describes a distribution this data does not have.
 *
 * `lib/stats.ts` re-exports quantile/median/mad from here rather than keeping
 * a second implementation.
 */

/** Linear-interpolated quantile. Input need not be sorted, and is not mutated. */
export function quantile(values: number[], p: number): number {
  if (values.length === 0) throw new Error("quantile of empty set");
  if (p < 0 || p > 1) throw new Error(`quantile p out of range: ${p}`);
  const s = [...values].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
}

export const median = (values: number[]): number => quantile(values, 0.5);

/**
 * Median absolute deviation, scaled to be comparable with a standard deviation
 * on normal data (×1.4826). Used instead of SD because the thing being detected
 * — the mishit — is exactly the outlier that inflates SD and then hides inside
 * the threshold its own presence widened.
 */
export function mad(values: number[]): number {
  if (values.length === 0) throw new Error("mad of empty set");
  const m = median(values);
  return 1.4826 * median(values.map((v) => Math.abs(v - m)));
}

/**
 * Weighted median, linearly interpolated.
 *
 * Each observation is placed at the midpoint of the weight it occupies —
 * `p_k = (S_k − w_k/2) / W` for cumulative weight `S_k` — and the answer is
 * read off that grid at p = 0.5.
 *
 * Interpolating rather than selecting matters for two reasons:
 *
 *   1. Equal weights reproduce `median` EXACTLY, including the even-count
 *      midpoint. Without that the weighted and unweighted numbers in a club
 *      profile are not comparable, and the difference between them cannot be
 *      read as "this is what recency did".
 *   2. It is continuous in the weights. A plain selection weighted median
 *      jumps to the next observation when a weight shifts by a hair — the six
 *      iron in this ledger moved 3 yards on a 0.2% weight difference, which
 *      would have been read as a recency effect and is nothing of the kind.
 *
 * Weights must be finite and non-negative; zero-weight entries drop out.
 */
export function weightedMedian(values: number[], weights: number[]): number {
  if (values.length === 0) throw new Error("weightedMedian of empty set");
  if (values.length !== weights.length) {
    throw new Error(`weightedMedian: ${values.length} values but ${weights.length} weights`);
  }
  if (weights.some((w) => w < 0 || !Number.isFinite(w))) {
    throw new Error("weightedMedian: weights must be finite and non-negative");
  }

  const pairs = values
    .map((v, i) => ({ v, w: weights[i] }))
    .filter((p) => p.w > 0)
    .sort((a, b) => a.v - b.v);

  if (pairs.length === 0) throw new Error("weightedMedian: every weight is zero");
  if (pairs.length === 1) return pairs[0].v;

  const total = pairs.reduce((sum, p) => sum + p.w, 0);

  // Plotting position of each observation: the middle of its own weight.
  const positions: number[] = [];
  let cumulative = 0;
  for (const p of pairs) {
    cumulative += p.w;
    positions.push((cumulative - p.w / 2) / total);
  }

  // Outside the grid at either end, the nearest observation is the answer.
  if (0.5 <= positions[0]) return pairs[0].v;
  if (0.5 >= positions[positions.length - 1]) return pairs[pairs.length - 1].v;

  for (let i = 0; i < positions.length - 1; i += 1) {
    const [lo, hi] = [positions[i], positions[i + 1]];
    if (0.5 >= lo && 0.5 <= hi) {
      if (hi === lo) return pairs[i].v;
      return pairs[i].v + ((pairs[i + 1].v - pairs[i].v) * (0.5 - lo)) / (hi - lo);
    }
  }

  return pairs[pairs.length - 1].v;
}

/** [p_lo, p_hi] as a pair. Null for an empty set rather than a thrown error. */
export function percentileInterval(
  values: number[],
  lo: number,
  hi: number,
): [number, number] | null {
  if (values.length === 0) return null;
  if (lo > hi) throw new Error(`percentileInterval: lo ${lo} above hi ${hi}`);
  return [quantile(values, lo), quantile(values, hi)];
}

/** Median, or null for an empty set. The shape every profile field wants. */
export const medianOrNull = (values: number[]): number | null =>
  values.length === 0 ? null : median(values);

/**
 * How many MADs below the median a value sits. Positive means below.
 *
 * Null when the MAD is zero — a club whose smash never varies has no scale to
 * measure deviation against, and dividing by it would make every value that is
 * not exactly the median infinitely deviant.
 */
export function madsBelow(value: number, values: number[]): number | null {
  if (values.length === 0) return null;
  const d = mad(values);
  if (d <= 0) return null;
  return (median(values) - value) / d;
}
