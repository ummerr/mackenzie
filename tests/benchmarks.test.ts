import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bench, parseBenchmarks, type BenchmarkFile } from "../lib/benchmarks";

/* The benchmark contract: a number about other golfers is printable only
 * with a source URL, the population it was measured on, and the provider's
 * own definition. The committed file must satisfy it in full, and the
 * reader must never invent a band. */

const real = (): BenchmarkFile =>
  parseBenchmarks(JSON.parse(readFileSync("data/benchmarks.json", "utf8")));

describe("data/benchmarks.json", () => {
  it("every entry carries source, population and definition", () => {
    const raw = JSON.parse(readFileSync("data/benchmarks.json", "utf8"));
    const file = parseBenchmarks(raw);
    // The parser drops malformed entries; the committed file has none.
    expect(file.benchmarks.length).toBe(raw.benchmarks.length);
    for (const b of file.benchmarks) {
      expect(b.source).toMatch(/^https?:\/\//);
      expect(b.population.length).toBeGreaterThan(0);
      expect(b.definition.length).toBeGreaterThan(0);
      expect(b.verified).toBe(true);
    }
  });

  it("has unique ids", () => {
    const ids = real().benchmarks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves the numbers the plan prices with", () => {
    const f = real();
    expect(bench(f, "gir-per-round", "5-7")?.value).toBe(7.6);
    expect(bench(f, "up-and-down-pct", "5")?.value).toBe(47);
    expect(bench(f, "three-putt-pct", "5")?.value).toBe(6);
    expect(bench(f, "troublesome-tees-per-round", "70s")?.value).toBe(2);
    expect(bench(f, "doubles-per-round", "5")?.value).toBe(1.44);
  });
});

describe("parseBenchmarks / bench", () => {
  it("drops an entry without a URL source and never falls back to another band", () => {
    const f = parseBenchmarks({
      benchmarks: [
        {
          id: "a",
          metric: "gir-per-round",
          band: "5",
          value: 7,
          unit: "x",
          definition: "d",
          population: "p",
          source: "not a url",
          sourceTitle: "t",
          checked: "2026-09-29",
          verified: true,
          confidence: "medium",
        },
        {
          id: "b",
          metric: "gir-per-round",
          band: "15",
          value: 4,
          unit: "x",
          definition: "d",
          population: "p",
          source: "https://example.com",
          sourceTitle: "t",
          checked: "2026-09-29",
          verified: false,
          confidence: "low",
        },
      ],
    });
    expect(f.benchmarks.map((b) => b.id)).toEqual(["b"]);
    expect(bench(f, "gir-per-round", "15")?.value).toBe(4);
    expect(bench(f, "gir-per-round", "5")).toBeNull();
    expect(bench(null, "gir-per-round", "15")).toBeNull();
  });

  it("throws only when the file is not an object", () => {
    expect(() => parseBenchmarks(null)).toThrow();
    expect(parseBenchmarks({}).benchmarks).toEqual([]);
  });
});
