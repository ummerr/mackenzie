/* Before and after, printed to stdout. `pnpm compare`.
 *
 * The point of this script is to be checkable against sessions you actually
 * remember, before any UI is built on top of the new numbers. It writes
 * nothing and touches no source data.
 *
 * The "before" side is a FROZEN COPY of the heuristics as they stood before
 * this run — warmup 3, smash 2 MAD, carry floor 0.60, sample gate 5, no
 * recency weighting, no partial detection. It lives here rather than in lib/
 * on purpose: keeping the superseded implementation in the library so a script
 * can call it is how dead code acquires a reason to exist forever.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LedgerShot } from "../lib/ledger";
import { classifyShots, type ShotReviewStatus } from "../lib/yardages/classify-shot";
import { buildClubProfiles } from "../lib/yardages/club-profile";
import { mad, median } from "../lib/yardages/robust-stats";
import { bagRank } from "../lib/stats";
import { REVIEW_THRESHOLDS } from "../lib/yardages/thresholds";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const shots: LedgerShot[] = JSON.parse(
  readFileSync(join(ROOT, "data", "shots.json"), "utf8"),
);

// ── the frozen "before" implementation ──────────────────────────────────────

type LegacyStatus = "included" | "warmup" | "mishit:smash" | "mishit:carry" | "phantom" | "manual";

const LEGACY = { warmupShots: 3, smashMads: 2, carryFloorFraction: 0.6, minSample: 5 };

function legacyClassify(input: LedgerShot[]): Map<string, LegacyStatus> {
  const key = (s: LedgerShot) => `${s.sessionId}#${s.shotTimestamp}`;
  const status = new Map<string, LegacyStatus>();
  const excluded = new Set<string>();

  for (const s of input) {
    if (s.isExcluded) {
      const phantom = s.exclusionReason?.startsWith("phantom") ?? false;
      status.set(key(s), phantom ? "phantom" : "manual");
      excluded.add(key(s));
    } else {
      status.set(key(s), "included");
    }
  }

  const seen = new Map<string, number>();
  for (const s of [...input].sort(
    (a, b) => a.sessionId.localeCompare(b.sessionId) || a.shotIndex - b.shotIndex,
  )) {
    if (excluded.has(key(s))) continue;
    const k = `${s.sessionId}#${s.club}`;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    if (n <= LEGACY.warmupShots) {
      status.set(key(s), "warmup");
      excluded.add(key(s));
    }
  }

  const carriesByClub = new Map<string, number[]>();
  const smashByClub = new Map<string, number[]>();
  for (const s of input) {
    if (excluded.has(key(s))) continue;
    if (s.carryYd !== null) carriesByClub.set(s.club, [...(carriesByClub.get(s.club) ?? []), s.carryYd]);
    if (s.smashFactor !== null)
      smashByClub.set(s.club, [...(smashByClub.get(s.club) ?? []), s.smashFactor]);
  }

  for (const s of input) {
    if (excluded.has(key(s))) continue;
    const smashes = smashByClub.get(s.club);
    if (s.smashFactor !== null && smashes && smashes.length >= LEGACY.minSample) {
      const d = mad(smashes);
      if (d > 0 && s.smashFactor < median(smashes) - LEGACY.smashMads * d) {
        status.set(key(s), "mishit:smash");
        excluded.add(key(s));
        continue;
      }
    }
    const carries = carriesByClub.get(s.club);
    if (s.carryYd !== null && carries && carries.length >= LEGACY.minSample) {
      if (s.carryYd < median(carries) * LEGACY.carryFloorFraction) {
        status.set(key(s), "mishit:carry");
        excluded.add(key(s));
      }
    }
  }

  return status;
}

// ── formatting ──────────────────────────────────────────────────────────────

const NA = "n/a";
const pad = (s: string, n: number) => s.padEnd(n);
const rpad = (s: string, n: number) => s.padStart(n);
const num = (v: number | null, d = 0) => (v === null ? NA : v.toFixed(d));

function rule(width: number) {
  console.log("  " + "─".repeat(width));
}

// ── run both ────────────────────────────────────────────────────────────────

const legacy = legacyClassify(shots);
const { shots: classified } = classifyShots(shots);
const profiles = buildClubProfiles(classified);

const shotKey = (s: LedgerShot) => `${s.sessionId}#${s.shotTimestamp}`;
const byKey = new Map(classified.map((s) => [shotKey(s), s]));

/* Legacy stock carry: unweighted median of everything it kept, no rounding
 * difference introduced — rounded here the same way the new profile rounds. */
