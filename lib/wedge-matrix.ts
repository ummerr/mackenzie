/* The wedge matrix: what each wedge carries at less than a full swing.
 *
 * The ledger has one categorical axis — the club — so a deliberate half wedge
 * has nowhere to live. The classifier can already SEE partials (reduced club
 * speed, normal smash), but seeing one only proves a shorter swing happened; it
 * cannot say which shorter swing, and "somewhere between a chip and a full Gap
 * Wedge" is not a yardage. The length of a partial is a fact about intent, and
 * intent is the one thing no monitor measures — so, like the bag itself, it is
 * asserted by hand: data/wedge-blocks.json records that a block of shots was a
 * deliberate half or three-quarter block, and everything here derives from
 * shots so labeled. Same argument as data/bag.json, one file over.
 *
 * ── The full row is the stock yardage, never re-measured ────────────────────
 *
 * A "full" label does not exist. The matrix's full-swing column is read
 * verbatim from the same ClubProfile the bag chart draws, because two sources
 * for one number will eventually disagree, and then the page argues with
 * itself. Only the partial cells come from labeled blocks.
 *
 * ── Labeled shots leave the full-swing pipeline entirely ────────────────────
 *
 * A labeled half swing must neither be judged against the club's full-swing
 * median (it would be flagged as a mishit or a "possible" partial — it is not
 * possible, it is confirmed) nor contribute to that median (twenty half swings
 * would drag the club's carry floor down and let genuine mishits through the
 * filter). classify-shot.ts sets labeled shots aside before its warmup counter
 * and club pools run; this module then reviews them against their own cell.
 */

import { WEDGE_CLUBS } from "./clubs";
import type { LedgerShot } from "./ledger";
/* Type-only, so it is erased and there is no runtime cycle: classify-shot.ts
 * imports blockOf/matchBlocks from this file at runtime. Same arrangement as
 * profile.ts ↔ tasks.ts. */
import type { ShotReviewStatus } from "./yardages/classify-shot";
import { mad, madsBelow, median, quantile } from "./yardages/robust-stats";
import { REVIEW_THRESHOLDS, type ReviewThresholds } from "./yardages/thresholds";
import type { ClubProfile } from "./stats";

// ── vocabulary ──────────────────────────────────────────────────────────────

/** The two swings a block may assert. "full" is deliberately not one of them. */
export type WedgeSwing = "half" | "three-quarter";
export type SwingLength = WedgeSwing | "full";

export const WEDGE_SWINGS: readonly WedgeSwing[] = ["half", "three-quarter"];
export const SWING_LENGTHS: readonly SwingLength[] = ["half", "three-quarter", "full"];

// ── the asserted file ───────────────────────────────────────────────────────

export interface WedgeBlock {
  /** The session the block was hit in — the `id` in data/sessions.json. */
  sessionId: string;
  /** The R50 `Club Type` string. Must be a wedge. */
  club: string;
  swing: WedgeSwing;
  /** First and last shotTimestamp of the block, inclusive. Survives re-ingest
   * because timestamps come from the CSV — the exclusions.json addressing. */
  from: string;
  to: string;
  note?: string;
}

export interface WedgeBlocksFile {
  blocks: WedgeBlock[];
  /** Entries the parser refused, with the reason. Reported, never dropped silently. */
  warnings: string[];
}

const SWINGS = new Set<string>(WEDGE_SWINGS);
const WEDGES = new Set<string>(WEDGE_CLUBS);

/**
 * Parse data/wedge-blocks.json. Pure — the caller does the filesystem, the
 * same contract as parseBag. A malformed entry becomes a warning rather than a
 * throw or a silent drop: a typo here silently removes a measured cell, which
 * is the one thing an asserted file must make impossible.
 */
