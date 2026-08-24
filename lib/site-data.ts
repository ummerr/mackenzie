/* The one composition of the repo's readers and builders.
 *
 * Four pages and one script used to repeat the same preamble — read the wedge
 * blocks, classify the ledger, build the bag, detect the gaps, load the two
 * round records, derive the tasks and the leaks — and five copies of a
 * pipeline is four chances for one of them to quietly diverge. The order
 * matters (blocks are an input to classification, the carry-basis bag is an
 * input to the wedge matrix) and lives here once.
 *
 * This composes; it does not compute. Every function called here is the same
 * pure, tested builder the pages always used. The course-history artifact is
 * deliberately not part of this object — only the profile builder wants the
 * map, and its callers pass `history: loadHistory()` themselves.
 */

import { join } from "node:path";
import { readBag, readWedgeBlocks } from "./bag-file";
import type { BagSpec } from "./clubs";
import type { GarminShots } from "./garmin-shots";
import { approachBands } from "./approach";
import { buildLeaks, type Leak } from "./leaks";
import type { LedgerSession, LedgerShot } from "./ledger";
import { loadGarmin, loadJson, loadRounds } from "./load";
import { PROFILE_THRESHOLDS } from "./profile";
import type { RoundHistory } from "./round-history";
import { applyHeuristics, buildBag, detectGaps, type ClubProfile, type Gap } from "./stats";
import { buildTasks, type Task } from "./tasks";
import { buildWedgeMatrix, type WedgeBlock, type WedgeMatrix } from "./wedge-matrix";

export interface SiteData {
  /** The hand-labeled partial-wedge blocks — read first, because a labeled
   *  shot leaves the full-swing pipeline entirely. */
  blocks: readonly WedgeBlock[];
  /** The R50 ledger after classification. The one artifact a checkout must
   *  have — `loadJson` throws without it. */
  shots: LedgerShot[];
  sessions: LedgerSession[];
  /** The carry-basis bag. A page that wants another basis builds it itself. */
  profiles: ClubProfile[];
  /** The clubs owned, hand-asserted — null when data/bag.json is absent. */
  bag: BagSpec | null;
  gaps: Gap[];
  roundHistory: RoundHistory | null;
  garminShots: GarminShots | null;
  wedgeMatrix: WedgeMatrix;
  tasks: Task[];
  leaks: Leak[];
}

export function buildSiteData(): SiteData {
  const blocks = readWedgeBlocks(join(process.cwd(), "data"))?.blocks ?? [];
  const shots = applyHeuristics(loadJson<LedgerShot[]>("shots.json"), undefined, blocks);
  const sessions = loadJson<LedgerSession[]>("sessions.json");
  const profiles = buildBag(shots);
  const bag = readBag(join(process.cwd(), "data"));
  const gaps = detectGaps(profiles, undefined, bag);
  const roundHistory = loadRounds();
  const garminShots = loadGarmin();
  const wedgeMatrix = buildWedgeMatrix(shots, blocks, profiles);
  const tasks = buildTasks({
    profiles,
    gaps,
    shots,
    sessions,
    bag,
    roundHistory,
    garminShots,
    wedgeMatrix,
  });
  const leaks = buildLeaks({
    roundHistory,
    garminShots,
    profiles,
    tasks,
    recentMonths: PROFILE_THRESHOLDS.recentMonths,
    approach: approachBands(garminShots),
  });
  return {
    blocks,
    shots,
    sessions,
    profiles,
    bag,
    gaps,
    roundHistory,
    garminShots,
    wedgeMatrix,
    tasks,
    leaks,
  };
}