function legacyStock(club: string): { carry: number | null; included: number } {
  const kept = shots.filter(
    (s) => s.club === club && legacy.get(shotKey(s)) === "included" && s.carryYd !== null,
  );
  const all = shots.filter((s) => s.club === club && legacy.get(shotKey(s)) === "included");
  return {
    carry: kept.length === 0 ? null : Math.round(median(kept.map((s) => s.carryYd as number))),
    included: all.length,
  };
}

console.log(`\nYARDAGES — classification and stats, before and after`);
console.log(
  `${shots.length} shots · ${new Set(shots.map((s) => s.sessionId)).size} sessions · ` +
    `weighted as of the newest session · exp(-age/${REVIEW_THRESHOLDS.recencyHalfLifeDays}d), ` +
    `session weight capped at max(${REVIEW_THRESHOLDS.maxSessionWeightShare}, share of shots)`,
);

// ── table 1: stock yardages ─────────────────────────────────────────────────

console.log(`\n\n1. STOCK CARRY PER CLUB`);
console.log(
  `\n  ${pad("club", 15)}${rpad("old", 6)}${rpad("new wtd", 9)}${rpad("new unwtd", 11)}` +
    `${rpad("Δ old→wtd", 11)}   ${rpad("old n", 6)}${rpad("trusted", 9)}${rpad("partial", 9)}${rpad("flagged", 9)}`,
);
rule(90);

const movers: { club: string; delta: number }[] = [];

for (const p of profiles) {
  const old = legacyStock(p.club);
  const delta =
    old.carry !== null && p.weightedMedianCarry !== null ? p.weightedMedianCarry - old.carry : null;
  if (delta !== null && Math.abs(delta) > 5) movers.push({ club: p.club, delta });

  console.log(
    `  ${pad(p.club, 15)}${rpad(num(old.carry), 6)}${rpad(num(p.weightedMedianCarry), 9)}` +
      `${rpad(num(p.unweightedMedianCarry), 11)}${rpad(delta === null ? NA : (delta > 0 ? "+" : "") + delta.toFixed(0), 11)}   ` +
      `${rpad(String(old.included), 6)}${rpad(String(p.trustedShotCount), 9)}` +
      `${rpad(String(p.partialShotCount), 9)}${rpad(String(p.flaggedShotCount), 9)}`,
  );
}

// ── table 2: intervals ──────────────────────────────────────────────────────

console.log(`\n\n2. NEW INTERVALS (percentile, whole yards)`);
console.log(
  `\n  ${pad("club", 15)}${rpad("p25–p75", 12)}${rpad("p10–p90", 12)}${rpad("offline", 9)}` +
    `${rpad("off p10–p90", 14)}${rpad("ball", 8)}${rpad("smash", 8)}  sessions  last hit`,
);
rule(96);
for (const p of profiles) {
  const iv = (v: [number, number] | null) => (v === null ? NA : `${v[0]}–${v[1]}`);
  console.log(
    `  ${pad(p.club, 15)}${rpad(iv(p.carryP25toP75), 12)}${rpad(iv(p.carryP10toP90), 12)}` +
      `${rpad(num(p.medianOffline), 9)}${rpad(iv(p.offlineP10toP90), 14)}` +
      `${rpad(num(p.medianBallSpeed, 1), 8)}${rpad(p.medianSmash === null ? NA : p.medianSmash.toFixed(3), 8)}` +
      `${rpad(String(p.sessionCount), 10)}  ${p.lastPracticedAt?.slice(0, 10) ?? NA}`,
  );
}

// ── table 3: transitions ────────────────────────────────────────────────────

console.log(`\n\n3. CLASSIFICATION CHANGES (old status → new status)`);

const transitions = new Map<string, number>();
for (const s of shots) {
  const from = legacy.get(shotKey(s)) ?? "included";
  const to = byKey.get(shotKey(s))!.reviewStatus;
  const k = `${from} ${to}`;
  transitions.set(k, (transitions.get(k) ?? 0) + 1);
}

const rows = [...transitions.entries()]
  .map(([k, n]) => {
    const [from, to] = k.split(" ");
    return { from, to, n, changed: from !== to && !(from === "included" && to === "included") };
  })
  .sort((a, b) => b.n - a.n);

console.log(`\n  ${pad("old", 16)}${pad("new", 20)}${rpad("shots", 7)}`);
rule(45);
for (const r of rows) {
  const same =
    r.from === r.to ||
    (r.from === "mishit:smash" && r.to === "auto-flagged") ||
    (r.from === "mishit:carry" && r.to === "auto-flagged");
  console.log(
    `  ${pad(r.from, 16)}${pad(r.to, 20)}${rpad(String(r.n), 7)}${same ? "" : "   ←"}`,
  );
}