export function parseWedgeBlocks(raw: unknown): WedgeBlocksFile {
  const list = (raw as { blocks?: unknown } | null)?.blocks;
  if (!Array.isArray(list)) return { blocks: [], warnings: [] };

  const blocks: WedgeBlock[] = [];
  const warnings: string[] = [];

  list.forEach((value, i) => {
    const v = value as Record<string, unknown>;
    const where = `blocks[${i}]`;
    if (
      typeof v?.sessionId !== "string" ||
      typeof v?.club !== "string" ||
      typeof v?.swing !== "string" ||
      typeof v?.from !== "string" ||
      typeof v?.to !== "string"
    ) {
      warnings.push(`${where}: missing sessionId, club, swing, from or to — skipped`);
      return;
    }
    if (!SWINGS.has(v.swing)) {
      warnings.push(
        `${where}: swing "${v.swing}" is not "half" or "three-quarter" — a full swing ` +
          `is the stock yardage and is never labeled — skipped`,
      );
      return;
    }
    if (!WEDGES.has(v.club)) {
      warnings.push(`${where}: "${v.club}" is not a wedge — skipped`);
      return;
    }
    if (v.from > v.to) {
      warnings.push(`${where}: from ${v.from} is after to ${v.to} — skipped`);
      return;
    }
    blocks.push({
      sessionId: v.sessionId,
      club: v.club,
      swing: v.swing as WedgeSwing,
      from: v.from,
      to: v.to,
      ...(typeof v.note === "string" && v.note !== "" ? { note: v.note } : {}),
    });
  });

  return { blocks, warnings };
}

// ── matching blocks to shots ────────────────────────────────────────────────

/** The block claiming this shot, or null. First match wins on an overlap. */
export function blockOf(
  s: Pick<LedgerShot, "sessionId" | "club" | "shotTimestamp">,
  blocks: readonly WedgeBlock[],
): WedgeBlock | null {
  for (const b of blocks) {
    if (
      s.sessionId === b.sessionId &&
      s.club === b.club &&
      s.shotTimestamp >= b.from &&
      s.shotTimestamp <= b.to
    ) {
      return b;
    }
  }
  return null;
}

export interface BlockMatch {
  /** Shot index in the input array → the block that claims it. */
  byShot: Map<number, WedgeBlock>;
  warnings: string[];
}

/**
 * Every shot each block claims, with the two failure modes said out loud: a
 * block that matches nothing is an orphan (a typo, or a session re-ingested
 * away — the treatment an orphaned exclusions override gets), and a shot two
 * blocks both claim goes to the first, with the collision reported.
 */
export function matchBlocks(shots: LedgerShot[], blocks: readonly WedgeBlock[]): BlockMatch {
  const byShot = new Map<number, WedgeBlock>();
  const matched = new Map<WedgeBlock, number>();
  const warnings: string[] = [];

  shots.forEach((s, i) => {
    let taken = false;
    for (const b of blocks) {
      if (
        s.sessionId !== b.sessionId ||
        s.club !== b.club ||
        s.shotTimestamp < b.from ||
        s.shotTimestamp > b.to
      ) {
        continue;
      }
      if (!taken) {
        byShot.set(i, b);
        matched.set(b, (matched.get(b) ?? 0) + 1);
        taken = true;
      } else {
        warnings.push(
          `shot ${s.shotTimestamp} (${s.club}) matches more than one block — ` +
            `the first (${byShot.get(i)!.swing}, from ${byShot.get(i)!.from}) wins`,
        );
      }
    }
  });

  for (const b of blocks) {
    if (!matched.has(b)) {
      warnings.push(
        `block ${b.club} ${b.swing} ${b.from}–${b.to} in session ${b.sessionId} ` +
          "matches no shot on file",
      );
    }
  }

  return { byShot, warnings };
}

// ── thresholds ──────────────────────────────────────────────────────────────

