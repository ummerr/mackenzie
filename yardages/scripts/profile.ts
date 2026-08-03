/* the ledger + the course snapshot  ->  PROFILE.md
 *
 *   pnpm profile              rewrite PROFILE.md from the current data
 *   pnpm profile --dry-run    print it, write nothing
 *   pnpm profile --check      exit non-zero if the file is out of date
 *
 * The page at /profile and this file render the same object from lib/profile.ts.
 * The page is for reading; the file is for remembering. A profile that only
 * exists as a rendered page has no history — it silently reads differently in
 * October than it did in July and nothing records that it changed, which is the
 * one thing a *living* spec has to do.
 *
 * `--check` is here so a future CI step, or a session that forgets, is told the
 * committed spec no longer matches the data it claims to describe.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CourseHistory } from "../lib/course-history";
import type { LedgerSession, LedgerShot } from "../lib/ledger";
import { buildProfile, type GolferProfile } from "../lib/profile";
import { applyHeuristics, buildBag, detectGaps } from "../lib/stats";
import { buildTasks } from "../lib/tasks";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "PROFILE.md");

const dryRun = process.argv.includes("--dry-run");
const check = process.argv.includes("--check");

function load<T>(name: string): T {
  return JSON.parse(readFileSync(join(ROOT, "data", name), "utf8")) as T;
}

function render(p: GolferProfile): string {
  const out: string[] = [];

  out.push("# THE PLAYER");
  out.push("");
  out.push(
    "A living spec of one golfer, derived from both halves of this repo: the shot",
    "ledger in `data/`, and the course history the map keeps in the parent",
    "directory. **Nothing here is written by hand.** `pnpm profile` regenerates it,",
    "and the diff is the point — this file exists so that a change in the golfer is",
    "a commit rather than a page that quietly reads differently than it did.",
  );
  out.push("");
  out.push(
    "Every finding carries the numbers that put it there and the condition that",
    "takes it off. Hit the shots and the sentence retires itself.",
  );
  out.push("");

  out.push("## The spec");
  out.push("");
  out.push("| | |");
  out.push("|---|---|");
  for (const s of p.spec) {
    out.push(`| ${s.label} | **${s.value}**${s.note ? ` — ${s.note}` : ""} |`);
  }
  out.push("");

  out.push("## The read");
  out.push("");
  out.push(
    "Ranked by how much of the record is behind each line, never by how bad it",
    "sounds. Every comparison is internal — this club against that club, these",
    "courses against those — because a benchmark without a source is the one kind",
    "of claim this repo refuses to print.",
  );
  out.push("");
  p.findings.forEach((f, i) => {
    out.push(`### ${String(i + 1).padStart(2, "0")}. ${f.claim}`);
    out.push("");
    out.push(`- **why** — ${f.evidence}`);
    out.push(`- **gone when** — ${f.falsifiedBy}`);
    out.push(`- *${f.lens} · ${f.confidence} confidence*`);
    out.push("");
  });

  const roasts = p.findings.filter((f) => f.roast !== null);
  if (roasts.length > 0) {
    out.push("## The roast");
    out.push("");
    out.push(
      "The same findings, unsoftened. Each one restates its own evidence and nothing",
      "more — a roast that needs a fact you do not have is just an insult.",
    );
    out.push("");
    for (const f of roasts) {
      out.push(`> ${f.roast}`);
      out.push(">");
      out.push(`> — ${f.evidence}`);
      out.push("");
    }
  }

  out.push("## What the record cannot say");
  out.push("");
  out.push(
    "Gaps in the data, not gaps in the analysis. Listed so that silence is never",
    "mistaken for a finding.",
  );
  out.push("");
  for (const u of p.unknowns) {
    out.push(`### ${u.question}`);
    out.push("");
    out.push(`${u.why}`);
    out.push("");
    out.push(`**Needs:** ${u.needs}`);
    out.push("");
  }

  out.push("## Read from");
  out.push("");
  for (const s of p.sources) out.push(`- **${s.label}** — ${s.detail}`);
  out.push("");
  out.push(
    "Regenerate with `pnpm profile`. The course half comes from",
    "`data/course-history.json`, itself a snapshot — `pnpm ingest:courses`.",
  );
  out.push("");

  return out.join("\n");
}

function main(): number {
  const shots = applyHeuristics(load<LedgerShot[]>("shots.json"));
  const sessions = load<LedgerSession[]>("sessions.json");
  const profiles = buildBag(shots);
  const gaps = detectGaps(profiles);
  const tasks = buildTasks({ profiles, gaps, shots, sessions });

  let history: CourseHistory | null = null;
  try {
    history = load<CourseHistory>("course-history.json");
  } catch {
    console.warn(
      "no data/course-history.json — writing the range half only. " +
        "Run `pnpm ingest:courses` inside the mackenzie repo for the rest.",
    );
  }

  const profile = buildProfile({ shots, sessions, profiles, gaps, tasks, history });
  const next = render(profile);

  let prev = "";
  try {
    prev = readFileSync(OUT, "utf8");
  } catch {
    /* first run */
  }

  console.log(
    `${profile.findings.length} findings · ` +
      `${profile.findings.filter((f) => f.roast !== null).length} with a roast · ` +
      `${profile.unknowns.length} unknowns`,
  );

  if (check) {
    if (prev === next) {
      console.log("PROFILE.md is up to date");
      return 0;
    }
    console.error("PROFILE.md is out of date — run `pnpm profile` and commit the result");
    return 1;
  }

  if (dryRun) {
    console.log("");
    console.log(next);
    return 0;
  }

  if (prev === next) {
    console.log("PROFILE.md unchanged");
    return 0;
  }
  writeFileSync(OUT, next);
  console.log(`wrote PROFILE.md`);
  return 0;
}

process.exit(main());
