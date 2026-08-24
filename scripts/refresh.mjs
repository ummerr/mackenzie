#!/usr/bin/env node
/**
 * One command after a capture: fold whatever is new in data/raw/ into the
 * artifacts, validate, and rewrite the derived surfaces.
 *
 *   pnpm refresh              run everything the raw directory calls for
 *   pnpm refresh --dry-run    print the plan, run nothing
 *
 * The capture stays manual and browser-side on purpose (the extensions hold
 * the user's own authenticated session — DECISIONS.md 2026-08-14/2026-08-21);
 * this is the whole downstream half. It shells the existing package scripts,
 * which carry their own gates and diff-stable outputs; it invents no step.
 *
 * Two things it will NEVER do: confirm a round link (data/round-links.json is
 * the one human-made join — this prints the proposed count and stops), and
 * edit a raw file. The report at the end says what ran, what changed, and
 * what still needs a person.
 */

import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = resolve(ROOT, "data", "raw");

/* ── the pure planner ─────────────────────────────────────────────────────── */

/**
 * Decide the ordered step list from what exists. Pure — the runner and the
 * tests both call this with plain values.
 *
 *   rawFiles        filenames in data/raw/
 *   roundsRawFile   rounds.json's rawFile field ("raw/a + raw/b"), or null
 *   garminRawFile   garmin-rounds.json's rawFile field, or null
 *   sessionCount    sessions in the R50 ledger
 *
 * Bundle filenames embed their capture date, so "newer than the artifact" is
 * a string comparison against the newest file the artifact's chain names —
 * older full bundles are legitimately absent and must not re-trigger.
 */
export function planRefresh({ rawFiles, roundsRawFile, garminRawFile, sessionCount }) {
  const newerThan = (files, chain) => {
    if (chain === null) return files;
    const named = chain
      .split("+")
      .map((s) => s.trim().replace(/^raw\//, ""))
      .filter(Boolean)
      .sort();
    const newest = named[named.length - 1] ?? "";
    return files.filter((f) => f > newest);
  };

  const csvs = rawFiles.filter((f) => /^DrivingRange-.*\.csv$/i.test(f)).sort();
  const grintNew = newerThan(
    rawFiles.filter((f) => /^grint-export-.*\.json$/.test(f)).sort(),
    roundsRawFile,
  );
  const garminNew = newerThan(
    rawFiles.filter((f) => /^garmin-export-.*\.json$/.test(f)).sort(),
    garminRawFile,
  );

  const steps = [];
  if (csvs.length > sessionCount) {
    steps.push({ cmd: "pnpm ingest", why: `${csvs.length} range CSVs, ${sessionCount} sessions in the ledger` });
  }
  if (grintNew.length > 0) {
    steps.push({ cmd: "pnpm data:inventory", why: `new bundle: ${grintNew.join(", ")}` });
    steps.push({ cmd: "pnpm data:rounds", why: "fold the bundle into rounds.json" });
    steps.push({
      cmd: "pnpm data:spine",
      why: "append any new courses to the spine",
      /* The map chain follows only if the spine actually appended — decided
       * at run time by whether git sees the spine files change. */
      then: {
        ifChanged: ["data/facilities.json", "data/layouts.json"],
        cmds: ["pnpm data:geocode", "pnpm data:osm", "pnpm data:holes", "pnpm data:build"],
        why: "the spine appended a course — rebuild the map artifacts",
      },
    });
  }
  if (garminNew.length > 0) {
    steps.push({ cmd: "pnpm data:garmin:inventory", why: `new bundle: ${garminNew.join(", ")}` });
    steps.push({ cmd: "pnpm data:garmin", why: "fold the bundle into garmin-rounds.json" });
  }
  // Always: links re-propose (diff-stable, never confirms), validate, derive.
  steps.push({ cmd: "pnpm data:links", why: "re-propose round links (a human confirms)" });
  steps.push({ cmd: "pnpm data:validate", why: "the invariants" });
  steps.push({ cmd: "pnpm run profile", why: "rewrite PROFILE.md from the new record" });
  steps.push({ cmd: "pnpm flight", why: "rewrite the ball-flight page" });
  return steps;
}

/* ── the runner ───────────────────────────────────────────────────────────── */

function artifactRawFile(name) {
  try {
    return JSON.parse(readFileSync(resolve(ROOT, "data", name), "utf8")).rawFile ?? null;
  } catch {
    return null;
  }
}

function gitChanged(paths) {
  const out = execSync(`git status --porcelain -- ${paths.join(" ")}`, {
    cwd: ROOT,
    encoding: "utf8",
  });
  return out.trim().length > 0;
}

function run(cmd) {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: "inherit" });
}

function main() {
  const dryRun = process.argv.includes("--dry-run");

  let rawFiles = [];
  try {
    rawFiles = readdirSync(RAW);
  } catch {
    console.error(`No ${RAW} directory — nothing captured yet.`);
    return 1;
  }
  let sessionCount = 0;
  try {
    sessionCount = JSON.parse(readFileSync(resolve(ROOT, "data", "sessions.json"), "utf8")).length;
  } catch {
    /* no ledger yet — the CSV count alone will call for pnpm ingest */
  }

  const steps = planRefresh({
    rawFiles,
    roundsRawFile: artifactRawFile("rounds.json"),
    garminRawFile: artifactRawFile("garmin-rounds.json"),
    sessionCount,
  });

  console.log("The plan:");
  for (const s of steps) {
    console.log(`  ${s.cmd}  — ${s.why}`);
    if (s.then) console.log(`    then, only if ${s.then.ifChanged.join("/")} changed: ${s.then.cmds.join(" → ")}`);
  }
  if (dryRun) return 0;

  for (const s of steps) {
    run(s.cmd);
    if (s.then && gitChanged(s.then.ifChanged)) {
      console.log(`\n${s.then.why}`);
      for (const c of s.then.cmds) run(c);
    }
  }

  // ---- report -------------------------------------------------------------
  console.log("\n── refresh report ─────────────────────────────────────────");
  const changed = execSync("git status --porcelain -- data/ public/ PROFILE.md", {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  console.log(changed ? `changed:\n${changed}` : "nothing changed — the record was already current");

  let proposed = 0;
  try {
    proposed = JSON.parse(
      readFileSync(resolve(ROOT, "data", "round-links.json"), "utf8"),
    ).links.filter((l) => l.status === "proposed").length;
  } catch {
    /* absent is fine */
  }
  if (proposed > 0) {
    console.log(
      `\nNEEDS A HUMAN: ${proposed} proposed round link${proposed === 1 ? "" : "s"} in ` +
        "data/round-links.json — confirm (or reject) and re-run `pnpm run profile`.",
    );
  }
  console.log("\nDone. Review the diff, then commit.");
  return 0;
}

// Importable for tests (planRefresh); runs only as a CLI.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