export const WEDGE_MATRIX_THRESHOLDS = {
  /**
   * Usable labeled shots before a cell shows a number.
   *
   * 8, the same figure as `minSampleForClubRelativeRules` and for the same
   * reason: below it a median is a coin toss wearing a number. It is NOT the
   * bag chart's 15 — eight partial cells at 15 apiece is 120 shots, forty
   * percent of the entire current ledger, before the matrix says anything at
   * all, and a gate that expensive is a gate nobody ever clears.
   */
  minShotsPerCell: 8,
} as const;

// ── the matrix ──────────────────────────────────────────────────────────────

export interface WedgeCell {
  club: string;
  swing: SwingLength;
  /** "stock" for the full row (read from ClubProfile), "blocks" for partials. */
  source: "blocks" | "stock";
  /** Every shot a block claims for this cell, whatever became of it. */
  n: number;
  /** Shots actually behind the numbers below. */
  active: number;
  sessions: number;
  /** True when `active` is under the cell's display gate. */
  suppressed: boolean;

  medianCarryYd: number | null;
  carryP25Yd: number | null;
  carryP75Yd: number | null;
  medianOfflineYd: number | null;
}

export interface WedgeMatrix {
  /** All 4 wedges × 3 swings, always — an empty cell renders as absence, never vanishes. */
  cells: WedgeCell[];
  warnings: string[];
}

/** The one cell, or null — the matrix always holds all 12, so null means a non-wedge. */
export function cellOf(m: WedgeMatrix, club: string, swing: SwingLength): WedgeCell | null {
  return m.cells.find((c) => c.club === club && c.swing === swing) ?? null;
}

/* Read `reviewStatus` off a shot that has been through the classifier. The
 * pages hold LedgerShot[] whose classified fields survive the applyHeuristics
 * shim at runtime — the same reading-through profile.ts already does. Absent
 * on a never-classified list, in which case no shot is labeled and every
 * partial cell is honestly empty. */
const statusOf = (s: LedgerShot): ShotReviewStatus | undefined =>
  (s as LedgerShot & { reviewStatus?: ShotReviewStatus }).reviewStatus;

/**
 * Build the matrix from a classified ledger.
 *
 * `shots` must have been through classifyShots/applyHeuristics WITH these same
 * blocks, so the labeled shots wear `labeled-partial` and the full-swing
 * profiles were computed without them. `profiles` must be the CARRY basis —
 * a partial is measured at the point of landing, and the R50 never modelled
 * the roll of a half wedge.
 *
 * Cell review mirrors the classifier's shape in miniature, against the cell's
 * own pool rather than the club's: the first `warmupShotsPerClub` shots of
 * each labeled block are warmup (the first swings at a new length are spent
 * finding the length — the same argument as the session warmup rule); then a
 * smash `reviewSmashMad` MADs below the cell pool, or a carry
 * `carryOutlierMad` MADs from the cell median in either direction, is flagged.
 * Both relative rules gate on `minSampleForClubRelativeRules` per cell — the
 * circularity argument does not change because the pool got smaller.
 */
