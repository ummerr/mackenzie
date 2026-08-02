/* Pure merge: many parsed exports -> one deduplicated ledger.
 *
 * No filesystem, no network. `scripts/ingest.ts` does the I/O and calls this.
 * Same discipline as lib/parse.ts, and for the same reason — Phase 2's stats
 * attach to this output, and none of it should need a runtime to test.
 */

import type { ParsedSession, ParsedShot, ParseResult } from "./parse";

export interface SourceFile {
  filename: string;
  sha256: string;
  parsed: ParseResult;
}

/** Hand-edited in data/exclusions.json. Keyed by shot timestamp. */
export interface ExclusionOverride {
  excluded: boolean;
  reason: string;
}

export type Overrides = Record<string, ExclusionOverride>;

export interface LedgerShot extends ParsedShot {
  /** The session's start timestamp, which is also its id. */
  sessionId: string;
}

export interface LedgerSession extends ParsedSession {
  id: string;
  /** Every file that contributed a shot to this session. */
  sourceFiles: string[];
}

export interface Ledger {
  sessions: LedgerSession[];
  shots: LedgerShot[];
  /** Rows skipped because an identical (session, timestamp) was already seen. */
  duplicatesSkipped: number;
  /** Override keys matching no shot — almost always a typo. */
  orphanedOverrides: string[];
  warnings: string[];
}

/** Identity of a shot across re-exports. There is no shot-number column. */
export function shotKey(sessionId: string, shotTimestamp: string): string {
  return `${sessionId}#${shotTimestamp}`;
}

export function buildLedger(files: SourceFile[], overrides: Overrides = {}): Ledger {
  const sessions = new Map<string, LedgerSession>();
  const shots = new Map<string, LedgerShot>();
  const warnings: string[] = [];
  let duplicatesSkipped = 0;

  // Sort by session start so the ledger is deterministic regardless of the
  // order the directory listing came back in.
  const ordered = [...files].sort((a, b) => {
    const d = a.parsed.session.sessionStartedAt.localeCompare(b.parsed.session.sessionStartedAt);
    return d !== 0 ? d : a.filename.localeCompare(b.filename);
  });

  for (const file of ordered) {
    const { session, shots: parsedShots, warnings: fileWarnings } = file.parsed;
    const id = session.sessionStartedAt;

    for (const w of fileWarnings) warnings.push(`${file.filename}: ${w}`);

    const existing = sessions.get(id);
    if (existing) {
      // Two files covering the same session. Legitimate — an export can be
      // taken twice — so merge rather than treating it as a conflict.
      if (!existing.sourceFiles.includes(file.filename)) {
        existing.sourceFiles.push(file.filename);
      }
    } else {
      sessions.set(id, { ...session, id, sourceFiles: [file.filename] });
    }

    for (const shot of parsedShots) {
      const key = shotKey(id, shot.shotTimestamp);
      if (shots.has(key)) {
        duplicatesSkipped += 1;
        continue;
      }
      shots.set(key, { ...shot, sessionId: id });
    }
  }

  // ── manual overrides ──────────────────────────────────────────────────────
  // Applied last so a hand edit always wins over the automatic phantom flag.
  // Un-excluding a phantom leaves its nulled metrics nulled: the swing is back
  // in the ledger, but the ball flight the monitor never saw is not invented.
  const byTimestamp = new Map<string, LedgerShot[]>();
  for (const s of shots.values()) {
    const list = byTimestamp.get(s.shotTimestamp);
    if (list) list.push(s);
    else byTimestamp.set(s.shotTimestamp, [s]);
  }

  const orphanedOverrides: string[] = [];
  for (const [timestamp, override] of Object.entries(overrides)) {
    const targets = byTimestamp.get(timestamp);
    if (!targets) {
      orphanedOverrides.push(timestamp);
      continue;
    }
    if (targets.length > 1) {
      warnings.push(
        `override ${timestamp} matches ${targets.length} shots across sessions; applied to all`,
      );
    }
    for (const t of targets) {
      t.isExcluded = override.excluded;
      t.exclusionReason = override.excluded ? override.reason : null;
    }
  }

  if (orphanedOverrides.length > 0) {
    warnings.push(
      `${orphanedOverrides.length} override(s) match no shot: ${orphanedOverrides.join(", ")}`,
    );
  }

  // Renumber shot_index within each session. The per-file index is per-file;
  // once two exports merge into one session it has to be recomputed.
  const bySession = new Map<string, LedgerShot[]>();
  for (const s of shots.values()) {
    const list = bySession.get(s.sessionId);
    if (list) list.push(s);
    else bySession.set(s.sessionId, [s]);
  }
  for (const [id, list] of bySession) {
    list.sort((a, b) => a.shotTimestamp.localeCompare(b.shotTimestamp));
    list.forEach((s, i) => {
      s.shotIndex = i;
    });
    const session = sessions.get(id);
    if (session) session.shotCount = list.length;
  }

  const orderedShots = [...bySession.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .flatMap(([, list]) => list);

  return {
    sessions: [...sessions.values()].sort((a, b) => a.id.localeCompare(b.id)),
    shots: orderedShots,
    duplicatesSkipped,
    orphanedOverrides,
    warnings,
  };
}

/** Shot counts per club, most-hit first. Used by the ingest summary. */
export function clubCounts(ledger: Ledger): { club: string; n: number; active: number }[] {
  const counts = new Map<string, { n: number; active: number }>();
  for (const s of ledger.shots) {
    const c = counts.get(s.club) ?? { n: 0, active: 0 };
    c.n += 1;
    if (!s.isExcluded) c.active += 1;
    counts.set(s.club, c);
  }
  return [...counts.entries()]
    .map(([club, c]) => ({ club, ...c }))
    .sort((a, b) => b.n - a.n || a.club.localeCompare(b.club));
}