const changedCount = shots.filter((s) => {
  const from = legacy.get(shotKey(s));
  const to = byKey.get(shotKey(s))!.reviewStatus;
  const equivalent =
    (from === "included" && to === "included") ||
    (from === "warmup" && to === "warmup") ||
    (from === "phantom" && to === "phantom") ||
    (from === "manual" && to === "manually-excluded") ||
    ((from === "mishit:smash" || from === "mishit:carry") && to === "auto-flagged");
  return !equivalent;
}).length;
console.log(`\n  ${changedCount} of ${shots.length} shots classified differently.`);

// ── table 4: why the new flags fired ────────────────────────────────────────

console.log(`\n\n4. NEW STATUS BREAKDOWN, WITH REASONS`);

const byStatus = new Map<ShotReviewStatus, number>();
const byReason = new Map<string, number>();
const byCertainty = new Map<string, number>();
for (const s of classified) {
  byStatus.set(s.reviewStatus, (byStatus.get(s.reviewStatus) ?? 0) + 1);
  for (const r of s.flagReasons) byReason.set(r, (byReason.get(r) ?? 0) + 1);
  if (s.reviewStatus !== "included" || s.flagReasons.length > 0) {
    byCertainty.set(s.classificationCertainty, (byCertainty.get(s.classificationCertainty) ?? 0) + 1);
  }
}

console.log();
for (const [status, n] of [...byStatus.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${pad(status, 20)}${rpad(String(n), 5)}`);
}
console.log(`\n  reasons (a shot can carry more than one)`);
for (const [reason, n] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${pad("  " + reason, 20)}${rpad(String(n), 5)}`);
}
console.log(`\n  certainty of non-trivial classifications`);
for (const [c, n] of [...byCertainty.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${pad("  " + c, 20)}${rpad(String(n), 5)}`);
}

// ── table 5: the shots responsible for a big move ───────────────────────────

console.log(`\n\n5. CLUBS WHOSE STOCK CARRY MOVED MORE THAN 5 YARDS`);

if (movers.length === 0) {
  console.log(`\n  None.`);
} else {
  for (const m of movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))) {
    const old = legacyStock(m.club);
    const p = profiles.find((x) => x.club === m.club)!;
    console.log(
      `\n  ${m.club}: ${num(old.carry)} → ${num(p.weightedMedianCarry)} yd ` +
        `(${m.delta > 0 ? "+" : ""}${m.delta.toFixed(0)}), unweighted ${num(p.unweightedMedianCarry)}`,
    );

    const responsible = shots
      .filter((s) => s.club === m.club)
      .map((s) => ({ s, from: legacy.get(shotKey(s))!, c: byKey.get(shotKey(s))! }))
      .filter(({ from, c }) => {
        const wasIn = from === "included";
        const isIn = c.reviewStatus === "included";
        return wasIn !== isIn;
      });

    if (responsible.length === 0) {
      console.log(`    No shot changed side. The move is recency weighting alone.`);
    } else {
      console.log(
        `    ${responsible.length} shot(s) changed side; the rest of the move is recency weighting.`,
      );
      for (const { s, from, c } of responsible.sort((a, b) =>
        a.s.shotTimestamp.localeCompare(b.s.shotTimestamp),
      )) {
        console.log(
          `      ${s.shotTimestamp}  ${rpad(num(s.carryYd, 1), 7)} yd  ` +
            `cs ${rpad(num(s.clubSpeedMph, 1), 6)}  smash ${rpad(num(s.smashFactor, 3), 6)}  ` +
            `${from} → ${c.reviewStatus}`,
        );
        if (c.explanation) console.log(`        ${c.explanation}`);
      }
    }
  }
}

// ── table 6: every flagged shot, so nothing hides ───────────────────────────

console.log(`\n\n6. EVERY FLAGGED OR PARTIAL SHOT`);
console.log();

const interesting = classified
  .filter((s) => s.reviewStatus === "auto-flagged" || s.reviewStatus === "possible-partial")
  .sort(
    (a, b) =>
      bagRank(a.club) - bagRank(b.club) || a.shotTimestamp.localeCompare(b.shotTimestamp),
  );

if (interesting.length === 0) {
  console.log(`  None.`);
}
for (const s of interesting) {
  console.log(
    `  ${pad(s.club, 15)} ${s.shotTimestamp}  ${rpad(num(s.carryYd, 1), 7)} yd  ` +
      `${pad(s.reviewStatus, 17)} ${s.classificationCertainty === "low" ? "(low certainty)" : ""}`,
  );
  console.log(`    ${s.explanation ?? ""}  [${s.flagReasons.join(", ")}]`);
}

console.log();