export function buildWedgeMatrix(
  shots: LedgerShot[],
  blocks: readonly WedgeBlock[],
  profiles: ClubProfile[],
  t: ReviewThresholds = REVIEW_THRESHOLDS,
): WedgeMatrix {
  const { byShot, warnings } = matchBlocks(shots, blocks);
  const byClub = new Map(profiles.map((p) => [p.club, p]));

  /* Group each block's claimed shots, in shot order, so warmup counts the
   * block's own first swings and not whichever array order the caller kept. */
  const perBlock = new Map<WedgeBlock, LedgerShot[]>();
  for (const [i, b] of byShot) {
    const list = perBlock.get(b) ?? [];
    list.push(shots[i]);
    perBlock.set(b, list);
  }

  interface CellShot {
    shot: LedgerShot;
    warmup: boolean;
  }
  const cellPool = new Map<string, CellShot[]>(); // "club#swing" → labeled shots
  const cellN = new Map<string, number>(); // includes phantom/manual casualties
  const cellSessions = new Map<string, Set<string>>();

  for (const [b, claimed] of perBlock) {
    const key = `${b.club}#${b.swing}`;
    cellN.set(key, (cellN.get(key) ?? 0) + claimed.length);
    const ordered = [...claimed].sort(
      (x, y) => x.shotTimestamp.localeCompare(y.shotTimestamp) || x.shotIndex - y.shotIndex,
    );
    let position = 0;
    for (const s of ordered) {
      /* Phantoms and hand exclusions were decided upstream and win over the
       * label; they count toward n (they were swings in the block) but never
       * toward the pool. */
      if (statusOf(s) !== "labeled-partial") continue;
      position += 1;
      const pool = cellPool.get(key) ?? [];
      pool.push({ shot: s, warmup: position <= t.warmupShotsPerClub });
      cellPool.set(key, pool);
      const sessions = cellSessions.get(key) ?? new Set<string>();
      sessions.add(s.sessionId);
      cellSessions.set(key, sessions);
    }
  }

  const cells: WedgeCell[] = [];
  for (const club of WEDGE_CLUBS) {
    for (const swing of WEDGE_SWINGS) {
      const key = `${club}#${swing}`;
      const pool = cellPool.get(key) ?? [];
      const past = pool.filter((c) => !c.warmup);
      const carries = past
        .map((c) => c.shot.carryYd)
        .filter((v): v is number => v !== null);

      /* The relative rules, against the cell's own pool. Below the sample gate
       * nothing relative runs and every post-warmup shot with a carry counts. */
      const gated = carries.length < t.minSampleForClubRelativeRules;
      const smashes = past
        .map((c) => c.shot.smashFactor)
        .filter((v): v is number => v !== null);
      const smashGated = smashes.length < t.minSampleForClubRelativeRules;
      const carryMad = gated ? null : mad(carries);
      const carryMedian = gated ? null : median(carries);

      const active = past.filter((c) => {
        const s = c.shot;
        if (s.carryYd === null) return false;
        if (!smashGated && s.smashFactor !== null) {
          const below = madsBelow(s.smashFactor, smashes);
          if (below !== null && below >= t.reviewSmashMad) return false;
        }
        if (carryMedian !== null && carryMad !== null && carryMad > 0) {
          if (Math.abs(s.carryYd - carryMedian) / carryMad >= t.carryOutlierMad) return false;
        }
        return true;
      });

      const dist = active
        .map((c) => c.shot.carryYd)
        .filter((v): v is number => v !== null);
      const off = active
        .map((c) => c.shot.offlineYd)
        .filter((v): v is number => v !== null);

      cells.push({
        club,
        swing,
        source: "blocks",
        n: cellN.get(key) ?? 0,
        active: active.length,
        sessions: (cellSessions.get(key) ?? new Set()).size,
        suppressed: active.length < WEDGE_MATRIX_THRESHOLDS.minShotsPerCell,
        medianCarryYd: dist.length ? median(dist) : null,
        carryP25Yd: dist.length ? quantile(dist, 0.25) : null,
        carryP75Yd: dist.length ? quantile(dist, 0.75) : null,
        medianOfflineYd: off.length ? median(off) : null,
      });
    }

    /* The full row: the stock yardage, verbatim, at the bag chart's own gate.
     * A wedge the ledger has never seen keeps its existing task; the matrix
     * reports the absence and claims nothing. */
    const p = byClub.get(club) ?? null;
    cells.push({
      club,
      swing: "full",
      source: "stock",
      n: p?.n ?? 0,
      active: p?.active ?? 0,
      sessions: p?.sessions ?? 0,
      suppressed: p?.suppressed ?? true,
      medianCarryYd: p?.medianDistanceYd ?? null,
      carryP25Yd: p?.distanceP25Yd ?? null,
      carryP75Yd: p?.distanceP75Yd ?? null,
      medianOfflineYd: p?.medianOfflineYd ?? null,
    });
  }

  return { cells, warnings };
}
