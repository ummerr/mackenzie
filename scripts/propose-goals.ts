/* the leaks + the open tasks  ->  a proposed week of goals, on stdout
 *
 *   pnpm goals:propose        print a paste-ready week for data/goals.json
 *
 * The engine proposes; the human commits — the same pattern as
 * data/round-links.json. Nothing here writes anything: the output is a JSON
 * week to paste (and edit) into data/goals.json's `weeks` array. Each
 * proposal is the top leak and the top open practice task, translated into
 * the metric that measures them and the target their own retire line names
 * (LEAK_TARGETS / the task's doneWhen), so a committed goal retires on the
 * same condition the leak does.
 *
 * The proposed weekOf is today's date — the one wall-clock read in this
 * repo's scripts, and a deliberate one: a proposal is ephemeral stdout for a
 * human deciding what THIS week is; nothing rendered or committed derives
 * from it until the human pastes it, at which point it is an assertion like
 * any other in the file.
 */

import { proposalForLeak, proposalForTask, type GoalProposal } from "../lib/goals";
import { buildSiteData } from "../lib/site-data";
import { WEDGE_MATRIX_THRESHOLDS } from "../lib/wedge-matrix";

function main(): number {
  const d = buildSiteData();
  const today = new Date().toISOString().slice(0, 10);

  const proposals: GoalProposal[] = [];
  const seen = new Set<string>();
  const push = (p: GoalProposal | null) => {
    if (p === null) return;
    const key = `${p.metricId}:${p.club ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    proposals.push(p);
  };

  const measuredCells = d.wedgeMatrix.cells.filter(
    (c) => c.source === "blocks" && c.active >= WEDGE_MATRIX_THRESHOLDS.minShotsPerCell,
  ).length;
  const topLeak = d.leaks[0] ?? null;
  if (topLeak) push(proposalForLeak(topLeak));
  for (const t of d.tasks) {
    if (proposals.length >= 2) break;
    push(proposalForTask(t, measuredCells));
  }

  if (proposals.length === 0) {
    console.log("Nothing to propose — no leaks and no mappable open tasks.");
    return 0;
  }

  const week = {
    weekOf: today,
    goals: proposals.map((p, i) => {
      const { why, ...goal } = p;
      return { id: `${today}-${i + 1}`, ...goal, note: why };
    }),
  };

  console.log("Proposed week — edit freely, then append to data/goals.json `weeks`:");
  console.log("");
  console.log(JSON.stringify(week, null, 2));
  console.log("");
  console.log(
    "The proposal is the engine's read of the top leak and the top open task;",
  );
  console.log("committing it is yours. Progress renders on the front page and in PROFILE.md.");
  return 0;
}

// Importable for tests (the proposal mappings); runs only as a CLI.
if (process.argv[1] && process.argv[1].endsWith("propose-goals.ts")) {
  process.exit(main());
}
