/* The state of the pipeline, in record time — what the command center's
 * "data status" block renders.
 *
 * No wall clock anywhere: staleness is never "N days ago" (which would make
 * the page read differently every day the record didn't change). Instead
 * each source prints deterministic facts of the checkout — the newest record
 * date it carries, when it was captured, which raw bundles are newer than
 * the artifact that should contain them, and which human steps are pending
 * (proposed round links). Cross-source drift is visible by putting the
 * dates side by side.
 *
 * Bundle-family filenames embed their capture date (grint-export-YYYY-MM-DD
 * [-HHMM].json), so "newer than the artifact" is a pure string comparison
 * against the newest file the artifact's rawFile chain names — older full
 * bundles are legitimately absent from the chain and must not be flagged.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { asOfGarmin, type GarminShots } from "./garmin-shots";
import type { LedgerSession } from "./ledger";
import { loadJson } from "./load";
import { asOf, type RoundHistory } from "./round-history";
import type { SourceId } from "./sources";

export interface SourceStatus {
  id: SourceId;
  label: string;
  /** Newest record date the artifact carries — the record's own clock. */
  asOf: string | null;
  /** When the capture that built the artifact was taken. */
  capturedAt: string | null;
  /** Raw files newer than the artifact — captured, not yet parsed. */
  unprocessed: string[];
  /** A pending human step, stated; null when nothing waits on a person. */
  pending: string | null;
  /** The command that folds new raw into the artifact. */
  command: string;
}

function rawFiles(pattern: RegExp): string[] {
  try {
    return readdirSync(join(process.cwd(), "data", "raw"))
      .filter((f) => pattern.test(f))
      .sort();
  } catch {
    return [];
  }
}

/** Raw files lexically newer than the newest one the artifact's rawFile
 *  names. The filename convention embeds the capture timestamp, so string
 *  order is capture order. */
function newerThanArtifact(files: string[], rawFileField: string | null): string[] {
  if (rawFileField === null) return files;
  const named = rawFileField
    .split("+")
    .map((s) => s.trim().replace(/^raw\//, ""))
    .filter(Boolean)
    .sort();
  const newest = named[named.length - 1] ?? "";
  return files.filter((f) => f > newest);
}

function artifactRawFile(name: string): string | null {
  try {
    return loadJson<{ rawFile?: string }>(name).rawFile ?? null;
  } catch {
    return null;
  }
}

export function loadProposedLinkCount(): number {
  try {
    return loadJson<{ links: { status: string }[] }>("round-links.json").links.filter(
      (l) => l.status === "proposed",
    ).length;
  } catch {
    return 0;
  }
}

export function buildDataStatus({
  roundHistory,
  garminShots,
  sessions,
}: {
  roundHistory: RoundHistory | null;
  garminShots: GarminShots | null;
  sessions: LedgerSession[];
}): SourceStatus[] {
  const grintNew = newerThanArtifact(
    rawFiles(/^grint-export-.*\.json$/),
    artifactRawFile("rounds.json"),
  );
  const garminNew = newerThanArtifact(
    rawFiles(/^garmin-export-.*\.json$/),
    artifactRawFile("garmin-rounds.json"),
  );
  const csvs = rawFiles(/^DrivingRange-.*\.csv$/i);
  const proposed = loadProposedLinkCount();

  return [
    {
      id: "scorecards",
      label: "Scorecards",
      asOf: roundHistory ? asOf(roundHistory.rounds) : null,
      capturedAt: roundHistory ? roundHistory.capturedAt.slice(0, 10) : null,
      unprocessed: grintNew,
      pending: null,
      command: "pnpm data:rounds",
    },
    {
      id: "watch",
      label: "Watch",
      asOf: garminShots ? asOfGarmin(garminShots) : null,
      capturedAt: garminShots ? garminShots.capturedAt.slice(0, 10) : null,
      unprocessed: garminNew,
      pending:
        proposed > 0
          ? `${proposed} proposed round link${proposed === 1 ? "" : "s"} await confirmation in data/round-links.json`
          : null,
      command: "pnpm data:garmin",
    },
    {
      id: "range",
      label: "Range",
      /* Session ids embed their date; the newest is the record's edge. */
      asOf: sessions.length ? sessions[sessions.length - 1].id.slice(0, 10) : null,
      capturedAt: null,
      /* CSVs and sessions are not strictly one-to-one, so this only speaks
       * when there are plainly more files than the ledger has sessions. */
      unprocessed: csvs.length > sessions.length ? csvs.slice(sessions.length) : [],
      pending: null,
      command: "pnpm ingest",
    },
  ];
}
