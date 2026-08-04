/* data/bag.json, off the disk.
 *
 * The parsing lives in lib/clubs.ts and is pure; this is the four lines that
 * are not, kept in one place rather than copied into the three pages and the
 * one script that need the bag. It takes the data directory as an argument
 * because Next resolves from `process.cwd()` and the scripts resolve from their
 * own location, and a module that guessed would work in exactly one of them.
 *
 * A missing file is a state, not a crash — the same contract
 * `app/profile/page.tsx` already keeps for the course snapshot. Every bag
 * feature downstream takes `BagSpec | null` and falls back to what the ledger
 * alone can say.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBag, type BagSpec } from "./clubs";

export function readBag(dataDir: string): BagSpec | null {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(dataDir, "bag.json"), "utf8"));
  } catch {
    return null;
  }

  const bag = parseBag(raw);

  /* A key naming no club in BAG_ORDER is a typo, and a typo here silently
   * removes a club from the bag — which is the one thing this file exists to
   * make impossible. Same treatment an orphaned exclusions override gets. */
  if (bag.orphans.length > 0) {
    console.warn(
      `bag.json: ${bag.orphans.length} club(s) match nothing in BAG_ORDER: ${bag.orphans.join(", ")}`,
    );
  }

  return bag;
}
