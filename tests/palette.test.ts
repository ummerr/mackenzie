import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/* The club ramp's rules live as prose in palette.ts and as hex in globals.css;
 * this file is what makes "validated, not eyeballed" true. It reads the
 * committed stylesheet — the real artifact, same contract as the ledger tests —
 * and holds every step to the ordinal gates: lightness strictly monotone with
 * adjacent steps ≥ 0.06, hue strictly monotone along the warm→cool path and
 * never inside the turf's green band, and the end nearest the turf above the
 * 2:1 floor against the fairway it sits on. */

const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");

function pair(name: string): { light: string; dark: string } {
  const m = css.match(new RegExp(`${name}:\\s*light-dark\\((#[0-9a-f]{6}),\\s*(#[0-9a-f]{6})\\)`));
  if (!m) throw new Error(`${name} is not a light-dark(hex, hex) token`);
  return { light: m[1], dark: m[2] };
}

const RAMP = Array.from({ length: 8 }, (_, i) => pair(`--club-${i}`));
const FAIRWAY = pair("--turf-fairway");

/* sRGB hex → OKLab, the space every rule is stated in. */
function oklab(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const lightness = (hex: string) => oklab(hex)[0];

const hue = (hex: string) => {
  const [, a, b] = oklab(hex);
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
};

/* WCAG relative luminance and contrast ratio. */
function contrast(fg: string, bg: string): number {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/* Hues unwrapped into one strictly falling run: the ramp descends from the
 * warm pole through 0/360 to the cool one, so each step reads modulo a wrap. */
function unwrap(hues: number[]): number[] {
  const out = [hues[0]];
  for (let i = 1; i < hues.length; i += 1) {
    let h = hues[i];
    while (h > out[i - 1]) h -= 360;
    out.push(h);
  }
  return out;
}

for (const theme of ["light", "dark"] as const) {
  describe(`the club ramp, ${theme}`, () => {
    const steps = RAMP.map((p) => p[theme]);
    const L = steps.map(lightness);

    it("descends in lightness, every step a legible ≥ 0.06 apart", () => {
      for (let i = 1; i < L.length; i += 1) {
        expect(L[i]).toBeLessThan(L[i - 1]);
        expect(L[i - 1] - L[i]).toBeGreaterThanOrEqual(0.06);
      }
    });

    it("runs one monotone hue path, warm pole to cool, never through green", () => {
      const H = unwrap(steps.map(hue));
      for (let i = 1; i < H.length; i += 1) {
        // A real hue step, not a wrap artifact: a one-hue ramp unwraps into
        // drops of ~0° or ~360°, and both are ruled out here. Two poles means
        // every step walks a bounded stretch of the path between them.
        const drop = H[i - 1] - H[i];
        expect(drop).toBeGreaterThan(5);
        expect(drop).toBeLessThan(45);
      }
      // The turf owns 90°–200°; a club that colour would read as scenery.
      for (const h of steps.map(hue)) {
        expect(h < 90 || h > 200).toBe(true);
      }
    });

    it("keeps the end nearest the turf above the 2:1 ordinal floor", () => {
      // The binding end flips with the theme: pale-on-pale in light,
      // deep-on-dark in dark. The other end is far clear by construction.
      const nearest = theme === "light" ? steps[0] : steps[7];
      expect(contrast(nearest, FAIRWAY[theme])).toBeGreaterThanOrEqual(2);
    });
  });
}
