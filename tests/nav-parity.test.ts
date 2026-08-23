import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SECTIONS } from "../app/site-nav";

/* The courses page is zero-build on purpose, so its masthead is a
 * hand-replicated copy of app/site-nav.tsx — and a hand-kept copy drifts:
 * it once shipped without the Diary link at all. This test is the guard:
 * every section, in order, in both of the static page's nav blocks. */

const html = readFileSync(join(process.cwd(), "public", "courses", "index.html"), "utf8");

function linksOf(navClass: string): { href: string; label: string }[] {
  const nav = html.match(new RegExp(`<nav class="${navClass}"[^>]*>([\\s\\S]*?)</nav>`));
  if (!nav) return [];
  return [...nav[1].matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => ({
    href: m[1],
    label: m[2],
  }));
}

describe("the courses page's hand-replicated header", () => {
  for (const navClass of ["site-nav", "site-tabs"]) {
    it(`${navClass} carries every section, in nav order`, () => {
      expect(linksOf(navClass)).toEqual(SECTIONS.map((s) => ({ href: s.href, label: s.label })));
    });
  }

  it("marks Courses as the current page in both blocks", () => {
    const current = [...html.matchAll(/<a href="\/courses" aria-current="page">/g)];
    expect(current.length).toBe(2);
  });
});
