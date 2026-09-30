/* External benchmarks — numbers about other golfers, admitted under one
 * contract (DECISIONS.md 2026-09-29): every entry carries a source URL, the
 * population it was measured on, and the provider's own definition of the
 * metric. The pages print the definition next to the record's own so a
 * Shot Scope "up-and-down" (any score) is never laid on a Grint "par save"
 * (par or better) as if they were the same number.
 *
 * `data/benchmarks.json` is hand-curated and validated by
 * `scripts/validate.mjs`; this module reads it and answers one question:
 * "what does the source say a golfer in band X does on metric Y?" Nothing
 * here computes a benchmark — a computed benchmark is a claim without a
 * source.
 */

export type BenchmarkBand =
  | "0"
  | "1-5"
  | "5"
  | "5-7"
  | "10"
  | "11-13"
  | "11-15"
  | "15"
  | "15+"
  | "70s"
  | "80s"
  | "all"
  | "am1-vs-am2"
  | "am2"
  | "mid-high";

export type BenchmarkConfidence = "high" | "medium" | "low";

export interface Benchmark {
  id: string;
  metric: string;
  band: BenchmarkBand;
  value: number;
  unit: string;
  /** The provider's definition — printed beside the record's own. */
  definition: string;
  population: string;
  /** URL. Empty is a validate error, never a rendered state. */
  source: string;
  sourceTitle: string;
  quote?: string;
  /** ISO date the page was read. */
  checked: string;
  verified: boolean;
  confidence: BenchmarkConfidence;
}

export interface BenchmarkFile {
  _README?: string;
  benchmarks: Benchmark[];
}

const BANDS: ReadonlySet<string> = new Set<BenchmarkBand>([
  "0",
  "1-5",
  "5",
  "5-7",
  "10",
  "11-13",
  "11-15",
  "15",
  "15+",
  "70s",
  "80s",
  "all",
  "am1-vs-am2",
  "am2",
  "mid-high",
]);

function isBenchmark(x: unknown): x is Benchmark {
  if (typeof x !== "object" || x === null) return false;
  const b = x as Record<string, unknown>;
  return (
    typeof b.id === "string" &&
    typeof b.metric === "string" &&
    typeof b.band === "string" &&
    BANDS.has(b.band) &&
    typeof b.value === "number" &&
    Number.isFinite(b.value) &&
    typeof b.unit === "string" &&
    typeof b.definition === "string" &&
    typeof b.population === "string" &&
    typeof b.source === "string" &&
    /^https?:\/\//.test(b.source) &&
    typeof b.sourceTitle === "string" &&
    typeof b.checked === "string" &&
    typeof b.verified === "boolean" &&
    (b.confidence === "high" || b.confidence === "medium" || b.confidence === "low")
  );
}

/** Read the file's shape. Throws only when the file is not an object at all;
 *  an entry that breaks the contract is dropped (validate reports it as an
 *  error — the page just does not get to print it). */
export function parseBenchmarks(raw: unknown): BenchmarkFile {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("benchmarks.json is not an object");
  }
  const r = raw as Record<string, unknown>;
  const list = Array.isArray(r.benchmarks) ? r.benchmarks : [];
  return {
    _README: typeof r._README === "string" ? r._README : undefined,
    benchmarks: list.filter(isBenchmark),
  };
}

/** The one lookup. Null when the file is absent or the source never
 *  measured that band — a rendered state, never a fallback to another band. */
export function bench(
  file: BenchmarkFile | null,
  metric: string,
  band: BenchmarkBand,
): Benchmark | null {
  if (!file) return null;
  return file.benchmarks.find((b) => b.metric === metric && b.band === band) ?? null;
}
