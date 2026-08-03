import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LedgerSession, LedgerShot } from "@/lib/ledger";
import { applyHeuristics } from "@/lib/stats";
import { ExclusionPicker } from "./picker";

/* A data-hygiene tool, not a view. Deliberately unstyled beyond what it takes
 * to be legible: this page exists so a bad shot can be excluded or a good one
 * rescued, and nothing else. */

export const metadata = { title: "Sessions — Yardages" };

function load<T>(name: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), "data", name), "utf8")) as T;
}

export default function Sessions() {
  const raw = load<LedgerShot[]>("shots.json");
  const shots = applyHeuristics(raw);
  const sessions = load<LedgerSession[]>("sessions.json");

  return (
    <div className="px-5 py-8 font-mono text-[12px]">
      <h1 className="text-[15px]">Sessions</h1>
      <p className="mt-2 max-w-3xl text-ink-2">
        Tick a shot to flip its exclusion, then paste the generated block into{" "}
        <code className="text-ink-0">data/exclusions.json</code> and re-run{" "}
        <code className="text-ink-0">pnpm ingest</code>. Nothing is written from
        the browser — the ledger is files, and a checkbox that pretended to
        persist would be lying.
      </p>
      <p className="mt-2 max-w-3xl text-ink-3">
        Reasons shown are what the heuristics decided:{" "}
        <code>warmup</code> is the first 3 shots with a club in a session,{" "}
        <code>mishit:smash</code> is more than 2 MAD below that club&rsquo;s median
        smash, <code>mishit:carry</code> is under 60% of its median carry, and{" "}
        <code>phantom</code> is a swing the monitor saw without tracking a ball.
      </p>

      <ExclusionPicker shots={shots} sessions={sessions} />
    </div>
  );
}
