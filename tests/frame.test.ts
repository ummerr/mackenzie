/* The chart's frame, as arithmetic.
 *
 * These exist because of a real misreading. Switch the bag to total and the
 * longest club on the page went from `5i 195` to `6i 171`, which reads as "the
 * bag got shorter on total" — the opposite of what rollout does. Two separate
 * things caused it, and only one of them was a bug:
 *
 *   - the 5 Iron and 7 Iron drop out on total, because dropping their
 *     carry-copy shots takes them under the display threshold. That is correct
 *     and deliberate.
 *   - the frame refitted itself to whichever basis was showing, so the axis
 *     absorbed the extra distance instead of showing it. That is what
 *     `mergeDomains` fixes.
 *
 * Nothing here renders anything: `plotDomain` and `mergeDomains` are pure, and
 * the frame is the one part of this chart where being wrong is invisible rather
 * than obvious.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { drawableOf, mergeDomains, plotDomain, type ShotDot } from "../app/bag-chart";
import type { LedgerShot } from "../lib/ledger";
import { applyHeuristics, buildBag, plotPoint, type DistanceBasis } from "../lib/stats";

const shots: LedgerShot[] = applyHeuristics(
  JSON.parse(readFileSync(join(__dirname, "..", "data", "shots.json"), "utf8")),
);

function viewOf(basis: DistanceBasis) {
  const bag = buildBag(shots, undefined, basis);
  const drawn = new Set(drawableOf(bag).map((p) => p.club));
  const dots: ShotDot[] = shots
    .filter((s) => !s.isExcluded)
    .flatMap((s) => {
      const at = plotPoint(s, basis);
      return at && drawn.has(s.club) ? [{ club: s.club, ...at }] : [];
    });
  return { bag, dots };
}

const carry = viewOf("carry");
const total = viewOf("total");

describe("plotDomain", () => {
  it("covers every dot it draws, not just the cones", () => {
    const d = plotDomain(carry.bag, carry.dots)!;
    for (const dot of carry.dots) {
      expect(dot.distanceYd).toBeGreaterThanOrEqual(d.yLo);
      expect(dot.distanceYd).toBeLessThanOrEqual(d.yHi);
      expect(Math.abs(dot.offlineYd)).toBeLessThanOrEqual(d.xMag);
    }
  });

  it("never draws a frame narrower than the fairway it references", () => {
    expect(plotDomain(carry.bag, carry.dots)!.xMag).toBeGreaterThanOrEqual(15);
  });

  it("is null when nothing is drawable, rather than -Infinity", () => {
    expect(plotDomain([], [])).toBeNull();
    const allHeld = buildBag(shots, 9999, "carry");
    expect(plotDomain(allHeld, carry.dots)).toBeNull();
  });

  /* The frames really do differ, which is why sharing one is not a no-op. */
  it("fits each basis differently when left to itself", () => {
    const c = plotDomain(carry.bag, carry.dots)!;
    const t = plotDomain(total.bag, total.dots)!;
    expect(t.yHi).not.toBeCloseTo(c.yHi, 1);
    expect(t.yHi - t.yLo).toBeLessThan(c.yHi - c.yLo);
  });
});

describe("mergeDomains", () => {
  it("contains every basis it was merged from", () => {
    const c = plotDomain(carry.bag, carry.dots)!;
    const t = plotDomain(total.bag, total.dots)!;
    const m = mergeDomains([c, t])!;
    for (const d of [c, t]) {
      expect(m.yLo).toBeLessThanOrEqual(d.yLo);
      expect(m.yHi).toBeGreaterThanOrEqual(d.yHi);
      expect(m.xMag).toBeGreaterThanOrEqual(d.xMag);
    }
  });

  it("ignores a basis with nothing to draw instead of returning null", () => {
    const c = plotDomain(carry.bag, carry.dots)!;
    expect(mergeDomains([c, null])).toEqual(c);
    expect(mergeDomains([null, null])).toBeNull();
  });

  /* The misreading, guarded directly: in ONE shared frame, every club that is
   * drawn on both bases sits further from the tee on total. If this fails, the
   * chart is telling somebody their bag shrank when the ball rolled. */
  it("puts every shared club further downrange on total, in the shared frame", () => {
    const m = mergeDomains([
      plotDomain(carry.bag, carry.dots),
      plotDomain(total.bag, total.dots),
    ])!;
    // Position in the frame, 0 at the near edge and 1 at the far one. The
    // frame is fixed, so this is comparable across bases — which is the point.
    const at = (v: number) => (v - m.yLo) / (m.yHi - m.yLo);

    const shared = drawableOf(total.bag).filter((t) =>
      drawableOf(carry.bag).some((c) => c.club === t.club),
    );
    expect(shared.length).toBeGreaterThan(0);

    for (const t of shared) {
      const c = carry.bag.find((x) => x.club === t.club)!;
      expect(at(t.medianDistanceYd as number)).toBeGreaterThan(
        at(c.medianDistanceYd as number),
      );
    }
  });
});
