/* the ledger  ->  public/ball-flight.html
 *
 *   pnpm flight              rewrite the report from the current data
 *   pnpm flight --dry-run    report what would change, write nothing
 *   pnpm flight --check      exit non-zero if the page is out of date
 *
 * Same contract as `pnpm run profile`: a derived artefact is generated and
 * committed, never hand-authored. A one-off HTML file with today's numbers
 * baked into it goes stale the first time a session lands, and — worse — goes
 * stale *silently*, which is the state this repo works hardest to avoid.
 *
 * The page is served as a static file rather than rendered as a route, so it
 * costs the app nothing and can be opened, mailed or printed on its own. The
 * trade is that its design tokens are a copy of `app/globals.css` rather than a
 * reference to it, and a copy can drift. Named here because that is the kind of
 * thing that is invisible six months later.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFlightReport } from "../lib/ball-flight";
import type { LedgerShot } from "../lib/ledger";
import { applyHeuristics } from "../lib/stats";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = join(ROOT, "scripts", "ball-flight.template.html");
const OUT = join(ROOT, "public", "ball-flight.html");

const dryRun = process.argv.includes("--dry-run");
const check = process.argv.includes("--check");

/** The one token the template carries. Kept distinctive so a partial write is
 *  a loud failure rather than a page that renders with a literal placeholder. */
const SLOT = "__DATA__";

function main(): number {
  const shots = applyHeuristics(
    JSON.parse(readFileSync(join(ROOT, "data", "shots.json"), "utf8")) as LedgerShot[],
  );
  const report = buildFlightReport(shots);

  if (report.n === 0) {
    console.error("no shot carries both launch direction and deviation angle; nothing to draw");
    return 1;
  }

  const template = readFileSync(TEMPLATE, "utf8");
  if (!template.includes(SLOT)) {
    console.error(`template has no ${SLOT} slot — refusing to write a page with no data`);
    return 1;
  }
  const next = template.replace(SLOT, JSON.stringify(report));
  if (next.includes(SLOT)) {
    console.error("more than one data slot in the template; refusing to write");
    return 1;
  }

  const summary =
    `${report.n} shots · ${report.straightPct}% straight · ${report.curvedPct}% curved · ` +
    `${report.rightOfCurves}% of curves bend right`;

  let current: string | null = null;
  try {
    current = readFileSync(OUT, "utf8");
  } catch {
    current = null;
  }

  if (check) {
    if (current === next) {
      console.log(`public/ball-flight.html is up to date — ${summary}`);
      return 0;
    }
    console.error(
      current === null
        ? "public/ball-flight.html is missing. Run `pnpm flight`."
        : "public/ball-flight.html no longer matches the ledger. Run `pnpm flight`.",
    );
    return 1;
  }

  if (dryRun) {
    console.log(`${summary}\n${current === next ? "no change" : "would rewrite public/ball-flight.html"}`);
    return 0;
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, next);
  console.log(`wrote public/ball-flight.html — ${summary}`);
  return 0;
}

process.exit(main());
