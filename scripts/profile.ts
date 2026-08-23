/* the ledger + the course record  ->  PROFILE.md
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
import { readBag } from "../lib/bag-file";
import {
  buildCourseHistory,
  type CourseHistory,
  type SourceCourses,
} from "../lib/course-history";
import {
  buildGarminShots,
  type GarminShots,
  type SourceGarminRounds,
} from "../lib/garmin-shots";
import type { LedgerSession, LedgerShot } from "../lib/ledger";
import {
  buildRoundHistory,
  type RoundHistory,
  type SourceRounds,
} from "../lib/round-history";
import { buildProfile, PROFILE_THRESHOLDS, type GolferProfile } from "../lib/profile";
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
    "ledger in `data/`, and the course history the map's pipeline builds.",
    "**Nothing here is written by hand.** `pnpm profile` regenerates it,",
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

  /* The same section the page renders — the two must not drift apart on the
   * one block that changes most often. Both numbers always, per the rule in
   * lib/yardages/club-profile.ts: recent answers "now", career answers "ever". */
  if (p.recentForm) {
    const form = p.recentForm;
    const num = (v: number | null) => (v === null ? "—" : v.toFixed(1));
    const pctOf = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(0)}%`);
    out.push("## Recent form");
    out.push("");
    out.push(
      `The last ${form.months} months (since ${form.cutoff}), measured from the newest`,
      `card (${form.asOf}) — never from today, so this file reads the same until the`,
      "record changes. Quick-entry echoes of a card already on file are not counted twice.",
    );
    out.push("");
    out.push("| Date | Course | Strokes | Putts |");
    out.push("|---|---|---|---|");
    for (const r of form.recentRounds.slice(-PROFILE_THRESHOLDS.recentRoundCount)) {
      // Grint course names can carry a literal "|" (layout | facility), which
      // would split the table cell.
      const course = (r.courseName ?? "—").replace(/\|/g, "\\|");
      out.push(`| ${r.date} | ${course} | ${r.strokes ?? "—"} | ${r.putts ?? "—"} |`);
    }
    out.push("");
    out.push("| | Recent | Career |");
    out.push("|---|---|---|");
    out.push(
      `| Scoring | **${num(form.scoring.recent)}** (${form.scoring.recentN} rounds) | ${num(form.scoring.career)} (${form.scoring.careerN} rounds) |`,
      `| Putts / round | **${num(form.putts.recent)}** (${form.putts.recentN} rounds) | ${num(form.putts.career)} (${form.putts.careerN} rounds) |`,
      `| Three-putt share | **${pctOf(form.threePutt.recent)}** (${form.threePutt.recentN} holes) | ${pctOf(form.threePutt.career)} (${form.threePutt.careerN} holes) |`,
      `| Fairways hit | **${pctOf(form.fairwayHit.recent)}** (${form.fairwayHit.recentN} holes) | ${pctOf(form.fairwayHit.career)} (${form.fairwayHit.careerN} holes) |`,
    );
    out.push("");
  }

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
    "`public/data/courses.json`, the map pipeline's artifact — `pnpm data:build`.",
  );
  out.push("");

  return out.join("\n");
}

function main(): number {
  const shots = applyHeuristics(load<LedgerShot[]>("shots.json"));
  const sessions = load<LedgerSession[]>("sessions.json");
  const profiles = buildBag(shots);
  const bag = readBag(join(ROOT, "data"));
  const gaps = detectGaps(profiles, undefined, bag);

  let history: CourseHistory | null = null;
  try {
    const raw = readFileSync(join(ROOT, "public", "data", "courses.json"), "utf8");
    history = buildCourseHistory(JSON.parse(raw) as SourceCourses);
  } catch {
    console.warn(
      "no public/data/courses.json — writing the range half only. " +
        "Run `pnpm data:build` for the rest.",
    );
  }

  let roundHistory: RoundHistory | null = null;
  try {
    roundHistory = buildRoundHistory(load<SourceRounds>("rounds.json"));
  } catch {
    console.warn(
      "no data/rounds.json — no round-by-round half. " +
        "Run `pnpm data:rounds` for it (needs a grint-export bundle in data/raw/).",
    );
  }

  let garminShots: GarminShots | null = null;
  try {
    garminShots = buildGarminShots(load<SourceGarminRounds>("garmin-rounds.json"));
  } catch {
    console.warn(
      "no data/garmin-rounds.json — no on-course shot half. " +
        "Run `pnpm data:garmin` for it (needs a garmin-export bundle in data/raw/).",
    );
  }

  const tasks = buildTasks({ profiles, gaps, shots, sessions, bag, roundHistory });
  const profile = buildProfile({
    shots,
    sessions,
    profiles,
    gaps,
    tasks,
    history,
    roundHistory,
    garminShots,
    bag,
  });
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
