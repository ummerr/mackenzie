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
import { GARMIN_THRESHOLDS } from "../lib/garmin-shots";
import { loadHistory } from "../lib/load";
import { buildProfile, PROFILE_THRESHOLDS, type GolferProfile } from "../lib/profile";
import { buildSiteData } from "../lib/site-data";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "PROFILE.md");

const dryRun = process.argv.includes("--dry-run");
const check = process.argv.includes("--check");

function render(p: GolferProfile): string {
  const out: string[] = [];

  out.push("# THE PLAYER");
  out.push("");
  out.push(
    "A living spec of one golfer, derived from every record this repo keeps: a",
    "launch-monitor ledger, a watch that hears the course, five seasons of",
    "scorecards, and a map of everywhere they happened.",
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
  for (const g of p.spec) {
    out.push(`### ${g.label} — ${g.device}`);
    out.push("");
    if (g.missing) {
      out.push(`No artifact on this checkout — run \`${g.missing}\`.`);
      out.push("");
      continue;
    }
    out.push("| | |");
    out.push("|---|---|");
    for (const s of g.lines) {
      out.push(`| ${s.label} | **${s.value}**${s.note ? ` — ${s.note}` : ""} |`);
    }
    out.push("");
  }

  /* The committed week, measured in record time — the goals file asserts
   * intent, the record answers. Rendered before the leaks because it is the
   * week's answer to them. Absent goals are simply absent: intent is
   * optional, and an empty section would imply it isn't. */
  if (p.goals && p.goals.latest) {
    const wk = p.goals.latest;
    const fmt = (v: number | null, unit: string) =>
      v === null ? "—" : `${Number.isInteger(v) ? v : v.toFixed(1)}${unit === "%" ? "%" : ` ${unit}`}`;
    out.push("## This week");
    out.push("");
    out.push(
      `The week of ${wk.weekOf}, measured against the newest capture` +
        `${p.goals.asOf ? ` (${p.goals.asOf})` : ""} — record time, not wall time:`,
      "a goal is open until the record outruns its week, then achieved or missed",
      "by what the record says. The engine proposes (`pnpm goals:propose`);",
      "data/goals.json is the human's commit.",
    );
    out.push("");
    for (const g of wk.goals) {
      const arrow = g.direction === "up" ? "→" : "→ under";
      out.push(
        `- **${g.status}** — ${g.label}: ${fmt(g.value, g.unit)} ${arrow} ${fmt(g.goal.target, g.unit)}` +
          (g.sample ? ` (${g.sample.n} ${g.sample.unit})` : "") +
          (g.goal.note ? ` — ${g.goal.note}` : "") +
          (g.orphaned ? ` — ⚠ ${g.orphaned}` : ""),
      );
    }
    const past = p.goals.weeks.slice(0, -1);
    if (past.length > 0) {
      out.push("");
      out.push("Past weeks: " +
        past
          .map((w) => {
            const done = w.goals.filter((g) => g.status === "achieved").length;
            return `${w.weekOf} (${done}/${w.goals.length} achieved)`;
          })
          .join(" · "));
    }
    out.push("");
  }

  if (p.leaks.length > 0) {
    out.push("## The leaks");
    out.push("");
    out.push(
      "Where the strokes go, ranked by what each leak costs: leaks the record can",
      "price come first, ranked in strokes; the ones whose cost is unknown by",
      "construction follow, ranked by how much of the record says they exist.",
      "Each move is the open practice task that addresses it, joined on render.",
    );
    out.push("");
    p.leaks.forEach((l, i) => {
      out.push(`### ${String(i + 1).padStart(2, "0")}. ${l.title}`);
      out.push("");
      out.push(`- **fact** — ${l.fact}`);
      out.push(`- **cost** — ${l.cost}`);
      out.push(`- **move** — ${l.move}`);
      out.push(`- **retired when** — ${l.retiredWhen}`);
      out.push(`- *${l.source}*`);
      out.push("");
    });
  }

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

  /* The on-course record, same object the page's "On the course" section
   * renders. Gate-independent by design: findings wait for minShotRounds, the
   * record does not — it just prints its sample sizes. */
  if (p.onCourse) {
    const oc = p.onCourse;
    const s = oc.split;
    const share = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");
    out.push("## On the course");
    out.push("");
    out.push(
      `What AutoShot heard over ${oc.rounds} round${oc.rounds === 1 ? "" : "s"} (as of ${oc.asOf};`,
      `the record's other ${oc.simRounds} rounds are simulator rounds with nothing to hear).`,
      `Findings from this data switch on at ${GARMIN_THRESHOLDS.minShotRounds} shot-bearing rounds —`,
      `until then this is the record, not a claim. The watch caught ${s.shots} of the`,
      `${s.strokes} strokes the scorecards count (${share(s.shots, s.strokes)}); putts and some`,
      "chips never become shots, so every share below is a share of recorded shots.",
    );
    out.push("");
    out.push("| | Shots | Of recorded |");
    out.push("|---|---|---|");
    out.push(
      `| Tee | ${s.tee} | ${share(s.tee, s.shots)} |`,
      `| Approach | ${s.approach} | ${share(s.approach, s.shots)} |`,
      `| Short game | ${s.shortGame} | ${share(s.shortGame, s.shots)} |`,
      `| Putts | ${s.putts} | ${share(s.putts, s.shots)} |`,
      `| Unclassified | ${s.other} | ${share(s.other, s.shots)} |`,
    );
    out.push("");
    out.push(
      `Lies (non-tee, Garmin's own strings): ${oc.lies.map((l) => `${l.lie} ${l.shots}`).join(" · ")}.`,
    );
    if (oc.clubs.length > 0) {
      out.push("");
      out.push(
        `Clubs the course has measured — clear full swings only (no chips, no punch-outs)`,
        `at ${GARMIN_THRESHOLDS.minShotsPerClub}+ shots; course yards are point-to-point, where the ball`,
        "came to rest, so nearer a range total than a carry:",
      );
      out.push("");
      out.push("| Club | On course | On the range |");
      out.push("|---|---|---|");
      for (const c of oc.clubs) {
        out.push(
          `| ${c.club} | **${c.medianYd.toFixed(0)} yd** (${c.shots} swings) | ` +
            `${c.rangeYd !== null ? `${c.rangeYd.toFixed(0)} yd` : "unmeasured — this is the club's first number"} |`,
        );
      }
    }
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
  /* The same composition every page reads — scripts and pages must not build
   * the golfer two different ways. `pnpm profile` runs with cwd at the repo
   * root (pnpm guarantees it), which is what the shared readers resolve from. */
  const d = buildSiteData();
  const history = loadHistory();

  if (history === null) {
    console.warn(
      "no public/data/courses.json — writing the range half only. " +
        "Run `pnpm data:build` for the rest.",
    );
  }
  if (d.roundHistory === null) {
    console.warn(
      "no data/rounds.json — no round-by-round half. " +
        "Run `pnpm data:rounds` for it (needs a grint-export bundle in data/raw/).",
    );
  }
  if (d.garminShots === null) {
    console.warn(
      "no data/garmin-rounds.json — no on-course shot half. " +
        "Run `pnpm data:garmin` for it (needs a garmin-export bundle in data/raw/).",
    );
  }

  const profile = buildProfile({
    shots: d.shots,
    sessions: d.sessions,
    profiles: d.profiles,
    gaps: d.gaps,
    tasks: d.tasks,
    history,
    roundHistory: d.roundHistory,
    garminShots: d.garminShots,
    bag: d.bag,
    wedgeMatrix: d.wedgeMatrix,
    goals: d.goals,
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
